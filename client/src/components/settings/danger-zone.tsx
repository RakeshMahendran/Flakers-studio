"use client";

import * as React from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { SectionCard } from "./section-card";
import { useAuth } from "@/contexts/auth-context";

/**
 * Danger zone — destructive account actions.
 * Currently only sign-out; account deletion would land here when backend supports it.
 */
export function DangerZone() {
  const { logout } = useAuth();

  return (
    <SectionCard
      title="Danger zone"
      description="Account actions that affect your access"
      icon={<AlertTriangle className="h-4 w-4 text-[var(--color-refuse)]" />}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">Sign out</span>
            <span className="text-xs text-[var(--color-text-secondary)]">
              End your current session and return to the login screen.
            </span>
          </div>
          <Button variant="destructive" size="sm" onClick={logout} type="button">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
