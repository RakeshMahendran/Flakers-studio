## Flakers Studio – Linear-Ready Engineering Tasks

This file groups engineering tasks by milestone. Each task includes a title, description, technical scope, and modules affected, formatted to be easy to import into Linear or a similar tool.

---

### Foundational Refactor

**Task:** F-1 – Restructure backend package under `backend/` `[completed]`  
**Description:**  
Introduce the target `backend/` package layout, move the current FastAPI modules into their planned domains (`config`, `models`, `services`, `ingestion`, `vector_providers`, `api`), and keep `server/main.py` as the runtime entrypoint with imports updated to `backend.*`. Preserve existing routes and DTO semantics while validating imports and startup behavior.  
**Technical Scope:**  
- Create `backend/` package structure and relocate existing modules.  
- Update imports across backend code and `server/main.py`.  
- Run compile/import smoke checks after the move.  
**Modules Affected:**  
- `backend/*`  
- `server/main.py`  

---
### Milestone M1 – Multi-Tenant Auth & Tenant Modeling

**Task:** M1-1 – Introduce Tenant and User models `[completed]`  
**Description:**  
Add SQLAlchemy models for `Tenant`, `User`, and `UserTenantMembership`, including basic metadata (names, emails, statuses), timestamps, and relational constraints. Ensure that migrations are created and that existing projects/assistants can be backfilled or associated with a default tenant for development.  
**Technical Scope:**  
- Define models and relationships in `backend/models`.  
- Create Alembic migrations for new tables and constraints.  
- Update `init_db` and tests to manage the new schema.  
**Modules Affected:**  
- `backend/models/*`  
- `backend/config/database.py`  
- Migrations under `backend/migrations`  

---

**Task:** M1-2 – Implement JWT-based first-party auth `[completed]`  
**Description:**  
Implement registration, login, and token refresh endpoints for first-party auth. Use secure password hashing, signed JWT access tokens, and (optionally) refresh tokens. On successful auth, associate users with a default tenant and return tenant and user identifiers in the token claims.  
**Technical Scope:**  
- Add auth service for password hashing, token creation, and verification.  
- Create FastAPI routes for register, login, and refresh.  
- Store and validate tokens using shared secrets from config.  
**Modules Affected:**  
- `backend/services/auth.py`  
- `backend/api/routes/auth.py`  
- `backend/config/settings.py`  

---

**Task:** M1-3 – Add tenant-aware dependency injection `[completed]`  
**Description:**  
Implement FastAPI dependencies that extract `current_user` and `current_tenant` from JWTs and memberships. Ensure these dependencies are reusable and can be applied across all tenant-scoped endpoints.  
**Technical Scope:**  
- Implement `get_current_user` and `get_current_tenant` helpers.  
- Integrate with the membership model to validate tenant membership and roles.  
- Provide clear error responses for missing/invalid tokens and unauthorized access.  
**Modules Affected:**  
- `backend/api/dependencies.py`  
- `backend/services/auth.py`  
- `backend/api/routes/*` (for integration)  

---

**Task:** M1-4 – Refactor existing APIs to derive tenant from auth `[completed]`  
**Description:**  
Remove usages of `tenant_id` from request bodies and query parameters where possible. Update assistant, project, and ingestion routes to rely on `current_tenant` from dependencies instead, and add authorization checks to prevent cross-tenant access.  
**Technical Scope:**  
- Update pydantic request models and route signatures.  
- Replace manual `tenant_id` handling with injected `current_tenant`.  
- Add tests for cross-tenant access attempts.  
**Modules Affected:**  
- `backend/api/routes/assistant.py`  
- `backend/api/routes/projects.py`  
- `backend/api/routes/chat.py`  
- `backend/api/routes/analytics.py`  

---

### Milestone M2 – Assistant Management & Governance

**Task:** M2-1 – Extract assistant domain service `[completed]`  
**Description:**  
Refactor assistant-related logic from `api/routes/assistant.py` into a dedicated `AssistantService` in `backend/assistants/service.py`. The service should handle create, list, get, update, activate, delete, and status sync, with clear interfaces and internal validation.  
**Technical Scope:**  
- Create `AssistantService` with methods mirroring current route behavior.  
- Move governance rules and system prompt generation into the service where appropriate.  
- Keep routes as thin controllers that call the service and handle HTTP concerns.  
**Modules Affected:**  
- `backend/assistants/service.py`  
- `backend/api/routes/assistant.py`  
- `backend/services/governance.py`  

---

