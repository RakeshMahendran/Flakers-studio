"""
Pytest fixtures for Celery task testing.

This module provides test fixtures that configure Celery to run in eager mode,
allowing tasks to execute synchronously during tests without requiring a broker.
"""
import pytest
from celery import Celery


@pytest.fixture
def celery_config():
    """
    Configure Celery for testing with eager mode.

    In eager mode, tasks execute locally and synchronously,
    which makes them easier to test without a real broker.
    """
    return {
        'broker_url': 'memory://',
        'result_backend': 'cache+memory://',
        'task_always_eager': True,  # Execute tasks synchronously
        'task_eager_propagates': True,  # Propagate exceptions in eager mode
        'task_serializer': 'json',
        'accept_content': ['json'],
        'result_serializer': 'json',
        'timezone': 'UTC',
        'enable_utc': True,
    }


@pytest.fixture
def celery_worker_parameters():
    """Configure worker parameters for testing."""
    return {
        'perform_ping_check': False,
    }


@pytest.fixture
def celery_enable_logging():
    """Enable Celery logging during tests."""
    return True


@pytest.fixture
def use_celery_app_trap():
    """Don't trap exceptions in eager mode."""
    return False
