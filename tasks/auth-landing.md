# Branch: feat/auth-and-landing
**Worktree:** `E:\FS-auth-landing`
**Phase:** 1b — Frontend tokens cascade
**Depends on:** design-system merged

---

You are in worktree FS-auth-landing on branch feat/auth-and-landing.

## GOAL
Login and signup currently look like a generic admin form. Make them match the new brand: gradient hero, governance-first marketing copy, social proof, and a polished form. Add a public marketing landing at `/`.

## READ FIRST
1. `client/src/components/flakers-studio/screens/login-screen.tsx`
2. `client/app/(auth)/` — current auth routes
3. `client/src/contexts/auth-context.tsx` — auth flow
4. `client/src/lib/design-system.ts` and `ui/primitives.tsx`

## DELIVERABLES

### 1. Public landing at `client/app/page.tsx` (top-level)
- Top nav: logo + Pricing / Docs / Login + "Get started" CTA
- Hero: full-bleed gradient mesh background, headline:
  > "AI assistants that show their work."
  Sub: "Every answer cites its sources, every refusal explains why. Six governance rules enforced by design."
- Hero CTA: "Start free" (gradient) + "See it live" (ghost, opens demo widget)
- Trust strip: "Backed by governance, not vibes" + 6 rule chips horizontally
- Feature section (3 cards): Governance, WordPress-native, Source-cited answers
- "How it works" 3-step diagram (ingest → govern → answer)
- Pricing teaser (3 tiers, simplified)
- Footer: links + small copyright

### 2. Login page (`client/app/(auth)/login/page.tsx`)
- Split layout: left 50% = form on neutral surface, right 50% = gradient mesh + rotating quote/screenshot
- Form: email, password, "Forgot?" link, primary submit
- Error states use `--color-refuse-soft` inline alert
- Loading: button shows skeleton shimmer, submits disabled
- Below: "or continue with" → Google/GitHub OAuth buttons (stub if backend not ready, mark with TODO)
- Bottom link: "Don't have an account? Create one"

### 3. Signup page (`client/app/(auth)/register/page.tsx`)
- Same split layout, different right-side content (3-step onboarding preview)
- Form: name, email, password (with strength indicator using `confidenceColor` logic), tenant name (auto-filled from email domain)
- Honor governance theme: small note "Your data stays in your tenant. Always."
- Confirmation flow: after submit → "Check your email" state with resend option

### 4. Forgot-password flow
- `client/app/(auth)/forgot-password/page.tsx` — simple email form
- Backend stub if not present (`POST /api/v1/auth/forgot-password`)

### 5. New components used across
- `client/src/components/marketing/gradient-hero.tsx`
- `client/src/components/marketing/feature-card.tsx`
- `client/src/components/marketing/rule-chip-strip.tsx`
- `client/src/components/auth/auth-split-layout.tsx` (the split shell)

### 6. Motion
- Hero headline: word-by-word fade up, 80ms stagger
- Feature cards: scroll-triggered y:24 → 0, opacity, with IntersectionObserver
- Background mesh: very slow drift (60s loop)

## CONSTRAINTS
- Use only design-system tokens.
- Do NOT touch dashboard or chat — different branches.
- Auth context (`auth-context.tsx`) — change minimally; only fix calls if shape changed.
- All forms must be keyboard-accessible, with proper labels and `aria-invalid` on error.
- Marketing copy must reflect governance positioning, NOT generic AI marketing fluff.

## ACCEPTANCE
- `/`, `/login`, `/register`, `/forgot-password` all render and look distinct.
- Login flow works against existing backend.
- Mobile (360px) works without horizontal scroll.
- `npm run build` passes.
- Lighthouse perf on `/` ≥ 90.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Screenshot landing hero, login, signup.
