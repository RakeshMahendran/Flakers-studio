# Branch: feat/dashboard-redesign
**Worktree:** `E:\FS-dashboard-ui`
**Phase:** 1b — Frontend tokens cascade
**Depends on:** design-system merged

---

You are in worktree FS-dashboard-ui on branch feat/dashboard-redesign.

## GOAL
Redesign the main dashboard from a flat list into a modern SaaS workspace: gradient-backed hero, assistant cards as the primary work unit, proper sidebar navigation, command palette (Cmd+K), and quick-action shortcuts. Strategic minimalism — every element earns its place.

## READ FIRST
1. `client/src/components/flakers-studio/screens/dashboard-screen.tsx`
2. `client/src/components/flakers-studio/app.tsx` — top-level orchestration
3. `client/src/components/flakers-studio/screens/assistant-review-screen.tsx`
4. `client/app/(dashboard)/layout.tsx` — current dashboard layout
5. `client/src/lib/design-system.ts` and `ui/primitives.tsx`

## DELIVERABLES

### 1. New shell layout: `client/src/components/layout/app-shell.tsx`
- Left sidebar (collapsible): logo (gradient mark) → nav items (Dashboard, Assistants, Content, Analytics, Settings) → user menu at bottom
- Sidebar width 240px expanded / 64px collapsed; uses `--color-sidebar` tokens
- Active nav item: `--gradient-brand` background, white text
- Top bar: breadcrumb (left) + global search trigger ("Search or press ⌘K") + notification bell + theme toggle
- Main content: `max-w-7xl`, generous `--space-8` padding
- Wire into `client/app/(dashboard)/layout.tsx` as the wrapper

### 2. Command palette: `client/src/components/layout/command-palette.tsx`
- Cmd+K (Ctrl+K) opens
- Radix Dialog + custom input, NOT cmdk lib (no new dep)
- Sections: Quick actions (Create assistant, Upload PDF, Open settings), Assistants (filterable), Recent chats, Help
- Each item: icon + label + keyboard hint
- ↑↓ to navigate, Enter to select, Esc to close
- Smooth scale + fade in (180ms)

### 3. Dashboard hero (top of `dashboard-screen.tsx`)
- Greeting: "Good morning, {firstName}." in `--text-display`
- Gradient mesh background (subtle, `--gradient-mesh-bg` at 20% opacity, slow drift animation)
- Sub-line with stat ribbon: "3 assistants · 1,247 conversations this month · 94% answer rate"
- Primary CTA on the right: "New assistant" button (`--button-primary-bg`)

### 4. Assistant card grid (replaces current list)
- 3-col on `lg`, 2-col on `md`, 1-col on `sm`
- Card content:
  - Top row: assistant avatar (gradient initial-letter mark) + name + "Active" / "Paused" badge
  - Middle: 1-line description
  - Stats row: chat count, answer rate %, avg latency — small inline stat blocks with icon
  - Confidence sparkline (last 7 days) using SVG, `--color-trust` stroke
  - Hover: card lifts (`--elevation-2` → `--elevation-3`), gradient border becomes visible
  - Click: navigates to `/assistant/[id]`
- Empty state: full-width gradient mesh card with illustration placeholder + "Create your first assistant" CTA

### 5. Quick actions strip below the hero (4 cards)
- "Add WordPress site" (icon: globe)
- "Upload documents" (icon: file-stack)
- "Edit governance rules" (icon: shield)
- "View analytics" (icon: chart)

Each card: small, minimal, gradient ring on hover.

### 6. Mini analytics row at bottom (4 KPI tiles)
Use AreaChart-style sparklines:
- Total chats (last 30 days)
- Answer rate %
- Avg processing time
- Refusals (with breakdown by rule on hover)

## CONSTRAINTS
- Use ONLY design-system tokens.
- Do NOT touch chat-interface or governance components — different branches.
- Do NOT add a charting library. SVG sparklines are fine for v1.
- Keyboard: Tab order must be logical (sidebar → top bar → main).
- Performance: gradient-mesh background must be CSS-only (no canvas). Use a static SVG with `<animateTransform>` or CSS-only `@keyframes`.
- Mobile: sidebar becomes a Sheet (Radix Dialog from left) below 768px.

## ACCEPTANCE
- Dashboard renders with seed data, looks distinctly modern.
- Cmd+K opens palette in <100ms.
- `npm run build` passes.
- Lighthouse perf ≥ 85 on the dashboard route.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Screenshot the dashboard in light + dark, plus the open command palette.
