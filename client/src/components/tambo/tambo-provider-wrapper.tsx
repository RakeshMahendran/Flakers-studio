"use client";

import { TamboProvider } from "@tambo-ai/react";
import { generativeComponents } from "./generative";
import { tamboTools } from "@/lib/tambo-tools";
import { ReactNode, useMemo } from "react";

/**
 * TamboProviderWrapper
 * 
 * Wraps the app with TamboProvider to enable generative UI capabilities.
 * 
 * Registered Components (AI can render these):
 * - AssistantCard: Show assistant details with actions
 * - GovernanceDecisionTree: Visualize governance decisions
 * - SourceExplorer: Interactive source citation explorer
 * - PerformanceChart: Analytics and performance metrics
 * 
 * Registered Tools (AI can call these):
 * - query_rag_backend: Query your RAG backend for answers
 * - get_user_assistants: Fetch list of user's assistants
 */

interface TamboProviderWrapperProps {
  children: ReactNode;
}

export function TamboProviderWrapper({ children }: TamboProviderWrapperProps) {
  // Get API key from environment
  const apiKey = process.env.NEXT_PUBLIC_TAMBO_API_KEY;

  // Context helpers provide dynamic context to the AI
  const contextHelpers = useMemo(() => ({
    current_time: () => ({ time: new Date().toISOString() }),
    app_context: () => ({ 
      app: "FlakersStudio",
      description: "Governance-first AI assistant platform",
    }),
  }), []);

  if (!apiKey) {
    console.warn(
      "NEXT_PUBLIC_TAMBO_API_KEY not found. Tambo features will be disabled."
    );
    // Return children without Tambo if no API key
    return <>{children}</>;
  }

  return (
    <TamboProvider
      apiKey={apiKey}
      components={generativeComponents}
      tools={tamboTools}
      contextHelpers={contextHelpers}
      // Tambo Cloud handles the AI orchestration
      // Tools connect to your backend via fetch calls
    >
      {children}
    </TamboProvider>
  );
}
