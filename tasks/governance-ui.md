# Branch: feat/governance-trust-ui
**Worktree:** `E:\FS-governance-ui`
**Phase:** 1b — Frontend tokens cascade
**Depends on:** design-system merged

---

You are in worktree FS-governance-ui on branch feat/governance-trust-ui.

## GOAL
Redesign the AnswerCard, RefusalCard, GovernancePanel, and SourceExplorer so users instantly see (a) was this answered or refused, (b) what rules applied, (c) what sources back the answer, (d) confidence level. This is the brand-defining surface.

## READ FIRST
1. `client/src/components/flakers-studio/tambo-components/answer-card.tsx`
2. `client/src/components/flakers-studio/tambo-components/refusal-card.tsx`
3. `client/src/components/flakers-studio/tambo-components/governance-panel.tsx`
4. `client/src/components/tambo/generative/source-explorer.tsx`
5. `backend/services/governance.py` — understand `GovernanceDecision` shape (decision, confidence, applied_rules, sources, refusal_reason)
6. `client/src/lib/design-system.ts` (from feat/design-system-overhaul) — use these tokens
7. `client/src/components/ui/primitives.tsx` — reuse Card, Badge, Chip

## DELIVERABLES

### 1. AnswerCard redesign
- Top edge: 2px gradient stripe (`--gradient-trust`)
- Top-left: small emerald-tinted shield icon + "Answered" label + confidence indicator
- Confidence ring: circular progress 16px showing score 0-1 (color via `confidenceColor` helper)
- Body: rendered markdown answer
- Source chips section: horizontal scrollable row of `<Chip variant="source">` with favicon + truncated title + open-in-new icon. Click = expands SourceExplorer in side panel
- Applied-rules row at bottom: each rule as `<Chip variant="rule">` with cascade animation (stagger 60ms)
- Footer: thumbs up / thumbs down feedback buttons (no labels, just icons), copy-answer button
- Hover state: `--elevation-2` → `--elevation-3` with `--duration-base ease-out`
- Subtle `pulse-trust` animation on first render (≤500ms, then settle)

### 2. RefusalCard redesign
- Top edge: 2px gradient stripe (`--gradient-refuse`)
- Top-left: amber-tinted info circle (NOT a red error icon — refusal is governance, not failure)
- Headline: "I can't answer this" in `--text-lg`
- Refusal reason in plain prose (NOT bulleted, NOT JSON)
- "Why this happened" expandable section showing which rule(s) blocked
- "Try instead" suggestions chips (3 max) — pulled from governance metadata if available, else show "Rephrase your question" as fallback
- Subdued background tint: `--color-refuse-soft`
- No pulsing animation; calm static presence

### 3. GovernancePanel redesign (the trust drawer)
- Slide-out right panel via Radix Dialog or Popover
- Header: assistant name + governance status badge ("Active — 6 rules enforced")
- Vertical timeline of all 6 rules with status per rule for the current query:
  - ✓ REQUIRE_CONTEXT — passed (1 chunk above threshold)
  - ✓ INTENT_FILTERING — passed
  - ✓ ATTRIBUTION_REQUIRED — passed (3 sources cited)
  - ✓ POLICY_QUOTE_ONLY — n/a (non-policy content)
  - ✓ TENANT_ISOLATION — passed
  - ⚠ CONFIDENCE_THRESHOLD — borderline (0.62 vs 0.65 cutoff)
- Each rule expandable to show the actual evaluation detail
- Footer: link to /docs/governance

### 4. SourceExplorer redesign
- Card grid (or list on narrow widths)
- Each source: favicon + title + URL host + relevance score bar + content snippet (3 lines)
- Click expands inline with full retrieved chunk text + metadata pills (year, category, chunk_index)
- Filter bar at top: by source type, year, category — uses metadata fields from feat/rich-metadata-extraction

### 5. New helper
`client/src/components/governance/decision-renderer.tsx` — Single switch component: takes `GovernanceDecision`, renders `<AnswerCard>` or `<RefusalCard>`. Used by `message-thread-full` and `chat-interface` so logic isn't duplicated

### 6. Motion specs (use framer-motion)
- AnswerCard mount: y: 8 → 0, opacity 0 → 1, duration 200ms, ease `--ease-out`
- Rule chips: stagger 60ms, scale 0.9 → 1, opacity 0 → 1
- Source chips: horizontal slide-in stagger 40ms
- GovernancePanel: slide from right, 240ms

### 7. Keyboard shortcuts
- "g" while a message is focused opens GovernancePanel for that message
- "s" opens SourceExplorer
- Esc closes both

## CONSTRAINTS
- Use ONLY tokens from the design system; no hard-coded hex.
- Do NOT modify `governance.py` or any backend file.
- Do NOT touch `chat-interface.tsx` or `thread-content.tsx` structure beyond replacing where AnswerCard/RefusalCard render — chat-revamp branch owns those.
- Mobile: cards must work down to 360px width. Source chips become a vertical stack <500px.
- Accessibility: confidence ring must have an `aria-label "Confidence: 87%"`. Rules timeline uses `<ol>`. Refusal reason is announced via `aria-live="polite"`.

## ACCEPTANCE
- Render AnswerCard/RefusalCard on `/design` page with mock data.
- Open GovernancePanel from a card; all 6 rules render correctly.
- Tab navigation reaches every interactive element.
- `npm run build` passes; lint clean.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Screenshot AnswerCard + RefusalCard + GovernancePanel and report.
