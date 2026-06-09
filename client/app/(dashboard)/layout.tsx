"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Require an authenticated session AND a valid access token.
    // A stored user without accessToken (stale or partial session) would
    // pass every UI check but every API call would 401 with
    // "Authorization header required". Clearing the broken object and
    // routing to /login forces a fresh login so a real token lands.
    if (typeof window === "undefined") return;

    let cancelled = false;

    const bounce = (sessionExpired: boolean) => {
      try {
        window.localStorage.removeItem("user");
      } catch {
        // ignore - we still redirect
      }
      router.push(sessionExpired ? "/login?session_expired=1" : "/login");
    };

    const raw = localStorage.getItem("user");
    if (!raw) {
      router.push("/login");
      return;
    }

    let token: string | undefined;
    try {
      const parsed = JSON.parse(raw) as { accessToken?: string } | null;
      token = parsed?.accessToken;
      if (!token) {
        bounce(false);
        return;
      }
    } catch {
      bounce(false);
      return;
    }

    // Lightweight liveness probe: stale tabs sitting on a long-expired
    // token would otherwise hit the first real API call deep in a wizard
    // and surface an opaque error. /api/auth/me is cheap and tells us
    // immediately whether the JWT still validates.
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 401) {
          bounce(true);
          return;
        }
        // For any other failure (500, network), let the user proceed —
        // they may still have a valid token and the backend may just be
        // flaky. The api-client's per-call 401 handler will catch a stale
        // token later if /auth/me itself was the anomaly.
        setIsChecking(false);
      } catch {
        if (cancelled) return;
        // Network error — don't block the dashboard. The user has a token
        // that LOOKS valid; let the UI render and downstream calls decide.
        setIsChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Show nothing while checking auth to prevent flash
  if (isChecking) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
