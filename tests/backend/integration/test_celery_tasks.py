"""
Integration tests for Celery task queue.

These tests verify that:
1. Tasks execute correctly in eager mode
2. Cancellation signals are honored
3. Error handling works properly
"""
import pytest
import asyncio
import uuid
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock

from backend.queue.tasks import run_ingestion_job, cancel_ingestion_job
from backend.models.content import IngestionJob, JobStatus
from backend.models.assistant import Assistant, AssistantStatus, SourceType, AssistantTemplate
from backend.models.project import Project, ProjectStatus
from backend.models.ingestion_tracking import IngestionURL, URLStatus


@pytest.fixture
def celery_config():
    """Configure Celery for eager execution in tests."""
    return {
        'task_always_eager': True,
        'task_eager_propagates': True,
        'broker_url': 'memory://',
        'result_backend': 'cache+memory://',
    }


@pytest.fixture
async def test_job_data():
    """Create test data for ingestion job."""
    job_id = str(uuid.uuid4())
    assistant_id = str(uuid.uuid4())
    project_id = str(uuid.uuid4())
    tenant_id = str(uuid.uuid4())

    return {
        'job_id': job_id,
        'assistant_id': assistant_id,
        'project_id': project_id,
        'tenant_id': tenant_id,
    }


class TestCeleryTasks:
    """Test suite for Celery tasks."""

    @pytest.mark.asyncio
    async def test_run_ingestion_job_success(self, test_job_data):
        """Test successful ingestion job execution."""
        job_id = test_job_data['job_id']
        assistant_id = test_job_data['assistant_id']
        project_id = test_job_data['project_id']
        tenant_id = test_job_data['tenant_id']

        # Mock database session and objects
        mock_job = MagicMock(spec=IngestionJob)
        mock_job.id = job_id
        mock_job.assistant_id = assistant_id
        mock_job.project_id = project_id
        mock_job.tenant_id = tenant_id
        mock_job.status = JobStatus.RUNNING.value
        mock_job.current_stage = "discovery_complete"
        mock_job.should_cancel = MagicMock(return_value=False)

        mock_assistant = MagicMock(spec=Assistant)
        mock_assistant.id = assistant_id
        mock_assistant.name = "Test Assistant"

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.name = "Test Project"

        # Mock database operations
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(side_effect=lambda model, id: {
                IngestionJob: mock_job,
                Assistant: mock_assistant,
                Project: mock_project
            }.get(model))

            # Mock ingestion service
            with patch('backend.queue.tasks.IngestionService') as mock_service_class:
                mock_service = AsyncMock()
                mock_service_class.return_value = mock_service
                mock_service._process_ingestion = AsyncMock()

                # Execute task
                result = await run_ingestion_job.apply_async(args=[job_id]).get()

                # Verify result
                assert result['status'] == 'completed'
                assert result['job_id'] == job_id
                assert result['assistant_id'] == assistant_id

                # Verify service was called
                mock_service._process_ingestion.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_ingestion_job_cancelled_before_start(self, test_job_data):
        """Test that job respects cancellation flag before processing."""
        job_id = test_job_data['job_id']
        assistant_id = test_job_data['assistant_id']
        project_id = test_job_data['project_id']
        tenant_id = test_job_data['tenant_id']

        # Mock cancelled job
        mock_job = MagicMock(spec=IngestionJob)
        mock_job.id = job_id
        mock_job.assistant_id = assistant_id
        mock_job.project_id = project_id
        mock_job.tenant_id = tenant_id
        mock_job.status = JobStatus.RUNNING.value
        mock_job.current_stage = "discovery_complete"
        mock_job.should_cancel = MagicMock(return_value=True)  # Cancelled!

        mock_assistant = MagicMock(spec=Assistant)
        mock_assistant.id = assistant_id
        mock_assistant.name = "Test Assistant"

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id
        mock_project.name = "Test Project"

        # Mock database operations
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(side_effect=lambda model, id: {
                IngestionJob: mock_job,
                Assistant: mock_assistant,
                Project: mock_project
            }.get(model))

            # Execute task
            result = await run_ingestion_job.apply_async(args=[job_id]).get()

            # Verify cancellation was detected
            assert result['status'] == 'cancelled'
            assert result['reason'] == 'cancelled_before_start'

    @pytest.mark.asyncio
    async def test_run_ingestion_job_not_found(self):
        """Test handling of non-existent job."""
        job_id = str(uuid.uuid4())

        # Mock database operations - job not found
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(return_value=None)  # Job not found

            # Execute task
            result = await run_ingestion_job.apply_async(args=[job_id]).get()

            # Verify error handling
            assert result['status'] == 'error'
            assert 'not found' in result['error'].lower()

    @pytest.mark.asyncio
    async def test_run_ingestion_job_already_completed(self, test_job_data):
        """Test that already completed jobs are skipped."""
        job_id = test_job_data['job_id']

        # Mock completed job
        mock_job = MagicMock(spec=IngestionJob)
        mock_job.id = job_id
        mock_job.status = JobStatus.COMPLETED.value  # Already completed

        # Mock database operations
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(return_value=mock_job)

            # Execute task
            result = await run_ingestion_job.apply_async(args=[job_id]).get()

            # Verify skipped
            assert result['status'] == 'skipped'
            assert result['reason'] == 'already_completed'

    @pytest.mark.asyncio
    async def test_cancel_ingestion_job_success(self, test_job_data):
        """Test successful job cancellation."""
        job_id = test_job_data['job_id']

        # Mock cancellation function
        with patch('backend.queue.tasks.request_job_cancellation') as mock_cancel:
            mock_cancel.return_value = True  # Cancellation successful

            with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
                mock_db = AsyncMock()
                mock_session.return_value.__aenter__.return_value = mock_db

                # Execute cancellation task
                result = cancel_ingestion_job.apply(args=[job_id]).get()

                # Verify cancellation
                assert result['status'] == 'cancelled'
                assert result['job_id'] == job_id

    @pytest.mark.asyncio
    async def test_cancel_ingestion_job_not_found(self, test_job_data):
        """Test cancellation of non-existent job."""
        job_id = test_job_data['job_id']

        # Mock cancellation function - job not found
        with patch('backend.queue.tasks.request_job_cancellation') as mock_cancel:
            mock_cancel.return_value = False  # Cancellation failed

            with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
                mock_db = AsyncMock()
                mock_session.return_value.__aenter__.return_value = mock_db

                # Execute cancellation task
                result = cancel_ingestion_job.apply(args=[job_id]).get()

                # Verify not cancelled
                assert result['status'] == 'not_cancelled'
                assert 'not_found' in result['reason']

    @pytest.mark.asyncio
    async def test_run_ingestion_job_wrong_stage(self, test_job_data):
        """Test that jobs not in discovery_complete stage are rejected."""
        job_id = test_job_data['job_id']
        assistant_id = test_job_data['assistant_id']
        project_id = test_job_data['project_id']
        tenant_id = test_job_data['tenant_id']

        # Mock job in wrong stage
        mock_job = MagicMock(spec=IngestionJob)
        mock_job.id = job_id
        mock_job.assistant_id = assistant_id
        mock_job.project_id = project_id
        mock_job.tenant_id = tenant_id
        mock_job.status = JobStatus.RUNNING.value
        mock_job.current_stage = "discovery"  # Wrong stage!
        mock_job.should_cancel = MagicMock(return_value=False)

        mock_assistant = MagicMock(spec=Assistant)
        mock_assistant.id = assistant_id

        mock_project = MagicMock(spec=Project)
        mock_project.id = project_id

        # Mock database operations
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(side_effect=lambda model, id: {
                IngestionJob: mock_job,
                Assistant: mock_assistant,
                Project: mock_project
            }.get(model))

            # Execute task
            result = await run_ingestion_job.apply_async(args=[job_id]).get()

            # Verify error
            assert result['status'] == 'error'
            assert 'not ready' in result['error'].lower()


