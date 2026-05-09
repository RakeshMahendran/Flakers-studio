"use client";

/**
 * FlakersStudio design-system primitives
 * --------------------------------------------------------------------
 * Lightweight, token-driven building blocks. NO heavy dependencies —
 * everything renders against the CSS custom properties declared in
 * `client/app/globals.css` (semantic + component layers).
 *
 * These primitives are the canonical way to render Buttons / Cards /
 * Badges / Chips / Skeletons. The legacy `@/components/ui/enhanced-ui`
 * file is preserved untouched so existing screens keep rendering, but
 * new code SHOULD import from here.
 * --------------------------------------------------------------------
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/design-system";

/* =====================================================================
 * Button
 * ===================================================================== */

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
    "rounded-md select-none",
    "transition-[background,box-shadow,transform,color] duration-[var(--duration-base)] ease-[var(--ease-out)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-focus-ring-offset)]",
    "disabled:opacity-50 disabled:pointer-events-none",
    "active:scale-[0.98]"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)]",
          "shadow-[var(--elevation-1)]",
          "hover:bg-[var(--button-primary-bg-hover)] hover:shadow-[var(--elevation-glow-brand)]",
          "active:bg-[var(--button-primary-bg-active)]"
        ),
        ghost: cn(
          "bg-[var(--button-ghost-bg)] text-[var(--button-ghost-fg)]",
          "hover:bg-[var(--button-ghost-bg-hover)] hover:text-[var(--button-ghost-fg-hover)]"
        ),
        outline: cn(
          "bg-[var(--button-outline-bg)] text-[var(--button-outline-fg)]",
          "border border-[var(--button-outline-border)]",
          "hover:bg-[var(--button-outline-bg-hover)] hover:border-[var(--color-border-strong)]"
        ),
        destructive: cn(
          "bg-[var(--button-destructive-bg)] text-[var(--button-destructive-fg)]",
          "shadow-[var(--elevation-1)]",
          "hover:bg-[var(--button-destructive-bg-hover)] hover:shadow-[var(--elevation-glow-refuse)]"
        ),
        gradient: cn(
          "text-white",
          "bg-[image:var(--gradient-brand)] bg-[length:200%_100%] bg-left",
          "shadow-[var(--elevation-1)]",
          "hover:bg-right hover:shadow-[var(--elevation-glow-brand)]"
        ),
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** When true, renders the child element instead of a <button> (Radix Slot). */
  asChild?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, asChild = false, isLoading, disabled, children, ...props },
    ref
  ) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        ) : null}
        {children}
      </Comp>
    );
  }
);

/* =====================================================================
 * Card
 * ===================================================================== */

const cardVariants = cva(
  cn(
    "relative rounded-xl",
    "bg-[var(--card-bg)] border border-[var(--card-border)]",
    "transition-[box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out)]"
  ),
  {
    variants: {
      elevation: {
        0: "shadow-none",
        1: "shadow-[var(--elevation-1)]",
        2: "shadow-[var(--elevation-2)]",
        3: "shadow-[var(--elevation-3)]",
        4: "shadow-[var(--elevation-4)]",
      },
      interactive: {
        true: "hover:shadow-[var(--card-shadow-hover)] hover:border-[var(--color-border-default)] cursor-pointer",
        false: "",
      },
      padding: {
        none: "p-0",
        sm:   "p-4",
        md:   "p-6",
        lg:   "p-8",
      },
    },
    defaultVariants: {
      elevation: 1,
      interactive: false,
      padding: "md",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  function Card({ className, elevation, interactive, padding, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ elevation, interactive, padding }), className)}
        {...props}
      />
    );
  }
);

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn("flex flex-col gap-1.5 mb-4", className)} {...props} />;
  }
);

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn("text-lg font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]", className)}
        {...props}
      />
    );
  }
);

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("text-sm text-[var(--color-text-muted)]", className)} {...props} />;
  }
);

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("text-sm text-[var(--color-text-secondary)]", className)} {...props} />;
  }
);

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("mt-4 pt-4 border-t border-[var(--color-border-subtle)] flex items-center gap-3", className)}
        {...props}
      />
    );
  }
);