**Task:** M2-2 – Align assistant flows with tenant context `[completed]`  
**Description:**  
Ensure that all assistant lifecycle operations are fully tenant-aware. Associate assistants with projects and tenants via the new tenant/user models and enforce authorization for list/get/update/delete and activation operations.  
**Technical Scope:**  
- Update service methods to accept `current_tenant` and `current_user`.  
- Add checks that prevent users from accessing assistants outside their tenants.  
- Add tests covering tenant-scoped assistant queries and mutations.  
**Modules Affected:**  
- `backend/assistants/service.py`  
- `backend/api/routes/assistant.py`  
- `backend/models/project.py`, `backend/models/assistant.py`  

---

**Task:** M2-3 – Surface governance configuration in dashboard `[completed]`  
**Description:**  
Expose assistant governance rules and allowed intents via API responses and align dashboard UI to display and, where appropriate, edit these settings.  
**Technical Scope:**  
- Extend assistant DTOs to include governance rules and allowed intents.  
- Add/update endpoints to fetch governance configuration for a given assistant.  
- Update dashboard screens to render governance panels based on API responses.  
**Modules Affected:**  
- `backend/api/routes/assistant.py`  
- `frontend/dashboard/src/components/flakers-studio/*`  
- `frontend/dashboard/src/lib/api-client.ts`  

---

**Task:** M2-4 – Stabilize frontend auth/build after backend auth rollout `[completed]`  
**Description:**  
Align the Next.js dashboard with the new backend auth flows and fix any lint/build/runtime issues introduced by replacing demo login with JWT-backed auth. Keep the current dashboard behavior intact while making the build pass cleanly.  
**Technical Scope:**  
- Wire dashboard login/session handling to backend auth proxy routes.  
- Run lint/build and fix TypeScript, route, and React issues.  
- Preserve existing page and API proxy semantics.  
**Modules Affected:**  
- `client/app/api/auth/*`  
- `client/src/contexts/auth-context.tsx`  
- `client/src/components/flakers-studio/*`  

---

### Milestone M3 – Ingestion Pipeline & Workers

**Task:** M3-1 – Consolidate ingestion domain under backend/ingestion `[completed]`  
**Description:**  
Move ingestion-related services (`web_scraper`, `content_discovery`, `content_processor`, `ingestion`) into `backend/ingestion`, updating imports while preserving behavior. Keep routes unchanged apart from import paths.  
**Technical Scope:**  
- Physically move files to `backend/ingestion`.  
- Adjust imports across routes and services.  
- Ensure tests still pass and ingestion flows behave as before.  
**Modules Affected:**  
- `backend/ingestion/*`  
- `backend/api/routes/projects.py`  
- `backend/services/__init__.py` (if needed)  

---

**Task:** M3-2 – Implement ingestion worker entrypoint `[completed]`  
**Description:**  
Introduce `backend/workers/ingestion_worker.py` as a long-running process that polls for runnable ingestion jobs and executes them using `IngestionService`. Initially, polling can be DB-based and single-process to keep behavior simple.  
**Technical Scope:**  
- Implement worker loop that selects queued/runnable jobs and calls ingestion.  
- Ensure idempotency and safe concurrency (e.g., job locks or status guards).  
- Provide a CLI or env-based configuration for running the worker separately from the API.  
**Modules Affected:**  
- `backend/workers/ingestion_worker.py`  
- `backend/ingestion/ingestion_service.py`  
- `backend/config/settings.py`  

---

**Task:** M3-3 – Harden job lifecycle, error handling, and cancellation `[completed]`  
**Description:**  
Improve the ingestion job lifecycle to handle errors, retries, and cancellation more robustly. Ensure that job statuses and metrics remain consistent even when failures occur mid-pipeline.  
**Technical Scope:**  
- Extend `IngestionJob`, `IngestionURL`, and `IngestionChunk` status handling and transitions.  
- Add retry logic for transient errors and limits for permanent failures.  
- Update status monitoring APIs to reflect new lifecycle semantics.  
**Modules Affected:**  
- `backend/models/content.py`, `backend/models/ingestion_tracking.py`  
- `backend/ingestion/ingestion_service.py`  
- `backend/api/routes/status.py`  

---

### Milestone M4 – Vector Storage Abstraction (Qdrant-First)

**Task:** M4-1 – Define VectorStore interface `[completed]`  
**Description:**  
Create a `VectorStore` protocol or abstract base class describing all vector operations needed by the app: collection management, upsert, search, and delete. Document expectations around payload structure and filtering.  
**Technical Scope:**  
- Define interface in `backend/vector_providers/base.py`.  
- Include type hints for embeddings, payloads, and filters.  
- Add basic documentation for implementers.  
**Modules Affected:**  
- `backend/vector_providers/base.py`  