class TestCeleryIntegration:
    """Integration tests for Celery with mocked Redis."""

    @pytest.mark.asyncio
    async def test_celery_task_queuing(self, test_job_data):
        """Test that tasks can be queued and executed."""
        job_id = test_job_data['job_id']

        # Mock entire execution path
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(return_value=None)  # Job not found

            # Queue task (in eager mode, it executes immediately)
            task_result = run_ingestion_job.delay(job_id)

            # Verify task completes
            assert task_result is not None
            result = task_result.get()
            assert result['status'] == 'error'  # Expected since job doesn't exist

    @pytest.mark.asyncio
    async def test_multiple_tasks_execution(self, test_job_data):
        """Test that multiple tasks can be queued and executed."""
        job_ids = [str(uuid.uuid4()) for _ in range(3)]

        # Mock database operations
        with patch('backend.queue.tasks.AsyncSessionLocal') as mock_session:
            mock_db = AsyncMock()
            mock_session.return_value.__aenter__.return_value = mock_db
            mock_db.get = AsyncMock(return_value=None)

            # Queue multiple tasks
            tasks = [run_ingestion_job.delay(job_id) for job_id in job_ids]

            # Verify all tasks complete
            results = [task.get() for task in tasks]
            assert len(results) == 3
            assert all(r['status'] == 'error' for r in results)  # All fail due to non-existent jobs
