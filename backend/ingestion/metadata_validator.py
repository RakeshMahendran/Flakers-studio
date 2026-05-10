"""
Validation for extracted metadata before database/Qdrant insertion.

Ensures metadata conforms to the flat schema contract:
  - Values must be str, int, bool, or list[str] only
  - No nested dicts or complex objects
  - Keys must match expected schema
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Set

logger = logging.getLogger(__name__)

# Whitelist of allowed metadata keys with their expected types
METADATA_SCHEMA = {
    # Core post/page fields
    "date": str,
    "year": int,
    "month": int,
    "post_id": str,
    "type": str,
    "wp_type": str,
    "category_ids": list,
    "tag_ids": list,
    "slug": str,
    "author_id": str,
    # Event ACF fields
    "is_event": bool,
    "event_start_date": str,
    "event_end_date": str,
    "event_year": int,
    "event_month": int,
    "event_location": str,
}


class MetadataValidationError(Exception):
    """Raised when metadata fails validation."""
    pass


def validate_metadata(metadata: Dict[str, Any], strict: bool = False) -> Dict[str, Any]:
    """Validate extracted metadata against schema.

    Args:
        metadata: Metadata dict to validate
        strict: If True, raise on unknown keys; if False, filter them out

    Returns:
        Validated and sanitized metadata dict

    Raises:
        MetadataValidationError: If strict=True and validation fails
    """
    if not isinstance(metadata, dict):
        if strict:
            raise MetadataValidationError(f"Metadata must be dict, got {type(metadata)}")
        logger.warning("Metadata is not a dict, returning empty dict")
        return {}

    validated: Dict[str, Any] = {}
    errors: List[str] = []

    for key, value in metadata.items():
        # Check if key is known
        if key not in METADATA_SCHEMA:
            if strict:
                errors.append(f"Unknown key: {key}")
            else:
                logger.debug(f"Skipping unknown metadata key: {key}")
            continue

        expected_type = METADATA_SCHEMA[key]

        # Validate value type
        if expected_type == list:
            # List must contain only strings
            if not isinstance(value, list):
                errors.append(f"{key}: expected list, got {type(value).__name__}")
                continue
            if not all(isinstance(item, str) for item in value):
                errors.append(f"{key}: list must contain only strings")
                continue
            validated[key] = value

        elif expected_type == str:
            if not isinstance(value, str):
                # Coerce to string (defensive)
                validated[key] = str(value)
                logger.debug(f"{key}: coerced {type(value).__name__} to str")
            else:
                validated[key] = value

        elif expected_type == int:
            if not isinstance(value, int):
                # Try to coerce
                try:
                    validated[key] = int(value)
                    logger.debug(f"{key}: coerced {type(value).__name__} to int")
                except (ValueError, TypeError):
                    errors.append(f"{key}: cannot coerce {type(value).__name__} to int")
                    continue
            else:
                validated[key] = value

        elif expected_type == bool:
            if not isinstance(value, bool):
                # Coerce boolean-ish values
                if value in (1, "1", "true", "True", "yes", "Yes"):
                    validated[key] = True
                elif value in (0, "0", "false", "False", "no", "No"):
                    validated[key] = False
                else:
                    errors.append(f"{key}: cannot coerce {value!r} to bool")
                    continue
            else:
                validated[key] = value

        else:
            # Unknown type in schema (shouldn't happen)
            logger.error(f"Invalid schema type for {key}: {expected_type}")
            errors.append(f"{key}: invalid schema type {expected_type}")

    if errors and strict:
        raise MetadataValidationError("; ".join(errors))

    if errors:
        logger.warning(f"Metadata validation errors (non-strict mode): {'; '.join(errors)}")

    return validated


def validate_metadata_size(metadata: Dict[str, Any], max_size_bytes: int = 50_000) -> bool:
    """Check if serialized metadata size is within limits.

    Qdrant has a 10MB per-point limit, but we want to catch runaway metadata
    much earlier (e.g., 50KB is reasonable for structured metadata).

    Args:
        metadata: Metadata dict to check
        max_size_bytes: Maximum allowed size in bytes

    Returns:
        True if within limits, False otherwise
    """
    if not metadata:
        return True

    # Rough estimate: count all string content
    total_size = 0
    for key, value in metadata.items():
        total_size += len(key)
        if isinstance(value, str):
            total_size += len(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    total_size += len(item)
        # int/bool are negligible

    if total_size > max_size_bytes:
        logger.warning(
            f"Metadata size {total_size} bytes exceeds limit {max_size_bytes} bytes. "
            f"Keys: {list(metadata.keys())}"
        )
        return False

    return True