---

**Task:** M4-2 – Implement QdrantVectorStore adapter `[completed]`  
**Description:**  
Wrap the existing Qdrant client logic into a `QdrantVectorStore` class that implements `VectorStore`. Keep the existing payload schema and behavior unchanged.  
**Technical Scope:**  
- Implement adapter methods for init, ensure collection, upsert, search, and delete.  
- Wire adapter into services (ingestion and retrieval) via dependency injection or a simple factory.  
- Add smoke tests to ensure results match current behavior.  
**Modules Affected:**  
- `backend/vector_providers/qdrant_provider.py`  
- `backend/ingestion/ingestion_service.py`  
- `backend/retrieval/rag_pipeline.py`  

---

**Task:** M4-3 – Centralize vector collection naming and config `[completed]`  
**Description:**  
Define and enforce a single convention for collection naming and configuration, including embedding dimensions and distance metrics, and ensure it’s driven by settings.  
**Technical Scope:**  
- Add helper functions for building collection names from assistant/tenant info.  
- Parameterize embedding dimension and distance metric in settings.  
- Replace scattered naming logic with centralized helpers.  
**Modules Affected:**  
- `backend/vector_providers/qdrant_provider.py`  
- `backend/config/settings.py`  

---

### Milestone M5 – Retrieval API & RAG Pipeline

**Task:** M5-1 – Extract RAG pipeline into backend/retrieval `[completed]`  
**Description:**  
Move retrieval, context-building, and prompt-construction logic out of `chat` routes into a dedicated `RAGPipeline` service, with a clean public API used by chat endpoints.  
**Technical Scope:**  
- Implement `RAGPipeline` in `backend/retrieval/rag_pipeline.py`.  
- Refactor `chat.py` to call `RAGPipeline` for query handling.  
- Ensure structured responses (decision, answer, sources, rules) remain identical.  
**Modules Affected:**  
- `backend/retrieval/rag_pipeline.py`  
- `backend/api/routes/chat.py`  
- `backend/services/governance.py`  

---

**Task:** M5-2 – Add explicit multi-tenant guards to retrieval `[completed]`  
**Description:**  
Before issuing vector store queries, validate that assistants belong to the current tenant and that vector queries are scoped appropriately. Log violations and return refusal decisions where needed.  
**Technical Scope:**  
- Add tenant checks around assistant lookups in retrieval layer.  
- Ensure vector store calls use assistant/tenant-aware collections and filters.  
- Add tests for cross-tenant retrieval attempts.  
**Modules Affected:**  
- `backend/retrieval/rag_pipeline.py`  
- `backend/api/routes/chat.py`  
- `backend/models/assistant.py`  

---

**Task:** M5-3 – Unit test RAG flows and governance integration `[completed]`  
**Description:**  
Add tests that validate the behavior of retrieval and governance integration, including edge cases (no context, out-of-scope intents, low confidence).  
**Technical Scope:**  
- Add test fixtures for sample chunks, embeddings, and assistant configs.  
- Test various queries against mocked vector store and governance engine.  
- Verify structured responses and rule application.  
**Modules Affected:**  
- `tests/backend/retrieval/*`  
- `tests/backend/governance/*`  

---

### Milestone M6 – CDN Widget & Public APIs

**Task:** M6-1 – Implement widget frontend bundle `[completed]`  
**Description:**  
Build `frontend/widget` as a small JS bundle that exposes a global initializer and renders the chat widget into a host page. Integrate with public chat APIs and support basic customization (colors, position, labels).  
**Technical Scope:**  
- Configure build tooling (e.g., separate entry or Vite-based bundle).  
- Implement widget UI with minimal dependencies.  
- Document host-page integration.  
**Modules Affected:**  
- `frontend/widget/*`  
- Build configuration for frontend  

---

**Task:** M6-2 – Design and implement public chat APIs `[completed]`  
**Description:**  
Create public chat endpoints specifically for widget traffic, secured with API keys and stricter rate limiting. Ensure these endpoints reuse the RAG pipeline but hide internal-only functionality.  
**Technical Scope:**  
- Add `ApiKey` model and management endpoints.  
- Implement `public_chat` routes that authenticate via API keys.  
- Add rate limiting and CORS configuration for widget usage.  
**Modules Affected:**  
- `backend/models/api_keys.py`  
- `backend/api/routes/public_chat.py`  
- `backend/services/auth.py`  

---

