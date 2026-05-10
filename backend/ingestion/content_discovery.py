"""
Content Discovery Service - Find and classify website content
Scrapes website ONCE and stores in database for later ingestion
"""
from typing import List, Dict, Any, Optional, Callable
import asyncio
import logging
import hashlib
import uuid
from datetime import datetime
from urllib.parse import urlparse, urljoin
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.assistant import Assistant, SourceType
from backend.models.content import IngestionJob, JobStatus
from backend.models.ingestion_tracking import IngestionURL, URLStatus
from backend.ingestion.web_scraper import WebScraperService, ScrapingConfig
from backend.ingestion.wordpress_client import WordPressClient, WordPressConfig
from backend.ingestion.content_processor import ContentProcessor
from backend.config.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

class ContentDiscoveryService:
    """
    Discovers content from websites and WordPress sites
    
    This service:
    1. Crawls the target site
    2. Discovers pages and content
    3. Classifies content by intent
    4. Prepares for ingestion
    """
    
    def __init__(self):
        self.scraper = WebScraperService()
        self.processor = ContentProcessor()

    @staticmethod
    def _append_job_error(job: IngestionJob, message: str) -> None:
        details = list(job.error_details or [])
        details.append({"error": message, "timestamp": datetime.utcnow().isoformat()})
        job.error_details = details
        job.errors_count = int(job.errors_count or 0) + 1
    
    async def start_discovery(
        self,
        assistant_id: str,
        project_id: str,
        tenant_id: str,
        site_url: str,
        source_type: str = "website",
        scraping_config: Optional[ScrapingConfig] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> str:
        """
        Start content discovery process - scrapes website and stores in database
        
        Returns:
            job_id: UUID of the discovery job
        """
        job_id = str(uuid.uuid4())
        
        logger.info(f"Starting content discovery for {site_url}")
        
        # Create discovery job
        async with AsyncSessionLocal() as db:
            job = IngestionJob(
                id=job_id,
                project_id=project_id,
                assistant_id=assistant_id,
                tenant_id=tenant_id,
                status=JobStatus.RUNNING.value,
                current_stage="discovery"
            )
            db.add(job)
            await db.commit()
        
        # Start background scraping
        asyncio.create_task(
            self._execute_discovery(
                job_id, assistant_id, site_url, source_type, scraping_config, progress_callback
            )
        )
        
        return job_id
    
    async def _execute_discovery(
        self,
        job_id: str,
        assistant_id: str,
        site_url: str,
        source_type: str = "website",
        scraping_config: Optional[ScrapingConfig] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        """Execute discovery - scrape website or fetch via WordPress API and store in database"""
        try:
            async with AsyncSessionLocal() as db:
                job = await db.get(IngestionJob, job_id)

                # ── WordPress REST API path ──────────────────────────
                if source_type == SourceType.WORDPRESS.value or source_type == "wordpress":
                    logger.info("Job %s: Fetching via WordPress REST API", job_id)
                    scraped_pages = await self._fetch_wordpress(
                        site_url, progress_callback,
                    )
                else:
                    # ── Generic Selenium scraping path ────────────────
                    if scraping_config is None:
                        scraping_config = ScrapingConfig(
                            max_pages=50,
                            max_depth=3,
                            delay_between_requests=1.0,
                            timeout=30,
                            follow_external_links=False,
                        )

                    logger.info("Job %s: Scraping website with parallel workers", job_id)
                    scraped_pages = await self.scraper.scrape_website_parallel(
                        site_url,
                        scraping_config,
                        max_workers=5,
                        progress_callback=progress_callback,
                    )
                
                if not scraped_pages:
                    raise Exception("No pages were successfully scraped")
                
                logger.info(f"Job {job_id}: Scraped {len(scraped_pages)} pages")
                
                # Store scraped pages in database
                job.total_urls_discovered = len(scraped_pages)
                job.current_stage = "storing"
                await db.commit()
                
                for page in scraped_pages:
                    # Create URL hash for deduplication
                    url_hash = hashlib.md5(page.url.encode('utf-8')).hexdigest()
                    
                    # Detect language and count words
                    language = self.processor._detect_language(page.content)
                    word_count = self.processor._count_words(page.content)
                    
                    # Validate extracted metadata before database insert
                    raw_metadata = getattr(page, "extracted_metadata", {}) or {}
                    try:
                        from backend.ingestion.metadata_validator import validate_metadata, validate_metadata_size
                        validated_metadata = validate_metadata(raw_metadata, strict=False)
                        if not validate_metadata_size(validated_metadata):
                            logger.warning(f"Metadata for {page.url} exceeds size limit, truncating")
                            validated_metadata = {}
                    except Exception as e:
                        logger.warning(f"Metadata validation failed for {page.url}: {e}")
                        validated_metadata = {}

                    # Store in database
                    url_record = IngestionURL(
                        job_id=job_id,
                        url=page.url,
                        url_hash=url_hash,
                        status=URLStatus.SCRAPED.value,
                        title=page.title,
                        content_type=page.content_type,
                        language=language,
                        word_count=word_count,
                        raw_content=page.content,
                        content_length=len(page.content),
                        scraped_at=page.scraped_at,
                        extracted_metadata=validated_metadata,
                    )
                    db.add(url_record)
                
                # Update job status - keep as RUNNING since ingestion phase is next
                job.status = JobStatus.RUNNING.value
                job.current_stage = "discovery_complete"
                job.urls_scraped = len(scraped_pages)
                # Don't set completed_at yet - job isn't fully complete until ingestion finishes
                await db.commit()
                
                logger.info(f"Job {job_id}: Discovery completed - {len(scraped_pages)} pages stored in database, ready for ingestion")
                
        except Exception as e:
            logger.error(f"Job {job_id}: Discovery failed - {str(e)}", exc_info=True)
            
            # Update job status to failed
            try:
                async with AsyncSessionLocal() as db:
                    job = await db.get(IngestionJob, job_id)
                    job.status = JobStatus.FAILED.value
                    job.current_stage = "failed"
                    job.completed_at = datetime.utcnow()
                    self._append_job_error(job, str(e))
                    await db.commit()
            except Exception as db_error:
                logger.error(f"Failed to update job status: {str(db_error)}")
    
    async def preview_website_content(
        self, 
        site_url: str, 
        assistant_id: str = "preview",
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> Dict[str, Any]:
        """
        Enhanced website content preview with parallel scraping for speed
        
        Args:
            site_url: URL to preview
            assistant_id: Assistant ID for preview
            progress_callback: Optional callback for progress updates
        """
        try:
            logger.info(f"Starting fast preview for {site_url} with parallel scraping")
            
            # Use parallel scraping with limited pages for preview
            config = ScrapingConfig(
                max_pages=6,  # Homepage + 5 sample pages
                max_depth=1,
                delay_between_requests=0.5,
                timeout=20,
                follow_external_links=False
            )
            
            # Scrape with 3 parallel workers for preview speed
            all_pages = await self.scraper.scrape_website_parallel(
                site_url,
                config,
                max_workers=3,
                progress_callback=progress_callback
            )
            
            if not all_pages:
                logger.warning(f"Could not scrape any pages from {site_url}")
                return {
                    "error": "Could not access the website",
                    "pages_discovered": 0,
                    "content_types": [],
                    "intents": []
                }
            
            logger.info(f"Parallel scraping completed: {len(all_pages)} pages analyzed")
            
            # Get total discovered URLs from homepage
            homepage = all_pages[0] if all_pages else None
            total_discovered = len(homepage.links) if homepage else 0
            
            # Phase 4: Process all collected pages
            processed_chunks = self.processor.process_scraped_pages(all_pages)
            logger.info(f"Generated {len(processed_chunks)} content chunks")
            
            # Phase 5: Analyze and categorize content
            content_types = {}
            intent_map = {}
            page_categories = {}
            
            # Categorize pages by URL patterns and content
            for page in all_pages:
                page_type = self._categorize_page_type(page.url, page.title, page.content)
                if page_type not in content_types:
                    content_types[page_type] = {"count": 0, "examples": []}
                
                content_types[page_type]["count"] += 1
                if len(content_types[page_type]["examples"]) < 3:
                    content_types[page_type]["examples"].append(page.title or page.url.split('/')[-1])
                
                page_categories[page.url] = page_type
            
            # Analyze intents from processed chunks
            for chunk in processed_chunks:
                intent = chunk.intent.value
                if intent not in intent_map:
                    intent_map[intent] = {"count": 0, "confidence": 0, "pages": set()}
                
                intent_map[intent]["count"] += 1
                intent_map[intent]["confidence"] = max(
                    intent_map[intent]["confidence"], 
                    chunk.confidence_score
                )
                intent_map[intent]["pages"].add(chunk.source_url)
            
            # Format content types for response
            formatted_content_types = [
                {
                    "type": content_type.title().replace('_', ' '),
                    "count": data["count"],
                    "examples": data["examples"]
                }
                for content_type, data in content_types.items()
            ]
            
            # Format intents for response
            formatted_intents = [
                {
                    "intent": intent,
                    "confidence": data["confidence"],
                    "pageCount": len(data["pages"])
                }
                for intent, data in intent_map.items()
            ]
            
            # Calculate comprehensive statistics
            total_content_length = sum(len(page.content) for page in all_pages)
            total_links_found = sum(len(page.links) for page in all_pages)
            
            return {
                "assistant_id": assistant_id,
                "pages_discovered": total_discovered,
                "pages_analyzed": len(all_pages),
                "content_types": formatted_content_types,
                "intents": formatted_intents,
                "status": "preview_complete",
                "scraping_method": "parallel",
                "comprehensive_analysis": {
                    "homepage_title": all_pages[0].title if all_pages else "",
                    "total_content_length": total_content_length,
                    "total_links_found": total_links_found,
                    "content_chunks_generated": len(processed_chunks),
                    "page_categories": page_categories,
                    "discovery_coverage": f"{len(all_pages)}/{total_discovered} pages analyzed"
                }
            }
            
        except Exception as e:
            logger.error(f"Error in comprehensive content preview: {str(e)}", exc_info=True)
            return {
                "error": f"Error during content discovery: {str(e)}",
                "pages_discovered": 0,
                "content_types": [],
                "intents": []
            }
    
    def _categorize_page_type(self, url: str, title: str, content: str) -> str:
        """
        Categorize page type based on URL patterns, title, and content
        Similar to the comprehensive categorization in the scraping script
        """
        url_lower = url.lower()
        title_lower = title.lower() if title else ""
        content_lower = content.lower()[:500]  # First 500 chars for analysis
        
        # URL-based categorization (most reliable)
        url_patterns = {
            'about': ['about', 'company', 'team', 'leadership', 'history'],
            'products': ['product', 'solution', 'service', 'offering'],
            'pricing': ['pricing', 'price', 'cost', 'plan', 'subscription'],
            'support': ['support', 'help', 'faq', 'documentation', 'docs'],
            'blog': ['blog', 'news', 'article', 'post', 'insights'],
            'contact': ['contact', 'reach', 'location', 'office'],
            'careers': ['career', 'job', 'hiring', 'employment'],
            'legal': ['legal', 'privacy', 'terms', 'policy', 'compliance'],
            'resources': ['resource', 'download', 'whitepaper', 'guide', 'ebook']
        }
        
        for category, patterns in url_patterns.items():
            if any(pattern in url_lower for pattern in patterns):
                return category
        
        # Title-based categorization
        title_patterns = {
            'about': ['about us', 'our company', 'our team', 'who we are'],
            'products': ['products', 'solutions', 'services', 'what we do'],
            'support': ['help center', 'support', 'faq', 'documentation'],
            'blog': ['blog', 'news', 'insights', 'articles'],
            'contact': ['contact us', 'get in touch', 'reach us']
        }
        
        for category, patterns in title_patterns.items():
            if any(pattern in title_lower for pattern in patterns):
                return category
        
        # Content-based categorization (fallback)
        content_indicators = {
            'about': ['founded', 'mission', 'vision', 'our story', 'leadership team'],
            'products': ['features', 'benefits', 'specifications', 'how it works'],
            'support': ['troubleshoot', 'how to', 'step by step', 'getting started'],
            'pricing': ['$', 'price', 'cost', 'subscription', 'plan', 'free trial'],
            'legal': ['privacy policy', 'terms of service', 'legal notice', 'gdpr']
        }
        
        for category, indicators in content_indicators.items():
            if any(indicator in content_lower for indicator in indicators):
                return category
        
        # Default categorization
        if url_lower == urlparse(url_lower).netloc or url_lower.endswith('/'):
            return 'homepage'
        
        return 'general'
    
    async def _discover_website_content(
        self,
        assistant_id: str,
        site_url: str
    ) -> Dict[str, Any]:
        """Discover content from a regular website"""
        try:
            # Use limited scraping for discovery
            config = ScrapingConfig(
                max_pages=10,  # Limited for discovery
                max_depth=2,
                delay_between_requests=0.5,
                timeout=15,
                follow_external_links=False
            )
            
            scraped_pages = await self.scraper.scrape_website(site_url, config)
            
            if not scraped_pages:
                return {
                    "assistant_id": assistant_id,
                    "pages_discovered": 0,
                    "pages": [],
                    "status": "discovery_failed",
                    "error": "No pages could be scraped"
                }
            
            # Process pages
            processed_chunks = self.scraper.processor.process_scraped_pages(scraped_pages)
            
            # Analyze discovered content
            content_types = {}
            intent_map = {}
            
            for page in scraped_pages:
                content_type = page.content_type or "general"
                if content_type not in content_types:
                    content_types[content_type] = {
                        "count": 0,
                        "examples": []
                    }
                content_types[content_type]["count"] += 1
                if len(content_types[content_type]["examples"]) < 3:
                    content_types[content_type]["examples"].append(page.title or page.url)
            
            for chunk in processed_chunks:
                intent = chunk.intent.value
                if intent not in intent_map:
                    intent_map[intent] = {
                        "count": 0,
                        "confidence": 0
                    }
                intent_map[intent]["count"] += 1
                intent_map[intent]["confidence"] = max(
                    intent_map[intent]["confidence"],
                    chunk.confidence_score
                )
            
            discovered_pages = [
                {
                    "url": page.url,
                    "title": page.title,
                    "content_type": page.content_type,
                    "estimated_intent": page.content_type  # Simplified mapping
                }
                for page in scraped_pages
            ]
            
            return {
                "assistant_id": assistant_id,
                "pages_discovered": len(scraped_pages),
                "pages": discovered_pages,
                "content_types": [
                    {
                        "type": content_type.title(),
                        "count": data["count"],
                        "examples": data["examples"]
                    }
                    for content_type, data in content_types.items()
                ],
                "intents": [
                    {
                        "intent": intent,
                        "confidence": data["confidence"],
                        "pageCount": data["count"]
                    }
                    for intent, data in intent_map.items()
                ],
                "status": "discovery_complete"
            }
            
        except Exception as e:
            logger.error(f"Error discovering website content: {str(e)}")
            return {
                "assistant_id": assistant_id,
                "pages_discovered": 0,
                "pages": [],
                "status": "discovery_failed",
                "error": str(e)
            }
    
    # ------------------------------------------------------------------
    # WordPress REST API helpers
    # ------------------------------------------------------------------

    async def _fetch_wordpress(
        self,
        site_url: str,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> list:
        """Fetch all content from a WordPress site via its REST API.

        Returns a list of ``ScrapedPage`` objects identical to what the
        Selenium scraper produces so the downstream pipeline is unchanged.
        """
        wp_client = WordPressClient(
            site_url,
            config=WordPressConfig(
                per_page=100,
                max_pages=50,
                request_timeout=30,
                delay_between_requests=0.5,
                probe_optional_endpoints=True,
            ),
            progress_callback=progress_callback,
        )
        pages = await wp_client.fetch_all()
        logger.info("WordPress REST API returned %d pages for %s", len(pages), site_url)
        return pages

    async def _discover_wordpress_content(
        self,
        assistant_id: str,
        site_url: str,
    ) -> Dict[str, Any]:
        """Discover content from WordPress via REST API (used by preview)."""
        try:
            pages = await self._fetch_wordpress(site_url)
            if not pages:
                return {
                    "assistant_id": assistant_id,
                    "pages_discovered": 0,
                    "pages": [],
                    "status": "discovery_failed",
                    "error": "WordPress REST API not available or returned no content",
                }

            processed_chunks = self.processor.process_scraped_pages(pages)

            content_types: Dict[str, Dict] = {}
            intent_map: Dict[str, Dict] = {}

            for page in pages:
                ct = page.content_type or "general"
                if ct not in content_types:
                    content_types[ct] = {"count": 0, "examples": []}
                content_types[ct]["count"] += 1
                if len(content_types[ct]["examples"]) < 3:
                    content_types[ct]["examples"].append(page.title or page.url)

            for chunk in processed_chunks:
                intent = chunk.intent.value
                if intent not in intent_map:
                    intent_map[intent] = {"count": 0, "confidence": 0}
                intent_map[intent]["count"] += 1
                intent_map[intent]["confidence"] = max(
                    intent_map[intent]["confidence"], chunk.confidence_score
                )

            return {
                "assistant_id": assistant_id,
                "pages_discovered": len(pages),
                "pages": [
                    {
                        "url": p.url,
                        "title": p.title,
                        "content_type": p.content_type,
                        "estimated_intent": p.content_type,
                    }
                    for p in pages
                ],
                "content_types": [
                    {"type": ct.title(), "count": d["count"], "examples": d["examples"]}
                    for ct, d in content_types.items()
                ],
                "intents": [
                    {"intent": i, "confidence": d["confidence"], "pageCount": d["count"]}
                    for i, d in intent_map.items()
                ],
                "status": "discovery_complete",
            }
        except Exception as e:
            logger.error("WordPress discovery failed: %s", e, exc_info=True)
            return {
                "assistant_id": assistant_id,
                "pages_discovered": 0,
                "pages": [],
                "status": "discovery_failed",
                "error": str(e),
            }
