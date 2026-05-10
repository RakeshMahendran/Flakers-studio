"use client";

/**
 * /forgot-password — single-field email form. Posts to
 * `/api/v1/auth/forgot-password` (frontend stub at `/api/auth/forgot-password`).
 *
 * The API stub never reveals whether an email exists in the system —
 * it simply returns 200 OK. That's intentional (account-enumeration
 * resistance) and the UI matches: regardless of what the user types,
 * we show the "If an account exists, we sent a reset link" state.
 */
import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { Button, Card, Chip, Input } from "@/components/ui/primitives";
import { ShieldCheck } from "lucide-react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";

type Stage = "form" | "sent";

export default function ForgotPasswordPage() {
  const [stage, setStage] = React.useState<Stage>("form");
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Frontend stub — backend route may or may not be live. We always
      // present a successful "sent" UX so we don't leak account existence.
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => null);
      setStage("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthSplitLayout
      eyebrow="Reset access"
      title={stage === "form" ? "Forgot your password?" : "Check your inbox"}
      subtitle={
        stage === "form"
          ? "Enter the email tied to your tenant. We'll send a one-time reset link."
          : "If an account exists for that email, a reset link is on the way. The link expires in 30 minutes."
      }
      aside={<ForgotAside />}
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-medium text-[var(--color-brand)] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to sign in
        </Link>
      }
    >
      {stage === "form" ? (
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
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            disabled={isLoading}
          />

          <Button
            type="submit"
            variant="gradient"
            size="lg"
            isLoading={isLoading}
            disabled={isLoading || !email}
            className="w-full"
          >
            {isLoading ? "Sending" : "Send reset link"}
            {!isLoading ? <ArrowRight className="ml-1 h-4 w-4" aria-hidden /> : null}
          </Button>

          <p className="text-xs text-[var(--color-text-muted)]">
            For your protection, we won&apos;t reveal whether an account
            exists for a given email.
          </p>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] p-4 text-sm text-[var(--color-trust-strong)]">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Reset link sent.</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                Open the link from your inbox to choose a new password.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="md"
            isLoading={isLoading}
            disabled={isLoading}
            onClick={async (ev) => {
              ev.preventDefault();
              setIsLoading(true);
              await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, resend: true }),
              }).catch(() => null);
              setIsLoading(false);
            }}
            className="w-full"
          >
            Resend reset link
          </Button>
        </div>
      )}
    </AuthSplitLayout>
  );
}

function ForgotAside() {
  return (
    <div className="space-y-6">
      <Chip variant="rule" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
        Account-enumeration safe
      </Chip>
      <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
        Reset, without leaking{" "}
        <span className="text-gradient-brand">who&apos;s on the system.</span>
      </h2>
      <Card elevation={1} padding="lg" className="bg-[var(--color-surface)]/85 backdrop-blur-sm">
        <p className="text-sm text-[var(--color-text-secondary)]">
          We respond identically whether or not the email exists. Reset links
          are one-time, expire in 30 minutes, and are tied to the device and
          tenant they were issued for.
        </p>
      </Card>
    </div>
  );
}
