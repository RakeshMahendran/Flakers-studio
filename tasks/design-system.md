# Branch: feat/design-system-overhaul
**Worktree:** `E:\FS-design-system`
**Phase:** 0 — Foundations (RUN FIRST, alongside eval-suite)
**Depends on:** nothing — every frontend branch consumes from this

---

You are in worktree FS-design-system on branch feat/design-system-overhaul.

## GOAL
Replace the bland near-black palette in `client/app/globals.css` with a 2026-grade OKLCH design system: gradient brand identity (indigo→cyan), governance-aware semantic colors (emerald=trust, amber=caution, rose=refuse), and proper component tokens. Add a typography scale, motion presets, elevation, and a per-component token layer. Preserve dark-mode parity.

## READ FIRST
1. `client/app/globals.css` — current tokens (Tailwind v4 @theme inline pattern is already in place)
2. `client/app/layout.tsx` — font loading
3. `client/package.json` — Tailwind v4 + Radix already there
4. `client/src/components/flakers-studio/screens/dashboard-screen.tsx` — spot-check current usage of color classes

## DELIVERABLES

### 1. Rewrite `client/app/globals.css` with three token layers (base → semantic → component)

**BASE TOKENS (raw OKLCH values), example pattern:**
```css
--brand-50: oklch(0.98 0.02 270);
--brand-500: oklch(0.60 0.18 270);   /* indigo */
--brand-700: oklch(0.45 0.20 275);
--accent-cyan-500: oklch(0.75 0.15 200);
--accent-cyan-300: oklch(0.85 0.12 200);
/* Governance-specific */
--trust-500: oklch(0.70 0.18 160);   /* emerald — ANSWER */
--trust-100: oklch(0.95 0.05 160);
--caution-500: oklch(0.78 0.15 75);  /* amber — low-confidence */
--refuse-500: oklch(0.65 0.20 25);   /* rose — REFUSE */
--refuse-100: oklch(0.95 0.04 25);
/* Neutrals (warm-tinted, not pure gray) */
--neutral-50  through --neutral-950 in oklch(... 0.005 270) — slight indigo tint
```

**SEMANTIC TOKENS (purpose-driven, light + dark):**
- `--color-background`, `--color-surface`, `--color-surface-elevated`
- `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- `--color-brand`, `--color-brand-hover`, `--color-brand-foreground`
- `--color-trust`, `--color-trust-soft` (background tint), `--color-trust-border`
- `--color-refuse`, `--color-refuse-soft`, `--color-refuse-border`
- `--color-border-subtle`, `--color-border-default`, `--color-border-strong`
- `--color-focus-ring` (use accent-cyan-500 for visible focus)

**COMPONENT TOKENS (per-pattern):**
- `--card-bg`, `--card-border`, `--card-shadow`
- `--button-primary-bg`, `--button-primary-fg`, `--button-ghost-bg`
- `--input-bg`, `--input-border`, `--input-border-focus`
- `--chip-source-bg` (subtle cyan), `--chip-rule-bg` (subtle indigo)

**GRADIENTS (CSS custom props):**
```css
--gradient-brand: linear-gradient(135deg, oklch(0.60 0.18 270), oklch(0.75 0.15 200));
--gradient-trust: linear-gradient(135deg, oklch(0.70 0.18 160), oklch(0.75 0.15 200));
--gradient-refuse: linear-gradient(135deg, oklch(0.65 0.20 25), oklch(0.78 0.15 75));
--gradient-mesh-bg: /* multi-stop radial mesh for hero backgrounds, low opacity */
```

**ELEVATION (replace flat borders):**
```css
--elevation-1: 0 1px 2px oklch(0 0 0 / 0.04), 0 1px 3px oklch(0 0 0 / 0.06);
--elevation-2: 0 4px 8px -2px oklch(0 0 0 / 0.06), 0 2px 4px -2px oklch(0 0 0 / 0.04);
--elevation-3: 0 12px 24px -6px oklch(0 0 0 / 0.08), 0 4px 8px -4px oklch(0 0 0 / 0.04);
--elevation-glow-brand: 0 0 24px -4px oklch(0.60 0.18 270 / 0.4);
```

**TYPOGRAPHY SCALE:**
- `--text-xs` through `--text-display` (0.75rem to 2.5rem with line-heights)
- Letter-spacing tighter on display, looser on uppercase chips

**MOTION TOKENS:**
```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* Vercel-style spring-out */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
--duration-fast: 120ms;
--duration-base: 200ms;
--duration-slow: 320ms;
```

Map all of the above into the `@theme inline` block so utility classes work (`bg-brand`, `text-trust`, `shadow-elevation-2`, etc.)

### 2. Dark mode parity
`.dark` selector MUST mirror every semantic token. Backgrounds shift to `oklch(0.16 0.01 270)` (slight indigo tint, NOT pure black). Brand becomes the cyan end of the gradient (`oklch(0.75 0.15 200)`) for better contrast.

### 3. New file: `client/src/lib/design-system.ts`
Export typed helpers:
- `cn()` (clsx + tailwind-merge — likely already exists, consolidate here)
- `gradientClass(variant: "brand" | "trust" | "refuse")` → string
- `confidenceColor(score: number)` → `"trust" | "caution" | "refuse"` semantic name
  (≥0.75 → trust, 0.5–0.75 → caution, <0.5 → refuse)

### 4. New file: `client/src/components/ui/primitives.tsx`
Light-weight shadcn-style primitives wired to the new tokens. NO heavy library — copy-paste pattern:
- `<Button variant="primary"|"ghost"|"outline"|"destructive" size="sm"|"md"|"lg" />`
- `<Card>` with elevation prop
- `<Badge variant="trust"|"caution"|"refuse"|"neutral"|"brand" />`
- `<Chip variant="source"|"rule"|"tag" />` with optional icon slot
- `<Skeleton>` shimmer using `--gradient-mesh-bg` animated

### 5. New file: `client/src/styles/animations.css` (imported by globals.css)
Keyframes:
- `shimmer` (for skeletons)
- `pulse-trust` (subtle emerald glow on confirmed answers)
- `rule-cascade` (governance rules animate in sequentially with stagger)
- `mesh-drift` (slow background mesh animation for hero/empty states)

### 6. Internal style-guide page
Add a `/design` route at `client/app/(dashboard)/design/page.tsx` — internal style-guide page rendering every primitive at every state. Not linked from nav; reachable by typing the URL. This becomes the canary for other branches.

## CONSTRAINTS
- Tailwind v4 only — do NOT downgrade or import shadcn-cli generated files (we own the tokens directly).
- Do NOT touch any `*.tsx` file outside the new `/design` route or new `ui/` primitives. Other frontend branches depend on tokens existing but components untouched.
- No new heavy dependencies. framer-motion, lucide-react, radix already in package.json — use them.
- Dark mode parity is non-negotiable. Every semantic token must work in both.
- Accessibility: every color pair used for text must hit WCAG AA (4.5:1 for body, 3:1 for large). Verify the brand-on-background combos.

## ACCEPTANCE
- `/design` page renders cleanly in light + dark.
- `npm run build` passes.
- Visiting an existing screen (dashboard) doesn't visually break (token names compatible — fall back where renamed).
- Color contrast hits AA on every documented combo.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `backend/services/governance.py` or any backend file.

Stop before committing. Take a screenshot of `/design` in both modes and report it to the user.
