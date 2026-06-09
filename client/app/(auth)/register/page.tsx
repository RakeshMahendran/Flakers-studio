"use client";

/**
 * /register — split-layout signup screen.
 *
 * The backend `/auth/register` endpoint creates the user immediately and
 * returns a full AuthResponse with access_token. We use that to sign the
 * user in directly and redirect to /dashboard — no email confirmation
 * stage, because no SMTP is wired (and faking a "Check your email"
 * screen for an email that never arrives is worse than just signing in).
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { confidenceColor } from "@/lib/design-system";
import { useAuth } from "@/contexts/auth-context";
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

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
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
          email,
          password,
          full_name: name,
          tenant_name: tenant,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.detail || "Could not create account");
      }

      // Backend returns AuthResponse directly (access_token, refresh_token,
      // user_id, tenant_id). Fetch /auth/me to get the human-readable
      // tenant_name and full profile shape, then sign the user in.
      const profileRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const profile = await profileRes.json().catch(() => null);
      if (!profileRes.ok || !profile) {
        throw new Error(profile?.detail || "Account created, but profile lookup failed. Try signing in.");
      }

      login({
        id: data.user_id,
        email: profile.email ?? email,
        tenantId: data.tenant_id,
        tenantName: profile.tenant_name,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      // login() already pushes to /dashboard; no further action.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
      setIsLoading(false);
    }
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
          <div className="relative">
            <Input
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={isLoading}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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
