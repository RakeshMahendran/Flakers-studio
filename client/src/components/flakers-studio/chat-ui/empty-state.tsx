"use client";

import * as React from "react";
import { Sparkles, MessageSquare, Search, ShieldCheck, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

export interface StarterQuestion {
  id: string;
  icon: React.ReactNode;
  title: string;
  prompt: string;
}

interface EmptyStateProps {
  assistantName: string;
  description?: string;
  starterQuestions?: StarterQuestion[];
  onStarterClick: (prompt: string) => void;
}

const DEFAULT_STARTERS_FACTORY = (
  assistantName: string,
  siteHint?: string,
): StarterQuestion[] => [
  {
    id: "overview",
    icon: <Sparkles className="h-4 w-4" />,
    title: "What is this about?",
    prompt: siteHint
      ? `What is ${siteHint} about?`
      : `What can you tell me about ${assistantName}?`,
  },
  {
    id: "key-features",
    icon: <Lightbulb className="h-4 w-4" />,
    title: "Key features",
    prompt: "What are the key features I should know about?",
  },
  {
    id: "find-info",
    icon: <Search className="h-4 w-4" />,
    title: "Find specific info",
    prompt: "Help me find a specific piece of information.",
  },
  {
    id: "governance",
    icon: <ShieldCheck className="h-4 w-4" />,
    title: "What can you answer?",
    prompt: "What kinds of questions are you allowed to answer?",
  },
];

export function EmptyState({
  assistantName,
  description,
  starterQuestions,
  onStarterClick,
}: EmptyStateProps) {
  // UX: Fallback for missing assistant name
  const displayName = assistantName || "this assistant";
  const starters = starterQuestions ?? DEFAULT_STARTERS_FACTORY(displayName);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 flex flex-col items-center text-center">
        {/* Gradient logo mark */}
        <div
          className={cn(
            "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl",
            "bg-[image:var(--gradient-brand)] shadow-[var(--elevation-2)]",
          )}
        >
          <MessageSquare className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {displayName}
        </h1>
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
          {description ??
            "Ask me anything. Every answer is grounded in cited sources and governed by your policies."}
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {starters.slice(0, 4).map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => onStarterClick(starter.prompt)}
            className="text-left focus-visible:outline-none"
          >
            <Card
              elevation={0}
              padding="md"
              interactive
              className={cn(
                "group h-full bg-[var(--color-surface)]",
                "border-[var(--color-border-default)]",
                "transition-[border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)]",
                "hover:-translate-y-0.5 hover:border-[var(--color-brand-border)]",
                "group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-focus-ring)]",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
                    "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
                    "group-hover:bg-[var(--color-brand)] group-hover:text-[var(--color-brand-foreground)]",
                    "transition-colors duration-[var(--duration-base)]",
                  )}
                  aria-hidden
                >
                  {starter.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">
                    {starter.title}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-muted)]">
                    {starter.prompt}
                  </p>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
