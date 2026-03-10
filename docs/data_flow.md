## Flakers Studio – Data Flow

### Overview

This document describes the end-to-end data flows in Flakers Studio:

- Content ingestion from external sources to Qdrant and Postgres.
- Retrieval and RAG during chat.
- Multi-tenant boundaries and how data is scoped per tenant and assistant.

---

### Ingestion Pipeline

#### 1. Source Configuration

1. Tenant user configures a new assistant in the dashboard:
   - Source type (website, WordPress).
   - Root URL (e.g. `https://docs.example.com`).
   - Template (support, customer, sales, ecommerce).
2. Backend creates or reuses a `Project` for the tenant.
3. Backend creates an `Assistant` record with:
   - Governance rules derived from template.
   - Allowed intents for classification.
   - Initial status `CREATING`.

#### 2. Discovery & Scraping

1. A discovery job (`IngestionJob`) is created for the assistant with status `RUNNING` and stage `discovery`.
2. Worker (or API in MVP) uses `WebScraperService`:
   - Crawls the site starting from `site_url`.
   - Follows allowed links up to configured depth and page count.
   - Extracts raw HTML/text, titles, and metadata.
3. For each discovered URL:
   - An `IngestionURL` row is created:
     - `url`, `url_hash`, `status` (SCRAPED/FAILED_SCRAPING).
     - `raw_content`, `content_type`, `content_length`.
4. `IngestionJob` is updated with:
   - `total_urls_discovered`, `urls_scraped`, `urls_failed_scraping`.
   - `current_stage` = `discovery_complete`.

#### 3. Processing & Chunking

1. Ingestion worker loads all SCRAPED/PROCESSED `IngestionURL` rows for the job.
2. For each URL:
   - Constructs a `ScrapedPage` object with URL, title, raw content, and metadata.
   - Passes it into `ContentProcessor.process_scraped_pages`.
3. `ContentProcessor`:
   - Cleans and normalizes text.
   - Splits content into manageable chunks based on character or token limits with overlaps.
   - Classifies each chunk with an intent (e.g. support, FAQ, policy).
   - Computes flags like `requires_attribution`, `is_policy_content`, `is_sensitive`.
4. For each URL:
   - `IngestionURL.status` → `PROCESSED`.
   - `chunk_count` and `processed_at` updated.
5. `IngestionJob` is updated with:
   - `total_chunks_created`.
   - `urls_processed`.
   - `current_stage` = `processing` → `embedding`.

#### 4. Embedding Generation

1. All chunk texts are collected in order.
2. `EmbeddingService.embed_texts` is called:
   - Uses Azure OpenAI embedding deployment.
   - Returns a dense vector per chunk.
3. `IngestionJob.current_stage` remains `embedding` until all embeddings are generated.

#### 5. Qdrant Storage Model

- A `VectorStore` abstraction wraps Qdrant:
  - `ensure_collection(assistant, tenant)` creates or verifies a collection per assistant/tenant.
  - Collection naming scheme (MVP): `<assistant_safe_name>_<tenant_safe_prefix>`.
  - Vector parameters: cosine distance, dimension matching embedding model.
- `store_embeddings`:
  - For each chunk, constructs:
    - Vector: embedding array.
    - Payload:
      - Assistant metadata: `assistant_id`, `assistant_name`, `user_name` (tenant alias).
      - Content metadata: `content`, `source_url`, `source_title`, `source_type`.
      - Governance metadata: `intent`, `confidence_score`, `requires_attribution`, `is_policy_content`, `is_sensitive`, `chunk_index`, `content_hash`, `metadata`.
  - Upserts points into the assistant-specific collection.
  - Returns Qdrant point IDs.

#### 6. Persisting Content Chunks

1. For each chunk/point pair:
   - A `ContentChunk` row is created:
     - References `assistant_id`.
     - Stores `source_url`, `source_title`, `source_type`.
     - Full chunk text in `content` and `content_hash`.
     - `intent` and `confidence_score`.
     - `qdrant_point_id`, `chunk_index`, `chunk_size`.
     - Governance flags (attribution, policy, sensitive).
2. `IngestionJob` and `Assistant` are updated:
   - `status` → `COMPLETED` for the job.
   - Assistant `status` → `READY`.
   - `total_chunks_indexed` and `total_pages_crawled` refreshed.

---

### Retrieval & RAG Pipeline

#### 1. Chat Request

1. Client (dashboard or widget) sends a request:
   - `assistant_id`, possibly `tenant_id` (for internal APIs).
   - `user_message`.
   - Optional `session_id`.
