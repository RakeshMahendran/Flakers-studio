## Flakers Studio – Product & Technical Roadmap

### Vision

Flakers Studio will evolve into a production-grade, multi-tenant SaaS for governed AI assistants, with:

- Strong multi-tenant isolation and enterprise-ready auth.
- Robust ingestion pipelines that support multiple content sources.
- A pluggable vector store abstraction (Qdrant first, others later).
- A CDN-delivered embeddable widget for tenant websites.
- Full observability, analytics, and testing.

---

### Phase A – Multi-Tenant Auth & Tenant Modeling

**Goal:** Establish first-party authentication, tenant modeling, and tenant-aware request handling.

- Introduce `Tenant`, `User`, and `UserTenantMembership` models.
- Implement JWT-based auth with registration, login, and token refresh.
- Add FastAPI dependencies that resolve `current_user` and `current_tenant`.
- Refactor existing APIs to derive tenant context from auth, not from request bodies.

---

### Phase B – Assistant Management & Governance UX

**Goal:** Solidify assistant lifecycle management and governance configuration, aligned with the dashboard UX.

- Extract assistant management into a dedicated domain (`backend/assistants`).
- Ensure assistant CRUD, activation, and deletion are fully tenant-scoped.
- Surface governance rules and intent scopes clearly in the dashboard.
- Align governance engine configuration with assistant templates.

---

### Phase C – Ingestion Pipeline Hardening & Workerization

**Goal:** Make ingestion resilient, scalable, and suitable for large tenants.

- Extract ingestion-related services into `backend/ingestion`.
- Introduce a separate ingestion worker process (or processes) decoupled from the API.
- Formalize job lifecycle and state transitions for discovery and ingestion.
- Improve error handling, retries, and cancellation mechanics.

---

### Phase D – Vector Storage Abstraction & Qdrant Hardening

**Goal:** Abstract vector operations behind a provider interface and harden Qdrant usage.

- Define a `VectorStore` interface describing collection management, upserts, search, and deletes.
- Implement `QdrantVectorStore` using the existing payload schema and behavior.
- Centralize Qdrant configuration and collection naming conventions.
- Prepare the codebase for additional providers (Pinecone, Weaviate) without changing business logic.

---

### Phase E – Retrieval API & RAG Pipeline Formalization

**Goal:** Treat retrieval and RAG as a first-class pipeline, fully testable and governed.

- Extract RAG logic from `chat.py` into `backend/retrieval/rag_pipeline.py`.
- Clearly separate retrieval (vector search) from generation (LLM) and governance checks.
- Add unit tests for retrieval and prompting behavior.
- Strengthen multi-tenant safeguards in retrieval and logging.

---

### Phase F – CDN Widget Delivery & Public APIs

**Goal:** Deliver a secure, embeddable widget served from a CDN with dedicated public APIs.

- Implement `frontend/widget` bundle as a framework-agnostic chat widget.
- Create public chat APIs with API keys and stricter rate limiting.
- Add tenant/assistant-level settings for widget enablement and configuration.
- Document integration for tenant developers (snippet, configuration options).

---

### Phase G – Monitoring, Observability & Security

**Goal:** Provide operational visibility and harden the platform for production use.

- Introduce structured JSON logging with correlation IDs, tenant IDs, and assistant IDs.
- Add basic metrics for ingestion latency, chat latency, error/refusal rates, and Qdrant health.
- Define SLOs for core operations (chat latency, ingestion completion).
- Address security hardening for secrets, TLS, and multi-tenant data boundaries.

---

### Phase H – Testing, CI/CD & Performance

**Goal:** Ensure continuous quality through automated testing and deployments.

- Structure backend tests into unit, integration, and end-to-end suites.
- Introduce mocks for Qdrant and Azure services.
- Configure CI pipelines to run tests and static checks on each change.
- Profile and optimize hot paths (retrieval, ingestion, widget load).

