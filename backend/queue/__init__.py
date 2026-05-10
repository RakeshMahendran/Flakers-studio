"""
Queue module for Celery-based task processing.

This module provides asynchronous task execution for long-running operations
like content ingestion, replacing the polling-based worker approach.
"""
from backend.queue.celery_app import celery_app, get_celery_app
from backend.queue.tasks import run_ingestion_job, cancel_ingestion_job

__all__ = [
    'celery_app',
    'get_celery_app',
    'run_ingestion_job',
    'cancel_ingestion_job',
]
