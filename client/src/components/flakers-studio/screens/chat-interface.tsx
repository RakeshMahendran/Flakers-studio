"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Badge } from "@/components/ui/enhanced-ui";
import { 
  ChevronLeft, ShieldCheck, Send, ArrowUp, Paperclip, AtSign, 
  FileText, HelpCircle, X, Check, Loader2, ChevronDown, Brain, Plus 
} from "lucide-react";
import { User, Assistant } from "../app";
import { generativeComponents } from "@/components/tambo/generative";

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  decision?: "ANSWER" | "REFUSE";
  reason?: string;
  sources?: Array<{
    url: string;
    title: string;
    intent: string;
  }>;
  rulesApplied?: string[];
  processingTimeMs?: number;
  toolCalls?: Array<{
    id: string;
    name: string;
    parameters: Record<string, any>;
    result?: any;
    status: 'loading' | 'success' | 'error';
  }>;
  reasoning?: string[];
  isRefusal?: boolean;
  citations?: Array<{ title: string; url: string; type: string }>;
  // Generative UI support
  component?: {
    type: string;
    props: Record<string, any>;
  };
}

interface ChatThread {
  id: string;
  session_id: string;
  last_message: string;
  last_activity: string;
  message_count: number;
}

interface ChatInterfaceProps {
  user: User;
  assistant: Assistant;
  onBack: () => void;
}

