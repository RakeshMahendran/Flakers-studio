"""
Assistant domain service extracted from route handlers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.ingestion.content_discovery import ContentDiscoveryService
from backend.ingestion.status_updater import StatusUpdateService
from backend.ingestion.web_scraper import ScrapingConfig
from backend.models.assistant import Assistant, AssistantStatus, AssistantTemplate
from backend.models.project import Project, ProjectStatus
from backend.models.tenant import Tenant
from backend.vector_providers.qdrant_provider import delete_assistant_content


class AssistantService:
    @staticmethod
    def default_widget_config() -> Dict[str, Any]:
        return {
            "enabled": False,
            "allowed_origins": [],
            "position": "bottom-right",
            "primary_color": "#14532d",
            "title": "Ask Flakers Studio",
            "subtitle": "Governed answers from your assistant",
            "launcher_label": "Chat",
            "send_label": "Send",
            "placeholder": "Ask a question...",
            "welcome_message": "Hi. Ask a question to start the conversation.",
        }

    async def list_assistants(self, db: AsyncSession, tenant: Tenant):
        result = await db.execute(
            select(Assistant)
            .where(Assistant.tenant_id == tenant.id)
            .order_by(Assistant.created_at.desc())
        )
        return result.scalars().all()

    async def create_assistant(self, db: AsyncSession, tenant: Tenant, request: Any) -> Dict[str, Any]:
        governance_rules = self.generate_governance_rules(request.template)
        allowed_intents = self.get_template_intents(request.template)

        result = await db.execute(
            select(Project).where(
                Project.tenant_id == tenant.id,
                Project.status == ProjectStatus.ACTIVE,
            ).limit(1)
        )
        project = result.scalar_one_or_none()

        if not project:
            project = Project(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                name="Default Project",
                description="Auto-created default project",
                status=ProjectStatus.ACTIVE,
            )
            db.add(project)
            await db.flush()

        assistant = Assistant(
            id=uuid.uuid4(),
            project_id=project.id,
            tenant_id=tenant.id,
            name=request.name,
            description=request.description,
            source_type=request.source_type,
            site_url=str(request.site_url),
            template=request.template,
            status=AssistantStatus.CREATING,
            governance_rules=governance_rules,
            allowed_intents=allowed_intents,
            widget_config=self.default_widget_config(),
        )
        db.add(assistant)
        await db.commit()
        await db.refresh(assistant)

        scraping_config = None
        if request.scraping_config:
            scraping_config = ScrapingConfig(
                max_pages=request.scraping_config.get("max_pages", 100),
                max_depth=request.scraping_config.get("max_depth", 3),
                delay_between_requests=request.scraping_config.get("delay_between_requests", 1.0),
                timeout=request.scraping_config.get("timeout", 30),
                follow_external_links=request.scraping_config.get("follow_external_links", False),
                excluded_patterns=request.scraping_config.get("excluded_patterns", []),
            )

        discovery_service = ContentDiscoveryService()
        job_id = await discovery_service.start_discovery(
            assistant_id=str(assistant.id),
            project_id=str(project.id),
            tenant_id=str(tenant.id),
            site_url=str(request.site_url),
            scraping_config=scraping_config,
        )

        assistant.status_message = f"Discovering content from {request.site_url}"
        await db.commit()
        return {"assistant": assistant, "job_id": job_id}

    async def get_assistant(self, db: AsyncSession, tenant: Tenant, assistant_id: str) -> Optional[Assistant]:
        result = await db.execute(
            select(Assistant).where(Assistant.id == assistant_id, Assistant.tenant_id == tenant.id)
        )
        return result.scalar_one_or_none()

    async def update_assistant(self, db: AsyncSession, tenant: Tenant, assistant_id: str, request: Any) -> bool:
        assistant = await self.get_assistant(db, tenant, assistant_id)
        if assistant is None:
            return False

        update_data = {}
        if request.name is not None:
            update_data["name"] = request.name
        if request.description is not None:
            update_data["description"] = request.description
        if request.governance_rules is not None:
            update_data["governance_rules"] = request.governance_rules
        if request.allowed_intents is not None:
            update_data["allowed_intents"] = request.allowed_intents
        if getattr(request, "widget_config", None) is not None:
            existing_config = assistant.widget_config or self.default_widget_config()
            update_data["widget_config"] = {**existing_config, **request.widget_config}

        if update_data:
            await db.execute(update(Assistant).where(Assistant.id == assistant_id).values(**update_data))
            await db.commit()
        return True

    async def activate_assistant(self, db: AsyncSession, tenant: Tenant, assistant_id: str) -> Optional[Assistant]:
        assistant = await self.get_assistant(db, tenant, assistant_id)
        if assistant is None:
            return None

        assistant.status = AssistantStatus.READY
        assistant.status_message = "Assistant is ready for chat"
        if not assistant.system_prompt:
            assistant.system_prompt = self.generate_system_prompt(assistant)
        await db.commit()
        return assistant

    async def sync_status(self, db: AsyncSession, tenant: Tenant, assistant_id: str):
        assistant = await self.get_assistant(db, tenant, assistant_id)
        if assistant is None:
            return None
        return await StatusUpdateService().sync_assistant_status(assistant_id)

    async def delete_assistant(self, db: AsyncSession, tenant: Tenant, assistant_id: str) -> Optional[Assistant]:
        assistant = await self.get_assistant(db, tenant, assistant_id)
        if assistant is None:
            return None
        await delete_assistant_content(assistant_id, assistant.name, "unknown")
        await db.delete(assistant)
        await db.commit()
        return assistant

    @staticmethod
    def generate_governance_rules(template: AssistantTemplate) -> Dict[str, Any]:
        base_rules = {
            "require_context": True,
            "tenant_isolation": True,
            "attribution_required": True,
            "confidence_threshold": 0.7,
        }
        template_rules = {
            AssistantTemplate.SUPPORT: {"intent_filtering": True, "policy_quote_only": True, "max_response_length": 1000},
            AssistantTemplate.CUSTOMER: {"intent_filtering": True, "policy_quote_only": True, "max_response_length": 800},
            AssistantTemplate.SALES: {"intent_filtering": True, "policy_quote_only": False, "max_response_length": 1200},
            AssistantTemplate.ECOMMERCE: {"intent_filtering": True, "policy_quote_only": False, "max_response_length": 1000},
        }
        return {**base_rules, **template_rules.get(template, {})}

    @staticmethod
    def get_template_intents(template: AssistantTemplate) -> List[str]:
        intent_mapping = {
            AssistantTemplate.SUPPORT: ["documentation", "support", "faq", "tutorial", "policy"],
            AssistantTemplate.CUSTOMER: ["support", "faq", "policy", "product_info"],
            AssistantTemplate.SALES: ["product_info", "pricing", "marketing", "faq"],
            AssistantTemplate.ECOMMERCE: ["product_info", "pricing", "support", "faq"],
        }
        return intent_mapping.get(template, ["documentation", "support", "faq"])

    @classmethod
    def generate_system_prompt(cls, assistant: Assistant) -> str:
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
- For complex issues, guide customers to appropriate support channels""",
        }
        base_prompt = template_prompts.get(assistant.template, f"You are an AI assistant for {assistant.name}.")
        return (
            base_prompt
            + f"""

IMPORTANT GOVERNANCE RULES:
- Only use information from the provided context
- Never make up or hallucinate information
- Always cite sources using the provided source URLs
- Allowed content types: {', '.join(assistant.allowed_intents)}
- If a question is outside your allowed scope, politely decline and explain your limitations
- Maintain strict tenant isolation - only use content from this specific assistant's knowledge base"""
        )
