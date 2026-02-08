#!/usr/bin/env python3
"""
Quick script to manually activate assistants that are stuck in 'ingesting' status
"""
import asyncio
import sys
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.assistant import Assistant, AssistantStatus

async def activate_all_ingesting_assistants():
    """Find and activate all assistants in 'ingesting' status"""
    async with AsyncSessionLocal() as db:
        # Find all ingesting assistants
        result = await db.execute(
            select(Assistant).where(Assistant.status == AssistantStatus.INGESTING)
        )
        assistants = result.scalars().all()
        
        if not assistants:
            print("No assistants found in 'ingesting' status")
            return
        
        print(f"Found {len(assistants)} assistant(s) in 'ingesting' status:")
        for assistant in assistants:
            print(f"  - {assistant.name} (ID: {assistant.id})")
        
        # Ask for confirmation
        response = input("\nActivate all these assistants? (y/n): ")
        if response.lower() != 'y':
            print("Cancelled")
            return
        
        # Activate each assistant
        for assistant in assistants:
            assistant.status = AssistantStatus.READY
            assistant.status_message = "Assistant is ready for chat"
            
            # Generate system prompt if missing
            if not assistant.system_prompt:
                assistant.system_prompt = _generate_system_prompt(assistant)
            
            print(f"✓ Activated: {assistant.name}")
        
        await db.commit()
        print(f"\n✅ Successfully activated {len(assistants)} assistant(s)")

def _generate_system_prompt(assistant) -> str:
    """Generate system prompt for assistant"""
    from app.models.assistant import AssistantTemplate
    
    template_prompts = {
        AssistantTemplate.SUPPORT: f"You are a helpful support assistant for {assistant.name}. Help users with technical issues and provide documentation guidance.",
        AssistantTemplate.CUSTOMER: f"You are a customer service assistant for {assistant.name}. Help customers with questions about products and services.",
        AssistantTemplate.SALES: f"You are a sales assistant for {assistant.name}. Help potential customers understand products and pricing.",
        AssistantTemplate.ECOMMERCE: f"You are an e-commerce assistant for {assistant.name}. Help customers find products and get support."
    }
    
    base_prompt = template_prompts.get(assistant.template, f"You are an AI assistant for {assistant.name}.")
    
    governance_addition = f"""

GOVERNANCE RULES:
- Only use information from the provided context
- Always cite sources using provided URLs
- Allowed content types: {', '.join(assistant.allowed_intents)}
- If a question is outside your scope, politely decline
- Maintain strict tenant isolation"""
    
    return base_prompt + governance_addition

if __name__ == "__main__":
    asyncio.run(activate_all_ingesting_assistants())
