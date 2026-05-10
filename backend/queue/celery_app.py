"""
Celery application factory for FlakersStudio background tasks.

This module configures Celery to use Redis as both broker and result backend.
Task results expire after 24 hours to prevent unbounded growth.
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
    result_persistent=True,

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
)

logger.info(f"Celery app configured with broker: {REDIS_URL}")


def get_celery_app() -> Celery:
    """Get the Celery application instance."""
    return celery_app
