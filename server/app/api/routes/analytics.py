"""
Analytics and Monitoring API
Provides insights into system usage, performance, and content quality
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from app.core.database import get_db
from app.models.assistant import Assistant, AssistantStatus
from app.models.content import ContentChunk, IngestionJob
from app.models.chat import ChatSession, ChatMessage, ChatDecision

router = APIRouter(prefix="/analytics", tags=["analytics"])

class SystemStatsResponse(BaseModel):
    """Overall system statistics"""
    total_assistants: int
    active_assistants: int
    total_projects: int
    total_content_chunks: int
    total_chat_sessions: int
    total_messages: int
    answer_rate: float
    avg_processing_time: float

class ContentQualityResponse(BaseModel):
    """Content quality metrics"""
    total_chunks: int
    avg_confidence_score: float
    intent_distribution: Dict[str, int]
    quality_distribution: Dict[str, int]
    sensitive_content_count: int
    policy_content_count: int

class UsageAnalyticsResponse(BaseModel):
    """Usage analytics over time"""
    period: str
    chat_volume: List[Dict[str, Any]]
    answer_rates: List[Dict[str, Any]]
    top_assistants: List[Dict[str, Any]]
    common_intents: List[Dict[str, Any]]

class PerformanceMetricsResponse(BaseModel):
    """System performance metrics"""
    avg_response_time: float
    p95_response_time: float
    error_rate: float
    ingestion_success_rate: float
    recent_jobs: List[Dict[str, Any]]

@router.get("/system-stats", response_model=SystemStatsResponse)
async def get_system_stats(db: AsyncSession = Depends(get_db)):
    """Get overall system statistics"""
    try:
        # Assistant statistics
        assistant_stats = await db.execute(
            select(
                func.count(Assistant.id).label('total'),
                func.count(Assistant.id).filter(Assistant.status == AssistantStatus.READY).label('active'),
                func.count(func.distinct(Assistant.tenant_id)).label('projects')
            )
        )
        assistant_data = assistant_stats.first()
        
        # Content statistics
        content_stats = await db.execute(
            select(func.count(ContentChunk.id)).label('total_chunks')
        )
        total_chunks = content_stats.scalar() or 0
        
        # Chat statistics
        chat_stats = await db.execute(
            select(
                func.count(func.distinct(ChatSession.id)).label('sessions'),
                func.count(ChatMessage.id).label('messages'),
                func.count(ChatMessage.id).filter(ChatMessage.decision == ChatDecision.ANSWER.value).label('answers')
            )
        )
        chat_data = chat_stats.first()
        
        # Calculate answer rate
        answer_rate = (chat_data.answers / chat_data.messages * 100) if chat_data.messages > 0 else 0
        
        # Average processing time
        processing_time_stats = await db.execute(
            select(func.avg(func.cast(ChatMessage.processing_time_ms, func.Integer())))
            .where(ChatMessage.processing_time_ms.isnot(None))
        )
        avg_processing_time = processing_time_stats.scalar() or 0
        
        return SystemStatsResponse(
            total_assistants=assistant_data.total or 0,
            active_assistants=assistant_data.active or 0,
            total_projects=assistant_data.projects or 0,
            total_content_chunks=total_chunks,
            total_chat_sessions=chat_data.sessions or 0,
            total_messages=chat_data.messages or 0,
            answer_rate=round(answer_rate, 2),
            avg_processing_time=round(avg_processing_time, 2)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system stats: {str(e)}")

@router.get("/content-quality", response_model=ContentQualityResponse)
async def get_content_quality_metrics(db: AsyncSession = Depends(get_db)):
    """Get content quality and classification metrics"""
    try:
        # Overall content stats
        total_result = await db.execute(
            select(
                func.count(ContentChunk.id).label('total'),
                func.avg(ContentChunk.confidence_score).label('avg_confidence'),
                func.count(ContentChunk.id).filter(ContentChunk.is_sensitive == "true").label('sensitive'),
                func.count(ContentChunk.id).filter(ContentChunk.is_policy_content == "true").label('policy')
            )
        )
        totals = total_result.first()
        
        # Intent distribution
        intent_result = await db.execute(
            select(
                ContentChunk.intent,
                func.count(ContentChunk.id).label('count')
            ).group_by(ContentChunk.intent)
        )
        intent_distribution = {row.intent: row.count for row in intent_result}
        
        # Quality distribution (based on confidence scores)
        quality_ranges = [
            ("High (0.8-1.0)", 0.8, 1.0),
            ("Medium (0.6-0.8)", 0.6, 0.8),
            ("Low (0.4-0.6)", 0.4, 0.6),
            ("Very Low (0.0-0.4)", 0.0, 0.4)
        ]
        
        quality_distribution = {}
        for label, min_score, max_score in quality_ranges:
            result = await db.execute(
                select(func.count(ContentChunk.id))
                .where(and_(
                    ContentChunk.confidence_score >= min_score,
                    ContentChunk.confidence_score < max_score
                ))
            )
            quality_distribution[label] = result.scalar() or 0
        
        return ContentQualityResponse(
            total_chunks=totals.total or 0,
            avg_confidence_score=round(totals.avg_confidence or 0, 3),
            intent_distribution=intent_distribution,
            quality_distribution=quality_distribution,
            sensitive_content_count=totals.sensitive or 0,
            policy_content_count=totals.policy or 0
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get content quality metrics: {str(e)}")

@router.get("/usage", response_model=UsageAnalyticsResponse)
async def get_usage_analytics(
    days: int = 7,
    db: AsyncSession = Depends(get_db)
):
    """Get usage analytics over specified time period"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Chat volume over time (daily)
        chat_volume = []
        for i in range(days):
            day_start = start_date + timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            
            volume_result = await db.execute(
                select(func.count(ChatMessage.id))
                .where(and_(
                    ChatMessage.created_at >= day_start,
                    ChatMessage.created_at < day_end
                ))
            )
            volume = volume_result.scalar() or 0
            
            chat_volume.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "messages": volume
            })
        
        # Answer rates over time
        answer_rates = []
        for i in range(days):
            day_start = start_date + timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            
            rate_result = await db.execute(
                select(
                    func.count(ChatMessage.id).label('total'),
                    func.count(ChatMessage.id).filter(ChatMessage.decision == ChatDecision.ANSWER.value).label('answers')
                ).where(and_(
                    ChatMessage.created_at >= day_start,
                    ChatMessage.created_at < day_end
                ))
            )
            rate_data = rate_result.first()
            
            answer_rate = (rate_data.answers / rate_data.total * 100) if rate_data.total > 0 else 0
            
            answer_rates.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "answer_rate": round(answer_rate, 2),
                "total_messages": rate_data.total
            })
        
        # Top assistants by usage
        top_assistants_result = await db.execute(
            select(
                Assistant.name,
                Assistant.id,
                func.count(ChatMessage.id).label('message_count')
            )
            .join(ChatSession, ChatSession.assistant_id == Assistant.id)
            .join(ChatMessage, ChatMessage.session_id == ChatSession.id)
            .where(ChatMessage.created_at >= start_date)
            .group_by(Assistant.id, Assistant.name)
            .order_by(desc('message_count'))
            .limit(10)
        )
        
        top_assistants = []
        for row in top_assistants_result:
            top_assistants.append({
                "assistant_id": str(row.id),
                "name": row.name,
                "message_count": row.message_count
            })
        
        # Common intents in queries
        # This would require NLP analysis of user messages
        # For now, return content intent distribution as proxy
        intent_result = await db.execute(
            select(
                ContentChunk.intent,
                func.count(ContentChunk.id).label('count')
            )
            .group_by(ContentChunk.intent)
            .order_by(desc('count'))
            .limit(10)
        )
        
        common_intents = []
        for row in intent_result:
            common_intents.append({
                "intent": row.intent,
                "count": row.count
            })
        
        return UsageAnalyticsResponse(
            period=f"{days} days",
            chat_volume=chat_volume,
            answer_rates=answer_rates,
            top_assistants=top_assistants,
            common_intents=common_intents
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get usage analytics: {str(e)}")

@router.get("/performance", response_model=PerformanceMetricsResponse)
async def get_performance_metrics(db: AsyncSession = Depends(get_db)):
    """Get system performance metrics"""
    try:
        # Response time statistics
        response_time_result = await db.execute(
            select(
                func.avg(func.cast(ChatMessage.processing_time_ms, func.Integer())).label('avg_time'),
                func.percentile_cont(0.95).within_group(func.cast(ChatMessage.processing_time_ms, func.Integer())).label('p95_time')
            ).where(ChatMessage.processing_time_ms.isnot(None))
        )
        response_times = response_time_result.first()
        
        # Error rate (refusal rate)
        error_rate_result = await db.execute(
            select(
                func.count(ChatMessage.id).label('total'),
                func.count(ChatMessage.id).filter(ChatMessage.decision == ChatDecision.REFUSE.value).label('errors')
            )
        )
        error_data = error_rate_result.first()
        error_rate = (error_data.errors / error_data.total * 100) if error_data.total > 0 else 0
        
        # Ingestion success rate
        ingestion_result = await db.execute(
            select(
                func.count(IngestionJob.id).label('total'),
                func.count(IngestionJob.id).filter(IngestionJob.status == 'completed').label('successful')
            )
        )
        ingestion_data = ingestion_result.first()
        success_rate = (ingestion_data.successful / ingestion_data.total * 100) if ingestion_data.total > 0 else 0
        
        # Recent jobs
        recent_jobs_result = await db.execute(
            select(IngestionJob)
            .order_by(desc(IngestionJob.started_at))
            .limit(10)
        )
        recent_jobs = []
        for job in recent_jobs_result.scalars():
            recent_jobs.append({
                "job_id": str(job.id),
                "assistant_id": str(job.assistant_id),
                "status": job.status,
                "progress": job.progress_percentage,
                "pages_processed": job.pages_processed,
                "chunks_created": job.chunks_created,
                "errors": job.errors_count,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None
            })
        
        return PerformanceMetricsResponse(
            avg_response_time=round(response_times.avg_time or 0, 2),
            p95_response_time=round(response_times.p95_time or 0, 2),
            error_rate=round(error_rate, 2),
            ingestion_success_rate=round(success_rate, 2),
            recent_jobs=recent_jobs
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get performance metrics: {str(e)}")

@router.get("/assistant/{assistant_id}/stats")
async def get_assistant_analytics(
    assistant_id: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed analytics for a specific assistant"""
    try:
        # Verify assistant exists
        assistant_result = await db.execute(
            select(Assistant).where(Assistant.id == assistant_id)
        )
        assistant = assistant_result.scalar_one_or_none()
        
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Chat statistics
        chat_stats = await db.execute(
            select(
                func.count(func.distinct(ChatSession.id)).label('sessions'),
                func.count(ChatMessage.id).label('messages'),
                func.count(ChatMessage.id).filter(ChatMessage.decision == ChatDecision.ANSWER.value).label('answers'),
                func.avg(func.cast(ChatMessage.processing_time_ms, func.Integer())).label('avg_time')
            )
            .join(ChatSession, ChatSession.assistant_id == assistant_id)
            .join(ChatMessage, ChatMessage.session_id == ChatSession.id)
            .where(ChatMessage.created_at >= start_date)
        )
        chat_data = chat_stats.first()
        
        # Content statistics
        content_stats = await db.execute(
            select(
                func.count(ContentChunk.id).label('chunks'),
                func.count(func.distinct(ContentChunk.source_url)).label('sources'),
                func.avg(ContentChunk.confidence_score).label('avg_confidence')
            ).where(ContentChunk.assistant_id == assistant_id)
        )
        content_data = content_stats.first()
        
        # Recent ingestion jobs
        jobs_result = await db.execute(
            select(IngestionJob)
            .where(IngestionJob.assistant_id == assistant_id)
            .order_by(desc(IngestionJob.started_at))
            .limit(5)
        )
        
        recent_jobs = []
        for job in jobs_result.scalars():
            recent_jobs.append({
                "job_id": str(job.id),
                "status": job.status,
                "progress": job.progress_percentage,
                "pages_processed": job.pages_processed,
                "chunks_created": job.chunks_created,
                "started_at": job.started_at.isoformat() if job.started_at else None
            })
        
        answer_rate = (chat_data.answers / chat_data.messages * 100) if chat_data.messages > 0 else 0
        
        return {
            "assistant_id": assistant_id,
            "assistant_name": assistant.name,
            "period_days": days,
            "chat_stats": {
                "total_sessions": chat_data.sessions or 0,
                "total_messages": chat_data.messages or 0,
                "successful_answers": chat_data.answers or 0,
                "answer_rate": round(answer_rate, 2),
                "avg_response_time": round(chat_data.avg_time or 0, 2)
            },
            "content_stats": {
                "total_chunks": content_data.chunks or 0,
                "unique_sources": content_data.sources or 0,
                "avg_confidence": round(content_data.avg_confidence or 0, 3)
            },
            "recent_jobs": recent_jobs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get assistant analytics: {str(e)}")

@router.get("/health-check")
async def analytics_health_check(db: AsyncSession = Depends(get_db)):
    """Health check for analytics system"""
    try:
        # Test database connectivity
        test_result = await db.execute(select(func.count(Assistant.id)))
        assistant_count = test_result.scalar()
        
        return {
            "status": "healthy",
            "database": "connected",
            "total_assistants": assistant_count,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }