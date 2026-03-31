"""
Enhanced CSV-based website scraper with PDF generation
Reads URLs from CSV and scrapes all sub-pages, saving to both text and PDF
"""
import asyncio
import sys
import os
from datetime import datetime
import time
import csv
from typing import List, Dict, Set

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("⚠️  ReportLab not installed. Install with: pip install reportlab")

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

class CSVWebsiteScraper:
    """Scraper that reads URLs from CSV and scrapes all sub-pages"""
    
    def __init__(self, csv_file_path: str, output_directory: str):
        self.csv_file_path = csv_file_path
        self.output_directory = output_directory
        self.driver = None
        self.company_data = {}
        self.visited_urls = set()
        
        # Create output directory
        if not os.path.exists(output_directory):
            os.makedirs(output_directory)
            print(f"✅ Created output directory: {output_directory}")
    
    def setup_driver(self):
        """Setup Chrome WebDriver"""
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=chrome_options)
        
        self.driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        })
        
        self.driver.set_page_load_timeout(60)
    
    def read_csv(self):
        """Read company names and URLs from CSV"""
        print(f"\n📄 Reading CSV: {self.csv_file_path}")
        
        company_urls = {}
        
        try:
            with open(self.csv_file_path, 'r', encoding='utf-8') as csv_file:
                csv_reader = csv.DictReader(csv_file)
                
                for row in csv_reader:
                    # Support both 'NAME' and 'name' columns
                    company_name = row.get('NAME') or row.get('name') or row.get('Company')
                    url = row.get('URL') or row.get('url') or row.get('Website')
                    
                    if company_name and url:
                        if company_name not in company_urls:
                            company_urls[company_name] = set()
                        company_urls[company_name].add(url)
            
            print(f"✅ Found {len(company_urls)} companies")
            for company, urls in company_urls.items():
                print(f"   • {company}: {len(urls)} URL(s)")
            
            return company_urls
            
        except Exception as e:
            print(f"❌ Error reading CSV: {str(e)}")
            return {}
    
    def get_sub_urls(self, base_url: str) -> Set[str]:
        """Get all sub-URLs from a page"""
        try:
            self.driver.get(base_url)
            
            # Wait for page to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Wait a bit for JavaScript
            time.sleep(3)
            
            # Get all links
            links = self.driver.find_elements(By.TAG_NAME, 'a')
            sub_urls = set()
            
            base_domain = urlparse(base_url).netloc
            
            for link in links:
                try:
                    href = link.get_attribute('href')
                    if href:
                        # Make absolute URL
                        absolute_url = urljoin(base_url, href)
                        
                        # Only include URLs from same domain
                        if urlparse(absolute_url).netloc == base_domain:
                            # Remove fragments
                            clean_url = absolute_url.split('#')[0]
                            if clean_url and clean_url not in sub_urls:
                                sub_urls.add(clean_url)
                except:
                    continue
            
            return sub_urls
            
        except Exception as e:
            print(f"   ⚠️  Error getting sub-URLs: {str(e)}")
            return set()
    
    def scrape_page(self, url: str) -> Dict:
        """Scrape a single page"""
        try:
            self.driver.get(url)
            
            # Wait for content
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Scroll to load lazy content
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight/2);")
            time.sleep(1)
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            self.driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(1)
            
            # Get HTML
            html = self.driver.page_source
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract title
            title = soup.title.get_text().strip() if soup.title else url
            
            # Remove unwanted elements
            for unwanted in soup(['script', 'style', 'nav', 'header', 'footer', 'iframe']):
                unwanted.decompose()
            
            # Get text content
            text_content = soup.get_text(separator=' ', strip=True)
            text_content = ' '.join(text_content.split())
            
            return {
                'url': url,
                'title': title,
                'content': text_content,
                'scraped_at': datetime.now()
            }
            
        except Exception as e:
            print(f"   ❌ Error scraping {url}: {str(e)}")
            return None
    
    def save_to_text_file(self, company_name: str, pages: List[Dict]):
        """Save scraped content to text file"""
        file_path = os.path.join(self.output_directory, f"{company_name}.txt")
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(f"Company: {company_name}\n")
                f.write(f"Scraped: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"Total Pages: {len(pages)}\n")
                f.write("="*80 + "\n\n")
                
                for i, page in enumerate(pages, 1):
                    f.write(f"\n{'='*80}\n")
                    f.write(f"PAGE {i}: {page['title']}\n")
                    f.write(f"URL: {page['url']}\n")
                    f.write(f"{'='*80}\n\n")
                    f.write(page['content'])
                    f.write("\n\n")
            
            print(f"   💾 Saved text file: {file_path}")
            return True
            
        except Exception as e:
            print(f"   ❌ Error saving text file: {str(e)}")
            return False
    
    def save_to_pdf(self, company_name: str, pages: List[Dict]):
        """Save scraped content to PDF"""
        if not PDF_AVAILABLE:
            return False
        
        file_path = os.path.join(self.output_directory, f"{company_name}.pdf")
        
        try:
            doc = SimpleDocTemplate(file_path, pagesize=letter, rightMargin=60, leftMargin=60, topMargin=60, bottomMargin=30)
            story = []
            styles = getSampleStyleSheet()
            
            # Styles
            title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=24, textColor=colors.HexColor('#1a1a1a'), spaceAfter=20, alignment=TA_CENTER, fontName='Helvetica-Bold')
            subtitle_style = ParagraphStyle('Subtitle', parent=styles['Heading2'], fontSize=14, textColor=colors.HexColor('#555555'), spaceAfter=20, alignment=TA_CENTER)
            h1_style = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#2c3e50'), spaceAfter=10, spaceBefore=12, fontName='Helvetica-Bold')
            body_style = ParagraphStyle('Body', parent=styles['BodyText'], fontSize=10, alignment=TA_JUSTIFY, spaceAfter=10, leading=14)
            url_style = ParagraphStyle('URL', parent=styles['BodyText'], fontSize=9, textColor=colors.HexColor('#0066cc'), spaceAfter=8)
            
            # Title page
            story.append(Paragraph(company_name, title_style))
            story.append(Paragraph("Website Content Report", subtitle_style))
            story.append(Spacer(1, 0.3*inch))
            
            # Metadata
            total_chars = sum(len(p['content']) for p in pages)
            metadata = [
                ['Generated:', datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
                ['Company:', company_name],
                ['Pages Scraped:', str(len(pages))],
                ['Total Content:', f"{total_chars:,} characters"],
            ]
            
            table = Table(metadata, colWidths=[2*inch, 4*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#ecf0f1')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('PADDING', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ]))
            
            story.append(table)
            story.append(PageBreak())
            
            # Content pages
            for i, page in enumerate(pages, 1):
                story.append(Paragraph(f"Page {i}: {page['title']}", h1_style))
                story.append(Paragraph(f"<font color='#666666'>{page['url']}</font>", url_style))
                story.append(Spacer(1, 0.1*inch))
                
                # Content (limit to 3000 chars per page for PDF)
                content = page['content'][:3000]
                if len(page['content']) > 3000:
                    content += "... (truncated for PDF)"
                
                content = content.replace('<', '&lt;').replace('>', '&gt;')
                
                # Split into chunks
                chunk_size = 500
                for j in range(0, len(content), chunk_size):
                    chunk = content[j:j+chunk_size]
                    if chunk.strip():
                        story.append(Paragraph(chunk, body_style))
                
                if i < len(pages):
                    story.append(PageBreak())
            
            doc.build(story)
            
            file_size = os.path.getsize(file_path)
            print(f"   📄 Saved PDF: {file_path} ({file_size/1024:.1f} KB)")
            return True
            
        except Exception as e:
            print(f"   ❌ Error saving PDF: {str(e)}")
            return False
    
    def scrape_company(self, company_name: str, base_urls: Set[str], max_pages: int = 20):
        """Scrape all pages for a company"""
        print(f"\n{'='*70}")
        print(f"🏢 SCRAPING: {company_name}")
        print('='*70)
        
        all_pages = []
        urls_to_scrape = set()
        
        # Get sub-URLs from all base URLs
        for base_url in base_urls:
            print(f"\n🔗 Getting sub-URLs from: {base_url}")
            sub_urls = self.get_sub_urls(base_url)
            print(f"   Found {len(sub_urls)} sub-URLs")
            urls_to_scrape.update(sub_urls)
        
        # Limit to max_pages
        urls_to_scrape = list(urls_to_scrape)[:max_pages]
        
        print(f"\n📄 Scraping {len(urls_to_scrape)} pages...")
        
        # Scrape each URL
        for i, url in enumerate(urls_to_scrape, 1):
            if url in self.visited_urls:
                continue
            
            print(f"\n   [{i}/{len(urls_to_scrape)}] {url[:60]}...")
            
            page_data = self.scrape_page(url)
            if page_data and len(page_data['content']) > 100:
                all_pages.append(page_data)
                self.visited_urls.add(url)
                print(f"      ✅ {len(page_data['content']):,} chars")
            else:
                print(f"      ⚠️  Skipped (insufficient content)")
            
            time.sleep(1)  # Be respectful
        
        # Save results
        if all_pages:
            print(f"\n💾 Saving {len(all_pages)} pages...")
            self.save_to_text_file(company_name, all_pages)
            self.save_to_pdf(company_name, all_pages)
            
            total_chars = sum(len(p['content']) for p in all_pages)
            print(f"\n✅ {company_name} complete:")
            print(f"   Pages: {len(all_pages)}")
            print(f"   Content: {total_chars:,} characters")
        else:
            print(f"\n⚠️  No content scraped for {company_name}")
        
        return all_pages
    
    def run(self, max_pages_per_company: int = 20):
        """Run the scraper"""
        print("\n" + "="*70)
        print("🕷️  CSV WEBSITE SCRAPER")
        print("="*70)
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Read CSV
        company_urls = self.read_csv()
        
        if not company_urls:
            print("❌ No companies found in CSV")
            return
        
        # Setup driver
        print("\n🚀 Setting up browser...")
        self.setup_driver()
        
        try:
            # Scrape each company
            for company_name, base_urls in company_urls.items():
                self.scrape_company(company_name, base_urls, max_pages_per_company)
            
            # Summary
            print("\n" + "="*70)
            print("📊 SCRAPING COMPLETE")
            print("="*70)
            print(f"Companies processed: {len(company_urls)}")
            print(f"Total URLs visited: {len(self.visited_urls)}")
            print(f"Output directory: {self.output_directory}")
            print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*70)
            
        finally:
            if self.driver:
                self.driver.quit()

def main():
    """Main function"""
    # Configuration
    CSV_FILE = "companies.csv"  # Your CSV file with NAME and URL columns
    OUTPUT_DIR = "scraped_data"  # Output directory for text and PDF files
    MAX_PAGES = 20  # Maximum pages to scrape per company
    
    # Check if CSV exists
    if not os.path.exists(CSV_FILE):
        print(f"❌ CSV file not found: {CSV_FILE}")
        print("\n📝 Please create a CSV file with the following format:")
        print("   NAME,URL")
        print("   Company1,https://example1.com")
        print("   Company2,https://example2.com")
        return
    
    # Run scraper
    scraper = CSVWebsiteScraper(CSV_FILE, OUTPUT_DIR)
    scraper.run(max_pages_per_company=MAX_PAGES)

if __name__ == "__main__":
    main()
