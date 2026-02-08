/**
 * Tambo Local Tools
 * 
 * These are client-side functions that Tambo's AI can call.
 * They connect to your backend RAG system.
 */

import { z } from "zod";
import type { TamboTool } from "@tambo-ai/react";

/**
 * Query RAG Tool
 * 
 * Allows Tambo's AI to query your RAG backend for answers.
 * This connects Tambo to your existing governance + RAG system.
 */
export const queryRagTool: TamboTool = {
  name: "query_rag_backend",
  description: "Query the RAG (Retrieval Augmented Generation) backend to get answers from the assistant's knowledge base. Use this when the user asks questions that require information from the assistant's trained content. Returns the answer, sources, and governance decision.",
  tool: async (params: { assistant_id: string; query: string; session_id?: string }) => {
    try {
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistant_id: params.assistant_id,
          user_message: params.query,
          session_id: params.session_id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        decision: data.decision,
        answer: data.answer,
        reason: data.reason,
        sources: data.sources || [],
        rules_applied: data.rules_applied || [],
        processing_time_ms: data.processing_time_ms,
        session_id: data.session_id,
      };
    } catch (error) {
      console.error('RAG query failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
  inputSchema: z.object({
    assistant_id: z.string().describe("The ID of the assistant to query"),
    query: z.string().describe("The user's question or query"),
    session_id: z.string().optional().describe("Optional session ID for conversation continuity"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    decision: z.enum(["ANSWER", "REFUSE"]).optional(),
    answer: z.string().optional(),
    reason: z.string().optional(),
    sources: z.array(z.object({
      url: z.string(),
      title: z.string(),
      intent: z.string(),
    })).optional(),
    rules_applied: z.array(z.string()).optional(),
    processing_time_ms: z.number().optional(),
    session_id: z.string().optional(),
    error: z.string().optional(),
  }),
};

/**
 * Get Assistants Tool
 * 
 * Fetches list of user's assistants from backend.
 */
export const getAssistantsTool: TamboTool = {
  name: "get_user_assistants",
  description: "Fetch the list of AI assistants for the current user. Use this when user asks 'show me my assistants' or wants to see their assistant list.",
  tool: async () => {
    try {
      const response = await fetch('/api/assistants');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch assistants: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        assistants: data.assistants || [],
      };
    } catch (error) {
      console.error('Failed to fetch assistants:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        assistants: [],
      };
    }
  },
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    assistants: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      status: z.enum(["ready", "creating", "error"]),
      siteUrl: z.string(),
      template: z.string(),
      totalPagesCrawled: z.string(),
      totalChunksIndexed: z.string(),
    })),
    error: z.string().optional(),
  }),
};

/**
 * All Tambo Tools
 * 
 * Export array of all tools to register with TamboProvider
 */
export const tamboTools: TamboTool[] = [
  queryRagTool,
  getAssistantsTool,
];