2. Backend resolves:
   - Authenticated `User` from JWT.
   - `current_tenant` from membership.
   - Validates that `assistant_id` belongs to `current_tenant`.

#### 2. Session & Query Embedding

1. Backend locates or creates a `ChatSession` associated with the assistant and tenant.
2. `EmbeddingService.embed_text` is called for `user_message` to get a query vector.

#### 3. Vector Retrieval (Qdrant)

1. Backend determines the correct collection:
   - Assistant-scoped collection created during ingestion.
2. `VectorStore.search` is called with:
   - `collection_name`.
   - `query_vector`.
   - Filter `"assistant_id" == assistant_id`.
   - `limit` and `score_threshold`.
3. Qdrant returns a list of hits with:
   - Vector similarity scores.
   - Stored payload (content, metadata, governance fields).

#### 4. Governance Evaluation

1. `GovernanceEngine` is initialized with assistant governance config:
   - Enabled rules.
   - Allowed intents.
   - Template type.
2. `evaluate_query` receives:
   - `user_query`, retrieved chunks, `tenant_id`.
3. The engine applies rules in order:
   - **Require Context**: If no chunks, refuse with `NO_CONTEXT`.
   - **Tenant Isolation**: Verifies chunks don’t violate tenant isolation (future-proof for metadata checks).
   - **Intent Filtering**: Filters chunks to those with intents in `allowed_intents`, else refuse as `OUT_OF_SCOPE`.
   - **Confidence Threshold**: Filters to high-confidence chunks by score; if none, refuse as `INSUFFICIENT_CONFIDENCE`.
   - **Policy Quote Only**: Marks responses that must only quote policy/legal text.
   - **Attribution Required**: Ensures responses cite sources.
4. If any rule fails, a `RefusalDecision` is returned with:
   - `decision=REFUSE`.
   - `reason` (`NO_CONTEXT`, `OUT_OF_SCOPE`, etc.).
   - `rules_applied` list.
5. If all rules pass:
   - `decision=ANSWER`.
   - `allowed_context` = filtered chunk list.

#### 5. Prompt Construction & LLM Call

1. Governance engine or RAG pipeline constructs a bounded system prompt:
   - Embeds allowed context chunks as read-only knowledge.
   - Injects governance constraints (no hallucinations, strict use of context, citation rules).
   - Template-specific instructions for tone and scope.
2. Azure LLM is called with:
   - System prompt.
   - `user_message`.
   - Temperature and max token settings tuned for grounded responses.
3. LLM response is post-processed:
   - Basic quality filters (length, small-talk handling).
   - Normalization of whitespace and removal of redundant greetings when appropriate.

#### 6. Response & Logging

1. Backend constructs a structured response:
   - `decision` (`ANSWER` or `REFUSE`).
   - `answer` text if applicable.
   - `reason` and `rules_applied`.
   - `sources`: derived from unique `source_url` + `source_title`+ `intent` across used chunks.
   - `session_id` and `processing_time_ms`.
2. `ChatMessage` is persisted with:
   - User message and assistant response.
   - Decision and refusal reason.
   - IDs of retrieved chunks and formatted sources.
   - Rules applied and processing time.
   - Azure usage metadata (tokens, model).
3. Client renders:
   - Answer or refusal via Tambo components.
   - Governance panel showing rules, sources, and metadata.

---

### Widget Delivery & Public Chat Flow

1. Tenant embeds the Flakers Studio widget JS snippet from a CDN in their website.
2. Host page initializes the widget with:
   - `tenantId`, `assistantId`, and `publicApiKey`.
3. Widget opens chat sessions by calling public chat APIs:
   - Uses `publicApiKey` for authentication and rate limiting.
   - Sends messages along with `assistantId`; backend infers `tenant_id` from the key.
4. Public APIs use the same retrieval + governance + RAG pipeline as the dashboard, but:
   - Enforce stricter rate limiting and quotas.
   - Are CORS-restricted to widget usage patterns.

---

### Multi-Tenant Data Isolation

- All DB writes and reads are tenant-scoped:
  - `tenant_id` is always part of query filters for tenant-owned data.
  - Assistant and project IDs are validated against the current tenant.
- Vector data is isolated via:
  - Per-assistant/tenant collections.
  - Payload filters on `assistant_id` (and later `tenant`-level attributes).
- Governance rules include tenant isolation as an explicit rule, and future versions will extend `_check_tenant_isolation` to inspect chunk payload metadata for tenant mismatches.

