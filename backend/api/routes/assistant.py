"""
Assistant API - thin controllers over AssistantService.
"""
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List, Optional

from backend.assistants.service import AssistantService
from backend.api.dependencies import get_current_tenant, get_current_user, require_admin_or_owner
from backend.config.database import get_db
from backend.models.assistant import AssistantTemplate, SourceType
from backend.models.api_keys import ApiKey
from backend.models.tenant import Tenant
from backend.models.user import User
from backend.services.auth import AuthService


router = APIRouter()
assistant_service = AssistantService()


class CreateAssistantRequest(BaseModel):
    tenant_id: str
    user_name: str
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
    project_id: str
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
    widget_config: Dict[str, Any]
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
    widget_config: Optional[Dict[str, Any]] = None


class CreateApiKeyRequest(BaseModel):
    name: str
    rate_limit_per_minute: Optional[int] = 60


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    is_active: bool
    rate_limit_per_minute: int
    last_used_at: Optional[str]
    created_at: str


class CreateApiKeyResponse(ApiKeyResponse):
    api_key: str


class WidgetConfigResponse(BaseModel):
    assistant_id: str
    widget_config: Dict[str, Any]


def _to_response(assistant) -> AssistantResponse:
    return AssistantResponse(
        id=str(assistant.id),
        project_id=str(assistant.project_id),
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
        widget_config=assistant.widget_config or {},
        created_at=assistant.created_at.isoformat(),
        updated_at=assistant.updated_at.isoformat() if assistant.updated_at else None,
    )


def _api_key_response(api_key: ApiKey) -> ApiKeyResponse:
    return ApiKeyResponse(
        id=str(api_key.id),
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        is_active=bool(api_key.is_active),
        rate_limit_per_minute=int(api_key.rate_limit_per_minute or 60),
        last_used_at=api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        created_at=api_key.created_at.isoformat() if api_key.created_at else datetime.utcnow().isoformat(),
    )


@router.get("", response_model=ListAssistantsResponse)
async def list_assistants(
    tenant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    try:
        assistants = await assistant_service.list_assistants(db, current_tenant)
        return ListAssistantsResponse(assistants=[_to_response(assistant) for assistant in assistants], total=len(assistants))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list assistants: {exc}")


@router.post("/create", response_model=CreateAssistantResponse)
async def create_assistant(
    request: CreateAssistantRequest,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await assistant_service.create_assistant(db, current_tenant, request)
        assistant = result["assistant"]
        return CreateAssistantResponse(
            assistant_id=str(assistant.id),
            status="discovering",
            message="Assistant created successfully. Content scraping started.",
            scraping_job_id=result["job_id"],
        )
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create assistant: {exc}")


@router.get("/{assistant_id}", response_model=AssistantResponse)
async def get_assistant(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return _to_response(assistant)


@router.put("/{assistant_id}")
async def update_assistant(
    assistant_id: str,
    request: UpdateAssistantRequest,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership = Depends(require_admin_or_owner),
):
    try:
        updated = await assistant_service.update_assistant(db, current_tenant, assistant_id, request)
        if not updated:
            raise HTTPException(status_code=404, detail="Assistant not found")
        return {"message": "Assistant updated successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update assistant: {exc}")


@router.get("/{assistant_id}/widget-config", response_model=WidgetConfigResponse)
async def get_widget_config(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return WidgetConfigResponse(
        assistant_id=assistant_id,
        widget_config=assistant.widget_config or assistant_service.default_widget_config(),
    )


@router.put("/{assistant_id}/widget-config", response_model=WidgetConfigResponse)
async def update_widget_config(
    assistant_id: str,
    request: WidgetConfigResponse,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership = Depends(require_admin_or_owner),
):
    updated = await assistant_service.update_assistant(
        db,
        current_tenant,
        assistant_id,
        UpdateAssistantRequest(widget_config=request.widget_config),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Assistant not found")
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    return WidgetConfigResponse(
        assistant_id=assistant_id,
        widget_config=assistant.widget_config or assistant_service.default_widget_config(),
    )


@router.get("/{assistant_id}/api-keys", response_model=List[ApiKeyResponse])
async def list_assistant_api_keys(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.assistant_id == uuid.UUID(str(assistant_id)), ApiKey.tenant_id == current_tenant.id)
        .order_by(ApiKey.created_at.desc())
    )
    return [_api_key_response(api_key) for api_key in result.scalars().all()]


@router.post("/{assistant_id}/api-keys", response_model=CreateApiKeyResponse)
async def create_assistant_api_key(
    assistant_id: str,
    request: CreateApiKeyRequest,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership = Depends(require_admin_or_owner),
):
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    raw_key = AuthService.generate_api_key()
    key_prefix = raw_key.split(".", 1)[0]
    api_key = ApiKey(
        id=uuid.uuid4(),
        tenant_id=current_tenant.id,
        assistant_id=uuid.UUID(str(assistant_id)),
        name=request.name,
        key_prefix=key_prefix,
        key_hash=AuthService.hash_api_key(raw_key),
        rate_limit_per_minute=int(request.rate_limit_per_minute or 60),
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return CreateApiKeyResponse(
        api_key=raw_key,
        **_api_key_response(api_key).model_dump(),
    )


@router.delete("/{assistant_id}/api-keys/{api_key_id}")
async def revoke_assistant_api_key(
    assistant_id: str,
    api_key_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership = Depends(require_admin_or_owner),
):
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    api_key = await db.get(ApiKey, uuid.UUID(str(api_key_id)))
    if api_key is None or api_key.tenant_id != current_tenant.id or str(api_key.assistant_id) != assistant_id:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = False
    await db.commit()
    return {"message": "API key revoked", "api_key_id": api_key_id}


@router.post("/{assistant_id}/rescrape")
async def rescrape_assistant_content(
    assistant_id: str,
    scraping_config: Optional[Dict[str, Any]] = None,
    db: AsyncSession = Depends(get_db),
):
    raise HTTPException(
        status_code=410,
        detail="Re-scrape is currently disabled. Use the project website scrape flow to create a new scrape.",
    )


@router.get("/{assistant_id}/system-prompt")
async def get_system_prompt(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    assistant = await assistant_service.get_assistant(db, current_tenant, assistant_id)
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return {
        "assistant_id": assistant_id,
        "system_prompt": assistant.system_prompt,
        "governance_rules": assistant.governance_rules,
        "allowed_intents": assistant.allowed_intents,
        "template": assistant.template.value,
    }


@router.post("/{assistant_id}/activate")
async def activate_assistant(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership = Depends(require_admin_or_owner),
):
    try:
        assistant = await assistant_service.activate_assistant(db, current_tenant, assistant_id)
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        return {"message": "Assistant activated successfully", "assistant_id": assistant_id, "status": "ready"}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to activate assistant: {exc}")


@router.post("/{assistant_id}/sync-status")
async def sync_assistant_status(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    try:
        result = await assistant_service.sync_status(db, current_tenant, assistant_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Assistant not found")
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to sync status: {exc}")


@router.delete("/{assistant_id}")
async def delete_assistant(
    assistant_id: str,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership = Depends(require_admin_or_owner),
):
    try:
        assistant = await assistant_service.delete_assistant(db, current_tenant, assistant_id)
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        return {"message": "Assistant deleted successfully", "assistant_id": assistant_id}
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete assistant: {exc}")
