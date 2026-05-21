"""
Authentication API - JWT-based first-party auth.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from backend.api.dependencies import get_current_tenant, get_current_user, require_admin_or_owner
from backend.config.database import get_db
from backend.models.membership import MembershipRole, UserTenantMembership
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
    full_name: Optional[str] = None
    tenant_id: str
    tenant_name: str
    role: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=320)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=255)


class UpdateTenantRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class TenantResponse(BaseModel):
    tenant_id: str
    name: str
    slug: str


class MemberResponse(BaseModel):
    user_id: str
    email: str
    full_name: Optional[str] = None
    role: str
    joined_at: Optional[str] = None


class ListMembersResponse(BaseModel):
    members: List[MemberResponse]
    total: int


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
    db: AsyncSession = Depends(get_db),
):
    # Resolve role from membership for the current tenant.
    result = await db.execute(
        select(UserTenantMembership.role).where(
            UserTenantMembership.user_id == current_user.id,
            UserTenantMembership.tenant_id == current_tenant.id,
            UserTenantMembership.status == "active",
        )
    )
    role = result.scalar_one_or_none()
    return MeResponse(
        user_id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        tenant_id=str(current_tenant.id),
        tenant_name=current_tenant.name,
        role=role,
    )


@router.patch("/me", response_model=MeResponse)
async def update_me(
    request: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    """Update the current user's profile (name and/or email)."""
    if request.full_name is None and request.email is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Email change: ensure not already taken by another user.
    if request.email is not None and request.email.lower() != current_user.email.lower():
        new_email = request.email.strip().lower()
        # Basic email shape check (avoid pulling email-validator dep).
        if "@" not in new_email or "." not in new_email.split("@", 1)[1] or len(new_email) < 5:
            raise HTTPException(status_code=400, detail="Invalid email address")
        existing = await db.execute(
            select(User).where(User.email == new_email, User.id != current_user.id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = new_email

    if request.full_name is not None:
        current_user.full_name = request.full_name.strip() or None

    await db.commit()
    await db.refresh(current_user)

    return MeResponse(
        user_id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        tenant_id=str(current_tenant.id),
        tenant_name=current_tenant.name,
    )


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the authenticated user's password."""
    if not AuthService.verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if request.current_password == request.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")

    current_user.password_hash = AuthService.hash_password(request.new_password)
    await db.commit()
    return {"message": "Password updated successfully"}


@router.get("/tenant", response_model=TenantResponse)
async def get_tenant(
    current_tenant: Tenant = Depends(get_current_tenant),
):
    """Get the current tenant's details."""
    return TenantResponse(
        tenant_id=str(current_tenant.id),
        name=current_tenant.name,
        slug=current_tenant.slug,
    )


@router.put("/tenant", response_model=TenantResponse)
async def update_tenant(
    request: UpdateTenantRequest,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
    _membership=Depends(require_admin_or_owner),
):
    """Rename the current tenant. Requires admin or owner role."""
    new_name = request.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Tenant name cannot be empty")
    current_tenant.name = new_name
    await db.commit()
    await db.refresh(current_tenant)
    return TenantResponse(
        tenant_id=str(current_tenant.id),
        name=current_tenant.name,
        slug=current_tenant.slug,
    )


@router.get("/tenant/members", response_model=ListMembersResponse)
async def list_tenant_members(
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    """List members of the current tenant."""
    result = await db.execute(
        select(UserTenantMembership, User)
        .join(User, User.id == UserTenantMembership.user_id)
        .where(
            UserTenantMembership.tenant_id == current_tenant.id,
            UserTenantMembership.status == "active",
        )
        .order_by(UserTenantMembership.created_at.asc())
    )
    rows = result.all()
    members = [
        MemberResponse(
            user_id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            role=membership.role,
            joined_at=membership.created_at.isoformat() if membership.created_at else None,
        )
        for membership, user in rows
    ]
    return ListMembersResponse(members=members, total=len(members))
