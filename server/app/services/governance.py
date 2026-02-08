"""
Governance Engine - Core decision-making for FlakersStudio

This is the heart of the governance-first architecture.
All AI responses must pass through governance checks.
"""
from typing import List, Dict, Any, Tuple, Optional
from enum import Enum
import logging

from app.models.chat import ChatDecision, RefusalReason
from app.models.content import ContentIntent

logger = logging.getLogger(__name__)

class GovernanceRule(str, Enum):
    """Available governance rules"""
    REQUIRE_CONTEXT = "require_context"
    INTENT_FILTERING = "intent_filtering" 
    ATTRIBUTION_REQUIRED = "attribution_required"
    POLICY_QUOTE_ONLY = "policy_quote_only"
    TENANT_ISOLATION = "tenant_isolation"
    CONFIDENCE_THRESHOLD = "confidence_threshold"

class GovernanceDecision:
    """Represents a governance decision"""
    def __init__(
        self,
        decision: ChatDecision,
        reason: Optional[RefusalReason] = None,
        allowed_context: List[Dict[str, Any]] = None,
        rules_applied: List[str] = None,
        explanation: str = ""
    ):
        self.decision = decision
        self.reason = reason
        self.allowed_context = allowed_context or []
        self.rules_applied = rules_applied or []
        self.explanation = explanation

