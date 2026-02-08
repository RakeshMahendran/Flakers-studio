"""
Content Processing Service
Handles content chunking, intent classification, and preparation for embedding
Uses tiktoken for tokenization as per pipeline spec
"""
import re
import hashlib
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import tiktoken

from app.services.web_scraper import ScrapedPage
from app.models.content import ContentIntent
from app.core.config import settings

logger = logging.getLogger(__name__)

@dataclass
class ContentChunk:
    """Represents a processed content chunk"""
    content: str
    source_url: str
    source_title: str
    source_type: str
    intent: ContentIntent
    confidence_score: float
    chunk_index: int
    chunk_size: int
    content_hash: str
    requires_attribution: bool
    is_policy_content: bool
    is_sensitive: bool
    metadata: Dict[str, Any]

class ContentProcessor:
    """
    Processes scraped content into searchable chunks
    
    Features:
    - Intelligent text chunking
    - Content quality scoring
    - Metadata extraction
    """
    
    def __init__(self):
        self.max_chunk_size = settings.MAX_CONTENT_LENGTH
        self.chunk_overlap = settings.CHUNK_OVERLAP
        
        # Initialize tiktoken encoder for the target embedding model
        # Using cl100k_base encoding (for text-embedding-3-* models)
        try:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
            logger.info("Initialized tiktoken with cl100k_base encoding")
        except Exception as e:
            logger.error(f"Failed to initialize tiktoken: {str(e)}")
            raise
        
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove special characters but keep punctuation
        text = re.sub(r'[^\w\s\.\,\!\?\;\:\-\(\)\[\]\{\}\"\'\/]', '', text)
        
        # Remove URLs
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # Remove email addresses
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '', text)
        
        return text.strip()
    
    def _chunk_text(self, text: str) -> List[str]:
        """
        Split text into overlapping chunks using tiktoken tokenization
        As per spec: tokenize using tiktoken for the target embedding model
        """
        # Tokenize the entire text
        tokens = self.tokenizer.encode(text)
        
        if len(tokens) <= self.max_chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(tokens):
            end = start + self.max_chunk_size
            
            # Get token slice
            chunk_tokens = tokens[start:end]
            
            # Decode back to text
            chunk_text = self.tokenizer.decode(chunk_tokens)
            
            if chunk_text.strip():
                chunks.append(chunk_text.strip())
            
            # Move start position with overlap
            start = end - self.chunk_overlap
            if start >= len(tokens):
                break
        
        return chunks
    
    def _calculate_content_quality(self, content: str) -> float:
        """Calculate content quality score (0-1)"""
        if not content.strip():
            return 0.0
        
        score = 0.5  # Base score
        
        # Length factor (optimal range: 100-2000 characters)
        length = len(content)
        if 100 <= length <= 2000:
            score += 0.2
        elif length > 50:
            score += 0.1
        
        # Sentence structure
        sentences = content.count('.') + content.count('!') + content.count('?')
        if sentences > 0:
            avg_sentence_length = length / sentences
            if 10 <= avg_sentence_length <= 50:
                score += 0.1
        
        # Word diversity
        words = content.lower().split()
        if words:
            unique_words = len(set(words))
            diversity = unique_words / len(words)
            if diversity > 0.5:
                score += 0.1
        
        # Readability indicators
        if re.search(r'\b(the|and|or|but|in|on|at|to|for|of|with|by)\b', content.lower()):
            score += 0.1
        
        return min(score, 1.0)
    
    def _count_words(self, text: str) -> int:
        """Count words in text"""
        # Split on whitespace and filter empty strings
        words = [w for w in text.split() if w.strip()]
        return len(words)
    
    def _generate_deterministic_chunk_id(
        self, 
        url: str, 
        chunk_index: int, 
        content_hash: str
    ) -> str:
        """
        Generate deterministic, idempotent chunk ID
        Format: hash(url + index + content_hash)
        """
        composite = f"{url}:{chunk_index}:{content_hash}"
        chunk_hash = hashlib.sha256(composite.encode('utf-8')).hexdigest()
        return f"chunk_{chunk_hash[:16]}"
    
    def process_scraped_pages(self, scraped_pages: List[ScrapedPage]) -> List[ContentChunk]:
        """
        Process scraped pages into content chunks
        
        Args:
            scraped_pages: List of scraped pages
            
        Returns:
            List of processed content chunks
        """
        processed_chunks = []
        
        for page in scraped_pages:
            try:
                # Clean content
                clean_content = self._clean_text(page.content)
                
                # Skip if content is too short
                if len(clean_content.strip()) < 50:
                    logger.warning(f"Skipping {page.url}: content too short")
                    continue
                
                # Chunk content
                text_chunks = self._chunk_text(clean_content)
                
                # Process each chunk
                for i, chunk_text in enumerate(text_chunks):
                    intent = ContentIntent.UNKNOWN
                    confidence = 1.0
                    
                    # Calculate quality score
                    quality_score = self._calculate_content_quality(chunk_text)
                    
                    # Create content hash
                    content_hash = hashlib.md5(chunk_text.encode('utf-8')).hexdigest()
                    
                    # Create metadata
                    metadata = {
                        'scraped_at': page.scraped_at.isoformat(),
                        'meta_description': page.meta_description,
                        'quality_score': quality_score,
                        'original_content_length': len(page.content),
                        'links_count': len(page.links),
                        'images_count': len(page.images)
                    }
                    
                    # Create content chunk
                    chunk = ContentChunk(
                        content=chunk_text,
                        source_url=page.url,
                        source_title=page.title,
                        source_type=page.content_type,
                        intent=intent,
                        confidence_score=confidence,
                        chunk_index=i,
                        chunk_size=len(chunk_text),
                        content_hash=content_hash,
                        requires_attribution=False,
                        is_policy_content=False,
                        is_sensitive=False,
                        metadata=metadata
                    )
                    
                    processed_chunks.append(chunk)
                    
            except Exception as e:
                logger.error(f"Error processing page {page.url}: {str(e)}")
                continue
        
        logger.info(f"Processed {len(processed_chunks)} content chunks from {len(scraped_pages)} pages")
        return processed_chunks
    
    def get_processing_stats(self, chunks: List[ContentChunk]) -> Dict[str, Any]:
        """Get processing statistics"""
        if not chunks:
            return {}
        
        intent_distribution = {}
        source_types = {}
        total_size = 0
        quality_scores = []
        
        for chunk in chunks:
            # Intent distribution
            intent_str = chunk.intent.value
            intent_distribution[intent_str] = intent_distribution.get(intent_str, 0) + 1
            
            # Source types
            source_types[chunk.source_type] = source_types.get(chunk.source_type, 0) + 1
            
            # Size stats
            total_size += chunk.chunk_size
            
            # Quality scores
            quality_scores.append(chunk.metadata.get('quality_score', 0))
        
        return {
            'total_chunks': len(chunks),
            'intent_distribution': intent_distribution,
            'source_type_distribution': source_types,
            'total_content_size': total_size,
            'average_chunk_size': total_size / len(chunks),
            'average_quality_score': sum(quality_scores) / len(quality_scores) if quality_scores else 0,
            'sensitive_chunks': sum(1 for chunk in chunks if chunk.is_sensitive),
            'policy_chunks': sum(1 for chunk in chunks if chunk.is_policy_content)
        }