"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp, Lock, Save, User as UserIcon } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { SectionCard } from "./section-card";
import { apiPatch, apiPost } from "@/lib/api-client";

interface ProfileSectionProps {
  email: string;
  fullName: string;
  userId: string;
  token: string;
  /** Called after a successful profile update so the parent can refetch /auth/me. */
  onSaved?: () => void;
}

export function ProfileSection({ email, fullName, userId, token, onSaved }: ProfileSectionProps) {
  const [name, setName] = React.useState(fullName);
  const [emailValue, setEmailValue] = React.useState(email);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileMessage, setProfileMessage] = React.useState<{
    kind: "trust" | "refuse";
    text: string;
  } | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [passwordMessage, setPasswordMessage] = React.useState<{
    kind: "trust" | "refuse";
    text: string;
  } | null>(null);
  // Collapse the password form by default — most visits don't change passwords.
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  React.useEffect(() => {
    setName(fullName);
  }, [fullName]);
  React.useEffect(() => {
    setEmailValue(email);
  }, [email]);

  const profileChanged = name !== fullName || emailValue.toLowerCase() !== email.toLowerCase();

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage(null);
    const body: { full_name?: string; email?: string } = {};
    if (name !== fullName) body.full_name = name;
    if (emailValue.toLowerCase() !== email.toLowerCase()) body.email = emailValue;
    try {
      const res = await apiPatch("/api/auth/me", body, token);
      if (res.ok) {
        setProfileMessage({ kind: "trust", text: "Profile updated." });
        onSaved?.();
      } else {
        const err = await res.json().catch(() => ({}));
        setProfileMessage({ kind: "refuse", text: err.detail || `Update failed (${res.status})` });
      }
    } catch (e) {
      setProfileMessage({
        kind: "refuse",
        text: e instanceof Error ? e.message : "Update failed",
      });
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMessage(null), 4000);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage({ kind: "refuse", text: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: "refuse", text: "Passwords don't match." });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await apiPost(
        "/api/auth/change-password",
        { current_password: currentPassword, new_password: newPassword },
        token
      );
      if (res.ok) {
        setPasswordMessage({ kind: "trust", text: "Password changed." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const err = await res.json().catch(() => ({}));
        setPasswordMessage({
          kind: "refuse",
          text: err.detail || `Change failed (${res.status})`,
        });
      }
    } catch (e) {
      setPasswordMessage({
        kind: "refuse",
        text: e instanceof Error ? e.message : "Change failed",
      });
    } finally {
      setChangingPassword(false);
      setTimeout(() => setPasswordMessage(null), 4000);
    }
  };

  return (
    <SectionCard
      title="Profile"
      description="Your personal account details"
      icon={<UserIcon className="h-4 w-4" />}
    >
      <div className="flex flex-col gap-6">
        {/* Profile fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email address"
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <span
              id="settings-user-id-label"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              User ID
            </span>
            <div
              className="flex h-10 items-center rounded-md border border-[var(--input-border)] bg-[var(--color-surface-sunken)] px-3 font-mono text-xs text-[var(--color-text-tertiary)]"
              role="textbox"
              aria-readonly="true"
              aria-labelledby="settings-user-id-label"
            >
              {userId || "—"}
            </div>
          </div>
        </div>
        <Input
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
        />

        {profileMessage ? (
          <div
            className={`rounded-md border p-3 text-sm ${
              profileMessage.kind === "trust"
                ? "border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]"
                : "border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]"
            }`}
          >
            {profileMessage.kind === "trust" ? (
              <Check className="mr-1 inline h-3.5 w-3.5" />
            ) : null}
            {profileMessage.text}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleSaveProfile}
            isLoading={savingProfile}
            disabled={savingProfile || !profileChanged}
          >
            <Save className="h-4 w-4" />
            Save profile
          </Button>
        </div>

        {/* Change password — collapsed by default */}
        <div className="flex flex-col border-t border-[var(--color-border-subtle)] pt-4">
          <button
            type="button"
            onClick={() => setPasswordOpen((v) => !v)}
            aria-expanded={passwordOpen}
            className="flex items-center justify-between rounded-md px-1 py-2 text-left transition-colors hover:bg-[var(--color-surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          >
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[var(--color-text-secondary)]" />
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                Change password
              </span>
            </span>
            {passwordOpen ? (
              <ChevronUp className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            )}
          </button>
          {passwordOpen ? (
            <div className="flex flex-col gap-3 pt-4">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Choose a new password of at least 8 characters. You&rsquo;ll stay signed in on this device.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <Input
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  autoComplete="new-password"
                />
              </div>

              {passwordMessage ? (
                <div
                  className={`rounded-md border p-3 text-sm ${
                    passwordMessage.kind === "trust"
                      ? "border-[var(--color-trust-border)] bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]"
                      : "border-[var(--color-refuse-border)] bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)]"
                  }`}
                >
                  {passwordMessage.text}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={handleChangePassword}
                  isLoading={changingPassword}
                  disabled={
                    changingPassword || !currentPassword || !newPassword || !confirmPassword
                  }
                >
                  <Lock className="h-4 w-4" />
                  Change password
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
