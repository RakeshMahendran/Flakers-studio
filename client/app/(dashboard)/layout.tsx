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
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("user");
      if (!raw) {
        router.push("/login");
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { accessToken?: string } | null;
        if (!parsed?.accessToken) {
          localStorage.removeItem("user");
          router.push("/login");
          return;
        }
      } catch {
        localStorage.removeItem("user");
        router.push("/login");
        return;
      }
      setIsChecking(false);
    }
  }, [router]);

  // Show nothing while checking auth to prevent flash
  if (isChecking) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
