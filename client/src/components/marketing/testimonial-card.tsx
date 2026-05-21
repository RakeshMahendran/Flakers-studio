"use client";

/**
 * TestimonialCard — single pull-quote with author byline and tone badge.
 * Used in the landing page social-proof band.
 */
import * as React from "react";
import { Quote } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

interface TestimonialCardProps {
  quote: string;
  authorName: string;
  authorRole: string;
  authorCompany: string;
  badge?: string;
  initials?: string;
  className?: string;
}

export function TestimonialCard({
  quote,
  authorName,
  authorRole,
  authorCompany,
  badge,
  initials,
  className,
}: TestimonialCardProps) {
  const fallbackInitials =
    initials ??
    authorName
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  return (
    <figure
      className={cn(
        "relative flex flex-col gap-6 rounded-2xl border border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface)] p-8 shadow-[var(--elevation-2)]",
        className
      )}
    >
      <Quote
        className="h-8 w-8 text-[var(--color-brand)] opacity-50"
        aria-hidden
      />
      <blockquote className="text-xl leading-relaxed text-[var(--color-text-primary)] sm:text-2xl">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption className="mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-sm font-semibold text-white">
            {fallbackInitials}
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{authorName}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {authorRole} · {authorCompany}
            </p>
          </div>
        </div>
        {badge ? <Badge variant="trust">{badge}</Badge> : null}
      </figcaption>
    </figure>
  );
}
