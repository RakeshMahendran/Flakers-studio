"""
Cooperative Cancellation Service
Provides cancellation checking for long-running ingestion operations
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.content import IngestionJob
from app.models.project import Project, ProjectStatus

logger = logging.getLogger(__name__)

class CancellationException(Exception):
    """Raised when operation should be cancelled"""
    pass

class CancellationChecker:
    """
    Cooperative cancellation checker
    
    Workers must call check_cancellation() frequently:
    - Before starting any unit of work
    - Before and after network calls
    - Before CPU-heavy processing
    - BEFORE EVERY VECTOR DATABASE WRITE
    """
    
    def __init__(self, db: AsyncSession, job_id: str, project_id: str):
        self.db = db
        self.job_id = job_id
        self.project_id = project_id
        self._cached_job_status: Optional[str] = None
        self._cached_project_status: Optional[str] = None
        self._check_count = 0
        self._cache_refresh_interval = 10  # Refresh cache every 10 checks
    
    async def check_cancellation(self, operation: str = "operation") -> None:
        """
        Check if cancellation has been requested
        
        Args:
            operation: Description of current operation (for logging)
            
        Raises:
            CancellationException: If cancellation is detected
        """
        self._check_count += 1
        
        # Refresh cache periodically
        if self._check_count % self._cache_refresh_interval == 0:
            await self._refresh_cache()
        
        # Check project status first (most critical)
        if self._cached_project_status != ProjectStatus.ACTIVE.value:
            logger.info(f"Job {self.job_id}: Project deletion detected during {operation}")
            raise CancellationException(
                f"Project {self.project_id} is being deleted (status: {self._cached_project_status})"
            )
        
        # Check job cancellation
        if self._cached_job_status == "cancelled":
            logger.info(f"Job {self.job_id}: Cancellation detected during {operation}")
            raise CancellationException(f"Job {self.job_id} has been cancelled")
        
        # Check if job failed
        if self._cached_job_status == "failed":
            logger.info(f"Job {self.job_id}: Job failure detected during {operation}")
            raise CancellationException(f"Job {self.job_id} has failed")
    
    async def _refresh_cache(self) -> None:
        """Refresh cached status from database"""
        try:
            # Get job status
            job_result = await self.db.execute(
                select(IngestionJob.status, IngestionJob.cancellation_requested)
                .where(IngestionJob.id == self.job_id)
            )
            job_row = job_result.first()
            
            if job_row:
                # If cancellation requested, update status
                if job_row.cancellation_requested and job_row.status != "cancelled":
                    self._cached_job_status = "cancelled"
                else:
                    self._cached_job_status = job_row.status
            
            # Get project status
            project_result = await self.db.execute(
                select(Project.status)
                .where(Project.id == self.project_id)
            )
            project_row = project_result.first()
            
            if project_row:
                self._cached_project_status = project_row.status.value
            
            logger.debug(
                f"Job {self.job_id}: Status cache refreshed - "
                f"job={self._cached_job_status}, project={self._cached_project_status}"
            )
            
        except Exception as e:
            logger.error(f"Error refreshing cancellation cache: {str(e)}")
            # Don't raise - allow operation to continue with stale cache
    
    async def is_cancelled(self) -> bool:
        """
        Non-throwing check for cancellation
        
        Returns:
            True if cancelled, False otherwise
        """
        try:
            await self.check_cancellation()
            return False
        except CancellationException:
            return True
    
    def get_check_count(self) -> int:
        """Get number of cancellation checks performed"""
        return self._check_count

async def check_project_active(db: AsyncSession, project_id: str) -> bool:
    """
    Check if project is active
    
    Args:
        db: Database session
        project_id: Project UUID
        
    Returns:
        True if project is active, False otherwise
    """
    try:
        result = await db.execute(
            select(Project.status)
            .where(Project.id == project_id)
        )
        row = result.first()
        
        if not row:
            logger.warning(f"Project {project_id} not found")
            return False
        
        return row.status == ProjectStatus.ACTIVE
        
    except Exception as e:
        logger.error(f"Error checking project status: {str(e)}")
        return False

async def request_job_cancellation(
    db: AsyncSession,
    job_id: str,
    reason: Optional[str] = None
) -> bool:
    """
    Request cancellation of a job
    
    Args:
        db: Database session
        job_id: Job UUID
        reason: Optional cancellation reason
        
    Returns:
        True if cancellation requested, False if job not found or already completed
    """
    try:
        result = await db.execute(
            select(IngestionJob)
            .where(IngestionJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        
        if not job:
            logger.warning(f"Job {job_id} not found for cancellation")
            return False
        
        # Only cancel if job is in progress
        if job.status in ["queued", "running"]:
            job.cancellation_requested = True
            job.cancellation_reason = reason or "User requested cancellation"
            await db.commit()
            logger.info(f"Cancellation requested for job {job_id}: {reason}")
            return True
        else:
            logger.info(f"Job {job_id} cannot be cancelled (status: {job.status})")
            return False
            
    except Exception as e:
        logger.error(f"Error requesting job cancellation: {str(e)}")
        await db.rollback()
        return False

async def cancel_all_project_jobs(
    db: AsyncSession,
    project_id: str,
    reason: str = "Project deletion"
) -> int:
    """
    Cancel all running jobs for a project
    
    Args:
        db: Database session
        project_id: Project UUID
        reason: Cancellation reason
        
    Returns:
        Number of jobs cancelled
    """
    try:
        result = await db.execute(
            select(IngestionJob)
            .where(
                IngestionJob.project_id == project_id,
                IngestionJob.status.in_(["queued", "running"])
            )
        )
        jobs = result.scalars().all()
        
        cancelled_count = 0
        for job in jobs:
            job.cancellation_requested = True
            job.cancellation_reason = reason
            cancelled_count += 1
        
        await db.commit()
        logger.info(f"Cancelled {cancelled_count} jobs for project {project_id}")
        return cancelled_count
        
    except Exception as e:
        logger.error(f"Error cancelling project jobs: {str(e)}")
        await db.rollback()
        return 0
