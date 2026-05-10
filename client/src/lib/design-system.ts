/**
 * FlakersStudio Design System helpers
 * --------------------------------------------------------------------
 * Re-exports `cn` (consolidated source of truth) plus typed utilities
 * for gradients, confidence scoring, and elevation.
 *
 * Other modules SHOULD import `cn` from here going forward:
 *     import { cn } from "@/lib/design-system";
 *
 * The legacy `@/lib/utils#cn` continues to work for backwards compat.
 * --------------------------------------------------------------------
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Compose Tailwind class names with clsx + tailwind-merge resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ */
/* Gradients                                                           */
/* ------------------------------------------------------------------ */

export type GradientVariant = "brand" | "trust" | "refuse" | "caution" | "mesh";

const GRADIENT_CLASS_MAP: Record<GradientVariant, string> = {
  brand:   "bg-gradient-brand",
  trust:   "bg-gradient-trust",
  refuse:  "bg-gradient-refuse",
  caution: "bg-gradient-caution",
  mesh:    "bg-gradient-mesh",
};

/** Returns the utility class that paints a token-driven gradient background. */
export function gradientClass(variant: GradientVariant): string {
  return GRADIENT_CLASS_MAP[variant];
}

/* ------------------------------------------------------------------ */
/* Confidence → governance semantic name                               */
/* ------------------------------------------------------------------ */

export type ConfidenceTone = "trust" | "caution" | "refuse";

/**
 * Map a numeric confidence score [0, 1] to a governance tone token.
 *   ≥ 0.75       → "trust"   (emerald — high confidence, safe to answer)
 *   0.5  – 0.75  → "caution" (amber  — low confidence, surface uncertainty)
 *   < 0.5        → "refuse"  (rose   — refuse / escalate)
 *
 * Out-of-range or non-finite scores collapse to "refuse" by default to
 * fail closed in the governance UI.
 */
export function confidenceColor(score: number): ConfidenceTone {
  if (!Number.isFinite(score)) return "refuse";
  if (score >= 0.75) return "trust";
  if (score >= 0.5)  return "caution";
  return "refuse";
}

/* ------------------------------------------------------------------ */
/* Elevation helper                                                    */
/* ------------------------------------------------------------------ */

export type Elevation = 0 | 1 | 2 | 3 | 4;

const ELEVATION_CLASS_MAP: Record<Elevation, string> = {
  0: "shadow-none",
  1: "shadow-elevation-1",
  2: "shadow-elevation-2",
  3: "shadow-elevation-3",
  4: "shadow-elevation-4",
};

export function elevationClass(level: Elevation): string {
  return ELEVATION_CLASS_MAP[level];
}

/* ------------------------------------------------------------------ */
/* Tone → token class bundles (for Badges, Chips, status pills, ...)   */
/* ------------------------------------------------------------------ */

export type SemanticTone =
  | "brand"
  | "trust"
  | "caution"
  | "refuse"
  | "neutral"
  | "accent";

/** Soft-tinted background + foreground + border for a given semantic tone. */
export const toneSoftClass: Record<SemanticTone, string> = {
  brand:   "bg-brand-soft text-brand border border-brand-border",
  trust:   "bg-trust-soft text-trust-strong border border-trust-border",
  caution: "bg-caution-soft text-caution-strong border border-caution-border",
  refuse:  "bg-refuse-soft text-refuse-strong border border-refuse-border",
  neutral: "bg-surface-sunken text-text-secondary border border-border-subtle",
  accent:  "bg-accent-soft text-accent border border-accent-border",
};

/** Solid (high-contrast) background for a given semantic tone. */
export const toneSolidClass: Record<SemanticTone, string> = {
  brand:   "bg-brand text-brand-foreground",
  trust:   "bg-trust text-trust-foreground",
  caution: "bg-caution text-caution-foreground",
  refuse:  "bg-refuse text-refuse-foreground",
  neutral: "bg-surface-inverse text-text-inverse",
  accent:  "bg-accent text-text-on-brand",
};
