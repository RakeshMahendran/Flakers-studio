"""
Web Scraping Service using Selenium
Scrapes websites, extracts content, and prepares it for embedding
"""
import asyncio
import logging
import hashlib
import re
from typing import List, Dict, Any, Optional, Set, Callable
from urllib.parse import urljoin, urlparse, urlunparse
from dataclasses import dataclass
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
from readability import Document
import lxml.html

from app.core.config import settings

logger = logging.getLogger(__name__)

@dataclass
class ScrapedPage:
    """Represents a scraped web page"""
    url: str
    title: str
    content: str
    meta_description: str
    links: List[str]
    images: List[str]
    content_type: str
    scraped_at: datetime
    content_hash: str

@dataclass
class ScrapingConfig:
    """Configuration for web scraping"""
    max_pages: int = 100
    max_depth: int = 3
    delay_between_requests: float = 1.0
    timeout: int = 60  # Increased to 60 seconds for slow-loading sites
    follow_external_links: bool = False
    allowed_domains: Optional[List[str]] = None
    excluded_patterns: Optional[List[str]] = None
    include_images: bool = False
    javascript_enabled: bool = True

class WebScraperService:
    """
    Advanced web scraping service using Selenium
    
    Features:
    - JavaScript rendering support
    - Intelligent content extraction
    - Duplicate detection
    - Rate limiting
    - Domain filtering
    - Content classification
    """
    
    def __init__(self):
        self.driver: Optional[webdriver.Chrome] = None
        self.visited_urls: Set[str] = set()
        self.scraped_pages: List[ScrapedPage] = []
        
    def _setup_driver(self, headless: bool = True) -> webdriver.Chrome:
        """Setup Chrome WebDriver with optimal settings"""
        chrome_options = Options()
        
        if headless:
            chrome_options.add_argument("--headless")
        
        # Performance optimizations
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--disable-extensions")
        chrome_options.add_argument("--disable-plugins")
        chrome_options.add_argument("--disable-images")  # Skip images for faster loading
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")  # Avoid detection
        chrome_options.add_argument("--disable-web-security")  # Allow cross-origin requests
        chrome_options.add_argument("--allow-running-insecure-content")
        # Note: JavaScript is enabled by default for SPA websites
        
        # User agent
        chrome_options.add_argument(
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        # Memory optimization
        chrome_options.add_argument("--memory-pressure-off")
        chrome_options.add_argument("--max_old_space_size=4096")
        
        # Additional stability options
        chrome_options.add_argument("--disable-setuid-sandbox")
        chrome_options.add_argument("--disable-infobars")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--start-maximized")
        
        # Experimental options to avoid detection
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # Try to use system Chrome/Chromium first (for Render/production)
        import os
        import shutil
        
        chromium_path = shutil.which("chromium") or shutil.which("chromium-browser")
        chrome_path = shutil.which("google-chrome") or shutil.which("chrome")
        
        if chromium_path:
            # Use system Chromium (Render)
            chrome_options.binary_location = chromium_path
            driver = webdriver.Chrome(options=chrome_options)
        elif chrome_path:
            # Use system Chrome
            chrome_options.binary_location = chrome_path
            driver = webdriver.Chrome(options=chrome_options)
        else:
            # Fallback to ChromeDriverManager (local development)
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Set timeouts
        driver.implicitly_wait(10)
        driver.set_page_load_timeout(60)  # Increased to 60 seconds for slow-loading sites
        
        return driver
    
    def _normalize_url(self, url: str, base_url: str) -> str:
        """Normalize and resolve relative URLs"""
        # Remove fragments
        parsed = urlparse(url)
        normalized = urlunparse((
            parsed.scheme, parsed.netloc, parsed.path,
            parsed.params, parsed.query, ''
        ))
        
        # Resolve relative URLs
        return urljoin(base_url, normalized)
    
    def _is_valid_url(self, url: str, config: ScrapingConfig, base_domain: str) -> bool:
        """Check if URL should be scraped based on configuration"""
        parsed = urlparse(url)
        
        # Skip non-HTTP URLs
        if parsed.scheme not in ['http', 'https']:
            return False
        
        # Check domain restrictions
        if not config.follow_external_links and parsed.netloc != base_domain:
            return False
        
        if config.allowed_domains and parsed.netloc not in config.allowed_domains:
            return False
        
        # Check excluded patterns
        if config.excluded_patterns:
            for pattern in config.excluded_patterns:
                if re.search(pattern, url):
                    return False
        
        # Skip common non-content URLs
        excluded_extensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar']
        if any(url.lower().endswith(ext) for ext in excluded_extensions):
            return False
        
        return True
    
    def _extract_content(self, html: str, url: str) -> Dict[str, Any]:
        """
        Extract clean content from HTML using hybrid approach
        Uses both readability for structured content and full text extraction
        """
        try:
            # Parse with BeautifulSoup using lxml parser (faster and more robust)
            soup = BeautifulSoup(html, 'lxml')
            
            # Extract title
            title = ""
            if soup.title:
                title = soup.title.get_text().strip()
            
            # Fallback to readability for title
            if not title:
                try:
                    doc = Document(html)
                    title = doc.title() or ""
                except:
                    pass
            
            # Method 1: Try readability for main content (structured)
            clean_content = ""
            try:
                doc = Document(html)
                content = doc.summary()
                content_soup = BeautifulSoup(content, 'lxml')
                clean_content = content_soup.get_text(separator=' ', strip=True)
            except Exception as e:
                logger.debug(f"Readability extraction failed: {str(e)}")
            
            # Method 2: Full text extraction (like the original script)
            # This often captures more content than readability
            full_text = soup.get_text(separator=' ', strip=True)
            full_text = ' '.join(full_text.split())  # Clean whitespace
            
            # Use whichever method got more content
            if len(full_text) > len(clean_content) * 1.2:  # Full text has 20% more
                logger.debug(f"Using full text extraction ({len(full_text)} chars vs {len(clean_content)} chars)")
                clean_content = full_text
            else:
                logger.debug(f"Using readability extraction ({len(clean_content)} chars)")
            
            # Extract meta description
            meta_desc = ""
            meta_tag = soup.find('meta', attrs={'name': 'description'})
            if not meta_tag:
                meta_tag = soup.find('meta', attrs={'property': 'og:description'})
            if meta_tag:
                meta_desc = meta_tag.get('content', '')
            
            # Extract links
            links = []
            for link in soup.find_all('a', href=True):
                href = link['href']
                if href:
                    normalized_link = self._normalize_url(href, url)
                    links.append(normalized_link)
            
            # Extract images
            images = []
            for img in soup.find_all('img', src=True):
                src = img['src']
                if src:
                    normalized_img = self._normalize_url(src, url)
                    images.append(normalized_img)
            
            return {
                'title': title,
                'content': clean_content,
                'meta_description': meta_desc,
                'links': links,
                'images': images
            }
            
        except Exception as e:
            logger.error(f"Content extraction failed for {url}: {str(e)}")
            return {
                'title': '',
                'content': '',
                'meta_description': '',
                'links': [],
                'images': []
            }
    
    def _classify_content_type(self, url: str, title: str, content: str) -> str:
        """Classify content type based on URL patterns and content"""
        url_lower = url.lower()
        title_lower = title.lower()
        content_lower = content.lower()
        
        # URL-based classification
        if any(pattern in url_lower for pattern in ['/blog/', '/news/', '/article/']):
            return 'blog'
        elif any(pattern in url_lower for pattern in ['/support/', '/help/', '/faq']):
            return 'support'
        elif any(pattern in url_lower for pattern in ['/about', '/company', '/team']):
            return 'about'
        elif any(pattern in url_lower for pattern in ['/product/', '/service/', '/solution']):
            return 'product'
        elif any(pattern in url_lower for pattern in ['/pricing', '/price', '/cost']):
            return 'pricing'
        elif any(pattern in url_lower for pattern in ['/privacy', '/terms', '/policy']):
            return 'policy'
        elif any(pattern in url_lower for pattern in ['/contact', '/reach']):
            return 'contact'
        
        # Content-based classification
        if any(keyword in content_lower for keyword in ['tutorial', 'how to', 'guide', 'step by step']):
            return 'tutorial'
        elif any(keyword in content_lower for keyword in ['faq', 'frequently asked', 'questions']):
            return 'faq'
        elif any(keyword in content_lower for keyword in ['documentation', 'api', 'reference']):
            return 'documentation'
        
        return 'general'
    
    async def scrape_website_parallel(
        self,
        start_url: str,
        config: ScrapingConfig = None,
        max_workers: int = 5,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> List[ScrapedPage]:
        """
        Scrape a website with parallel processing for faster results
        
        Args:
            start_url: Starting URL to scrape
            config: Scraping configuration
            max_workers: Number of parallel workers (default: 5)
            progress_callback: Optional callback function to report progress
                             Called with dict containing: event_type, url, total_discovered, completed, pending
            
        Returns:
            List of scraped pages
        """
        if config is None:
            config = ScrapingConfig()
        
        self.visited_urls.clear()
        self.scraped_pages.clear()
        
        logger.info(f"Starting parallel scraping with {max_workers} workers")
        
        try:
            # Phase 1: Scrape homepage and discover URLs
            logger.info(f"Phase 1: Discovering URLs from {start_url}")
            homepage = await self.scrape_single_page(start_url)
            
            if not homepage:
                error_msg = f"Failed to scrape homepage: {start_url}. The site may be slow to load, blocking automated access, or experiencing issues."
                logger.error(error_msg)
                if progress_callback:
                    try:
                        progress_callback({
                            "event_type": "error",
                            "error": error_msg
                        })
                    except Exception as e:
                        logger.warning(f"Progress callback error: {e}")
                return []
            
            self.scraped_pages.append(homepage)
            self.visited_urls.add(start_url)
            
            # Parse base domain
            base_domain = urlparse(start_url).netloc
            
            # Collect all URLs to scrape
            urls_to_scrape = []
            for link in homepage.links:
                if (link not in self.visited_urls and 
                    self._is_valid_url(link, config, base_domain) and
                    len(urls_to_scrape) < config.max_pages - 1):
                    urls_to_scrape.append(link)
            
            logger.info(f"Discovered {len(urls_to_scrape)} URLs to scrape")
            
            # Report discovered URLs
            if progress_callback:
                for url in urls_to_scrape:
                    try:
                        progress_callback({
                            "event_type": "url_discovered",
                            "url": url,
                            "total_discovered": len(urls_to_scrape),
                            "completed": 0,
                            "pending": len(urls_to_scrape)
                        })
                    except Exception as e:
                        logger.warning(f"Progress callback error: {e}")
            
            if not urls_to_scrape:
                logger.info("No additional URLs found, returning homepage only")
                return self.scraped_pages
            
            # Phase 2: Parallel scraping of discovered URLs
            logger.info(f"Phase 2: Parallel scraping {len(urls_to_scrape)} URLs with {max_workers} workers")
            
            # Use asyncio.gather for parallel execution
            import concurrent.futures
            from functools import partial
            
            # Track progress
            completed_count = 0
            total_urls = len(urls_to_scrape)
            
            # Create a thread pool for parallel scraping
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Create tasks for each URL
                loop = asyncio.get_event_loop()
                tasks = []
                
                for url in urls_to_scrape:
                    if len(self.scraped_pages) >= config.max_pages:
                        break
                    
                    # Report URL starting
                    if progress_callback:
                        try:
                            progress_callback({
                                "event_type": "url_started",
                                "url": url,
                                "total_discovered": total_urls,
                                "completed": completed_count,
                                "pending": total_urls - completed_count
                            })
                        except Exception as e:
                            logger.warning(f"Progress callback error: {e}")
                    
                    # Run scrape_single_page in thread pool
                    task = loop.run_in_executor(
                        executor,
                        partial(asyncio.run, self.scrape_single_page(url))
                    )
                    tasks.append((url, task))
                
                # Wait for all tasks to complete
                for url, task in tasks:
                    try:
                        page = await task
                        completed_count += 1
                        
                        if page and len(page.content.strip()) > 100:
                            # Check for duplicates
                            content_hash = hashlib.md5(page.content.encode('utf-8')).hexdigest()
                            if not any(p.content_hash == content_hash for p in self.scraped_pages):
                                self.scraped_pages.append(page)
                                self.visited_urls.add(url)
                                logger.info(f"✓ Scraped: {url} ({len(page.content)} chars)")
                                
                                # Report successful completion
                                if progress_callback:
                                    try:
                                        progress_callback({
                                            "event_type": "url_completed",
                                            "url": url,
                                            "total_discovered": total_urls,
                                            "completed": completed_count,
                                            "pending": total_urls - completed_count,
                                            "status": "success"
                                        })
                                    except Exception as e:
                                        logger.warning(f"Progress callback error: {e}")
                            else:
                                logger.debug(f"Skipped duplicate: {url}")
                                if progress_callback:
                                    try:
                                        progress_callback({
                                            "event_type": "url_completed",
                                            "url": url,
                                            "total_discovered": total_urls,
                                            "completed": completed_count,
                                            "pending": total_urls - completed_count,
                                            "status": "skipped_duplicate"
                                        })
                                    except Exception as e:
                                        logger.warning(f"Progress callback error: {e}")
                        else:
                            logger.debug(f"Skipped insufficient content: {url}")
                            if progress_callback:
                                try:
                                    progress_callback({
                                        "event_type": "url_completed",
                                        "url": url,
                                        "total_discovered": total_urls,
                                        "completed": completed_count,
                                        "pending": total_urls - completed_count,
                                        "status": "skipped_insufficient"
                                    })
                                except Exception as e:
                                    logger.warning(f"Progress callback error: {e}")
                    except Exception as e:
                        completed_count += 1
                        logger.error(f"Error scraping {url}: {str(e)}")
                        if progress_callback:
                            try:
                                progress_callback({
                                    "event_type": "url_completed",
                                    "url": url,
                                    "total_discovered": total_urls,
                                    "completed": completed_count,
                                    "pending": total_urls - completed_count,
                                    "status": "error",
                                    "error": str(e)
                                })
                            except Exception as e2:
                                logger.warning(f"Progress callback error: {e2}")
                        continue
            
            logger.info(f"Parallel scraping completed: {len(self.scraped_pages)} pages scraped")
            return self.scraped_pages
            
        except Exception as e:
            logger.error(f"Error in parallel scraping: {str(e)}")
            return self.scraped_pages
    
    async def scrape_website(
        self,
        start_url: str,
        config: ScrapingConfig = None
    ) -> List[ScrapedPage]:
        """
        Scrape a website starting from the given URL
        
        Args:
            start_url: Starting URL to scrape
            config: Scraping configuration
            
        Returns:
            List of scraped pages
        """
        if config is None:
            config = ScrapingConfig()
        
        self.visited_urls.clear()
        self.scraped_pages.clear()
        
        try:
            # Setup WebDriver
            self.driver = self._setup_driver()
            
            # Parse base domain
            base_domain = urlparse(start_url).netloc
            
            # Initialize queue with start URL
            url_queue = [(start_url, 0)]  # (url, depth)
            
            while url_queue and len(self.scraped_pages) < config.max_pages:
                current_url, depth = url_queue.pop(0)
                
                # Skip if already visited or depth exceeded
                if current_url in self.visited_urls or depth > config.max_depth:
                    continue
                
                try:
                    logger.info(f"Scraping: {current_url} (depth: {depth})")
                    
                    # Load page
                    self.driver.get(current_url)
                    
                    # Wait for page to load
                    WebDriverWait(self.driver, config.timeout).until(
                        EC.presence_of_element_located((By.TAG_NAME, "body"))
                    )
                    
                    # Additional wait for JavaScript content to render
                    import time
                    time.sleep(2)  # Wait for JavaScript to execute
                    
                    # Try to wait for actual content (not just loading screens)
                    try:
                        WebDriverWait(self.driver, 5).until(
                            lambda driver: len(driver.find_element(By.TAG_NAME, "body").text.strip()) > 100
                        )
                    except:
                        # If content doesn't load in 5 seconds, continue anyway
                        pass
                    
                    # Get page source
                    html = self.driver.page_source
                    
                    # Extract content
                    extracted = self._extract_content(html, current_url)
                    
                    # Skip if no meaningful content
                    if len(extracted['content'].strip()) < 100:
                        logger.warning(f"Skipping {current_url}: insufficient content")
                        self.visited_urls.add(current_url)
                        continue
                    
                    # Create content hash for deduplication
                    content_hash = hashlib.md5(
                        extracted['content'].encode('utf-8')
                    ).hexdigest()
                    
                    # Check for duplicate content
                    if any(page.content_hash == content_hash for page in self.scraped_pages):
                        logger.info(f"Skipping {current_url}: duplicate content")
                        self.visited_urls.add(current_url)
                        continue
                    
                    # Classify content type
                    content_type = self._classify_content_type(
                        current_url, extracted['title'], extracted['content']
                    )
                    
                    # Create scraped page
                    scraped_page = ScrapedPage(
                        url=current_url,
                        title=extracted['title'],
                        content=extracted['content'],
                        meta_description=extracted['meta_description'],
                        links=extracted['links'],
                        images=extracted['images'],
                        content_type=content_type,
                        scraped_at=datetime.utcnow(),
                        content_hash=content_hash
                    )
                    
                    self.scraped_pages.append(scraped_page)
                    self.visited_urls.add(current_url)
                    
                    # Add valid links to queue for next depth level
                    if depth < config.max_depth:
                        for link in extracted['links']:
                            if (link not in self.visited_urls and 
                                self._is_valid_url(link, config, base_domain)):
                                url_queue.append((link, depth + 1))
                    
                    # Rate limiting
                    await asyncio.sleep(config.delay_between_requests)
                    
                except TimeoutException:
                    logger.warning(f"Timeout loading {current_url}")
                    self.visited_urls.add(current_url)
                    continue
                    
                except WebDriverException as e:
                    logger.error(f"WebDriver error for {current_url}: {str(e)}")
                    self.visited_urls.add(current_url)
                    continue
                    
                except Exception as e:
                    logger.error(f"Unexpected error scraping {current_url}: {str(e)}")
                    self.visited_urls.add(current_url)
                    continue
            
            logger.info(f"Scraping completed. {len(self.scraped_pages)} pages scraped.")
            return self.scraped_pages
            
        finally:
            # Clean up WebDriver
            if self.driver:
                self.driver.quit()
                self.driver = None
    
    async def scrape_single_page(self, url: str) -> Optional[ScrapedPage]:
        """
        Scrape a single page with proper driver management
        Creates a dedicated driver instance for this single page
        """
        driver = None
        try:
            # Setup dedicated driver for this page
            driver = self._setup_driver()
            
            logger.info(f"Scraping single page: {url}")
            
            # Load page with timeout handling
            try:
                driver.get(url)
                
                # Wait for page to load
                WebDriverWait(driver, 60).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                
                # Additional wait for JavaScript content
                import time
                time.sleep(3)  # Increased wait for JS to execute
                
                # Try to wait for actual content
                try:
                    WebDriverWait(driver, 10).until(
                        lambda d: len(d.find_element(By.TAG_NAME, "body").text.strip()) > 100
                    )
                except:
                    # If content doesn't load, log and continue
                    logger.warning(f"Content did not fully load for {url}, proceeding anyway")
                    pass
                    
            except TimeoutException as e:
                # If page times out, try to get whatever content is available
                logger.warning(f"Page load timeout for {url}, attempting to extract partial content")
                try:
                    # Try to get the page source even if not fully loaded
                    html = driver.page_source
                    if html and len(html) > 1000:  # If we got some HTML
                        logger.info(f"Extracted partial content from {url}")
                    else:
                        logger.error(f"Timeout and no usable content for {url}")
                        return None
                except Exception as extract_error:
                    logger.error(f"Failed to extract content after timeout for {url}: {str(extract_error)}")
                    return None
            
            # Get page source
            html = driver.page_source
            
            # Extract content
            extracted = self._extract_content(html, url)
            
            # Skip if no meaningful content
            if len(extracted['content'].strip()) < 100:
                logger.warning(f"Insufficient content for {url}")
                return None
            
            # Create content hash
            content_hash = hashlib.md5(
                extracted['content'].encode('utf-8')
            ).hexdigest()
            
            # Classify content type
            content_type = self._classify_content_type(
                url, extracted['title'], extracted['content']
            )
            
            # Create scraped page
            scraped_page = ScrapedPage(
                url=url,
                title=extracted['title'],
                content=extracted['content'],
                meta_description=extracted['meta_description'],
                links=extracted['links'],
                images=extracted['images'],
                content_type=content_type,
                scraped_at=datetime.utcnow(),
                content_hash=content_hash
            )
            
            logger.info(f"Successfully scraped: {url} ({len(extracted['content'])} chars)")
            return scraped_page
            
        except TimeoutException:
            logger.warning(f"Timeout loading {url}")
            return None
            
        except WebDriverException as e:
            logger.error(f"WebDriver error for {url}: {str(e)}")
            return None
            
        except Exception as e:
            logger.error(f"Unexpected error scraping {url}: {str(e)}")
            return None
            
        finally:
            # Always clean up driver
            if driver:
                try:
                    driver.quit()
                except:
                    pass
    
    def get_scraping_stats(self) -> Dict[str, Any]:
        """Get scraping statistics"""
        if not self.scraped_pages:
            return {}
        
        content_types = {}
        total_content_length = 0
        
        for page in self.scraped_pages:
            content_types[page.content_type] = content_types.get(page.content_type, 0) + 1
            total_content_length += len(page.content)
        
        return {
            'total_pages': len(self.scraped_pages),
            'total_urls_visited': len(self.visited_urls),
            'content_types': content_types,
            'average_content_length': total_content_length / len(self.scraped_pages),
            'total_content_length': total_content_length
        }