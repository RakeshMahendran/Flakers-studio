"""
Authentication and tenant membership utilities.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac
from typing import Any, Dict, Optional
import base64
import hmac
import secrets
import uuid

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.settings import settings
from backend.models.membership import MembershipRole, UserTenantMembership
from backend.models.api_keys import ApiKey
from backend.models.tenant import Tenant
from backend.models.user import User


DEMO_EMAIL = "demo@flakers.studio"
DEMO_PASSWORD = "demo123"
DEMO_USER_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "flakers-studio-demo-user")
DEMO_TENANT_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "flakers-studio-demo-tenant")


class AuthService:
    access_token_type = "access"
    refresh_token_type = "refresh"

    @staticmethod
    def hash_password(password: str, salt: Optional[bytes] = None) -> str:
        salt = salt or secrets.token_bytes(16)
        password_hash = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
        return f"{base64.b64encode(salt).decode()}${base64.b64encode(password_hash).decode()}"

    @staticmethod
    def generate_api_key(prefix: Optional[str] = None) -> str:
        key_prefix = prefix or f"fsw_{secrets.token_hex(4)}"
        return f"{key_prefix}.{secrets.token_urlsafe(24)}"

    @classmethod
    def hash_api_key(cls, api_key: str) -> str:
        return cls.hash_password(api_key)

    @classmethod
    def verify_api_key(cls, api_key: str, key_hash: str) -> bool:
        return cls.verify_password(api_key, key_hash)

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        try:
            salt_b64, digest_b64 = password_hash.split("$", 1)
            salt = base64.b64decode(salt_b64.encode())
            expected = base64.b64decode(digest_b64.encode())
            candidate = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
            return hmac.compare_digest(candidate, expected)
        except Exception:
            return False

    @classmethod
    def create_token(cls, *, user_id: str, tenant_id: str, email: str, token_type: str, expires_delta: timedelta) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user_id,
            "tenant_id": tenant_id,
            "email": email,
            "type": token_type,
            "iat": int(now.timestamp()),
            "exp": int((now + expires_delta).timestamp()),
        }
        return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    @classmethod
    def create_access_token(cls, *, user_id: str, tenant_id: str, email: str) -> str:
        return cls.create_token(
            user_id=user_id,
            tenant_id=tenant_id,
            email=email,
            token_type=cls.access_token_type,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )

    @classmethod
    def create_refresh_token(cls, *, user_id: str, tenant_id: str, email: str) -> str:
        return cls.create_token(
            user_id=user_id,
            tenant_id=tenant_id,
            email=email,
            token_type=cls.refresh_token_type,
            expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )

    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    @classmethod
    async def authenticate_user(cls, db: AsyncSession, email: str, password: str) -> Optional[Dict[str, Any]]:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user or not user.is_active or not cls.verify_password(password, user.password_hash):
            return None

        membership = await cls.get_default_membership(db, user.id)
        if membership is None:
            return None

        tenant = await db.get(Tenant, membership.tenant_id)
        if tenant is None or not tenant.is_active:
            return None

        return {"user": user, "membership": membership, "tenant": tenant}

    @staticmethod
    async def get_default_membership(db: AsyncSession, user_id: uuid.UUID) -> Optional[UserTenantMembership]:
        result = await db.execute(
            select(UserTenantMembership)
            .where(
                UserTenantMembership.user_id == user_id,
                UserTenantMembership.status == "active",
            )
            .order_by(UserTenantMembership.is_default.desc(), UserTenantMembership.created_at.asc())
        )
        return result.scalars().first()

    @classmethod
    async def register_user(
        cls,
        db: AsyncSession,
        *,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        tenant_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            raise ValueError("User already exists")

        tenant_display_name = tenant_name or f"{email.split('@')[0]}'s Workspace"
        tenant_slug = cls._slugify(tenant_display_name)

        slug_counter = 1
        unique_slug = tenant_slug
        while True:
            existing_tenant = await db.execute(select(Tenant).where(Tenant.slug == unique_slug))
            if existing_tenant.scalar_one_or_none() is None:
                break
            unique_slug = f"{tenant_slug}-{slug_counter}"
            slug_counter += 1

        tenant = Tenant(id=uuid.uuid4(), name=tenant_display_name, slug=unique_slug)
        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=cls.hash_password(password),
            full_name=full_name,
        )
        membership = UserTenantMembership(
            user_id=user.id,
            tenant_id=tenant.id,
            role=MembershipRole.OWNER.value,
            is_default=True,
        )

        db.add(tenant)
        db.add(user)
        db.add(membership)
        await db.commit()
        await db.refresh(user)
        await db.refresh(tenant)
        await db.refresh(membership)

        return {"user": user, "tenant": tenant, "membership": membership}

    @classmethod
    async def get_authenticated_context(cls, db: AsyncSession, token: str) -> Dict[str, Any]:
        if cls.is_legacy_demo_token(token):
            return await cls.ensure_demo_context(db)

        payload = cls.decode_token(token)
        if payload.get("type") != cls.access_token_type:
            raise ValueError("Invalid access token")

        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        if not user_id or not tenant_id:
            raise ValueError("Invalid token claims")

        user = await db.get(User, uuid.UUID(str(user_id)))
        tenant = await db.get(Tenant, uuid.UUID(str(tenant_id)))
        if not user or not user.is_active or not tenant or not tenant.is_active:
            raise ValueError("Invalid user or tenant")

        membership_result = await db.execute(
            select(UserTenantMembership).where(
                UserTenantMembership.user_id == user.id,
                UserTenantMembership.tenant_id == tenant.id,
                UserTenantMembership.status == "active",
            )
        )
        membership = membership_result.scalar_one_or_none()
        if membership is None:
            raise ValueError("Tenant membership not found")

        return {"user": user, "tenant": tenant, "membership": membership, "claims": payload}

    @classmethod
    async def refresh_access_token(cls, db: AsyncSession, refresh_token: str) -> Dict[str, Any]:
        if cls.is_legacy_demo_token(refresh_token):
            context = await cls.ensure_demo_context(db)
            user = context["user"]
            tenant = context["tenant"]
            return {
                "access_token": cls.create_access_token(user_id=str(user.id), tenant_id=str(tenant.id), email=user.email),
                "refresh_token": cls.create_refresh_token(user_id=str(user.id), tenant_id=str(tenant.id), email=user.email),
                "user": user,
                "tenant": tenant,
            }

        payload = cls.decode_token(refresh_token)
        if payload.get("type") != cls.refresh_token_type:
            raise ValueError("Invalid refresh token")
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        email = payload.get("email")
        if not user_id or not tenant_id or not email:
            raise ValueError("Invalid refresh token claims")

        user = await db.get(User, uuid.UUID(str(user_id)))
        tenant = await db.get(Tenant, uuid.UUID(str(tenant_id)))
        if not user or not tenant:
            raise ValueError("Invalid refresh token subject")

        membership_result = await db.execute(
            select(UserTenantMembership).where(
                UserTenantMembership.user_id == user.id,
                UserTenantMembership.tenant_id == tenant.id,
                UserTenantMembership.status == "active",
            )
        )
        if membership_result.scalar_one_or_none() is None:
            raise ValueError("Tenant membership not found")

        return {
            "access_token": cls.create_access_token(user_id=str(user.id), tenant_id=str(tenant.id), email=user.email),
            "refresh_token": cls.create_refresh_token(user_id=str(user.id), tenant_id=str(tenant.id), email=user.email),
            "user": user,
            "tenant": tenant,
        }

    @classmethod
    async def ensure_demo_context(cls, db: AsyncSession) -> Dict[str, Any]:
        tenant = await db.get(Tenant, DEMO_TENANT_ID)
        user = await db.get(User, DEMO_USER_ID)

        if tenant is None:
            tenant = Tenant(id=DEMO_TENANT_ID, name="Demo Tenant", slug="demo-tenant")
            db.add(tenant)
        if user is None:
            user = User(
                id=DEMO_USER_ID,
                email=DEMO_EMAIL,
                password_hash=cls.hash_password(DEMO_PASSWORD),
                full_name="Demo User",
            )
            db.add(user)
        await db.flush()

        membership_result = await db.execute(
            select(UserTenantMembership).where(
                UserTenantMembership.user_id == DEMO_USER_ID,
                UserTenantMembership.tenant_id == DEMO_TENANT_ID,
            )
        )
        membership = membership_result.scalar_one_or_none()
        if membership is None:
            membership = UserTenantMembership(
                user_id=DEMO_USER_ID,
                tenant_id=DEMO_TENANT_ID,
                role=MembershipRole.OWNER.value,
                is_default=True,
            )
            db.add(membership)

        await db.commit()
        await db.refresh(user)
        await db.refresh(tenant)
        await db.refresh(membership)
        return {"user": user, "tenant": tenant, "membership": membership, "claims": {"legacy_demo": True}}

    @staticmethod
    def is_legacy_demo_token(token: str) -> bool:
        return token == "demo_token_123" or token.startswith("demo-token-")

    @classmethod
    async def authenticate_api_key(cls, db: AsyncSession, raw_api_key: str) -> Optional[ApiKey]:
        if not raw_api_key or "." not in raw_api_key:
            return None

        key_prefix = raw_api_key.split(".", 1)[0]
        result = await db.execute(
            select(ApiKey).where(
                ApiKey.key_prefix == key_prefix,
                ApiKey.is_active.is_(True),
            )
        )
        api_key = result.scalar_one_or_none()
        if api_key is None or not cls.verify_api_key(raw_api_key, api_key.key_hash):
            return None

        api_key.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        return api_key

    @staticmethod
    def _slugify(value: str) -> str:
        cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
        while "--" in cleaned:
            cleaned = cleaned.replace("--", "-")
        return cleaned or f"tenant-{uuid.uuid4().hex[:8]}"
