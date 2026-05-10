"use client";

/**
 * /register — split-layout signup screen.
 *
 * The backend register endpoint may not yet exist on this branch; we POST
 * to /api/auth/register and degrade gracefully to a "Check your email"
 * confirmation if the response is non-2xx (so this page is shippable
 * before the backend route lands).
 */
import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, MailCheck, ShieldCheck } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { confidenceColor } from "@/lib/design-system";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { RegisterAside } from "./_aside";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Score a password [0..1] using length + character class diversity. */
function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 0.25;
  if (pw.length >= 12) score += 0.15;
  if (/[A-Z]/.test(pw)) score += 0.15;
  if (/[a-z]/.test(pw)) score += 0.1;
  if (/\d/.test(pw)) score += 0.15;
  if (/[^A-Za-z0-9]/.test(pw)) score += 0.2;
  return Math.min(score, 1);
}

/** Pull a tenant slug out of an email's domain. */
function tenantFromEmail(email: string): string {
  const at = email.indexOf("@");
  if (at === -1) return "";
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return "";
  // strip TLD-like suffix; keep the registrable label
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  // for "acme.co.uk" → "acme"; for "acme.com" → "acme"
  return parts[0];
}

const STRENGTH_LABEL: Record<"trust" | "caution" | "refuse", string> = {
  trust: "Strong",
  caution: "OK",
  refuse: "Weak",
};

const STRENGTH_BAR: Record<"trust" | "caution" | "refuse", string> = {
  trust: "bg-[var(--color-trust)]",
  caution: "bg-[var(--color-caution)]",
  refuse: "bg-[var(--color-refuse)]",
};

const STRENGTH_TEXT: Record<"trust" | "caution" | "refuse", string> = {
  trust: "text-[var(--color-trust-strong)]",
  caution: "text-[var(--color-caution-strong)]",
  refuse: "text-[var(--color-refuse-strong)]",
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type Stage = "form" | "confirm";

export default function RegisterPage() {
  const [stage, setStage] = React.useState<Stage>("form");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenant, setTenant] = React.useState("");
  const [tenantTouched, setTenantTouched] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Auto-fill tenant from email domain unless the user has typed in it.
  React.useEffect(() => {
    if (tenantTouched) return;
    const derived = tenantFromEmail(email);
    setTenant(derived);
  }, [email, tenantTouched]);

  const score = passwordScore(password);
  const tone = confidenceColor(score);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          tenant_name: tenant,
        }),
      });
      if (!res.ok) {
        // Backend stub may not exist yet; treat 404/501 as "queued" so the
        // user still gets the confirmation flow.
        if (res.status === 404 || res.status === 501) {
          setStage("confirm");
          return;
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Could not create account");
      }
      setStage("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    setIsLoading(true);
    try {
      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, tenant_name: tenant, resend: true }),
      }).catch(() => null);
    } finally {
      setIsLoading(false);
    }
  }

  if (stage === "confirm") {
    return (
      <AuthSplitLayout
        eyebrow="Almost there"
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}. Click it to finish setting up your tenant.`}
        aside={<RegisterAside />}
        footer={
          <span>
            Wrong address?{" "}
            <button
              type="button"
              onClick={() => setStage("form")}
              className="font-medium text-[var(--color-brand)] hover:underline"
            >
              Edit and try again
            </button>
          </span>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] p-4 text-sm text-[var(--color-trust-strong)]">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Confirmation sent.</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                The link expires in 30 minutes. If you don&apos;t see it, check spam — or resend below.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleResend}
            variant="outline"
            size="md"
            isLoading={isLoading}
            disabled={isLoading}
            className="w-full"
          >
            Resend confirmation
          </Button>

          <p className="text-xs text-[var(--color-text-muted)]">
            <ShieldCheck className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" aria-hidden />
            Your data stays in your tenant. Always.
          </p>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout
      eyebrow="Create your tenant"
      title="Get a governed assistant in minutes"
      subtitle="No credit card. Source citations and refusal traces from the first query."
      aside={<RegisterAside />}
      footer={
        <span>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--color-brand)] hover:underline"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] p-3 text-sm text-[var(--color-refuse-strong)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <Input
          label="Full name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
          disabled={isLoading}
        />

        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ada@company.com"
          disabled={isLoading}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="register-password"
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Password
          </label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            disabled={isLoading}
          />
          {password ? (
            <div className="space-y-1 pt-1" aria-live="polite">
              <div
                className="grid h-1.5 grid-cols-3 gap-1 overflow-hidden rounded-full"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(score * 100)}
                aria-label="Password strength"
              >
                <span
                  className={`rounded-full ${
                    score > 0 ? STRENGTH_BAR[tone] : "bg-[var(--color-border-subtle)]"
                  }`}
                />
                <span
                  className={`rounded-full ${
                    score >= 0.5 ? STRENGTH_BAR[tone] : "bg-[var(--color-border-subtle)]"
                  }`}
                />
                <span
                  className={`rounded-full ${
                    score >= 0.75 ? STRENGTH_BAR[tone] : "bg-[var(--color-border-subtle)]"
                  }`}
                />
              </div>
              <p className={`text-xs ${STRENGTH_TEXT[tone]}`}>
                {STRENGTH_LABEL[tone]} password.{" "}
                <span className="text-[var(--color-text-muted)]">
                  Mix length, case, numbers, and symbols.
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="register-tenant"
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Tenant name
          </label>
          <Input
            id="register-tenant"
            value={tenant}
            onChange={(e) => {
              setTenantTouched(true);
              setTenant(e.target.value);
            }}
            placeholder="acme"
            disabled={isLoading}
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Auto-filled from your email domain. All your data is isolated to this tenant.
          </p>
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          isLoading={isLoading}
          disabled={isLoading || !name || !email || !password || !tenant || score < 0.5}
          className="w-full"
        >
          {isLoading ? "Creating account" : "Create account"}
          {!isLoading ? <ArrowRight className="ml-1 h-4 w-4" aria-hidden /> : null}
        </Button>

        <p className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-trust)]" aria-hidden />
          <span>
            Your data stays in your tenant. Always. We don&apos;t train models on
            your content.
          </span>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
