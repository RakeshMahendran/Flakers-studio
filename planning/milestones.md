## Flakers Studio – Milestones

This document breaks the roadmap into concrete, trackable milestones.

---

### Milestone M1 – Multi-Tenant Auth & Tenant Modeling

**Objectives**

- Introduce first-party authentication and tenant modeling.
- Ensure all business operations can be scoped to a tenant and user.

**Key Outcomes**

- `Tenant`, `User`, and `UserTenantMembership` models with migrations.
- JWT-based auth with login, registration, and token refresh endpoints.
- FastAPI dependencies for `current_user` and `current_tenant`.
- Core APIs refactored to derive tenant from auth context, not raw request fields.

---

### Milestone M2 – Assistant Management & Governance

**Objectives**

- Encapsulate assistant lifecycle and governance into a dedicated domain.
- Align dashboard flows with backend assistant state and governance rules.

**Key Outcomes**

- `backend/assistants` module with services for create, list, update, activate, and delete.
- Assistant templates mapped to governance rules and allowed intents.
- Assistant status and statistics consistently derived from ingestion jobs and content.
- Dashboard screens wired to new assistant service interfaces.

---

### Milestone M3 – Ingestion Pipeline & Workers

**Objectives**

- Move ingestion into its own domain and worker processes.
- Improve resilience and clarity of ingestion lifecycle.

**Key Outcomes**

- `backend/ingestion` module housing web scraping, content discovery, processing, and ingestion service.
- `backend/workers/ingestion_worker.py` entrypoint for running ingestion jobs.
- Documented job lifecycle stages and state transitions.
- Better error reporting, cancellation, and restart flows for ingestion jobs.

---

### Milestone M4 – Vector Storage Abstraction (Qdrant-First)

**Objectives**

- Abstract away Qdrant-specific details behind a `VectorStore` interface.
- Prepare for future vector providers without changing business logic.

**Key Outcomes**

- `backend/vector_providers/base.py` defining the `VectorStore` protocol.
- `backend/vector_providers/qdrant_provider.py` implementing `QdrantVectorStore`.
- Services updated to depend on `VectorStore` instead of raw Qdrant client functions.
- Configuration toggles and naming conventions centralized in settings.

---

### Milestone M5 – Retrieval API & RAG Pipeline

**Objectives**

- Treat retrieval and RAG as a first-class, testable pipeline.
- Strengthen governance integration and multi-tenant safeguards.

**Key Outcomes**

- `backend/retrieval/rag_pipeline.py` and `retrieval_service.py` introduc ed.
- `chat` routes simplified to delegate to retrieval service.
- Unit tests covering retrieval, chunk selection, and prompt construction.
- Explicit multi-tenant checks and logging around retrieval and governance decisions.

---

### Milestone M6 – CDN Widget & Public APIs

**Objectives**

- Deliver an embeddable chat widget for tenant websites.
- Provide secure, rate-limited public APIs for widget traffic.

**Key Outcomes**

- `frontend/widget` bundle that can be included via a CDN `<script>` tag.
- Public chat API endpoints with API key auth and per-tenant/assistant quotas.
- Tenant-level configuration for widget enablement, appearance, and behavior.
- Documentation for embedding and configuring the widget.

---

### Milestone M7 – Observability & Security

**Objectives**

- Provide visibility into performance and reliability.
- Strengthen security posture and tenant isolation guarantees.

**Key Outcomes**

- Structured logging and log correlation for ingestion and chat paths.
- Basic metrics (response times, error/refusal rates, job success rates).
- Health and readiness endpoints for backend and vector providers.
- Security checks for secrets management, RBAC, and data isolation.

---

### Milestone M8 – Testing & CI/CD

**Objectives**

- Ensure consistent quality and safe deployments.
- Catch regressions early via automated pipelines.

**Key Outcomes**

- Organized test suites for backend and frontend (unit, integration, E2E).
- CI workflows running tests, linting, and builds for each change.
- Performance benchmarks and periodic regression checks.
- Guidelines for contributing and reviewing changes safely.

