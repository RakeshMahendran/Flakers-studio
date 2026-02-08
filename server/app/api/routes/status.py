"""
Status Monitoring API
Real-time status updates and system monitoring
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.services.status_updater import StatusUpdateService

router = APIRouter(prefix="/status", tags=["status"])

class AssistantStatusResponse(BaseModel):
    """Assistant status response"""
    assistant_id: str
    status: str
    status_message: Optional[str]
    is_ready: bool
    total_chunks: str
    total_pages: str
    recent_jobs: List[Dict[str, Any]]
    last_updated: Optional[str]

class JobStatusResponse(BaseModel):
    """Job status response"""
    job_id: str
    assistant_id: str
    status: str
    progress_percentage: int
    pages_processed: int
    chunks_created: int
    errors_count: int
    started_at: Optional[str]
    completed_at: Optional[str]

class SystemHealthResponse(BaseModel):
    """System health response"""
    status: str
    services: Dict[str, str]
    active_jobs: int
    stale_jobs_cleaned: int
    timestamp: str

# Dependency to get status service
def get_status_service() -> StatusUpdateService:
    return StatusUpdateService()

@router.get("/assistant/{assistant_id}", response_model=AssistantStatusResponse)
async def get_assistant_status(
    assistant_id: str,
    status_service: StatusUpdateService = Depends(get_status_service)
):
    """Get current status of an assistant with job monitoring"""
    try:
        status_info = await status_service.sync_assistant_status(assistant_id)
        
        if "error" in status_info:
            raise HTTPException(status_code=404, detail=status_info["error"])
        
        return AssistantStatusResponse(**status_info)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get assistant status: {str(e)}")

@router.get("/job/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    status_service: StatusUpdateService = Depends(get_status_service)
):
    """Get current status of a scraping job"""
    try:
        job_status = await status_service.update_job_progress(job_id)
        
        if not job_status:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return JobStatusResponse(**job_status)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get job status: {str(e)}")

@router.post("/job/{job_id}/restart")
async def restart_failed_job(
    job_id: str,
    status_service: StatusUpdateService = Depends(get_status_service)
):
    """Restart a failed ingestion job"""
    try:
        new_job_id = await status_service.restart_failed_job(job_id)
        
        if not new_job_id:
            raise HTTPException(status_code=400, detail="Failed to restart job - job may not be in failed state")
        
        return {
            "message": "Job restarted successfully",
            "original_job_id": job_id,
            "new_job_id": new_job_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart job: {str(e)}")

@router.get("/health", response_model=SystemHealthResponse)
async def system_health_check(
    status_service: StatusUpdateService = Depends(get_status_service),
    db: AsyncSession = Depends(get_db)
):
    """Comprehensive system health check"""
    try:
        from datetime import datetime
        from sqlalchemy import select, func
        from app.models.content import IngestionJob
        
        # Test database connectivity
        try:
            await db.execute(select(func.count()).select_from(IngestionJob))
            db_status = "healthy"
        except Exception:
            db_status = "unhealthy"
        
        # Test Qdrant connectivity
        try:
            from app.core.qdrant_client import get_qdrant_client
            client = get_qdrant_client()
            client.get_collections()
            qdrant_status = "healthy"
        except Exception:
            qdrant_status = "unhealthy"
        
        # Clean up stale jobs
        stale_cleaned = await status_service.cleanup_stale_jobs(max_age_hours=24)
        
        # Count active jobs from database
        result = await db.execute(
            select(func.count())
            .select_from(IngestionJob)
            .where(IngestionJob.status.in_(['running', 'queued']))
        )
        active_jobs = result.scalar() or 0
        
        # Determine overall status
        services = {
            "database": db_status,
            "qdrant": qdrant_status
        }
        
        overall_status = "healthy" if all(s == "healthy" for s in services.values()) else "degraded"
        
        return SystemHealthResponse(
            status=overall_status,
            services=services,
            active_jobs=active_jobs,
            stale_jobs_cleaned=stale_cleaned,
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        return SystemHealthResponse(
            status="unhealthy",
            services={"error": str(e)},
            active_jobs=0,
            stale_jobs_cleaned=0,
            timestamp=datetime.utcnow().isoformat()
        )

@router.get("/jobs/active")
async def get_active_jobs(
    db: AsyncSession = Depends(get_db)
):
    """Get all currently active jobs"""
    try:
        from sqlalchemy import select
        from app.models.content import IngestionJob
        
        # Get active jobs from database
        result = await db.execute(
            select(IngestionJob)
            .where(IngestionJob.status.in_(['running', 'queued']))
            .order_by(IngestionJob.started_at.desc())
        )
        jobs = result.scalars().all()
        
        active_jobs = [
            {
                "job_id": str(job.id),
                "assistant_id": str(job.assistant_id),
                "status": job.status,
                "current_stage": job.current_stage,
                "urls_discovered": job.total_urls_discovered or 0,
                "urls_scraped": job.urls_scraped or 0,
                "chunks_created": job.total_chunks_created or 0,
                "started_at": job.started_at.isoformat() if job.started_at else None
            }
            for job in jobs
        ]
        
        # Get total job count
        total_result = await db.execute(
            select(func.count()).select_from(IngestionJob)
        )
        total_jobs = total_result.scalar() or 0
        
        return {
            "active_jobs": active_jobs,
            "count": len(active_jobs),
            "total_jobs": total_jobs
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get active jobs: {str(e)}")

@router.post("/cleanup/stale-jobs")
async def cleanup_stale_jobs(
    max_age_hours: int = 24,
    status_service: StatusUpdateService = Depends(get_status_service)
):
    """Manually trigger cleanup of stale jobs"""
    try:
        cleaned_count = await status_service.cleanup_stale_jobs(max_age_hours)
        
        return {
            "message": f"Cleaned up {cleaned_count} stale jobs",
            "cleaned_count": cleaned_count,
            "max_age_hours": max_age_hours
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cleanup stale jobs: {str(e)}")

@router.get("/assistant/{assistant_id}/monitor")
async def monitor_assistant(
    assistant_id: str,
    status_service: StatusUpdateService = Depends(get_status_service)
):
    """Monitor assistant and update status based on job progress"""
    try:
        is_ready = await status_service.monitor_assistant_jobs(assistant_id)
        status_info = await status_service.sync_assistant_status(assistant_id)
        
        return {
            "assistant_id": assistant_id,
            "monitoring_complete": True,
            "is_ready": is_ready,
            "current_status": status_info
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to monitor assistant: {str(e)}")