export function ChatInterface({ user, assistant, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation threads on mount
  useEffect(() => {
    loadThreads();
  }, [assistant.id]);

  // Load conversation history when session changes
  useEffect(() => {
    if (sessionId) {
      loadHistory(sessionId);
    } else {
      // Show welcome message when no session
      showWelcomeMessage();
    }
  }, [sessionId]);

  const showWelcomeMessage = () => {
    setMessages([{
      id: 'welcome',
      type: 'assistant',
      content: `Hello! I'm your AI assistant for ${assistant.name}. I can help you with questions about ${assistant.siteUrl}. What would you like to know?`,
      timestamp: new Date(),
    }]);
    setIsLoadingHistory(false);
  };

  const loadThreads = async () => {
    try {
      setIsLoadingThreads(true);
      const response = await fetch(`/api/chat/threads?assistant_id=${assistant.id}`);
      
      if (response.ok) {
        const data = await response.json();
        setThreads(data.threads || []);
        
        // Auto-select the most recent thread if exists
        if (data.threads && data.threads.length > 0) {
          setSessionId(data.threads[0].session_id);
        } else {
          // No threads, show welcome
          showWelcomeMessage();
        }
      } else {
        showWelcomeMessage();
      }
    } catch (error) {
      console.error('Error loading threads:', error);
      showWelcomeMessage();
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const loadHistory = async (session_id: string) => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(`/api/chat/history?session_id=${session_id}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.messages && data.messages.length > 0) {
          const formattedMessages: ChatMessage[] = [];
          
          for (const msg of data.messages) {
            // Add user message
            if (msg.user_message) {
              formattedMessages.push({
                id: `${msg.id}-user`,
                type: 'user',
                content: msg.user_message,
                timestamp: new Date(msg.created_at),
              });
            }
            
            // Add assistant message
            if (msg.assistant_response) {
              formattedMessages.push({
                id: msg.id,
                type: 'assistant',
                content: msg.assistant_response,
                timestamp: new Date(msg.created_at),
                decision: msg.decision,
                reason: msg.refusal_reason,
                sources: msg.sources || [],
                citations: msg.sources?.map((s: any) => ({
                  title: s.title,
                  url: s.url,
                  type: s.intent,
                })) || [],
                rulesApplied: msg.rules_applied || [],
                processingTimeMs: parseInt(msg.processing_time_ms || '0'),
                isRefusal: msg.decision === "REFUSE",
              });
            }
          }
          
          setMessages(formattedMessages);
        } else {
          showWelcomeMessage();
        }
      } else {
        showWelcomeMessage();
      }
    } catch (error) {
      console.error('Error loading conversation history:', error);
      showWelcomeMessage();
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const startNewConversation = () => {
    setSessionId(null);
    showWelcomeMessage();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistant_id: assistant.id,
          user_message: currentInput,
          session_id: sessionId,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      
      // Update session ID and reload threads if new session
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        loadThreads();
      }

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.answer || data.reason || "I couldn't process your request.",
        timestamp: new Date(),
        decision: data.decision,
        sources: data.sources || [],
        citations: data.sources?.map((s: any) => ({
          title: s.title,
          url: s.url,
          type: s.intent,
        })) || [],
        rulesApplied: data.rules_applied || [],
        processingTimeMs: data.processing_time_ms,
        isRefusal: data.decision === "REFUSE",
        toolCalls: data.decision === "ANSWER" ? [{
          id: 'search-1',
          name: 'search_vector_db',
          parameters: { query: currentInput, assistant_id: assistant.id },
          result: { found: data.sources?.length || 0 },
          status: 'success' as const,
        }] : undefined,
        reasoning: data.decision === "ANSWER" ? [
          'Analyzing user query',
          'Searching vector database',
          `Found ${data.sources?.length || 0} relevant sources`,
          'Generating response',
        ] : undefined,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
        isRefusal: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 relative overflow-hidden">
      {/* Conversation Threads Sidebar */}
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

        {/* Conversation Threads */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Conversation History
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={startNewConversation}
                className="text-xs h-7 px-2"
              >
                <Plus className="w-3 h-3 mr-1" />
                New
              </Button>
            </div>

            {isLoadingThreads ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : threads.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-slate-500 mb-3">No conversations yet</p>
                <p className="text-xs text-slate-400">Start chatting to create your first conversation</p>
              </div>
            ) : (
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    key={thread.session_id}
                    onClick={() => setSessionId(thread.session_id)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      sessionId === thread.session_id
                        ? 'bg-blue-50 border-2 border-blue-300 shadow-sm'
                        : 'bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">
                      {thread.last_message}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{thread.message_count} messages</span>
                      <span>{new Date(thread.last_activity).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tambo AI Features */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Tambo AI Features
          </div>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Dynamic Components</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Tool Visualization</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Reasoning Display</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative z-0 bg-slate-50">
        {/* Header */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="font-serif font-bold text-slate-900 text-lg">{assistant.name}</span>
            <Badge color="green">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Governed
            </Badge>
            <Badge color="blue">🤖 Tambo AI</Badge>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {isLoadingHistory ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-sm text-slate-600">Loading conversation...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                  onToggleExplanation={() => {
                    setSelectedMessageId(msg.id);
                    setShowExplanation(true);
                  }}
                />
              ))}
              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-slate-200">
          <div className="relative max-w-4xl mx-auto">
            <div className="relative flex flex-col rounded-xl bg-white shadow-md p-2 px-3 border border-slate-300">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ToolbarButton icon={<Paperclip className="w-4 h-4" />} tooltip="Attach files" />
                  <ToolbarButton icon={<AtSign className="w-4 h-4" />} tooltip="Mention" />
                  <ToolbarButton icon={<FileText className="w-4 h-4" />} tooltip="Prompt" />
                </div>
                <button
                  type="button"
                  disabled={!inputValue.trim() || isLoading}
                  onClick={handleSendMessage}
                  className="w-10 h-10 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              </div>

              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question..."
                disabled={isLoading}
                className="w-full bg-transparent border-0 outline-none resize-none text-base placeholder:text-slate-400 min-h-[60px] max-h-[200px]"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Explanation Panel */}
      <AnimatePresence>
        {showExplanation && selectedMessageId && (
          <ExplanationPanel 
            message={messages.find(m => m.id === selectedMessageId)}
            onClose={() => setShowExplanation(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Message Bubble Component
const MessageBubble: React.FC<{ message: ChatMessage; onToggleExplanation: () => void }> = ({ message, onToggleExplanation }) => {
  // Render generative UI component if specified
  const renderGenerativeComponent = () => {
    if (!message.component) return null;
    
    const componentType = message.component.type;
    const componentDef = generativeComponents.find(c => c.name === componentType);
    if (!componentDef) {
      console.warn(`Unknown component type: ${componentType}`);
      return null;
    }
    
    const Component = componentDef.component as React.ComponentType<any>;
    
    return (
      <div className="mt-4">
        <Component {...message.component.props} />
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[75%]`}>
        <div className={`
          p-6 rounded-3xl text-[15px] leading-7 shadow-sm
          ${message.type === 'user' 
            ? 'bg-blue-600 text-white rounded-br-none' 
            : message.isRefusal 
              ? 'bg-red-50 text-slate-800 border border-red-100 rounded-bl-none' 
              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'}
        `}>
          <p>{message.content}</p>
        </div>

        {/* Render Generative UI Component */}
        {renderGenerativeComponent()}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((toolCall) => (
              <ToolCallInfo key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {message.reasoning && message.reasoning.length > 0 && (
          <div className="mt-3">
            <ReasoningInfo reasoning={message.reasoning} />
          </div>
        )}

        {message.type === 'assistant' && !message.isRefusal && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-2">
            {message.citations?.map((cite, i) => (
              <a key={i} href={cite.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-blue-600 hover:border-blue-300 hover:shadow-sm transition-all">
                <FileText className="w-3.5 h-3.5" />
                {cite.title}
              </a>
            ))}
            {message.sources && message.sources.length > 0 && (
              <button 
                onClick={onToggleExplanation}
                className="ml-auto text-xs font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1.5 transition-colors bg-white px-3 py-1.5 rounded-full border border-slate-200 hover:border-blue-200"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Why this answer?
              </button>
            )}
          </div>
        )}
        
        {message.isRefusal && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-600 font-bold bg-red-50 px-3 py-1.5 rounded-full w-fit border border-red-100">
            <ShieldCheck className="w-3.5 h-3.5" />
            Governance: {message.reason || 'Out of Scope'}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-white border border-slate-200 p-5 rounded-3xl rounded-bl-none shadow-sm">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
      </div>
    </div>
  </div>
);

const ToolbarButton: React.FC<{ icon: React.ReactNode; tooltip: string }> = ({ icon, tooltip }) => (
  <button
    type="button"
    className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center"
    title={tooltip}
  >
    {icon}
  </button>
);

const ToolCallInfo: React.FC<{ toolCall: any }> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="text-xs bg-slate-50 rounded-lg p-2">
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1 hover:bg-slate-100 rounded p-1">
        <Check className="w-3 h-3 text-green-500" />
        <span>Used tool: {toolCall.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
      </button>
      {isExpanded && (
        <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
          {JSON.stringify(toolCall.result, null, 2)}
        </pre>
      )}
    </div>
  );
};

const ReasoningInfo: React.FC<{ reasoning: string[] }> = ({ reasoning }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="text-xs bg-blue-50 rounded-lg p-2">
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-1 hover:bg-blue-100 rounded p-1">
        <Brain className="w-3 h-3 text-blue-600" />
        <span className="text-blue-600">💭 Reasoning</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
      </button>
      {isExpanded && (
        <div className="mt-2 pl-4 space-y-2">
          {reasoning.map((step, i) => (
            <div key={i} className="text-slate-600">
              <span className="font-medium text-blue-600">Step {i + 1}:</span>
              <p className="mt-1">{step}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ExplanationPanel: React.FC<{ message?: ChatMessage; onClose: () => void }> = ({ message, onClose }) => (
  <motion.div
    initial={{ x: '100%' }}
    animate={{ x: 0 }}
    exit={{ x: '100%' }}
    transition={{ type: "spring", damping: 25, stiffness: 200 }}
    className="absolute inset-y-0 right-0 w-full md:w-[400px] bg-white shadow-2xl border-l border-slate-200 z-50 overflow-y-auto"
  >
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-serif font-bold text-xl text-slate-900">Why this answer?</h3>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-8">
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Sources Used</h4>
          <div className="space-y-3">
            {message?.sources?.map((source, i) => (
              <div key={i} className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-blue-900 text-sm">{source.title}</span>
                </div>
                <p className="text-xs text-slate-600 mb-3">{source.url}</p>
                <div className="text-[10px] text-emerald-600 font-bold uppercase bg-emerald-50 w-fit px-2 py-1 rounded">
                  Confidence: 98%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Governance</h4>
          <div className="space-y-3">
            {message?.rulesApplied?.map((rule, i) => (
              <div key={i} className="flex items-center gap-3 text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <ShieldCheck className="w-5 h-5" />
                {rule}
              </div>
            ))}
          </div>
        </div>

        {message?.processingTimeMs && (
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Performance</h4>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Processing Time:</span>
                <span className="font-mono">{message.processingTimeMs}ms</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </motion.div>
);
