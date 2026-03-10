"""
Event Emission Service
Emits structured events on every state change as per pipeline spec
"""
import logging
from typing import Dict, Any, Optional, Literal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

EntityType = Literal["url", "chunk", "job", "project"]
EventType = Literal["state_change", "error", "completion", "cancellation"]

class EventEmitter:
    """
    Emits structured events for observability
    
    As per spec, emit events on every state change with:
    - tenant_id
    - project_id
    - job_id
    - stage
    - entity_type (url | chunk)
    - entity_id
    - status
    - metadata (optional)
    """
    
    @staticmethod
    def emit_state_change(
        tenant_id: str,
        project_id: str,
        job_id: str,
        stage: str,
        entity_type: EntityType,
        entity_id: str,
        status: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Emit a state change event
        
        This logs the event and can be extended to:
        - Send to message queue (RabbitMQ, Kafka)
        - Store in audit log table
        - Send webhooks
        - Update metrics
        """
        event = {
            "event_type": "state_change",
            "timestamp": datetime.utcnow().isoformat(),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "job_id": job_id,
            "stage": stage,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "status": status,
            "metadata": metadata or {}
        }
        
        # Log the event
        logger.info(f"EVENT: {event}")
        
        # TODO: Send to message queue for async processing
        # TODO: Store in audit log table
        # TODO: Update metrics/monitoring
        
        return event
    
    @staticmethod
    def emit_error(
        tenant_id: str,
        project_id: str,
        job_id: str,
        stage: str,
        entity_type: EntityType,
        entity_id: str,
        error_type: str,
        error_message: str,
        is_retryable: bool,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Emit an error event"""
        event = {
            "event_type": "error",
            "timestamp": datetime.utcnow().isoformat(),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "job_id": job_id,
            "stage": stage,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "error_type": error_type,
            "error_message": error_message,
            "is_retryable": is_retryable,
            "metadata": metadata or {}
        }
        
        logger.error(f"ERROR EVENT: {event}")
        return event
    
    @staticmethod
    def emit_completion(
        tenant_id: str,
        project_id: str,
        job_id: str,
        stage: str,
        entity_type: EntityType,
        entity_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Emit a completion event"""
        event = {
            "event_type": "completion",
            "timestamp": datetime.utcnow().isoformat(),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "job_id": job_id,
            "stage": stage,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": metadata or {}
        }
        
        logger.info(f"COMPLETION EVENT: {event}")
        return event
    
    @staticmethod
    def emit_cancellation(
        tenant_id: str,
        project_id: str,
        job_id: str,
        reason: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Emit a cancellation event"""
        event = {
            "event_type": "cancellation",
            "timestamp": datetime.utcnow().isoformat(),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "job_id": job_id,
            "reason": reason,
            "metadata": metadata or {}
        }
        
        logger.warning(f"CANCELLATION EVENT: {event}")
        return event
    
    @staticmethod
    def emit_project_deletion(
        tenant_id: str,
        project_id: str,
        status: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Emit a project deletion audit event"""
        event = {
            "event_type": "project_deletion",
            "timestamp": datetime.utcnow().isoformat(),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "status": status,
            "metadata": metadata or {}
        }
        
        logger.warning(f"PROJECT DELETION EVENT: {event}")
        return event

# Convenience functions for common events

def emit_url_scraped(tenant_id: str, project_id: str, job_id: str, url_id: str, metadata: Dict[str, Any]):
    """Emit event when URL is scraped"""
    return EventEmitter.emit_state_change(
        tenant_id, project_id, job_id, "scraping", "url", url_id, "scraped", metadata
    )

def emit_url_failed(tenant_id: str, project_id: str, job_id: str, url_id: str, error: str, is_retryable: bool):
    """Emit event when URL scraping fails"""
    return EventEmitter.emit_error(
        tenant_id, project_id, job_id, "scraping", "url", url_id, 
        "scraping_failed", error, is_retryable
    )

def emit_chunk_uploaded(tenant_id: str, project_id: str, job_id: str, chunk_id: str, metadata: Dict[str, Any]):
    """Emit event when chunk is uploaded"""
    return EventEmitter.emit_state_change(
        tenant_id, project_id, job_id, "ingestion", "chunk", chunk_id, "uploaded", metadata
    )

def emit_chunk_failed(tenant_id: str, project_id: str, job_id: str, chunk_id: str, error: str, is_retryable: bool):
    """Emit event when chunk upload fails"""
    return EventEmitter.emit_error(
        tenant_id, project_id, job_id, "ingestion", "chunk", chunk_id,
        "upload_failed", error, is_retryable
    )

def emit_job_completed(tenant_id: str, project_id: str, job_id: str, metadata: Dict[str, Any]):
    """Emit event when job completes"""
    return EventEmitter.emit_completion(
        tenant_id, project_id, job_id, "completed", "job", job_id, metadata
    )

def emit_job_cancelled(tenant_id: str, project_id: str, job_id: str, reason: str):
    """Emit event when job is cancelled"""
    return EventEmitter.emit_cancellation(
        tenant_id, project_id, job_id, reason
    )