**Task:** M6-3 – Tenant and assistant-level widget configuration `[completed]`  
**Description:**  
Allow tenants to enable/disable widgets per assistant and configure basic widget behavior. Reflect this configuration in both widget bundle initialization and public chat routes.  
**Technical Scope:**  
- Extend assistant or project models with widget config fields.  
- Add CRUD APIs for widget configuration.  
- Update widget frontend to read and apply configuration.  
**Modules Affected:**  
- `backend/models/assistant.py`  
- `backend/api/routes/assistant.py`  
- `frontend/dashboard/src/components/flakers-studio/*`  

---

### Milestone M7 – Observability & Security

**Task:** M7-1 – Introduce structured logging with context `[completed]`  
**Description:**  
Standardize logging to JSON with fields for `request_id`, `tenant_id`, `assistant_id`, and other relevant context, across ingestion, retrieval, and governance paths.  
**Technical Scope:**  
- Add logging configuration and formatters.  
- Implement middleware to generate and propagate request IDs.  
- Update services to log structured events.  
**Modules Affected:**  
- `backend/config/logging.py`  
- `backend/api/main.py`  
- Domain services across `backend/*`  

---

**Task:** M7-2 – Add basic metrics for ingestion and chat `[completed]`  
**Description:**  
Expose metrics for ingestion duration, chat latency, error/refusal rates, and vector search performance, suitable for scraping by Prometheus or another monitoring system.  
**Technical Scope:**  
- Integrate a metrics library (e.g. Prometheus client).  
- Instrument key code paths (ingestion, retrieval, governance).  
- Add `/metrics` endpoint as appropriate.  
**Modules Affected:**  
- `backend/observability/*`  
- `backend/api/main.py`  

---

**Task:** M7-3 – Strengthen multi-tenant security posture `[completed]`  
**Description:**  
Perform a review and implementation pass over multi-tenant security: secret management, RBAC on admin endpoints, validation of tenant scoping on all routes, and safe defaults.  
**Technical Scope:**  
- Audit routes for tenant scoping and role requirements.  
- Harden secret management (env, secret stores).  
- Add role-based checks for sensitive operations.  
**Modules Affected:**  
- `backend/api/routes/*`  
- `backend/services/auth.py`  
- `backend/config/settings.py`  

---

### Milestone M8 – Testing & CI/CD

**Task:** M8-1 – Organize backend test suites `[completed]`  
**Description:**  
Structure tests into unit, integration, and E2E, with proper fixtures for DB, Qdrant, and Azure mocks. Aim for high coverage in ingestion, retrieval, and governance domains.  
**Technical Scope:**  
- Create separate test directories and naming conventions.  
- Add fixtures for DB sessions, vector store mocks, and fake LLM responses.  
- Write tests for critical happy paths and edge cases.  
**Modules Affected:**  
- `tests/backend/*`  

---

**Task:** M8-2 – Add CI pipeline for backend and frontend `[completed]`  
**Description:**  
Configure CI workflows to run backend pytest, frontend lint/build, and selected end-to-end tests on each PR, blocking merges when checks fail.  
**Technical Scope:**  
- Create CI configuration (e.g. GitHub Actions workflows).  
- Add scripts for running full and subset test suites.  
- Integrate with repository branch protection.  
**Modules Affected:**  
- `.github/workflows/*` (or equivalent CI configuration)  
- `tests/*`  

---

**Task:** M8-3 – Establish performance benchmarks and regression tests `[completed]`  
**Description:**  
Define baseline performance metrics for chat and ingestion, and add automated checks to catch regressions over time.  
**Technical Scope:**  
- Implement simple load/performance scripts.  
- Capture baseline metrics and thresholds.  
- Integrate selected performance checks into CI (or scheduled jobs).  
**Modules Affected:**  
- `tests/performance/*`  
- CI configuration  

---

### Maintenance Cleanup

**Task:** C-1 – Normalize repository folder structure `[completed]`  
**Description:**  
Clean up legacy repository layout now that the active backend lives under `backend/` and the widget lives under `frontend/widget/`. Move operational scripts into grouped folders, update lingering legacy imports and documentation, and remove dead duplicated backend code without changing runtime behavior.  
**Technical Scope:**  
- Move loose `server/*.py` utility scripts into organized `server/scripts/*` folders.  
- Update those scripts to import from `backend.*` instead of legacy `app.*`.  
- Remove the redundant `server/app/*` package once no active references remain.  
- Update docs and entrypoint references to match the cleaned structure.  
**Modules Affected:**  
- `server/*`  
- `backend/*`  
- `README.md`  






