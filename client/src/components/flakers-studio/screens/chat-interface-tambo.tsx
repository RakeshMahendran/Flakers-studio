"use client";

import { ChevronLeft, ShieldCheck, RefreshCw } from "lucide-react";
import { Button, Badge } from "@/components/ui/enhanced-ui";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTamboThread, useTamboContextAttachment } from "@tambo-ai/react";
import { useEffect, useState } from "react";
import type { Assistant } from "./dashboard-screen";
import { apiGet } from "@/lib/api-client";
import {
  MessageInput,
  MessageInputError,
  MessageInputFileButton,
  MessageInputMcpPromptButton,
  MessageInputMcpResourceButton,
  MessageInputSubmitButton,
  MessageInputTextarea,
  MessageInputToolbar,
} from "@/components/tambo/message-input";
import {
  MessageSuggestions,
  MessageSuggestionsList,
  MessageSuggestionsStatus,
} from "@/components/tambo/message-suggestions";
import { ScrollableMessageContainer } from "@/components/tambo/scrollable-message-container";
import { ThreadContainer } from "@/components/tambo/thread-container";
import {
  ThreadContent,
  ThreadContentMessages,
} from "@/components/tambo/thread-content";
import {
  ThreadHistory,
  ThreadHistoryHeader,
  ThreadHistoryList,
  ThreadHistoryNewButton,
  ThreadHistorySearch,
} from "@/components/tambo/thread-history";
import type { Suggestion } from "@tambo-ai/react";

/**
 * ChatInterfaceTambo - Full-featured Tambo chat interface
 * 
 * Features:
 * - Thread history sidebar with search
 * - File attachments
 * - MCP prompts and resources
 * - Message suggestions
 * - Generative UI components
 * - Streaming responses
 * - Connected to your RAG backend via tools
 */

interface ChatInterfaceTamboProps {
  assistantId: string;
}

export function ChatInterfaceTambo({ assistantId }: ChatInterfaceTamboProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch assistant details
    const fetchAssistant = async () => {
      if (!user) return;
      
      try {
        const response = await apiGet('/api/assistants', user.accessToken);
        const data = await response.json();
        const found = data.assistants?.find((a: Assistant) => a.id === assistantId);
        if (found) {
          setAssistant(found);
        }
      } catch (error) {
        console.error("Failed to fetch assistant:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssistant();
  }, [assistantId, user]);

  if (loading || !assistant) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  return (
    <div className="flex h-screen bg-slate-50 relative overflow-hidden">
      {/* Custom Sidebar (replaces default thread history) */}
      <ChatSidebar assistant={assistant} onBack={() => router.push('/dashboard')} />

      {/* Main Chat Area with Full Tambo Features */}
      <div className="flex-1 flex flex-col relative z-0 bg-slate-50">
        <ChatHeader assistant={assistant} />
        <TamboFullChatArea assistant={assistant} />
      </div>
    </div>
  );
}

/**
 * TamboFullChatArea - Complete Tambo chat with all features
 */
function TamboFullChatArea({ assistant }: { assistant: Assistant }) {
  const { addContextAttachment } = useTamboContextAttachment();

  // Add assistant context as attachment when component mounts
  useEffect(() => {
    addContextAttachment({
      context: {
        assistant_id: assistant.id,
        assistant_name: assistant.name,
        site_url: assistant.siteUrl,
        template: assistant.template,
        instruction: "Use the query_rag_backend tool to answer questions about this assistant's knowledge base.",
      },
      displayName: `Assistant: ${assistant.name}`,
      type: "assistant_context",
    });
  }, [assistant, addContextAttachment]);

  const defaultSuggestions: Suggestion[] = [
    {
      id: "suggestion-1",
      title: "Ask about content",
      detailedSuggestion: `What can you tell me about ${assistant.siteUrl}?`,
      messageId: "content-query",
    },
    {
      id: "suggestion-2",
      title: "Show my assistants",
      detailedSuggestion: "Show me all my assistants",
      messageId: "assistants-query",
    },
    {
      id: "suggestion-3",
      title: "View sources",
      detailedSuggestion: "Show me the sources for this answer",
      messageId: "sources-query",
    },
  ];

  return (
    <div className="flex-1 flex flex-col bg-white light overflow-hidden">
      {/* Messages Area */}
      <ScrollableMessageContainer className="flex-1 p-4 bg-slate-50 overflow-y-auto">
        <ThreadContent variant="default">
          <ThreadContentMessages />
        </ThreadContent>
      </ScrollableMessageContainer>

      {/* Message Suggestions Status */}
      <MessageSuggestions>
        <MessageSuggestionsStatus />
      </MessageSuggestions>

      {/* Input Area with Full Features */}
      <div className="px-4 pb-4 bg-white border-t border-slate-200 flex-shrink-0">
        <MessageInput className="[&_textarea]:text-slate-900 [&_textarea]:placeholder:text-slate-400">
          <MessageInputTextarea 
            placeholder="Ask a question or try: 'Show me my assistants'" 
            className="text-slate-900 placeholder:text-slate-400"
          />
          <MessageInputToolbar>
            <MessageInputFileButton />
            <MessageInputMcpPromptButton />
            <MessageInputMcpResourceButton />
            <MessageInputSubmitButton />
          </MessageInputToolbar>
          <MessageInputError />
        </MessageInput>
      </div>

      {/* Message Suggestions */}
      <MessageSuggestions initialSuggestions={defaultSuggestions}>
        <MessageSuggestionsList />
      </MessageSuggestions>
    </div>
  );
}

/**
 * ChatSidebar - Shows assistant info, conversation threads, and Tambo features
 */
function ChatSidebar({
  assistant,
  onBack,
}: {
  assistant: Assistant;
  onBack: () => void;
}) {
  const { thread } = useTamboThread();

  return (
    <div className="hidden md:flex flex-col w-80 bg-white border-r border-slate-200">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div
          className="flex items-center gap-2 mb-6 font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors"
          onClick={onBack}
        >
          <ChevronLeft className="w-5 h-5" />
          Back to Dashboard
        </div>

        {/* Active Assistant */}
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Active Assistant
          </div>
          <div className="p-4 bg-blue-50/50 rounded-xl text-sm font-bold text-blue-900 flex items-center gap-3 border border-blue-100">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            {assistant.name}
          </div>
        </div>
      </div>

      {/* Conversation Threads - Using Tambo's built-in thread history */}
      <div className="flex-1 overflow-hidden">
        <ThreadHistory>
          <div className="p-4 border-b border-slate-200">
            <ThreadHistoryHeader>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Conversation History
                </span>
                <ThreadHistoryNewButton />
              </div>
            </ThreadHistoryHeader>
            <ThreadHistorySearch placeholder="Search conversations..." />
          </div>
          <div className="overflow-y-auto">
            <ThreadHistoryList />
          </div>
        </ThreadHistory>
      </div>

      {/* Tambo Features */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Tambo AI Features
        </div>
        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Generative UI</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Streaming</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Source Explorer</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Governance</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ChatHeader - Shows assistant name and governance status
 */
function ChatHeader({ assistant }: { assistant: Assistant }) {
  return (
    <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="font-serif font-bold text-slate-900 text-lg">
          {assistant.name}
        </span>
        <Badge color="green">
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
          Governed • {assistant.allowedIntents?.join(", ") || "All Intents"}
        </Badge>
        <Badge color="blue">🤖 Tambo AI Powered</Badge>
      </div>
    </div>
  );
}
