"""
Project Deletion Service
Handles cooperative project deletion with proper cleanup
"""
import logging
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime

from app.models.project import Project, ProjectStatus
from app.models.assistant import Assistant
from app.models.content import IngestionJob
from app.services.cancellation import cancel_all_project_jobs
from app.services.event_emitter import EventEmitter
from app.core.qdrant_client import delete_assistant_collection

logger = logging.getLogger(__name__)

class ProjectDeletionService:
    """
    Handles project deletion with proper lifecycle management
    
    Process:
    1. Mark project as "deleting"
    2. Cancel all running jobs
    3. Wait for workers to stop cooperatively
    4. Delete vector collections
    5. Delete database records
    6. Mark project as "deleted"
    """
    
    @staticmethod
    async def initiate_deletion(
        db: AsyncSession,
        project_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Initiate project deletion
        
        Args:
            db: Database session
            project_id: Project UUID
            tenant_id: Tenant UUID (for verification)
            
        Returns:
            Deletion status
        """
        try:
            # Get project
            result = await db.execute(
                select(Project)
                .where(
                    Project.id == project_id,
                    Project.tenant_id == tenant_id
                )
            )
            project = result.scalar_one_or_none()
            
            if not project:
                return {"error": "Project not found or access denied"}
            
            if project.status == ProjectStatus.DELETED:
                return {"error": "Project already deleted"}
            
            if project.status == ProjectStatus.DELETING:
                return {"message": "Project deletion already in progress"}
            
            # Mark project as deleting
            project.status = ProjectStatus.DELETING
            await db.commit()
            
            logger.info(f"Project {project_id}: Marked as deleting")
            
            # Emit audit event
            EventEmitter.emit_project_deletion(
                str(tenant_id), str(project_id), "deleting",
                {"initiated_at": datetime.utcnow().isoformat()}
            )
            
            # Cancel all running jobs
            cancelled_count = await cancel_all_project_jobs(
                db, project_id, "Project deletion initiated"
            )
            
            logger.info(f"Project {project_id}: Cancelled {cancelled_count} jobs")
            
            return {
                "message": "Project deletion initiated",
                "project_id": project_id,
                "status": "deleting",
                "jobs_cancelled": cancelled_count
            }
            
        except Exception as e:
            logger.error(f"Error initiating project deletion: {str(e)}")
            await db.rollback()
            return {"error": str(e)}
    
    @staticmethod
    async def complete_deletion(
        db: AsyncSession,
        project_id: str
    ) -> Dict[str, Any]:
        """
        Complete project deletion after workers have stopped
        
        This should be called after verifying all jobs are stopped
        """
        try:
            # Get project
            result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = result.scalar_one_or_none()
            
            if not project:
                return {"error": "Project not found"}
            
            if project.status != ProjectStatus.DELETING:
                return {"error": f"Project not in deleting state (current: {project.status.value})"}
            
            # Check if any jobs are still running
            running_jobs_result = await db.execute(
                select(IngestionJob)
                .where(
                    IngestionJob.project_id == project_id,
                    IngestionJob.status.in_(["queued", "running"])
                )
            )
            running_jobs = running_jobs_result.scalars().all()
            
            if running_jobs:
                return {
                    "error": "Cannot complete deletion - jobs still running",
                    "running_jobs": len(running_jobs)
                }
            
            # Get all assistants for vector collection cleanup
            assistants_result = await db.execute(
                select(Assistant).where(Assistant.project_id == project_id)
            )
            assistants = assistants_result.scalars().all()
            
            # Delete vector collections
            for assistant in assistants:
                try:
                    await delete_assistant_collection(
                        assistant.name,
                        "unknown"  # TODO: Get user name from context
                    )
                    logger.info(f"Deleted vector collection for assistant {assistant.id}")
                except Exception as e:
                    logger.error(f"Error deleting vector collection: {str(e)}")
                    # Continue with deletion even if vector cleanup fails
            
            # Mark project as deleted (cascade will handle related records)
            project.status = ProjectStatus.DELETED
            project.deleted_at = datetime.utcnow()
            await db.commit()
            
            logger.info(f"Project {project_id}: Deletion completed")
            
            # Emit audit event
            EventEmitter.emit_project_deletion(
                str(project.tenant_id), str(project_id), "deleted",
                {
                    "deleted_at": project.deleted_at.isoformat(),
                    "assistants_deleted": len(assistants)
                }
            )
            
            return {
                "message": "Project deletion completed",
                "project_id": project_id,
                "assistants_deleted": len(assistants)
            }
            
        except Exception as e:
            logger.error(f"Error completing project deletion: {str(e)}")
            await db.rollback()
            return {"error": str(e)}
    
    @staticmethod
    async def check_deletion_status(
        db: AsyncSession,
        project_id: str
    ) -> Dict[str, Any]:
        """
        Check status of project deletion
        
        Returns:
            Status information including running jobs
        """
        try:
            # Get project
            result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = result.scalar_one_or_none()
            
            if not project:
                return {"error": "Project not found"}
            
            # Get job counts
            jobs_result = await db.execute(
                select(IngestionJob.status, func.count(IngestionJob.id))
                .where(IngestionJob.project_id == project_id)
                .group_by(IngestionJob.status)
            )
            job_counts = {row[0]: row[1] for row in jobs_result.all()}
            
            return {
                "project_id": project_id,
                "status": project.status.value,
                "deleted_at": project.deleted_at.isoformat() if project.deleted_at else None,
                "jobs": {
                    "queued": job_counts.get("queued", 0),
                    "running": job_counts.get("running", 0),
                    "cancelled": job_counts.get("cancelled", 0),
                    "completed": job_counts.get("completed", 0),
                    "failed": job_counts.get("failed", 0)
                },
                "can_complete_deletion": (
                    project.status == ProjectStatus.DELETING and
                    job_counts.get("queued", 0) == 0 and
                    job_counts.get("running", 0) == 0
                )
            }
            
        except Exception as e:
            logger.error(f"Error checking deletion status: {str(e)}")
            return {"error": str(e)}
