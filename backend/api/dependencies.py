"""
Shared API dependencies for auth and tenant resolution.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.database import get_db
from backend.config.logging import set_log_context
from backend.models.membership import MembershipRole, UserTenantMembership
from backend.models.tenant import Tenant
from backend.models.user import User
from backend.services.auth import AuthService


auth_scheme = HTTPBearer(auto_error=False)


async def get_auth_context(
    credentials: HTTPAuthorizationCredentials = Depends(auth_scheme),
    db: AsyncSession = Depends(get_db),
):
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header required")

    try:
        auth_context = await AuthService.get_authenticated_context(db, credentials.credentials)
        set_log_context(
            tenant_id=str(auth_context["tenant"].id),
            user_id=str(auth_context["user"].id),
        )
        return auth_context
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid authentication credentials: {exc}")


async def get_current_user(auth_context=Depends(get_auth_context)) -> User:
    return auth_context["user"]


async def get_current_tenant(auth_context=Depends(get_auth_context)) -> Tenant:
    return auth_context["tenant"]


async def get_current_membership(auth_context=Depends(get_auth_context)) -> UserTenantMembership:
    return auth_context["membership"]


def require_membership_role(*allowed_roles: MembershipRole):
    allowed = {role.value if isinstance(role, MembershipRole) else str(role) for role in allowed_roles}

    async def dependency(membership: UserTenantMembership = Depends(get_current_membership)) -> UserTenantMembership:
        if membership.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires one of roles: {', '.join(sorted(allowed))}",
            )
        return membership

    return dependency


require_admin_or_owner = require_membership_role(MembershipRole.ADMIN, MembershipRole.OWNER)
