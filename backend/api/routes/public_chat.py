"""
Public chat API for widget traffic.
"""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta
import time
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.database import get_db
from backend.config.logging import log_context
from backend.models.api_keys import ApiKey
from backend.models.assistant import Assistant
from backend.observability.metrics import observe_chat
from backend.retrieval.rag_pipeline import RAGPipeline
from backend.services.auth import AuthService


router = APIRouter(prefix="/public", tags=["public-chat"])
public_rag_pipeline = RAGPipeline()
_rate_limit_windows: dict[str, deque[datetime]] = defaultdict(deque)


class PublicChatRequest(BaseModel):
    assistant_id: str
    tenant_id: str
    user_message: str
    session_id: str | None = None


class PublicChatResponse(BaseModel):
    decision: str
    answer: str | None = None
    reason: str | None = None
    sources: list[dict[str, str]] = []
    rules_applied: list[str] = []
    allowed_scope: list[str] = []
    session_id: str
    processing_time_ms: int


class PublicWidgetConfigResponse(BaseModel):
    assistant_id: str
    tenant_id: str
    widget_config: dict[str, object]


async def get_public_api_key(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> ApiKey:
    raw_api_key = x_api_key
    if authorization and authorization.lower().startswith("bearer "):
        raw_api_key = authorization.split(" ", 1)[1].strip()

    api_key = await AuthService.authenticate_api_key(db, raw_api_key or "")
    if api_key is None:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key


def enforce_rate_limit(api_key: ApiKey) -> None:
    now = datetime.utcnow()
    window = _rate_limit_windows[str(api_key.id)]
    limit = int(api_key.rate_limit_per_minute or 60)

    while window and (now - window[0]) > timedelta(minutes=1):
        window.popleft()

    if len(window) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    window.append(now)


async def _get_public_assistant(
    db: AsyncSession,
    assistant_id: str,
    tenant_id: str,
) -> Assistant | None:
    result = await db.execute(
        select(Assistant).where(
            Assistant.id == uuid.UUID(assistant_id),
            Assistant.tenant_id == uuid.UUID(tenant_id),
            Assistant.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


def _assistant_widget_config(assistant: Assistant) -> dict:
    return assistant.widget_config or {}


def _validate_widget_access(assistant: Assistant, origin: str | None) -> None:
    widget_config = _assistant_widget_config(assistant)
    if not widget_config.get("enabled", False):
        raise HTTPException(status_code=403, detail="Widget access is disabled for this assistant")

    allowed_origins = widget_config.get("allowed_origins") or []
    if origin and allowed_origins and "*" not in allowed_origins and origin not in allowed_origins:
        raise HTTPException(status_code=403, detail="Origin is not allowed for this assistant widget")


@router.post("/chat", response_model=PublicChatResponse)
async def public_chat_query(
    request: PublicChatRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_public_api_key),
    origin: str | None = Header(default=None),
):
    start_time = time.time()

    if str(api_key.assistant_id) != request.assistant_id or str(api_key.tenant_id) != request.tenant_id:
        raise HTTPException(status_code=403, detail="API key does not match assistant or tenant")

    enforce_rate_limit(api_key)

    assistant = await _get_public_assistant(db, request.assistant_id, request.tenant_id)
    if assistant is None:
        raise HTTPException(status_code=404, detail="Assistant not found")
    _validate_widget_access(assistant, origin)

    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"

    with log_context(tenant_id=request.tenant_id, assistant_id=request.assistant_id):
        result = await public_rag_pipeline.handle_query(
            db=db,
            assistant=assistant,
            user_message=request.user_message,
            session_id=request.session_id,
        )
        result["processing_time_ms"] = int((time.time() - start_time) * 1000)
        observe_chat("public_chat", str(result.get("decision", "unknown")).lower(), (time.time() - start_time))
        return PublicChatResponse(**result)


@router.get("/widget-config/{assistant_id}", response_model=PublicWidgetConfigResponse)
async def public_widget_config(
    assistant_id: str,
    tenant_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_public_api_key),
    origin: str | None = Header(default=None),
):
    if str(api_key.assistant_id) != assistant_id or str(api_key.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="API key does not match assistant or tenant")

    assistant = await _get_public_assistant(db, assistant_id, tenant_id)
    if assistant is None:
        raise HTTPException(status_code=404, detail="Assistant not found")
    _validate_widget_access(assistant, origin)

    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"

    return PublicWidgetConfigResponse(
        assistant_id=assistant_id,
        tenant_id=tenant_id,
        widget_config=_assistant_widget_config(assistant),
    )
