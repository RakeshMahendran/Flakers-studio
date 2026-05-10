"""
Celery application factory for FlakersStudio background tasks.

This module configures Celery to use Redis as both broker and result backend.
Task results expire after 24 hours to prevent unbounded growth.

Security Considerations:
- JSON serialization only (prevents pickle-based code execution)
- Task acknowledgment after completion (acks_late=True)
- Task requeue on worker failure (reject_on_worker_lost=True)
- Connection retry with backoff (broker_connection_retry=True)
- Results are non-persistent to avoid Redis memory issues in production

Scaling:
- Worker concurrency: 4 (configurable via CLI)
- Prefetch multiplier: 1 (one task per worker at a time)
- Task time limits: 30 min hard, 25 min soft
- Worker restart: after 1000 tasks (prevents memory leaks)
"""
from celery import Celery
from backend.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Get Redis URL from settings, with fallback for development
REDIS_URL = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')

# Create Celery app
celery_app = Celery(
    'flakers_studio',
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=['backend.queue.tasks']
)

# Celery configuration
celery_app.conf.update(
    # Task execution
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,

    # Result backend
    result_expires=86400,  # 24 hours
    result_persistent=False,  # Don't persist results to avoid Redis memory issues

    # Task routing
    task_routes={
        'ingestion.run_job': {'queue': 'ingestion'},
        'ingestion.cancel_job': {'queue': 'ingestion'},
    },

    # Worker configuration
    worker_prefetch_multiplier=1,  # Only fetch one task at a time per worker
    worker_max_tasks_per_child=1000,  # Restart worker after 1000 tasks to prevent memory leaks

    # Task acknowledgment
    task_acks_late=True,  # Only ack after task completes
    task_reject_on_worker_lost=True,  # Requeue tasks if worker dies

    # Time limits (30 minutes hard limit, 25 minute soft limit)
    task_time_limit=1800,  # 30 minutes hard kill
    task_soft_time_limit=1500,  # 25 minutes soft limit (raises exception)

    # Broker settings
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,

    # Security settings
    result_backend_transport_options={
        'master_name': 'mymaster',
    } if 'sentinel' in REDIS_URL else {},

    # Task result settings
    result_backend_max_retries=3,
    result_chord_retry_interval=1.0,
)

logger.info(f"Celery app configured with broker: {REDIS_URL}")


def get_celery_app() -> Celery:
    """Get the Celery application instance."""
    return celery_app
