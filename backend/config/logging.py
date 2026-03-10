"""
Structured logging configuration and request context helpers.
"""
from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Dict, Iterator, Optional


_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)
_tenant_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("tenant_id", default=None)
_assistant_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("assistant_id", default=None)
_user_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("user_id", default=None)


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_var.get()
        record.tenant_id = _tenant_id_var.get()
        record.assistant_id = _assistant_id_var.get()
        record.user_id = _user_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            "tenant_id": getattr(record, "tenant_id", None),
            "assistant_id": getattr(record, "assistant_id", None),
            "user_id": getattr(record, "user_id", None),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ContextFilter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)


def set_log_context(
    *,
    request_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    assistant_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, contextvars.Token]:
    tokens: Dict[str, contextvars.Token] = {}
    if request_id is not None:
        tokens["request_id"] = _request_id_var.set(request_id)
    if tenant_id is not None:
        tokens["tenant_id"] = _tenant_id_var.set(str(tenant_id))
    if assistant_id is not None:
        tokens["assistant_id"] = _assistant_id_var.set(str(assistant_id))
    if user_id is not None:
        tokens["user_id"] = _user_id_var.set(str(user_id))
    return tokens


def reset_log_context(tokens: Dict[str, contextvars.Token]) -> None:
    for key, token in reversed(list(tokens.items())):
        if key == "request_id":
            _request_id_var.reset(token)
        elif key == "tenant_id":
            _tenant_id_var.reset(token)
        elif key == "assistant_id":
            _assistant_id_var.reset(token)
        elif key == "user_id":
            _user_id_var.reset(token)


@contextlib.contextmanager
def log_context(**kwargs: Optional[str]) -> Iterator[None]:
    tokens = set_log_context(**kwargs)
    try:
        yield
    finally:
        reset_log_context(tokens)


def get_request_id() -> Optional[str]:
    return _request_id_var.get()