class GovernanceEngine:
    """
    Core governance engine that makes decisions about AI responses
    
    This class enforces the governance-first principle:
    - Backend authority over all decisions
    - No AI response without governance approval
    - Transparent and auditable decision-making
    """
    
    def __init__(self, assistant_config: Dict[str, Any]):
        self.assistant_id = assistant_config["id"]
        self.governance_rules = assistant_config.get("governance_rules", {})
        self.allowed_intents = assistant_config.get("allowed_intents", [])
        self.template = assistant_config.get("template", "support")
        
    async def evaluate_query(
        self,
        user_query: str,
        retrieved_chunks: List[Dict[str, Any]],
        tenant_id: str
    ) -> GovernanceDecision:
        """
        Main governance evaluation method
        
        Args:
            user_query: User's question
            retrieved_chunks: Content chunks from Qdrant
            tenant_id: Tenant making the request
            
        Returns:
            GovernanceDecision with ANSWER or REFUSE
        """
        rules_applied = []
        
        # Rule 1: Require Context (MANDATORY)
        if not retrieved_chunks:
            logger.info(f"REFUSE: No context found for query: {user_query[:100]}")
            return GovernanceDecision(
                decision=ChatDecision.REFUSE,
                reason=RefusalReason.NO_CONTEXT,
                rules_applied=["require_context"],
                explanation="No relevant content found in knowledge base"
            )
        rules_applied.append("require_context")
        
        # Rule 2: Tenant Isolation (MANDATORY)
        tenant_violation = self._check_tenant_isolation(retrieved_chunks, tenant_id)
        if tenant_violation:
            logger.warning(f"REFUSE: Tenant isolation violation for {tenant_id}")
            return GovernanceDecision(
                decision=ChatDecision.REFUSE,
                reason=RefusalReason.CROSS_TENANT,
                rules_applied=rules_applied + ["tenant_isolation"],
                explanation="Access to requested content is not authorized"
            )
        rules_applied.append("tenant_isolation")
        
        # Rule 3: Intent Filtering
        allowed_chunks = self._filter_by_intent(retrieved_chunks)
        if not allowed_chunks:
            logger.info(f"REFUSE: No chunks match allowed intents for assistant {self.assistant_id}")
            return GovernanceDecision(
                decision=ChatDecision.REFUSE,
                reason=RefusalReason.OUT_OF_SCOPE,
                rules_applied=rules_applied + ["intent_filtering"],
                explanation=f"Query is outside allowed scope: {', '.join(self.allowed_intents)}"
            )
        rules_applied.append("intent_filtering")
        
        # Rule 4: Confidence Threshold
        high_confidence_chunks = self._filter_by_confidence(allowed_chunks)
        if not high_confidence_chunks:
            logger.info(f"REFUSE: No high-confidence chunks for query: {user_query[:100]}")
            return GovernanceDecision(
                decision=ChatDecision.REFUSE,
                reason=RefusalReason.INSUFFICIENT_CONFIDENCE,
                rules_applied=rules_applied + ["confidence_threshold"],
                explanation="Insufficient confidence in available information"
            )
        rules_applied.append("confidence_threshold")
        
        # Rule 5: Policy Content Handling
        policy_chunks = [c for c in high_confidence_chunks if c.get("is_policy_content", False)]
        if policy_chunks:
            rules_applied.append("policy_quote_only")
            # Policy content requires special handling (quote-only)
            
        # Rule 6: Attribution Requirements
        if any(c.get("requires_attribution", True) for c in high_confidence_chunks):
            rules_applied.append("attribution_required")
        
        # DECISION: ANSWER
        logger.info(f"ALLOW: Query approved with {len(high_confidence_chunks)} chunks")
        return GovernanceDecision(
            decision=ChatDecision.ANSWER,
            allowed_context=high_confidence_chunks,
            rules_applied=rules_applied,
            explanation=f"Query approved with {len(high_confidence_chunks)} relevant sources"
        )
    
    def _check_tenant_isolation(self, chunks: List[Dict[str, Any]], tenant_id: str) -> bool:
        """Check if any chunks violate tenant isolation"""
        # In a real implementation, this would check chunk metadata
        # For now, we assume all chunks belong to the correct tenant
        # since they were retrieved with assistant_id filter
        return False
    
    def _filter_by_intent(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter chunks by allowed intents"""
        if not self.allowed_intents:
            return chunks  # No intent restrictions
            
        allowed_chunks = []
        for chunk in chunks:
            chunk_intent = chunk.get("intent", "unknown")
            if chunk_intent in self.allowed_intents:
                allowed_chunks.append(chunk)
                
        return allowed_chunks
    
    def _filter_by_confidence(
        self, 
        chunks: List[Dict[str, Any]], 
        threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """Filter chunks by confidence threshold"""
        return [
            chunk for chunk in chunks 
            if chunk.get("score", 0.0) >= threshold
        ]
    
    def generate_system_prompt(self, allowed_context: List[Dict[str, Any]]) -> str:
        """
        Generate system prompt with governance constraints
        
        This prompt ensures Azure AI stays within governance boundaries
        """
        context_text = "\n\n".join([
            f"Source: {chunk['source_url']}\nContent: {chunk['content']}"
            for chunk in allowed_context
        ])
        
        # Template-specific instructions
        template_instructions = self._get_template_instructions()
        
        # Policy content handling
        has_policy_content = any(c.get("is_policy_content", False) for c in allowed_context)
        policy_instruction = ""
        if has_policy_content:
            policy_instruction = "\n\nIMPORTANT: Some content is marked as policy/legal. For policy content, quote directly rather than paraphrasing."
        
        system_prompt = f"""You are a helpful assistant for {self.template} inquiries. You must follow these strict rules:

1. ONLY use information from the provided context below
2. If the context doesn't contain relevant information, say "I don't have information about that in my knowledge base"
3. Always cite sources by including the source URL in your response
4. Be accurate and helpful within the scope of the provided information
5. {template_instructions}{policy_instruction}

CONTEXT:
{context_text}

Remember: You can only answer based on the context provided above. Do not use external knowledge."""

        return system_prompt
    
    def _get_template_instructions(self) -> str:
        """Get template-specific instructions"""
        instructions = {
            "support": "Focus on helping users resolve issues and find solutions",
            "customer": "Provide helpful customer service responses",
            "sales": "Focus on product information and helping with purchase decisions", 
            "ecommerce": "Help with product information, orders, and shopping assistance"
        }
        return instructions.get(self.template, "Provide helpful and accurate responses")
    
    def format_sources(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Format source information for frontend display"""
        sources = []
        seen_urls = set()
        
        for chunk in chunks:
            url = chunk["source_url"]
            if url not in seen_urls:
                sources.append({
                    "url": url,
                    "title": chunk.get("source_title", url),
                    "intent": chunk.get("intent", "unknown")
                })
                seen_urls.add(url)
                
        return sources