"use client";

import * as React from "react";
import { Bot } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";

export interface TopAssistantItem {
  assistant_id: string;
  name: string;
  message_count: number;
}

interface TopAssistantsListProps {
  items: TopAssistantItem[];
}

/**
 * Ranked horizontal-bar list of the busiest assistants for the period.
 * Bars are sized relative to the top entry so even small datasets render readably.
 */
export function TopAssistantsList({ items }: TopAssistantsListProps) {
  const max = Math.max(1, ...items.map((i) => i.message_count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top assistants</CardTitle>
        <CardDescription>Ranked by message volume in the selected window.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--color-text-tertiary)]">
            No conversations yet in this window.
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((item, idx) => {
              const pct = (item.message_count / max) * 100;
              return (
                <li key={item.assistant_id} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-xs font-mono text-[var(--color-text-tertiary)]">
                    {idx + 1}
                  </span>
                  <span
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                    aria-hidden
                  >
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={`/analytics/assistant/${item.assistant_id}`}
                        className="truncate text-sm font-medium text-[var(--color-text-primary)] hover:underline"
                      >
                        {item.name}
                      </a>
                      <span className="shrink-0 text-xs font-medium text-[var(--color-text-secondary)] tabular-nums">
                        {item.message_count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-brand)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
