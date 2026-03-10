import unittest
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from fastapi.testclient import TestClient

from backend.api.dependencies import get_db
from server.main import app
from tests.backend.support.fixtures import FakeAsyncSession, auth_context, iso_stub


class ApiRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.fake_db = FakeAsyncSession()

        async def override_get_db():
            yield self.fake_db

        app.dependency_overrides[get_db] = override_get_db

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_login_returns_tokens_for_demo_credentials(self):
        fake_user = auth_context(email="demo@flakers.studio")["user"]
        fake_tenant = auth_context(tenant_name="Demo Tenant")["tenant"]

        with patch("backend.api.routes.auth.AuthService.ensure_demo_context", new=AsyncMock(return_value={"user": fake_user, "tenant": fake_tenant})), \
             patch("backend.api.routes.auth.AuthService.create_access_token", return_value="access-token"), \
             patch("backend.api.routes.auth.AuthService.create_refresh_token", return_value="refresh-token"):
            response = self.client.post("/auth/login", json={"email": "demo@flakers.studio", "password": "demo123"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "access_token": "access-token",
                "refresh_token": "refresh-token",
                "tenant_id": "tenant-1",
                "user_id": "user-1",
                "token_type": "bearer",
            },
        )

    def test_assistant_list_requires_auth(self):
        response = self.client.get("/assistant")
        self.assertEqual(response.status_code, 401)

    def test_assistant_list_returns_authenticated_tenant_scope(self):
        context = auth_context()
        fake_tenant = context["tenant"]
        fake_user = context["user"]
        fake_assistant = SimpleNamespace(
            id="assistant-1",
            name="Support Assistant",
            description="Desc",
            source_type=SimpleNamespace(value="website"),
            site_url="https://example.com",
            template=SimpleNamespace(value="support"),
            status=SimpleNamespace(value="ready"),
            status_message="Ready",
            total_pages_crawled="10",
            total_chunks_indexed="42",
            allowed_intents=["support"],
            governance_rules={"tenant_isolation": True},
            widget_config={"enabled": True, "allowed_origins": ["https://example.com"]},
            created_at=iso_stub(),
            updated_at=None,
        )

        with patch("backend.api.dependencies.AuthService.get_authenticated_context", new=AsyncMock(return_value=context)), \
             patch("backend.api.routes.assistant.assistant_service.list_assistants", new=AsyncMock(return_value=[fake_assistant])):
            response = self.client.get("/assistant", headers={"Authorization": "Bearer test-token"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["assistants"][0]["id"], "assistant-1")
        self.assertEqual(body["assistants"][0]["governance_rules"]["tenant_isolation"], True)
        self.assertTrue(body["assistants"][0]["widget_config"]["enabled"])

    def test_chat_query_returns_not_found_for_tenant_mismatch(self):
        context = auth_context()

        with patch("backend.api.dependencies.AuthService.get_authenticated_context", new=AsyncMock(return_value=context)), \
             patch("backend.api.routes.chat._get_assistant", new=AsyncMock(return_value=None)):
            response = self.client.post(
                "/chat/query",
                headers={"Authorization": "Bearer test-token"},
                json={"assistant_id": "assistant-2", "user_message": "hello"},
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Assistant not found")

    def test_job_status_includes_lifecycle_metadata(self):
        fake_job_status = {
            "job_id": "job-1",
            "assistant_id": "assistant-1",
            "status": "cancelled",
            "current_stage": "cancelled",
            "progress_percentage": 50,
            "pages_processed": 3,
            "urls_discovered": 6,
            "urls_scraped": 4,
            "chunks_created": 8,
            "chunks_uploaded": 4,
            "errors_count": 1,
            "error_details": [{"error": "cancelled"}],
            "cancellation_requested": True,
            "cancellation_reason": "user",
            "cancelled_at": "2026-03-10T12:00:00",
            "started_at": "2026-03-10T11:00:00",
            "completed_at": None,
            "can_restart": True,
            "can_cancel": False,
            "retryable": True,
        }

        with patch("backend.api.routes.status.StatusUpdateService.update_job_progress", new=AsyncMock(return_value=fake_job_status)):
            response = self.client.get("/api/v1/status/job/job-1")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "cancelled")
        self.assertTrue(body["can_restart"])
        self.assertFalse(body["can_cancel"])
        self.assertEqual(body["chunks_uploaded"], 4)

    def test_cancel_job_requests_cooperative_cancellation(self):
        with patch("backend.api.routes.status.request_job_cancellation", new=AsyncMock(return_value=True)):
            response = self.client.post("/api/v1/status/job/job-1/cancel", params={"reason": "user requested"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["job_id"], "job-1")
        self.assertEqual(response.json()["reason"], "user requested")

    def test_public_chat_requires_valid_api_key(self):
        with patch("backend.api.routes.public_chat.AuthService.authenticate_api_key", new=AsyncMock(return_value=None)):
            response = self.client.post(
                "/api/v1/public/chat",
                json={"assistant_id": "assistant-1", "tenant_id": "tenant-1", "user_message": "hello"},
                headers={"Authorization": "Bearer invalid"},
            )

        self.assertEqual(response.status_code, 401)

    def test_public_chat_uses_rag_pipeline_for_valid_key(self):
        fake_api_key = SimpleNamespace(id="key-1", assistant_id="assistant-1", tenant_id="tenant-1", rate_limit_per_minute=60)
        fake_assistant = SimpleNamespace(
            id="assistant-1",
            tenant_id="tenant-1",
            is_active=True,
            widget_config={"enabled": True, "allowed_origins": ["https://example.com"]},
        )
        fake_response = {
            "decision": "answer",
            "answer": "Hello from public chat",
            "reason": None,
            "sources": [],
            "rules_applied": ["tenant_isolation"],
            "allowed_scope": ["support"],
            "session_id": "session-1",
            "processing_time_ms": 5,
        }

        with patch("backend.api.routes.public_chat.AuthService.authenticate_api_key", new=AsyncMock(return_value=fake_api_key)), \
             patch("backend.api.routes.public_chat._get_public_assistant", new=AsyncMock(return_value=fake_assistant)), \
             patch("backend.api.routes.public_chat.public_rag_pipeline.handle_query", new=AsyncMock(return_value=fake_response)):
            response = self.client.post(
                "/api/v1/public/chat",
                json={"assistant_id": "assistant-1", "tenant_id": "tenant-1", "user_message": "hello"},
                headers={"Authorization": "Bearer fsw_test.secret", "Origin": "https://example.com"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], "Hello from public chat")

    def test_create_assistant_api_key_returns_secret_once(self):
        assistant_id = "11111111-1111-1111-1111-111111111111"
        tenant_id = "22222222-2222-2222-2222-222222222222"
        context = auth_context(tenant_id=tenant_id)
        fake_assistant = SimpleNamespace(id=assistant_id)

        async def refresh_side_effect(obj):
            obj.id = "key-1"
            obj.name = "Widget key"
            obj.key_prefix = "fsw_test"
            obj.is_active = True
            obj.rate_limit_per_minute = 60
            obj.last_used_at = None
            obj.created_at = iso_stub()

        self.fake_db.refresh = AsyncMock(side_effect=refresh_side_effect)

        with patch("backend.api.dependencies.AuthService.get_authenticated_context", new=AsyncMock(return_value=context)), \
             patch("backend.api.routes.assistant.assistant_service.get_assistant", new=AsyncMock(return_value=fake_assistant)), \
             patch("backend.api.routes.assistant.AuthService.generate_api_key", return_value="fsw_test.secret"), \
             patch("backend.api.routes.assistant.AuthService.hash_api_key", return_value="hashed"):
            response = self.client.post(
                f"/assistant/{assistant_id}/api-keys",
                headers={"Authorization": "Bearer test-token"},
                json={"name": "Widget key", "rate_limit_per_minute": 60},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["api_key"], "fsw_test.secret")
        self.assertEqual(response.json()["key_prefix"], "fsw_test")

    def test_create_assistant_api_key_requires_admin_or_owner(self):
        assistant_id = "11111111-1111-1111-1111-111111111111"
        context = auth_context(
            tenant_id="22222222-2222-2222-2222-222222222222",
            email="member@example.com",
            role="member",
        )

        with patch("backend.api.dependencies.AuthService.get_authenticated_context", new=AsyncMock(return_value=context)):
            response = self.client.post(
                f"/assistant/{assistant_id}/api-keys",
                headers={"Authorization": "Bearer test-token"},
                json={"name": "Widget key", "rate_limit_per_minute": 60},
            )

        self.assertEqual(response.status_code, 403)

    def test_public_widget_config_requires_widget_enabled(self):
        fake_api_key = SimpleNamespace(id="key-1", assistant_id="assistant-1", tenant_id="tenant-1", rate_limit_per_minute=60)
        fake_assistant = SimpleNamespace(
            id="assistant-1",
            tenant_id="tenant-1",
            is_active=True,
            widget_config={"enabled": False, "allowed_origins": []},
        )

        with patch("backend.api.routes.public_chat.AuthService.authenticate_api_key", new=AsyncMock(return_value=fake_api_key)), \
             patch("backend.api.routes.public_chat._get_public_assistant", new=AsyncMock(return_value=fake_assistant)):
            response = self.client.get(
                "/api/v1/public/widget-config/assistant-1?tenant_id=tenant-1",
                headers={"Authorization": "Bearer fsw_test.secret"},
            )

        self.assertEqual(response.status_code, 403)

    def test_health_propagates_request_id_header(self):
        response = self.client.get("/health", headers={"X-Request-ID": "req-123"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("X-Request-ID"), "req-123")

    def test_metrics_endpoint_is_exposed(self):
        response = self.client.get("/metrics")
        self.assertEqual(response.status_code, 200)
        self.assertIn("flakers_chat_requests_total", response.text)


if __name__ == "__main__":
    unittest.main()
