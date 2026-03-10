from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock


class FakeAsyncSession(SimpleNamespace):
    """Small async-session stand-in for route tests."""

    def __init__(self) -> None:
        super().__init__()
        self.add = lambda *_args, **_kwargs: None
        self.commit = AsyncMock(return_value=None)
        self.refresh = AsyncMock(return_value=None)


def auth_context(*, user_id: str = "user-1", email: str = "owner@example.com", tenant_id: str = "tenant-1", tenant_name: str = "Tenant One", role: str = "owner") -> dict[str, SimpleNamespace]:
    return {
        "user": SimpleNamespace(id=user_id, email=email),
        "tenant": SimpleNamespace(id=tenant_id, name=tenant_name),
        "membership": SimpleNamespace(role=role),
    }


def iso_stub(value: str = "2026-03-10T00:00:00") -> SimpleNamespace:
    return SimpleNamespace(isoformat=lambda: value)


class FakeVectorStore:
    def __init__(self, *, results=None):
        self.results = results or []
        self.search = AsyncMock(return_value=self.results)
        self.upsert = AsyncMock(return_value=None)
        self.delete = AsyncMock(return_value=None)


class FakeLLMClient:
    def __init__(self, *, response: str = "Stubbed answer") -> None:
        self.response = response
        self.generate = AsyncMock(return_value=response)
