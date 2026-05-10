"""
Admin API routes for cache management and system operations.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging

from backend.cache.redis_cache import get_cache
from backend.api.routes.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


class CacheClearRequest(BaseModel):
    """Request model for cache clearing operations."""
    tenant_id: str
    cache_type: str | None = None  # "embedding", "filter", "answer", or None for all


class CacheClearResponse(BaseModel):
    """Response model for cache clearing operations."""
    success: bool
    message: str
    keys_deleted: int


@router.post("/cache/clear", response_model=CacheClearResponse)
async def clear_cache(
    request: CacheClearRequest,
    current_user=Depends(get_current_user),
):
    """
    Clear cached data for a specific tenant.

    This endpoint allows administrators to invalidate cached data when:
    - Assistant content has been re-ingested
    - Filter schema has changed
    - Cache entries need to be purged for any reason

    Args:
        request: Cache clear request with tenant_id and optional cache_type

    Returns:
        Response with success status and number of keys deleted

    Security:
        - Validates tenant_id format to prevent injection
        - Restricts cache_type to whitelisted values
        - Logs all cache clear operations for audit trail
    """
    try:
        cache = get_cache()
        tenant_id = request.tenant_id
        cache_type = request.cache_type

        # SECURITY: Validate tenant_id to prevent Redis injection
        # tenant_id should be alphanumeric, hyphens, and underscores only
        if not tenant_id or not isinstance(tenant_id, str):
            raise HTTPException(status_code=400, detail="tenant_id is required and must be a string")

        # Strip whitespace and validate format
        tenant_id = tenant_id.strip()
        if not tenant_id:
            raise HTTPException(status_code=400, detail="tenant_id cannot be empty")

        # Validate characters (alphanumeric, hyphens, underscores only)
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', tenant_id):
            raise HTTPException(
                status_code=400,
                detail="tenant_id contains invalid characters. Only alphanumeric, hyphens, and underscores allowed."
            )

        # Length check to prevent excessively long keys
        if len(tenant_id) > 128:
            raise HTTPException(status_code=400, detail="tenant_id exceeds maximum length of 128 characters")

        # SECURITY: Validate and whitelist cache_type
        valid_cache_types = {"embedding", "filter", "answer", None}
        if cache_type not in valid_cache_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid cache_type: {cache_type}. Must be 'embedding', 'filter', 'answer', or null.",
            )

        # TODO: Add tenant ownership verification
        # Future enhancement: Verify current_user has permission for this tenant_id
        # For now, we assume the auth layer handles this

        # Determine the prefix to clear
        if cache_type == "embedding":
            prefix = f"emb:{tenant_id}:"
        elif cache_type == "filter":
            prefix = f"filter:{tenant_id}:"
        elif cache_type == "answer":
            prefix = f"answer:{tenant_id}:"
        elif cache_type is None:
            # Clear all cache types for this tenant
            prefixes = [
                f"emb:{tenant_id}:",
                f"filter:{tenant_id}:",
                f"answer:{tenant_id}:",
            ]
            total_deleted = 0
            for prefix in prefixes:
                deleted = await cache.clear_prefix(prefix)
                total_deleted += deleted

            logger.info(
                "Cleared all cache types for tenant %s: %d keys deleted by user %s",
                tenant_id,
                total_deleted,
                getattr(current_user, 'id', 'unknown'),
            )
            return CacheClearResponse(
                success=True,
                message=f"Cleared all cache types for tenant {tenant_id}",
                keys_deleted=total_deleted,
            )

        # Clear the specific cache type
        keys_deleted = await cache.clear_prefix(prefix)

        logger.info(
            "Cleared %s cache for tenant %s: %d keys deleted by user %s",
            cache_type,
            tenant_id,
            keys_deleted,
            getattr(current_user, 'id', 'unknown'),
        )

        return CacheClearResponse(
            success=True,
            message=f"Cleared {cache_type} cache for tenant {tenant_id}",
            keys_deleted=keys_deleted,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error clearing cache: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear cache: {str(e)}",
        )


@router.get("/cache/stats")
async def get_cache_stats(current_user=Depends(get_current_user)):
    """
    Get cache statistics and health status.

    Returns:
        Cache connection status and basic statistics
    """
    try:
        cache = get_cache()

        # Try to ping Redis to check connection
        connected = await cache._ensure_connection()

        return {
            "redis_connected": connected,
            "redis_url": cache._redis_url[:30] if cache._redis_url else "not configured",
            "lru_enabled": cache._lru is not None,
            "cache_enabled": True,
        }

    except Exception as e:
        logger.error("Error getting cache stats: %s", e)
        return {
            "redis_connected": False,
            "error": str(e),
            "cache_enabled": False,
        }
