"use client";

/**
 * SettingsScreen — account & organization settings.
 *
 * Left-nav layout (sections are anchor-scrolled, not separate pages):
 *   - Profile
 *   - Organization
 *   - Members
 *   - Sign out
 *
 * All sections are wired to live backend endpoints. On narrow viewports
 * the left nav collapses to anchor pills that scroll horizontally.
 */
import * as React from "react";
import { AlertTriangle, Building2, User as UserIcon, Users } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { apiGet } from "@/lib/api-client";
import { useAppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

import { ProfileSection } from "@/components/settings/profile-section";
import { TenantSection } from "@/components/settings/tenant-section";
import { DangerZone } from "@/components/settings/danger-zone";

interface MeResponse {
  user_id?: string;
  id?: string;
  email: string;
  full_name?: string;
  fullName?: string;
  name?: string;
  tenant_id?: string;
  tenantId?: string;
  tenant_name?: string;
  tenantName?: string;
  role?: string;
}

interface NavSection {
  id: "profile" | "organization" | "danger";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: NavSection[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "danger", label: "Sign out", icon: AlertTriangle },
];

export function SettingsScreen() {
  const { user } = useAuth();
  const shell = useAppShell();
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeSection, setActiveSection] = React.useState<NavSection["id"]>("profile");

  React.useEffect(() => {
    shell.registerAssistants([]);
    shell.registerRecents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMe = React.useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiGet("/api/auth/me", user.accessToken);
      if (res.ok) {
        setMe((await res.json()) as MeResponse);
      }
    } catch (err) {
      console.error("Failed to refresh /auth/me:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Track which section is in view as the user scrolls.
  React.useEffect(() => {
    if (loading) return;
    const observers: IntersectionObserver[] = [];
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (!el) continue;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveSection(section.id);
              break;
            }
          }
        },
        { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [loading]);

  const scrollTo = (id: NavSection["id"]) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const email = me?.email ?? user?.email ?? "";
  const userId = me?.user_id ?? me?.id ?? user?.id ?? "";
  const fullName = me?.full_name ?? me?.fullName ?? me?.name ?? "";
  const tenantId = me?.tenant_id ?? me?.tenantId ?? user?.tenantId ?? "";
  const tenantName = me?.tenant_name ?? me?.tenantName ?? user?.tenantName ?? "";
  const role = me?.role;

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <Skeleton className="h-40 hidden lg:block" />
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-60 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          Settings
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Manage your profile, organization, and account preferences.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        {/* Left nav (desktop) / horizontal pills (mobile) */}
        <nav
          aria-label="Settings sections"
          className={cn(
            "sticky top-20 z-10 lg:self-start",
            "flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          )}
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                  "lg:w-full lg:justify-start",
                  active
                    ? "bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]"
                )}
                aria-current={active ? "true" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Sections */}
        <div className="flex flex-col gap-6">
          <section id="profile" className="scroll-mt-24">
            <ProfileSection
              email={email}
              fullName={fullName}
              userId={userId}
              token={user?.accessToken ?? ""}
              onSaved={fetchMe}
            />
          </section>
          <section id="organization" className="scroll-mt-24">
            <TenantSection
              tenantId={tenantId}
              tenantName={tenantName}
              token={user?.accessToken ?? ""}
              role={role}
              onSaved={fetchMe}
            />
          </section>
          <section id="danger" className="scroll-mt-24">
            <DangerZone />
          </section>
        </div>
      </div>
    </div>
  );
}
