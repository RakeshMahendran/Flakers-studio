"""
Projects API Routes
Multi-tenant project management with lifecycle support
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict, Any
import uuid
import asyncio
import json
import threading
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.models.project import Project, ProjectStatus
from app.services.project_deletion import ProjectDeletionService
from app.models.assistant import Assistant, AssistantStatus, AssistantTemplate, SourceType
from app.models.content import IngestionJob, JobStatus
from app.models.ingestion_tracking import IngestionURL, URLStatus
from app.services.web_scraper import WebScraperService, ScrapingConfig

router = APIRouter(prefix="/projects", tags=["projects"])

class CreateProjectRequest(BaseModel):
    """Create project request"""
    tenant_id: str
    name: str
    description: Optional[str] = None

class ProjectResponse(BaseModel):
    """Project response"""
    id: str
    tenant_id: str
    name: str
    description: Optional[str]
    status: str
    created_at: str
    updated_at: Optional[str]
    deleted_at: Optional[str]

class ListProjectsResponse(BaseModel):
    """List projects response"""
    projects: List[ProjectResponse]
    total: int

class BulkDeleteProjectsResponse(BaseModel):
    message: str
    tenant_id: str
    projects_found: int
    deletion_initiated: int
    results: List[Dict[str, Any]]


class WebsiteScrapeRequest(BaseModel):
    tenant_id: str
    user_name: str
    name: str
    description: Optional[str] = None
    template: AssistantTemplate
    site_url: HttpUrl
    max_pages: Optional[int] = 100
    max_depth: Optional[int] = 3
    delay_between_requests: Optional[float] = 1.0
    timeout: Optional[int] = 30
    follow_external_links: Optional[bool] = False
    excluded_patterns: Optional[List[str]] = None


class ScrapedUrlItem(BaseModel):
    url: str
    title: Optional[str] = None
    content_type: Optional[str] = None
    content_length: Optional[int] = None
    scraped_at: Optional[str] = None


class ListScrapedUrlsResponse(BaseModel):
    job_id: str
    urls: List[ScrapedUrlItem]


class ScrapedUrlContentResponse(BaseModel):
    job_id: str
    url: str
    title: Optional[str] = None
    content_type: Optional[str] = None
    raw_content: str
    content_length: Optional[int] = None
    scraped_at: Optional[str] = None


@router.post("/website/scrape")
async def scrape_website_master(
    request: WebsiteScrapeRequest,
    db: AsyncSession = Depends(get_db),
):
    async def generate():
        progress_list: List[Dict[str, Any]] = []
        progress_lock = threading.Lock()
        scrape_complete = threading.Event()
        scrape_result: Dict[str, Any] = {"data": None, "error": None}

        def progress_callback(progress_info: Dict[str, Any]):
            try:
                with progress_lock:
                    progress_list.append(progress_info)
            except Exception:
                return

        async def run_scrape():
            try:
                tenant_uuid = uuid.UUID(request.tenant_id)

                project_result = await db.execute(
                    select(Project).where(
                        Project.tenant_id == tenant_uuid,
                        Project.status == ProjectStatus.ACTIVE,
                    ).limit(1)
                )
                project = project_result.scalar_one_or_none()

                if not project:
                    project = Project(
                        id=uuid.uuid4(),
                        tenant_id=tenant_uuid,
                        name=request.name,
                        description=request.description or "Auto-created project",
                        status=ProjectStatus.ACTIVE,
                    )
                    db.add(project)
                    await db.flush()

                assistant = Assistant(
                    id=uuid.uuid4(),
                    project_id=project.id,
                    tenant_id=tenant_uuid,
                    name=request.name,
                    description=request.description,
                    source_type=SourceType.WEBSITE,
                    site_url=str(request.site_url),
                    template=request.template,
                    status=AssistantStatus.CREATING,
                    status_message=f"Discovering content from {request.site_url}",
                )
                db.add(assistant)
                await db.flush()

                job = IngestionJob(
                    id=uuid.uuid4(),
                    project_id=project.id,
                    assistant_id=assistant.id,
                    tenant_id=tenant_uuid,
                    status=JobStatus.RUNNING.value,
                    current_stage="discovery",
                )
                db.add(job)
                await db.commit()

                # Let the client know identifiers early, so it can recover by fetching from DB
                progress_callback({
                    "event_type": "init",
                    "assistant_id": str(assistant.id),
                    "job_id": str(job.id),
                })

                scraper = WebScraperService()
                config = ScrapingConfig(
                    max_pages=int(request.max_pages or 100),
                    max_depth=int(request.max_depth or 3),
                    delay_between_requests=float(request.delay_between_requests or 1.0),
                    timeout=int(request.timeout or 30),
                    follow_external_links=bool(request.follow_external_links or False),
                    excluded_patterns=request.excluded_patterns or [],
                )

                pages = await scraper.scrape_website_parallel(
                    start_url=str(request.site_url),
                    config=config,
                    max_workers=5,
                    progress_callback=progress_callback,
                )

                if not pages:
                    raise Exception("No pages were successfully scraped")

                job.total_urls_discovered = len(pages)
                job.urls_scraped = len(pages)
                job.status = JobStatus.RUNNING.value
                job.current_stage = "discovery_complete"
                # Don't set completed_at yet - job isn't fully complete until ingestion finishes

                for page in pages:
                    url_hash = uuid.uuid5(uuid.NAMESPACE_URL, page.url).hex
                    db.add(
                        IngestionURL(
                            job_id=job.id,
                            url=page.url,
                            url_hash=url_hash,
                            status=URLStatus.SCRAPED.value,
                            title=page.title,
                            content_type=page.content_type,
                            raw_content=page.content,
                            content_length=len(page.content),
                            scraped_at=page.scraped_at,
                        )
                    )

                assistant.total_pages_crawled = str(len(pages))
                await db.commit()

                # Small delay to ensure all progress callbacks are processed
                await asyncio.sleep(0.2)

                with progress_lock:
                    scrape_result["data"] = {
                        "assistant_id": str(assistant.id),
                        "job_id": str(job.id),
                        "pages_scraped": len(pages),
                        "urls": [p.url for p in pages],
                    }
                scrape_complete.set()
            except Exception as e:
                try:
                    await db.rollback()
                except Exception:
                    pass
                with progress_lock:
                    scrape_result["error"] = str(e)
                scrape_complete.set()

        scrape_task = asyncio.create_task(run_scrape())

        last_index = 0
        while not scrape_complete.is_set() or last_index < len(progress_list):
            with progress_lock:
                new_items = progress_list[last_index:]
                last_index = len(progress_list)

            for item in new_items:
                yield f"data: {json.dumps(item)}\n\n"

            if scrape_complete.is_set():
                # Ensure all remaining progress items are sent before completion
                with progress_lock:
                    remaining_items = progress_list[last_index:]
                    last_index = len(progress_list)
                
                for item in remaining_items:
                    yield f"data: {json.dumps(item)}\n\n"
                
                # Now send the completion event
                with progress_lock:
                    if scrape_result["error"]:
                        yield f"data: {json.dumps({'event_type': 'error', 'error': scrape_result['error']})}\n\n"
                    else:
                        yield f"data: {json.dumps({'event_type': 'complete', 'result': scrape_result['data']})}\n\n"
                break

            await asyncio.sleep(0.1)

        await scrape_task

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/website/scrape/{job_id}/urls", response_model=ListScrapedUrlsResponse)
async def list_scraped_urls(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    logger.info(f"Fetching URLs for job_id={job_id}")
    try:
        job_uuid = uuid.UUID(job_id)
        logger.info(f"Successfully parsed job_id to UUID: {job_uuid}")
    except Exception as e:
        logger.error(f"Invalid job_id format: {job_id}, error: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid job_id")

    # First check if the job exists
    job_result = await db.execute(
        select(IngestionJob).where(IngestionJob.id == job_uuid)
    )
    job = job_result.scalar_one_or_none()
    
    if not job:
        logger.error(f"Job not found: {job_id}")
        raise HTTPException(status_code=404, detail="Job not found")
    
    logger.info(f"Job found: {job_id}, status={job.status}, stage={job.current_stage}")

    result = await db.execute(
        select(IngestionURL)
        .where(
            IngestionURL.job_id == job_uuid,
            IngestionURL.status == URLStatus.SCRAPED.value,
        )
        .order_by(IngestionURL.created_at)
    )
    rows = result.scalars().all()
    
    logger.info(f"Found {len(rows)} scraped URLs for job {job_id}")

    return ListScrapedUrlsResponse(
        job_id=job_id,
        urls=[
            ScrapedUrlItem(
                url=r.url,
                title=r.title,
                content_type=r.content_type,
                content_length=r.content_length,
                scraped_at=r.scraped_at.isoformat() if r.scraped_at else None,
            )
            for r in rows
        ],
    )


@router.get("/website/scrape/{job_id}/content", response_model=ScrapedUrlContentResponse)
async def get_scraped_url_content(
    job_id: str,
    url: str,
    db: AsyncSession = Depends(get_db),
):
    logger.info(f"Fetching content for job_id={job_id}, url={url}")
    try:
        job_uuid = uuid.UUID(job_id)
        logger.info(f"Successfully parsed job_id to UUID: {job_uuid}")
    except Exception as e:
        logger.error(f"Invalid job_id format: {job_id}, error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid job_id: {str(e)}")

    result = await db.execute(
        select(IngestionURL).where(
            IngestionURL.job_id == job_uuid,
            IngestionURL.url == url,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="URL not found for this job")

    if not row.raw_content:
        raise HTTPException(status_code=404, detail="No scraped content stored for this URL")

    return ScrapedUrlContentResponse(
        job_id=job_id,
        url=row.url,
        title=row.title,
        content_type=row.content_type,
        raw_content=row.raw_content,
        content_length=row.content_length,
        scraped_at=row.scraped_at.isoformat() if row.scraped_at else None,
    )

@router.post("", response_model=ProjectResponse)
async def create_project(
    request: CreateProjectRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    try:
        project = Project(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(request.tenant_id),
            name=request.name,
            description=request.description,
            status=ProjectStatus.ACTIVE
        )
        
        db.add(project)
        await db.commit()
        await db.refresh(project)
        
        return ProjectResponse(
            id=str(project.id),
            tenant_id=str(project.tenant_id),
            name=project.name,
            description=project.description,
            status=project.status.value,
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat() if project.updated_at else None,
            deleted_at=project.deleted_at.isoformat() if project.deleted_at else None
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")

@router.get("", response_model=ListProjectsResponse)
async def list_projects(
    tenant_id: Optional[str] = None,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """List projects for a tenant"""
    try:
        query = select(Project)
        
        if tenant_id:
            query = query.where(Project.tenant_id == uuid.UUID(tenant_id))
        
        if not include_deleted:
            query = query.where(Project.status != ProjectStatus.DELETED)
        
        query = query.order_by(Project.created_at.desc())
        
        result = await db.execute(query)
        projects = result.scalars().all()
        
        project_responses = [
            ProjectResponse(
                id=str(p.id),
                tenant_id=str(p.tenant_id),
                name=p.name,
                description=p.description,
                status=p.status.value,
                created_at=p.created_at.isoformat(),
                updated_at=p.updated_at.isoformat() if p.updated_at else None,
                deleted_at=p.deleted_at.isoformat() if p.deleted_at else None
            )
            for p in projects
        ]
        
        return ListProjectsResponse(
            projects=project_responses,
            total=len(project_responses)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list projects: {str(e)}")

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get project details"""
    try:
        project_uuid = uuid.UUID(project_id)
        result = await db.execute(
            select(Project).where(Project.id == project_uuid)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return ProjectResponse(
            id=str(project.id),
            tenant_id=str(project.tenant_id),
            name=project.name,
            description=project.description,
            status=project.status.value,
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat() if project.updated_at else None,
            deleted_at=project.deleted_at.isoformat() if project.deleted_at else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get project: {str(e)}")

@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    tenant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Initiate project deletion
    This marks the project as deleting and cancels all jobs
    """
    try:
        result = await ProjectDeletionService.initiate_deletion(
            db, project_id, tenant_id
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")

@router.delete("", response_model=BulkDeleteProjectsResponse)
async def delete_all_projects_for_tenant(
    tenant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Initiate deletion for all non-deleted projects for a tenant."""
    try:
        tenant_uuid = uuid.UUID(tenant_id)

        result = await db.execute(
            select(Project).where(
                Project.tenant_id == tenant_uuid,
                Project.status != ProjectStatus.DELETED
            )
        )
        projects = result.scalars().all()

        deletion_results: List[Dict[str, Any]] = []
        initiated = 0

        for project in projects:
            deletion_result = await ProjectDeletionService.initiate_deletion(
                db,
                project_id=str(project.id),
                tenant_id=tenant_id
            )
            deletion_results.append({
                "project_id": str(project.id),
                "result": deletion_result
            })
            if "error" not in deletion_result:
                initiated += 1

        return BulkDeleteProjectsResponse(
            message="Bulk project deletion initiated",
            tenant_id=tenant_id,
            projects_found=len(projects),
            deletion_initiated=initiated,
            results=deletion_results
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant_id")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to bulk delete projects: {str(e)}")

@router.post("/{project_id}/complete-deletion")
async def complete_project_deletion(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Complete project deletion after all jobs have stopped
    This should be called after verifying no jobs are running
    """
    try:
        result = await ProjectDeletionService.complete_deletion(db, project_id)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to complete deletion: {str(e)}")

@router.get("/{project_id}/deletion-status")
async def get_deletion_status(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Check status of project deletion"""
    try:
        result = await ProjectDeletionService.check_deletion_status(db, project_id)
        
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check deletion status: {str(e)}")


@router.post("/website/ingest")
async def ingest_website_content(
    assistant_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Start content ingestion with SSE streaming for real-time progress
    
    This endpoint is called after scraping completes to:
    1. Process scraped content into chunks
    2. Generate embeddings
    3. Upload to vector database
    
    Returns Server-Sent Events for real-time progress updates
    """
    async def generate():
        try:
            # Get assistant
            result = await db.execute(
                select(Assistant).where(Assistant.id == assistant_id)
            )
            assistant = result.scalar_one_or_none()
            
            if not assistant:
                error_data = {"event_type": "error", "error": "Assistant not found"}
                yield f"data: {json.dumps(error_data)}\n\n"
                return
            
            # Find the most recent scraping job for this assistant that's ready for ingestion
            result = await db.execute(
                select(IngestionJob)
                .where(
                    IngestionJob.assistant_id == assistant_id,
                    IngestionJob.status == JobStatus.RUNNING.value,
                    IngestionJob.current_stage == "discovery_complete"
                )
                .order_by(IngestionJob.started_at.desc())
                .limit(1)
            )
            job = result.scalar_one_or_none()
            
            if not job:
                error_data = {"event_type": "error", "error": "No scraping job ready for ingestion"}
                yield f"data: {json.dumps(error_data)}\n\n"
                return
            
            # Send initial event
            init_data = {"event_type": "init", "job_id": str(job.id), "assistant_id": assistant_id}
            yield f"data: {json.dumps(init_data)}\n\n"
            
            # Start ingestion
            from app.services.ingestion import IngestionService
            ingestion_service = IngestionService()
            
            project_name = assistant.name
            try:
                project_result = await db.execute(
                    select(Project).where(Project.id == assistant.project_id)
                )
                project = project_result.scalar_one_or_none()
                if project and project.name:
                    project_name = project.name
            except Exception:
                project_name = assistant.name
            
            user_name = str(assistant.tenant_id)[:8]
            
            await ingestion_service.start_ingestion(
                job_id=str(job.id),
                assistant_id=str(assistant.id),
                assistant_name=project_name,
                user_name=user_name
            )
            
            # Poll for progress and stream updates
            last_stage = None
            last_percentage = 0
            max_polls = 300  # 5 minutes max
            poll_count = 0
            job_id_str = str(job.id)  # Store job ID before any async operations
            
            while poll_count < max_polls:
                await asyncio.sleep(1)
                poll_count += 1
                
                # Refresh job from database with explicit session refresh
                await db.rollback()  # Clear any cached data
                result = await db.execute(
                    select(IngestionJob).where(IngestionJob.id == job_id_str)
                )
                job = result.scalar_one_or_none()
                
                if not job:
                    logger.warning(f"Job {job_id_str} not found during polling")
                    break
                
                logger.debug(f"Job {job_id_str} status: {job.status}, stage: {job.current_stage}")
                
                # Calculate progress
                total_chunks = int(job.total_chunks_created or 0)
                uploaded_chunks = int(job.chunks_uploaded or 0)
                
                if total_chunks > 0:
                    progress_percentage = int((uploaded_chunks / total_chunks) * 100)
                else:
                    progress_percentage = 0
                
                # Check if completed FIRST before sending progress
                if job.status == "completed":
                    logger.info(f"Job {job_id_str} completed, sending complete event")
                    complete_data = {
                        "event_type": "complete",
                        "job_id": job_id_str,
                        "assistant_id": assistant_id,
                        "chunks_created": total_chunks,
                        "chunks_uploaded": uploaded_chunks
                    }
                    yield f"data: {json.dumps(complete_data)}\n\n"
                    break
                
                # Check if failed
                if job.status == "failed":
                    logger.info(f"Job {job_id_str} failed")
                    error_data = {
                        "event_type": "error",
                        "error": "Ingestion failed",
                        "details": job.error_details
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"
                    break
                
                # Send progress update if changed
                if job.current_stage != last_stage or progress_percentage != last_percentage:
                    progress_data = {
                        "event_type": "progress",
                        "stage": job.current_stage or "starting",
                        "progress_percentage": progress_percentage,
                        "chunks_created": total_chunks,
                        "chunks_uploaded": uploaded_chunks,
                        "status": job.status
                    }
                    yield f"data: {json.dumps(progress_data)}\n\n"
                    
                    last_stage = job.current_stage
                    last_percentage = progress_percentage
            
            # Timeout
            if poll_count >= max_polls:
                timeout_data = {"event_type": "timeout", "message": "Ingestion is taking longer than expected"}
                yield f"data: {json.dumps(timeout_data)}\n\n"
                
        except Exception as e:
            logger.error(f"Error in ingestion stream: {str(e)}", exc_info=True)
            error_data = {"event_type": "error", "error": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
