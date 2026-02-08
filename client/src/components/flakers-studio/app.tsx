"use client";

import { useState } from "react";
import { LoginScreen } from "./screens/login-screen";
import { DashboardScreen } from "./screens/dashboard-screen";
import { AssistantCreationFlow } from "./flows/assistant-creation-flow";
import { ChatInterface } from "./screens/chat-interface";
import { ChatInterfaceTambo } from "./screens/chat-interface-tambo";
import { AssistantReviewScreen } from "./screens/assistant-review-screen";

export type AppState = 
  | "login"
  | "dashboard" 
  | "create-assistant"
  | "review"
  | "chat";

export interface User {
  id: string;
  email: string;
  tenantId: string;
  accessToken: string;
}

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  sourceType: "website" | "wordpress";

  siteUrl: string;
  template: "support" | "customer" | "sales" | "ecommerce";
  status: "creating" | "ingesting" | "ready" | "error";
  statusMessage?: string;
  totalPagesCrawled: string;
  totalChunksIndexed: string;
  allowedIntents?: string[];  // Made optional to handle undefined/null
  createdAt: string;
}

export function FlakersStudioApp() {
  const [appState, setAppState] = useState<AppState>("login");
  const [user, setUser] = useState<User | null>(null);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [discoveredContent, setDiscoveredContent] = useState<any>(null);
  const [assistantDraft, setAssistantDraft] = useState<{
    name: string;
    description: string;
    sourceType: "website";
    siteUrl: string;
    template: "support" | "customer" | "sales" | "ecommerce";
  } | null>(null);

  const handleLogin = (userData: User) => {
    setUser(userData);
    setAppState("dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedAssistant(null);
    setDiscoveredContent(null);
    setAssistantDraft(null);
    setAppState("login");
  };

  const handleCreateAssistant = () => {
    setAppState("create-assistant");
  };

  const handleAssistantCreated = (
    assistantId: string,
    jobId: string,
    content: any,
    draft: {
      name: string;
      description: string;
      sourceType: "website";
      siteUrl: string;
      template: "support" | "customer" | "sales" | "ecommerce";
    }
  ) => {
    // Create a temporary assistant object for discovery tracking
    const tempAssistant: Assistant = {
      id: assistantId,
      name: draft.name,
      description: draft.description,
      sourceType: draft.sourceType,
      siteUrl: draft.siteUrl,
      template: draft.template,
      status: "creating",
      totalPagesCrawled: "0",
      totalChunksIndexed: "0",
      allowedIntents: [],
      createdAt: new Date().toISOString()
    };
    
    setSelectedAssistant(tempAssistant);
    setAssistantDraft(draft);
    setDiscoveredContent(content);
    setAppState("review");
  };

  const handleReviewFinish = () => {
    setDiscoveredContent(null);
    setAssistantDraft(null);
    setAppState("dashboard");
  };

  const handleSelectAssistant = (assistant: Assistant) => {
    setSelectedAssistant(assistant);
    setAppState("chat");
  };

  const handleBackToDashboard = () => {
    setSelectedAssistant(null);
    setDiscoveredContent(null);
    setAssistantDraft(null);
    setAppState("dashboard");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {appState === "login" && (
        <LoginScreen onLogin={handleLogin} />
      )}
      
      {appState === "dashboard" && user && (
        <DashboardScreen />
      )}
      
      {appState === "create-assistant" && user && (
        <AssistantCreationFlow
          onComplete={handleBackToDashboard}
          onCancel={handleBackToDashboard}
        />
      )}
      
      {appState === "review" && selectedAssistant && (
        <AssistantReviewScreen
          assistantId={selectedAssistant.id}
        />
      )}
      
      {appState === "chat" && user && selectedAssistant && (
        <ChatInterfaceTambo
          assistantId={selectedAssistant.id}
        />
      )}
    </div>
  );
}