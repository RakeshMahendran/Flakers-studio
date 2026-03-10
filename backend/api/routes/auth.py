"""
Authentication API - JWT-based first-party auth.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from backend.api.dependencies import get_current_tenant, get_current_user
from backend.config.database import get_db
from backend.models.tenant import Tenant
from backend.models.user import User
from backend.services.auth import AuthService

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    tenant_name: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    tenant_id: str
    user_id: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: str
    email: str
    tenant_id: str
    tenant_name: str


def _build_auth_response(*, user: User, tenant: Tenant) -> AuthResponse:
    return AuthResponse(
        access_token=AuthService.create_access_token(user_id=str(user.id), tenant_id=str(tenant.id), email=user.email),
        refresh_token=AuthService.create_refresh_token(user_id=str(user.id), tenant_id=str(tenant.id), email=user.email),
        tenant_id=str(tenant.id),
        user_id=str(user.id),
    )


@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await AuthService.register_user(
            db,
            email=request.email,
            password=request.password,
            full_name=request.full_name,
            tenant_name=request.tenant_name,
        )
        return _build_auth_response(user=result["user"], tenant=result["tenant"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    if AuthService.is_legacy_demo_token("demo_token_123") and request.email == "demo@flakers.studio" and request.password == "demo123":
        demo_context = await AuthService.ensure_demo_context(db)
        return _build_auth_response(user=demo_context["user"], tenant=demo_context["tenant"])

    authenticated = await AuthService.authenticate_user(db, request.email, request.password)
    if authenticated is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return _build_auth_response(
        user=authenticated["user"],
        tenant=authenticated["tenant"],
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh(request: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        refreshed = await AuthService.refresh_access_token(db, request.refresh_token)
        return AuthResponse(
            access_token=refreshed["access_token"],
            refresh_token=refreshed["refresh_token"],
            tenant_id=str(refreshed["tenant"].id),
            user_id=str(refreshed["user"].id),
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    return MeResponse(
        user_id=str(current_user.id),
        email=current_user.email,
        tenant_id=str(current_tenant.id),
        tenant_name=current_tenant.name,
    )
