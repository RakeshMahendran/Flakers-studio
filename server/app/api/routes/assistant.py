"""
Assistant API - Create and manage AI assistants with integrated scraping
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel, HttpUrl
from typing import List, Dict, Any, Optional
import uuid
import logging

from app.core.database import get_db
from app.models.assistant import Assistant, SourceType, AssistantTemplate, AssistantStatus
from app.models.project import Project

logger = logging.getLogger(__name__)
router = APIRouter()

class CreateAssistantRequest(BaseModel):
    tenant_id: str
    user_name: str  # Add user name for collection naming
    name: str
    description: Optional[str] = None
    source_type: SourceType
    site_url: HttpUrl
    template: AssistantTemplate
    scraping_config: Optional[Dict[str, Any]] = None

class CreateAssistantResponse(BaseModel):
    assistant_id: str
    status: str
    message: str
    scraping_job_id: Optional[str] = None

class AssistantResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    source_type: str
    site_url: str
    template: str
    status: str
    status_message: Optional[str]
    total_pages_crawled: str
    total_chunks_indexed: str
    allowed_intents: List[str]
    governance_rules: Dict[str, Any]
    created_at: str
    updated_at: Optional[str]

class ListAssistantsResponse(BaseModel):
    assistants: List[AssistantResponse]
    total: int

class UpdateAssistantRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    governance_rules: Optional[Dict[str, Any]] = None
    allowed_intents: Optional[List[str]] = None

@router.get("", response_model=ListAssistantsResponse)
async def list_assistants(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    List all assistants, optionally filtered by tenant_id
    """
    try:
        query = select(Assistant)
        
        if tenant_id:
            query = query.where(Assistant.tenant_id == uuid.UUID(tenant_id))
        
        # Order by created_at descending (newest first)
        query = query.order_by(Assistant.created_at.desc())
        
        result = await db.execute(query)
        assistants = result.scalars().all()
        
        assistant_responses = [
            AssistantResponse(
                id=str(assistant.id),
                name=assistant.name,
                description=assistant.description,
                source_type=assistant.source_type.value,
                site_url=assistant.site_url,
                template=assistant.template.value,
                status=assistant.status.value,
                status_message=assistant.status_message,
                total_pages_crawled=assistant.total_pages_crawled or "0",
                total_chunks_indexed=assistant.total_chunks_indexed or "0",
                allowed_intents=assistant.allowed_intents or [],
                governance_rules=assistant.governance_rules or {},
                created_at=assistant.created_at.isoformat(),
                updated_at=assistant.updated_at.isoformat() if assistant.updated_at else None
            )
            for assistant in assistants
        ]
        
        return ListAssistantsResponse(
            assistants=assistant_responses,
            total=len(assistant_responses)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list assistants: {str(e)}")

@router.post("/create", response_model=CreateAssistantResponse)
async def create_assistant(
    request: CreateAssistantRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new AI assistant with content discovery
    
    This starts the FlakersStudio workflow:
    1. Create assistant record
    2. Start content discovery (scraping ONCE)
    3. Return assistant_id and job_id for tracking
    
    After discovery completes, user will:
    - Review content on governance page
    - Configure assistant prompt
    - Trigger ingestion to vector DB
    """
    try:
        # Generate governance rules based on template
        governance_rules = _generate_governance_rules(request.template)
        allowed_intents = _get_template_intents(request.template)
        
        # Get or create default project for tenant
        tenant_uuid = uuid.UUID(request.tenant_id)
        
        result = await db.execute(
            select(Project).where(
                Project.tenant_id == tenant_uuid,
                Project.status == ProjectStatus.ACTIVE
            ).limit(1)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            # Create default project for tenant
            project = Project(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                name=f"Default Project",
                description="Auto-created default project",
                status=ProjectStatus.ACTIVE
            )
            db.add(project)
            await db.flush()  # Flush to get the project ID
        
        # Create assistant record
        assistant = Assistant(
            id=uuid.uuid4(),
            project_id=project.id,
            tenant_id=tenant_uuid,
            name=request.name,
            description=request.description,
            source_type=request.source_type,
            site_url=str(request.site_url),
            template=request.template,
            status=AssistantStatus.CREATING,
            governance_rules=governance_rules,
            allowed_intents=allowed_intents
        )
        
        db.add(assistant)
        await db.commit()
        await db.refresh(assistant)
        
        # Start content discovery (scraping ONCE)
        from app.services.content_discovery import ContentDiscoveryService
        discovery_service = ContentDiscoveryService()
        
        # Configure scraping based on request
        scraping_config = None
        if request.scraping_config:
            from app.services.web_scraper import ScrapingConfig
            scraping_config = ScrapingConfig(
                max_pages=request.scraping_config.get('max_pages', 100),
                max_depth=request.scraping_config.get('max_depth', 3),
                delay_between_requests=request.scraping_config.get('delay_between_requests', 1.0),
                timeout=request.scraping_config.get('timeout', 30),
                follow_external_links=request.scraping_config.get('follow_external_links', False),
                excluded_patterns=request.scraping_config.get('excluded_patterns', [])
            )
        
        # Start discovery job
        job_id = await discovery_service.start_discovery(
            assistant_id=str(assistant.id),
            project_id=str(project.id),
            tenant_id=str(tenant_uuid),
            site_url=str(request.site_url),
            scraping_config=scraping_config
        )
        
        # Update assistant status
        assistant.status = AssistantStatus.CREATING
        assistant.status_message = f"Discovering content from {request.site_url}"
        await db.commit()
        
        return CreateAssistantResponse(
            assistant_id=str(assistant.id),
            status="discovering",
            message="Assistant created successfully. Content scraping started.",
            scraping_job_id=job_id
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create assistant: {str(e)}")

@router.get("/{assistant_id}", response_model=AssistantResponse)
async def get_assistant(
    assistant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get assistant details"""
    result = await db.execute(
        select(Assistant).where(Assistant.id == assistant_id)
    )
    assistant = result.scalar_one_or_none()
    
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    
    return AssistantResponse(
        id=str(assistant.id),
        name=assistant.name,
        description=assistant.description,
        source_type=assistant.source_type.value,
        site_url=assistant.site_url,
        template=assistant.template.value,
        status=assistant.status.value,
        status_message=assistant.status_message,
        total_pages_crawled=assistant.total_pages_crawled,
        total_chunks_indexed=assistant.total_chunks_indexed,
        allowed_intents=assistant.allowed_intents,
        governance_rules=assistant.governance_rules,
        created_at=assistant.created_at.isoformat(),
        updated_at=assistant.updated_at.isoformat() if assistant.updated_at else None
    )

@router.put("/{assistant_id}")
async def update_assistant(
    assistant_id: str,
    request: UpdateAssistantRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update assistant configuration"""
    try:
        # Check if assistant exists
        result = await db.execute(
            select(Assistant).where(Assistant.id == assistant_id)
        )
        assistant = result.scalar_one_or_none()
        
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        
        project_name = assistant.name
        try:
            project_result = await db.execute(
                select(Project).where(Project.id == assistant.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project and project.name:
                project_name = project.name
        except Exception:
            # Fall back to assistant name if project lookup fails
            project_name = assistant.name
        
        # Update fields
        update_data = {}
        if request.name is not None:
            update_data['name'] = request.name
        if request.description is not None:
            update_data['description'] = request.description
        if request.governance_rules is not None:
            update_data['governance_rules'] = request.governance_rules
        if request.allowed_intents is not None:
            update_data['allowed_intents'] = request.allowed_intents
        
        if update_data:
            await db.execute(
                update(Assistant)
                .where(Assistant.id == assistant_id)
                .values(**update_data)
            )
            await db.commit()
        
        return {"message": "Assistant updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update assistant: {str(e)}")

@router.post("/{assistant_id}/rescrape")
async def rescrape_assistant_content(
    assistant_id: str,
    scraping_config: Optional[Dict[str, Any]] = None,
    db: AsyncSession = Depends(get_db)
):
    """Trigger re-scraping of assistant content"""
    raise HTTPException(
        status_code=410,
        detail="Re-scrape is currently disabled. Use the project website scrape flow to create a new scrape."
    )

@router.get("/{assistant_id}/system-prompt")
async def get_system_prompt(
    assistant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get the generated system prompt for review"""
    result = await db.execute(
        select(Assistant).where(Assistant.id == assistant_id)
    )
    assistant = result.scalar_one_or_none()
    
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    
    return {
        "assistant_id": assistant_id,
        "system_prompt": assistant.system_prompt,
        "governance_rules": assistant.governance_rules,
        "allowed_intents": assistant.allowed_intents,
        "template": assistant.template.value
    }

@router.post("/{assistant_id}/activate")
async def activate_assistant(
    assistant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Manually activate an assistant (mark as ready)"""
    try:
        result = await db.execute(
            select(Assistant).where(Assistant.id == assistant_id)
        )
        assistant = result.scalar_one_or_none()
        
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        
        # Update status to ready
        assistant.status = AssistantStatus.READY
        assistant.status_message = "Assistant is ready for chat"
        
        # Generate system prompt if not exists
        if not assistant.system_prompt:
            assistant.system_prompt = _generate_system_prompt(assistant)
        
        await db.commit()
        
        return {
            "message": "Assistant activated successfully",
            "assistant_id": assistant_id,
            "status": "ready"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to activate assistant: {str(e)}")

@router.post("/{assistant_id}/sync-status")
async def sync_assistant_status(
    assistant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Sync assistant status based on job completion"""
    try:
        from app.services.status_updater import StatusUpdateService
        
        status_service = StatusUpdateService()
        result = await status_service.sync_assistant_status(assistant_id)
        
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync status: {str(e)}")

@router.delete("/{assistant_id}")
async def delete_assistant(
    assistant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete an assistant and all its content"""
    try:
        # Get assistant
        result = await db.execute(
            select(Assistant).where(Assistant.id == assistant_id)
        )
        assistant = result.scalar_one_or_none()
        
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        
        project_id = str(assistant.tenant_id)
        
        # Delete from Qdrant
        from app.core.qdrant_client import delete_assistant_content
        await delete_assistant_content(assistant_id, assistant.name, "unknown")  # TODO: Get user name
        
        # Delete from database (cascade will handle content chunks)
        await db.delete(assistant)
        await db.commit()
        
        return {
            "message": "Assistant deleted successfully",
            "assistant_id": assistant_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete assistant: {str(e)}")

def _generate_governance_rules(template: AssistantTemplate) -> Dict[str, Any]:
    """Generate governance rules based on template"""
    base_rules = {
        "require_context": True,
        "tenant_isolation": True,
        "attribution_required": True,
        "confidence_threshold": 0.7
    }
    
    template_rules = {
        AssistantTemplate.SUPPORT: {
            "intent_filtering": True,
            "policy_quote_only": True,
            "max_response_length": 1000
        },
        AssistantTemplate.CUSTOMER: {
            "intent_filtering": True,
            "policy_quote_only": True,
            "max_response_length": 800
        },
        AssistantTemplate.SALES: {
            "intent_filtering": True,
            "policy_quote_only": False,
            "max_response_length": 1200
        },
        AssistantTemplate.ECOMMERCE: {
            "intent_filtering": True,
            "policy_quote_only": False,
            "max_response_length": 1000
        }
    }
    
    rules = {**base_rules, **template_rules.get(template, {})}
    return rules

def _get_template_intents(template: AssistantTemplate) -> List[str]:
    """Get allowed content intents for template"""
    intent_mapping = {
        AssistantTemplate.SUPPORT: [
            "documentation", "support", "faq", "tutorial", "policy"
        ],
        AssistantTemplate.CUSTOMER: [
            "support", "faq", "policy", "product_info"
        ],
        AssistantTemplate.SALES: [
            "product_info", "pricing", "marketing", "faq"
        ],
        AssistantTemplate.ECOMMERCE: [
            "product_info", "pricing", "support", "faq"
        ]
    }
    
    return intent_mapping.get(template, ["documentation", "support", "faq"])

def _generate_system_prompt(assistant: Assistant) -> str:
    """Generate system prompt based on assistant configuration"""
    template_prompts = {
        AssistantTemplate.SUPPORT: f"""You are a helpful support assistant for {assistant.name}. 
Your role is to help users with technical issues, provide documentation guidance, and answer frequently asked questions.

Guidelines:
- Only answer questions related to support, documentation, tutorials, FAQ, and policies
- Always cite your sources when providing information
- If you don't have relevant information, politely explain that you cannot help
- Keep responses concise and actionable
- For policy questions, quote directly from the source material""",
        
        AssistantTemplate.CUSTOMER: f"""You are a customer service assistant for {assistant.name}.
Your role is to help customers with their questions about products, services, and policies.

Guidelines:
- Focus on customer support, FAQ, policies, and product information
- Be friendly and professional in all interactions
- Always provide source citations for your answers
- If you cannot help with a question, explain why and suggest alternatives
- Keep responses clear and customer-focused""",
        
        AssistantTemplate.SALES: f"""You are a sales assistant for {assistant.name}.
Your role is to help potential customers understand products, pricing, and benefits.

Guidelines:
- Focus on product information, pricing, marketing content, and FAQ
- Be enthusiastic but honest about product capabilities
- Always cite sources for claims and information
- Help guide customers toward making informed decisions
- If asked about topics outside your scope, politely redirect""",
        
        AssistantTemplate.ECOMMERCE: f"""You are an e-commerce assistant for {assistant.name}.
Your role is to help customers with product information, pricing, and support.

Guidelines:
- Focus on product information, pricing, support, and FAQ
- Help customers find the right products for their needs
- Provide accurate pricing and availability information
- Always cite your sources
- For complex issues, guide customers to appropriate support channels"""
    }
    
    base_prompt = template_prompts.get(assistant.template, f"You are an AI assistant for {assistant.name}.")
    
    # Add governance constraints
    governance_addition = f"""

IMPORTANT GOVERNANCE RULES:
- Only use information from the provided context
- Never make up or hallucinate information
- Always cite sources using the provided source URLs
- Allowed content types: {', '.join(assistant.allowed_intents)}
- If a question is outside your allowed scope, politely decline and explain your limitations
- Maintain strict tenant isolation - only use content from this specific assistant's knowledge base"""
    
    return base_prompt + governance_addition