# Branch: feat/celery-queue
**Worktree:** `E:\FS-celery`
**Phase:** 4 — Infra (highest risk, do last)
**Depends on:** ideally cache merged (Redis is the broker)

---

You are in worktree FS-celery on branch feat/celery-queue.

## GOAL
Replace the single DB-polling ingestion worker (`backend/workers/ingestion_worker.py`, 5s poll interval) with a Celery + Redis task queue. The current setup scales to ~10 concurrent tenants; this needs to handle 100s.

## READ FIRST
1. `backend/workers/ingestion_worker.py` — current polling loop
2. `backend/ingestion/ingestion.py` — orchestration
3. `backend/ingestion/cancellation.py` — how cancellation works today
4. `backend/ingestion/status_updater.py` — job state sync
5. `server/requirements.txt` — celery and redis are commented out

## DELIVERABLES

### 1. Dependencies
`server/requirements.txt`: uncomment `celery>=5.3`, `redis>=5.0`; add `flower>=2.0` (optional monitoring UI)

### 2. New module: `backend/queue/`
- `backend/queue/__init__.py`
- `backend/queue/celery_app.py` — Celery app factory, broker = `settings.REDIS_URL`, backend = same
- `backend/queue/tasks.py` — declare tasks:
  ```python
  @celery_app.task(bind=True, name="ingestion.run_job")
  def run_ingestion_job(self, job_id: str): ...   # wraps existing ingestion.run logic

  @celery_app.task(name="ingestion.cancel_job")
  def cancel_ingestion_job(job_id: str): ...
  ```
- `backend/queue/conftest.py` — Celery test fixtures with eager mode

### 3. Convert `ingestion_worker.py`
- Keep the file but turn it into a thin shim: enqueues pending DB jobs to Celery instead of running them inline
- Or, alternatively, REMOVE the polling and have the API enqueue directly when an ingestion job is created (preferred — see below)

### 4. Modify API routes
`backend/api/routes/projects.py` and `scraping.py`: when a new `IngestionJob` is created, call `run_ingestion_job.delay(job_id)` instead of relying on the polling worker.

### 5. Cancellation
`cancellation.py` already uses a DB flag. Wire `cancel_ingestion_job` to set that flag — the running task checks it cooperatively (already does).

### 6. Render service
Add a new Render service. Update `render.yaml` with a new service:
```yaml
type: worker
name: flakers-celery
buildCommand: pip install -r server/requirements.txt
startCommand: celery -A backend.queue.celery_app worker --loglevel=info --concurrency=4
```

### 7. Local dev scripts
- `scripts/run-worker.ps1`
- `scripts/run-redis-docker.ps1` (`docker run -p 6379:6379 redis:7-alpine`)

### 8. Tests
`tests/backend/integration/test_celery_tasks.py`:
- Run tasks in eager mode
- Assert ingestion completes
- Assert cancellation flag is honored

### 9. Backfill
Write a one-time migration script `scripts/migrate_pending_jobs.py` that finds in-flight DB jobs and enqueues them to Celery on first deploy.

## CONSTRAINTS
- This is the largest, riskiest branch. Keep the OLD polling worker code intact behind a `settings.USE_CELERY = True` flag for a one-release rollback safety net.
- Do NOT modify `governance.py`.
- Do NOT modify the ingestion business logic — only HOW it's invoked. The actual scrape/process/embed code stays untouched.
- Test with a sample assistant in a local environment before claiming done.

## ACCEPTANCE
- Integration test passes in eager mode.
- Local run with `redis:7-alpine` + a worker process: an ingestion job kicked off via the API completes via Celery, not the old poll loop.
- Cancellation works.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. **THIS IS A BIG CHANGE** — leave a clean diff and a written rollout plan in your final report to the user.
