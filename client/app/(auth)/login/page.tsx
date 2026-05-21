"use client";

/**
 * /login — split-layout login screen.
 *
 * Composes <AuthSplitLayout> with the design-system primitives. Auth flow
 * matches the existing backend contract handled by `/api/auth/login` +
 * `/api/auth/me` and the legacy `<LoginScreen />` component — we kept the
 * call shape identical so `auth-context.tsx` does not need changes.
 */
import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { useAuth } from "@/contexts/auth-context";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { LoginAside } from "./_aside";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginResponse.json().catch(() => null);
      if (!loginResponse.ok || !loginData) {
        throw new Error(loginData?.detail || "Login failed");
      }

      const profileResponse = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${loginData.access_token}` },
      });
      const profileData = await profileResponse.json().catch(() => null);
      if (!profileResponse.ok || !profileData) {
        throw new Error(profileData?.detail || "Failed to load user profile");
      }

      login({
        id: loginData.user_id,
        email: profileData.email ?? email,
        tenantId: loginData.tenant_id,
        tenantName: profileData.tenant_name,
        accessToken: loginData.access_token,
        refreshToken: loginData.refresh_token,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Pick up where your assistants left off."
      aside={<LoginAside />}
      footer={
        <span>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-[var(--color-brand)] hover:underline"
          >
            Create one
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
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={isLoading}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[var(--color-brand)] hover:underline"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          isLoading={isLoading}
          disabled={isLoading || !email || !password}
          className="w-full"
        >
          {isLoading ? "Signing in" : "Sign in"}
          {!isLoading ? <ArrowRight className="ml-1 h-4 w-4" aria-hidden /> : null}
        </Button>

      </form>
    </AuthSplitLayout>
  );
}

/* ----- inline brand glyph kept for future OAuth wiring ----- */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GoogleGlyph() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 18 18"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.717v2.258h2.908c1.702-1.567 2.685-3.874 2.685-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.712A5.41 5.41 0 0 1 3.682 9c0-.594.102-1.17.282-1.712V4.957H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.043l3.007-2.331Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.957L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
