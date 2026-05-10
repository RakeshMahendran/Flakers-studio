import { TOKEN_VARS } from "./tokens";

/**
 * Build the widget's stylesheet. The output is injected as a single `<style>`
 * tag inside the shadow root, so:
 *  - host page styles cannot bleed in (shadow boundary)
 *  - the widget's selectors cannot bleed out
 *  - tenants can still override `--fsw-primary` / `--fsw-accent` via the
 *    options API by re-setting them on the shadow host element
 *
 * The CSS is intentionally token-driven. Theme overrides flip
 * `--fsw-gradient-start` / `--fsw-gradient-end`, and every gradient surface
 * derives from `--fsw-gradient`.
 */
export function buildStylesheet(opts: {
  primaryColor: string;
  accentColor: string;
  bubblePx: number;
}): string {
  const { primaryColor, accentColor, bubblePx } = opts;

  return `
/* =====================================================================
 * FlakersStudio widget — shadow-DOM stylesheet
 * Reset only what's necessary; box-sizing is universally enforced so
 * inherited host styles cannot warp the layout even if shadow leak
 * regressions ever occur.
 * ===================================================================== */
:host, :host * { box-sizing: border-box; }
:host {
  all: initial;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: ${TOKEN_VARS.textPrimary};

  /* THEME — these three are overridable via host.style.setProperty(...) */
  --fsw-gradient-start: ${primaryColor};
  --fsw-gradient-end:   ${accentColor};
  --fsw-gradient: linear-gradient(135deg, var(--fsw-gradient-start) 0%, var(--fsw-gradient-end) 100%);

  /* Token bridge */
  --fsw-surface:        ${TOKEN_VARS.surface};
  --fsw-surface-sunken: ${TOKEN_VARS.surfaceSunken};
  --fsw-surface-muted:  ${TOKEN_VARS.surfaceMuted};
  --fsw-text:           ${TOKEN_VARS.textPrimary};
  --fsw-text-2:         ${TOKEN_VARS.textSecondary};
  --fsw-text-muted:     ${TOKEN_VARS.textMuted};
  --fsw-text-on-brand:  ${TOKEN_VARS.textOnBrand};
  --fsw-border:         ${TOKEN_VARS.borderDefault};
  --fsw-border-subtle:  ${TOKEN_VARS.borderSubtle};
  --fsw-trust:          ${TOKEN_VARS.trust};
  --fsw-trust-soft:     ${TOKEN_VARS.trustSoft};
  --fsw-caution:        ${TOKEN_VARS.caution};
  --fsw-refuse:         ${TOKEN_VARS.refuse};
  --fsw-refuse-soft:    ${TOKEN_VARS.refuseSoft};
  --fsw-refuse-strong:  ${TOKEN_VARS.refuseStrong};
  --fsw-accent-soft:    ${TOKEN_VARS.accentSoft};
  --fsw-accent-700:     ${TOKEN_VARS.accent700};
  --fsw-accent-200:     ${TOKEN_VARS.accent200};
  --fsw-brand-soft:     ${TOKEN_VARS.brandSoft};
  --fsw-brand-700:      ${TOKEN_VARS.brand700};
  --fsw-brand-200:      ${TOKEN_VARS.brand200};
  --fsw-focus:          ${TOKEN_VARS.focusRing};
  --fsw-elev-1:         ${TOKEN_VARS.elevation1};
  --fsw-elev-3:         ${TOKEN_VARS.elevation3};
  --fsw-elev-4:         ${TOKEN_VARS.elevation4};
  --fsw-glow:           ${TOKEN_VARS.glowBrand};
  --fsw-ease-out:       ${TOKEN_VARS.easeOut};
  --fsw-ease-spring:    ${TOKEN_VARS.easeSpring};
}

/* Root container — fixed-position viewport overlay */
.fsw-root {
  position: fixed;
  z-index: 2147483000;
  pointer-events: none; /* let host page receive clicks where the widget isn't */
}
.fsw-root[data-position="bottom-right"] { right: 24px; bottom: 24px; }
.fsw-root[data-position="bottom-left"]  { left:  24px; bottom: 24px; }
.fsw-root[data-position="top-right"]    { right: 24px; top:    24px; }
.fsw-root[data-position="top-left"]     { left:  24px; top:    24px; }

.fsw-root > * { pointer-events: auto; }

/* =====================================================================
 * LAUNCHER
 * 56px circle by default with brand gradient + glow. Sizes:
 *   sm = 48, md = 56 (default), lg = 64
 * ===================================================================== */
.fsw-launcher {
  position: relative;
  width: ${bubblePx}px;
  height: ${bubblePx}px;
  border-radius: 9999px;
  border: none;
  background: var(--fsw-gradient);
  color: var(--fsw-text-on-brand);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--fsw-elev-3), var(--fsw-glow);
  transition:
    transform 200ms var(--fsw-ease-spring),
    box-shadow 200ms var(--fsw-ease-out),
    opacity 160ms var(--fsw-ease-out);
  -webkit-tap-highlight-color: transparent;
}
.fsw-launcher:hover {
  transform: scale(1.05);
  box-shadow:
    0 12px 28px -6px oklch(0 0 0 / 0.18),
    0 0 36px -2px oklch(0.60 0.18 270 / 0.55);
}
.fsw-launcher:focus-visible {
  outline: 2px solid var(--fsw-focus);
  outline-offset: 3px;
}
.fsw-launcher:active { transform: scale(0.97); }

.fsw-launcher__icon { width: 50%; height: 50%; }
.fsw-launcher__icon svg { width: 100%; height: 100%; }

.fsw-unread {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: ${TOKEN_VARS.refuse};
  border: 2px solid var(--fsw-text-on-brand);
  box-shadow: 0 0 0 0 oklch(0.65 0.20 25 / 0.6);
  animation: fsw-pulse 1.6s var(--fsw-ease-out) infinite;
}
@keyframes fsw-pulse {
  0%   { box-shadow: 0 0 0 0 oklch(0.65 0.20 25 / 0.6); }
  70%  { box-shadow: 0 0 0 10px oklch(0.65 0.20 25 / 0); }
  100% { box-shadow: 0 0 0 0 oklch(0.65 0.20 25 / 0); }
}

.fsw-hidden { display: none !important; }

/* =====================================================================
 * PANEL
 * 380×600 by default; full-screen below 500px viewport.
 * Slides up from the launcher with origin transform.
 * ===================================================================== */
.fsw-panel {
  position: absolute;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 600px;
  max-height: calc(100vh - 96px);
  background: var(--fsw-surface);
  border: 1px solid var(--fsw-border-subtle);
  border-radius: 20px;
  box-shadow: var(--fsw-elev-4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  transform: translateY(12px) scale(0.96);
  transform-origin: bottom right;
  transition:
    opacity 220ms var(--fsw-ease-out),
    transform 280ms var(--fsw-ease-spring);
  pointer-events: none;
}
.fsw-root[data-position$="-left"] .fsw-panel { transform-origin: bottom left; }
.fsw-root[data-position^="top-"]  .fsw-panel { transform-origin: top right; }
.fsw-root[data-position="top-left"] .fsw-panel { transform-origin: top left; }

.fsw-root[data-position^="bottom-"] .fsw-panel { bottom: ${bubblePx + 16}px; }
.fsw-root[data-position^="top-"]    .fsw-panel { top:    ${bubblePx + 16}px; }
.fsw-root[data-position$="-right"]  .fsw-panel { right: 0; }
.fsw-root[data-position$="-left"]   .fsw-panel { left:  0; }

.fsw-panel--open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

@media (max-width: 500px) {
  .fsw-panel {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    max-width: 100vw;
    border-radius: 0;
    inset: 0 !important;
  }
}

/* =====================================================================
 * HEADER
 * ===================================================================== */
.fsw-header {
  position: relative;
  padding: 16px 16px 14px;
  background: var(--fsw-gradient);
  color: var(--fsw-text-on-brand);
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}
.fsw-header__strip {
  position: absolute;
  inset: auto 0 0 0;
  height: 2px;
  background: linear-gradient(90deg,
    oklch(1 0 0 / 0) 0%,
    oklch(1 0 0 / 0.45) 50%,
    oklch(1 0 0 / 0) 100%);
}
.fsw-avatar {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: oklch(1 0 0 / 0.18);
  border: 1px solid oklch(1 0 0 / 0.28);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  font-weight: 700;
  font-size: 14px;
}
.fsw-avatar img { width: 100%; height: 100%; object-fit: cover; }
.fsw-header__heading { flex: 1 1 auto; min-width: 0; }
.fsw-header__title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fsw-header__subtitle {
  margin-top: 2px;
  font-size: 11.5px;
  opacity: 0.85;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fsw-status-dot {
  width: 6px; height: 6px; border-radius: 9999px;
  background: ${TOKEN_VARS.trust};
  box-shadow: 0 0 8px ${TOKEN_VARS.trust};
}
.fsw-iconbtn {
  flex: 0 0 auto;
  width: 30px; height: 30px;
  border-radius: 9999px;
  background: oklch(1 0 0 / 0.16);
  border: none;
  color: var(--fsw-text-on-brand);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 160ms var(--fsw-ease-out);
}
.fsw-iconbtn:hover { background: oklch(1 0 0 / 0.28); }
.fsw-iconbtn:focus-visible {
  outline: 2px solid var(--fsw-text-on-brand);
  outline-offset: 1px;
}
.fsw-iconbtn svg { width: 14px; height: 14px; }

/* =====================================================================
 * BODY (message stream)
 * ===================================================================== */
.fsw-body {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 14px 8px;
  background: var(--fsw-surface-muted);
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
}
.fsw-body::-webkit-scrollbar { width: 6px; }
.fsw-body::-webkit-scrollbar-thumb {
  background: oklch(0 0 0 / 0.12);
  border-radius: 9999px;
}

/* User bubble */
.fsw-msg-user {
  align-self: flex-end;
  max-width: 86%;
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  background: var(--fsw-gradient);
  color: var(--fsw-text-on-brand);
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  box-shadow: var(--fsw-elev-1);
  animation: fsw-rise 220ms var(--fsw-ease-out) both;
}

/* Assistant bubble (plain text fallback when no decision metadata) */
.fsw-msg-assistant {
  align-self: flex-start;
  max-width: 92%;
  padding: 10px 14px;
  border-radius: 16px 16px 16px 4px;
  background: var(--fsw-surface);
  color: var(--fsw-text);
  border: 1px solid var(--fsw-border-subtle);
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  animation: fsw-rise 220ms var(--fsw-ease-out) both;
}

@keyframes fsw-rise {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* System / banner messages (e.g. errors) */
.fsw-msg-system {
  align-self: stretch;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--fsw-refuse-soft);
  color: var(--fsw-refuse-strong);
  border: 1px solid ${TOKEN_VARS.refuseBorder};
  font-size: 12.5px;
}

/* =====================================================================
 * MINI ANSWER CARD
 * Mirrors the dashboard AnswerCard concept — gradient stripe, source chips,
 * confidence dot — but compact for 380px width.
 * ===================================================================== */
.fsw-card {
  align-self: flex-start;
  width: 100%;
  background: var(--fsw-surface);
  border: 1px solid var(--fsw-border-subtle);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--fsw-elev-1);
  animation: fsw-rise 240ms var(--fsw-ease-out) both;
}
.fsw-card__stripe {
  height: 3px;
  background: var(--fsw-gradient);
}
.fsw-card--refuse .fsw-card__stripe { background: var(--fsw-refuse); }
.fsw-card__body { padding: 12px 14px; }
.fsw-card__text {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--fsw-text);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.fsw-card__sources {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.fsw-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  text-decoration: none;
  border: 1px solid var(--fsw-accent-200);
  background: var(--fsw-accent-soft);
  color: var(--fsw-accent-700);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 160ms var(--fsw-ease-out);
}
.fsw-chip:hover { background: oklch(0.94 0.05 200); }
.fsw-chip__more {
  background: ${TOKEN_VARS.surfaceSunken};
  border-color: var(--fsw-border);
  color: var(--fsw-text-2);
  cursor: pointer;
}
.fsw-chip__rule {
  background: var(--fsw-brand-soft);
  border-color: var(--fsw-brand-200);
  color: var(--fsw-brand-700);
}

.fsw-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid var(--fsw-border-subtle);
  background: ${TOKEN_VARS.surfaceMuted};
  font-size: 11px;
  color: var(--fsw-text-muted);
}
.fsw-conf {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.fsw-conf__dot {
  width: 7px; height: 7px; border-radius: 9999px;
  background: ${TOKEN_VARS.trust};
  box-shadow: 0 0 0 2px oklch(0.70 0.18 160 / 0.18);
}
.fsw-card--refuse .fsw-conf__dot { background: ${TOKEN_VARS.refuse}; box-shadow: 0 0 0 2px oklch(0.65 0.20 25 / 0.18); }
.fsw-card--caution .fsw-conf__dot { background: ${TOKEN_VARS.caution}; box-shadow: 0 0 0 2px oklch(0.78 0.15 75 / 0.18); }

/* =====================================================================
 * REFUSAL CARD (variant of mini AnswerCard with amber-rose strip)
 * ===================================================================== */
.fsw-refuse-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 9999px;
  background: var(--fsw-refuse-soft);
  color: var(--fsw-refuse-strong);
  border: 1px solid ${TOKEN_VARS.refuseBorder};
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

/* =====================================================================
 * TYPING INDICATOR
 * ===================================================================== */
.fsw-typing {
  align-self: flex-start;
  padding: 10px 14px;
  border-radius: 16px 16px 16px 4px;
  background: var(--fsw-surface);
  border: 1px solid var(--fsw-border-subtle);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: var(--fsw-elev-1);
}
.fsw-typing span {
  width: 6px; height: 6px; border-radius: 9999px;
  background: var(--fsw-text-muted);
  animation: fsw-bounce 1.2s var(--fsw-ease-out) infinite;
}
.fsw-typing span:nth-child(2) { animation-delay: 0.15s; }
.fsw-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes fsw-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-4px); opacity: 1; }
}

/* =====================================================================
 * COMPOSER
 * ===================================================================== */
.fsw-composer {
  flex: 0 0 auto;
  padding: 10px 12px 12px;
  background: var(--fsw-surface);
  border-top: 1px solid var(--fsw-border-subtle);
}
.fsw-composer__row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--fsw-surface-sunken);
  border: 1px solid var(--fsw-border);
  border-radius: 14px;
  padding: 6px 6px 6px 12px;
  transition: border-color 160ms var(--fsw-ease-out), box-shadow 160ms var(--fsw-ease-out);
}
.fsw-composer__row:focus-within {
  border-color: var(--fsw-focus);
  box-shadow: 0 0 0 3px oklch(0.75 0.15 200 / 0.18);
}
.fsw-textarea {
  flex: 1 1 auto;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font: inherit;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--fsw-text);
  padding: 6px 0;
  max-height: 120px;
  min-height: 22px;
  font-family: inherit;
}
.fsw-textarea::placeholder { color: var(--fsw-text-muted); }
.fsw-send {
  flex: 0 0 auto;
  width: 32px; height: 32px;
  border-radius: 10px;
  border: none;
  background: var(--fsw-gradient);
  color: var(--fsw-text-on-brand);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px -2px oklch(0.60 0.18 270 / 0.35);
  transition: transform 160ms var(--fsw-ease-spring), opacity 160ms var(--fsw-ease-out);
}
.fsw-send:hover { transform: scale(1.06); }
.fsw-send:active { transform: scale(0.95); }
.fsw-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.fsw-send svg { width: 14px; height: 14px; }

.fsw-footer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--fsw-text-muted);
}
.fsw-footer-meta a {
  color: var(--fsw-text-muted);
  text-decoration: none;
  font-weight: 500;
}
.fsw-footer-meta a:hover { color: var(--fsw-text-2); }
.fsw-footer-meta strong {
  background: var(--fsw-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 700;
}

/* =====================================================================
 * REDUCED MOTION
 * ===================================================================== */
@media (prefers-reduced-motion: reduce) {
  .fsw-launcher,
  .fsw-panel,
  .fsw-msg-user,
  .fsw-msg-assistant,
  .fsw-card,
  .fsw-typing span,
  .fsw-unread,
  .fsw-send {
    animation: none !important;
    transition-duration: 0.001ms !important;
  }
}
`;
}