/* =====================================================================
 * Badge
 * ===================================================================== */

const badgeVariants = cva(
  cn(
    "inline-flex items-center gap-1 rounded-full border",
    "px-2.5 py-0.5 text-xs font-medium",
    "transition-colors duration-[var(--duration-fast)]"
  ),
  {
    variants: {
      variant: {
        trust: cn(
          "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
          "border-[var(--color-trust-border)]"
        ),
        caution: cn(
          "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]",
          "border-[var(--color-caution-border)]"
        ),
        refuse: cn(
          "bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]",
          "border-[var(--color-refuse-border)]"
        ),
        neutral: cn(
          "bg-[var(--color-surface-sunken)] text-[var(--color-text-secondary)]",
          "border-[var(--color-border-subtle)]"
        ),
        brand: cn(
          "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
          "border-[var(--color-brand-border)]"
        ),
        accent: cn(
          "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
          "border-[var(--color-accent-border)]"
        ),
        solid: cn(
          "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
          "border-transparent"
        ),
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge({ className, variant, ...props }, ref) {
    return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
  }
);

/* =====================================================================
 * Chip — like badge but with an optional icon slot, used for sources
 * and governance rules
 * ===================================================================== */

const chipVariants = cva(
  cn(
    "inline-flex items-center gap-1.5 rounded-full border",
    "px-2.5 py-1 text-xs font-medium",
    "transition-colors duration-[var(--duration-fast)]"
  ),
  {
    variants: {
      variant: {
        source: cn(
          "bg-[var(--chip-source-bg)] text-[var(--chip-source-fg)]",
          "border-[var(--chip-source-border)]"
        ),
        rule: cn(
          "bg-[var(--chip-rule-bg)] text-[var(--chip-rule-fg)]",
          "border-[var(--chip-rule-border)]"
        ),
        tag: cn(
          "bg-[var(--chip-tag-bg)] text-[var(--chip-tag-fg)]",
          "border-[var(--chip-tag-border)]"
        ),
      },
    },
    defaultVariants: {
      variant: "tag",
    },
  }
);

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof chipVariants> {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  function Chip({ className, variant, icon, children, ...props }, ref) {
    return (
      <span ref={ref} className={cn(chipVariants({ variant }), className)} {...props}>
        {icon ? (
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span>{children}</span>
      </span>
    );
  }
);

/* =====================================================================
 * Skeleton — shimmer loading placeholder
 * ===================================================================== */

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        className={cn(
          "relative overflow-hidden rounded-md",
          "bg-[var(--color-surface-sunken)]",
          "animate-shimmer-bg",
          className
        )}
        {...props}
      />
    );
  }
);

/* =====================================================================
 * Input — styled to component tokens
 * ===================================================================== */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional label rendered above the input. */
  label?: string;
  /** Inline error message; turns the border red and shows below. */
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, label, error, id, ...props }, ref) {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(
            "h-10 w-full rounded-md px-3 text-sm",
            "bg-[var(--input-bg)] text-[var(--input-fg)]",
            "border border-[var(--input-border)]",
            "placeholder:text-[var(--input-placeholder)]",
            "transition-[border-color,box-shadow,background] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
            "hover:border-[var(--input-border-hover)]",
            "focus:outline-none focus:border-[var(--input-border-focus)] focus:ring-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-1 focus:ring-offset-[var(--color-background)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error ? "border-[var(--color-refuse)]" : "",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-[var(--color-refuse)]">{error}</p>
        ) : null}
      </div>
    );
  }
);

/* =====================================================================
 * Re-exports for convenience
 * ===================================================================== */
export { cn } from "@/lib/design-system";
export { confidenceColor, gradientClass, elevationClass } from "@/lib/design-system";
export type { ConfidenceTone, GradientVariant, Elevation, SemanticTone } from "@/lib/design-system";
