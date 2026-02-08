"""
Scraping API Routes
Endpoints for automated web scraping and content indexing
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from typing import Optional, List, Dict, Any
import logging
import json
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.content import IngestionJob
from app.services.progress_reporter import ProgressReporter

from app.services.content_discovery import ContentDiscoveryService
from app.services.ingestion import IngestionService
from app.services.web_scraper import ScrapingConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scraping", tags=["scraping"])

# Pydantic models for request/response
class PreviewContentRequest(BaseModel):
    """Preview content request model"""
    url: HttpUrl

# Dependency to get services
def get_discovery_service() -> ContentDiscoveryService:
    return ContentDiscoveryService()

def get_ingestion_service() -> IngestionService:
    return IngestionService()

@router.post("/preview-content")
async def preview_website_content(
    request: PreviewContentRequest,
    discovery_service: ContentDiscoveryService = Depends(get_discovery_service)
):
    """
    Preview website content for discovery phase
    
    This endpoint provides a quick preview of website content
    by scraping the homepage and analyzing its structure.
    Used during the assistant creation flow.
    """
    try:
        preview_data = await discovery_service.preview_website_content(str(request.url))
        
        return preview_data
        
    except Exception as e:
        logger.error(f"Error previewing website content: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to preview content: {str(e)}")

@router.post("/preview-content-stream")
async def preview_website_content_stream(
    request: PreviewContentRequest,
    discovery_service: ContentDiscoveryService = Depends(get_discovery_service)
):
    """
    Preview website content with Server-Sent Events (SSE) for real-time progress
    
    This endpoint streams progress updates as URLs are discovered and scraped.
    Used during the assistant creation flow for better UX.
    """
    import threading
    
    async def generate():
        progress_list = []
        progress_lock = threading.Lock()
        preview_complete = threading.Event()
        preview_result = {'data': None, 'error': None}
        
        def progress_callback(progress_info: Dict[str, Any]):
            """Callback to add progress events"""
            try:
                with progress_lock:
                    progress_list.append(progress_info)
            except Exception as e:
                logger.error(f"Error adding progress: {e}")
        
        async def run_preview():
            """Run preview in background"""
            try:
                preview_data = await discovery_service.preview_website_content(
                    str(request.url),
                    progress_callback=progress_callback
                )
                # Small delay to ensure all progress callbacks are processed
                await asyncio.sleep(0.2)
                
                with progress_lock:
                    preview_result['data'] = preview_data
                preview_complete.set()
            except Exception as e:
                logger.error(f"Error in preview: {str(e)}")
                with progress_lock:
                    preview_result['error'] = str(e)
                preview_complete.set()
        
        # Start preview task
        preview_task = asyncio.create_task(run_preview())
        
        # Stream progress events
        last_index = 0
        while not preview_complete.is_set() or last_index < len(progress_list):
            try:
                # Get new progress items
                with progress_lock:
                    new_items = progress_list[last_index:]
                    last_index = len(progress_list)
                
                # Yield new items
                for item in new_items:
                    yield f"data: {json.dumps(item)}\n\n"
                
                # Check if complete
                if preview_complete.is_set():
                    # Ensure all remaining progress items are sent before completion
                    with progress_lock:
                        remaining_items = progress_list[last_index:]
                        last_index = len(progress_list)
                    
                    for item in remaining_items:
                        yield f"data: {json.dumps(item)}\n\n"
                    
                    # Now send the completion event
                    with progress_lock:
                        if preview_result['error']:
                            yield f"data: {json.dumps({'event_type': 'error', 'error': preview_result['error']})}\n\n"
                        elif preview_result['data']:
                            yield f"data: {json.dumps({'event_type': 'complete', 'result': preview_result['data']})}\n\n"
                    break
                
                # Small delay to avoid busy waiting
                await asyncio.sleep(0.1)
                    
            except Exception as e:
                logger.error(f"Error in stream generation: {e}")
                break
        
        # Wait for preview to complete
        await preview_task
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/test-single-page")
async def test_single_page_scraping(
    url: HttpUrl
):
    """
    Test scraping a single page (for development/testing)
    
    This endpoint scrapes a single page without storing results,
    useful for testing scraping configuration and content extraction.
    """
    try:
        from app.services.web_scraper import WebScraperService
        from app.services.content_processor import ContentProcessor
        
        scraper = WebScraperService()
        processor = ContentProcessor()
        
        # Scrape single page
        scraped_page = await scraper.scrape_single_page(str(url))
        
        if not scraped_page:
            raise HTTPException(status_code=400, detail="Failed to scrape the page")
        
        # Process content
        processed_chunks = processor.process_scraped_pages([scraped_page])
        
        # Get statistics
        scraping_stats = scraper.get_scraping_stats()
        processing_stats = processor.get_processing_stats(processed_chunks)
        
        return {
            "scraped_page": {
                "url": scraped_page.url,
                "title": scraped_page.title,
                "content_length": len(scraped_page.content),
                "content_type": scraped_page.content_type,
                "links_count": len(scraped_page.links),
                "images_count": len(scraped_page.images),
                "scraped_at": scraped_page.scraped_at.isoformat()
            },
            "processed_chunks": [
                {
                    "content_preview": chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content,
                    "intent": chunk.intent.value,
                    "confidence_score": chunk.confidence_score,
                    "chunk_size": chunk.chunk_size,
                    "is_sensitive": chunk.is_sensitive,
                    "is_policy_content": chunk.is_policy_content
                }
                for chunk in processed_chunks
            ],
            "scraping_stats": scraping_stats,
            "processing_stats": processing_stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing single page scraping: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to test scraping: {str(e)}")

@router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the status of a scraping job
    
    Returns the current status, progress, and results of a scraping job.
    """
    try:
        job_result = await db.execute(
            select(IngestionJob).where(IngestionJob.id == job_id)
        )
        job = job_result.scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        progress = await ProgressReporter.get_job_progress(db, job_id)
        if progress.get("error"):
            raise HTTPException(status_code=404, detail=progress["error"])

        urls_total = progress.get("urls", {}).get("total") or 0
        urls_processed = progress.get("urls", {}).get("processed") or 0
        urls_completed = progress.get("urls", {}).get("completed") or 0

        # NOTE: ProgressReporter can compute chunk progress from IngestionChunk rows,
        # but our current ingestion implementation doesn't create those rows.
        # So we fall back to job.total_chunks_created + job.chunks_uploaded when available.
        total_chunks_created = int(job.total_chunks_created or 0)
        chunks_uploaded = int(job.chunks_uploaded or 0)

        if total_chunks_created > 0 and (job.current_stage in ["ingestion", "storing", "completed"]):
            progress_percentage = int(round((chunks_uploaded / total_chunks_created) * 100))
            chunks_created = total_chunks_created
        else:
            progress_percentage = int(round((urls_processed / urls_total) * 100)) if urls_total > 0 else 0
            chunks_created = total_chunks_created

        return {
            "job_id": str(job.id),
            "assistant_id": str(job.assistant_id),
            "status": job.status,
            "current_stage": job.current_stage,
            "progress_percentage": progress_percentage,
            "pages_discovered": int(job.total_urls_discovered or 0),
            "pages_processed": int(urls_processed + urls_completed),
            "chunks_created": chunks_created,
            "chunks_uploaded": chunks_uploaded,
            "errors_count": int(job.errors_count or 0),
            "error_details": job.error_details or [],
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching job status: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch job status: {str(e)}")

@router.get("/health")
async def health_check():
    """Health check endpoint for scraping service"""
    try:
        # Test WebDriver availability
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from webdriver_manager.chrome import ChromeDriverManager
        
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        # Try to initialize driver
        driver = webdriver.Chrome(
            service=webdriver.chrome.service.Service(ChromeDriverManager().install()),
            options=chrome_options
        )
        driver.quit()
        
        return {
            "status": "healthy",
            "selenium": "available",
            "webdriver": "chrome",
            "message": "Scraping service is ready"
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": "Scraping service is not available"
        }