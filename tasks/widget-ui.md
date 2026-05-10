# Branch: feat/widget-redesign
**Worktree:** `E:\FS-widget-ui`
**Phase:** 1b — Frontend tokens cascade
**Depends on:** design-system merged

---

You are in worktree FS-widget-ui on branch feat/widget-redesign.

## GOAL
The embeddable widget at `frontend/widget/` is what tenants put on THEIR sites. Currently barebones. Make it feel like a premium product: gradient launcher, smooth open/close, branded chat with governance cards, customizable theme via config.

## READ FIRST
1. `frontend/widget/` — entire folder
2. `backend/api/routes/public_chat.py` — public chat endpoint shape
3. The `widget-config` endpoint in routes (returns brand colors, assistant name, etc.)
4. esbuild config for the widget

## DELIVERABLES

### 1. Launcher button (bottom-right by default)
- 56px circle, `--gradient-brand` background, `--elevation-glow-brand`
- Chat-bubble icon, white
- Hover: scale 1.05, glow intensifies
- Unread indicator: 8px dot top-right, animated pulse
- Position configurable (bottom-right | bottom-left | custom offsets)

### 2. Chat panel
- 380px × 600px (responsive: full-screen on <500px viewport)
- Slides up from launcher with origin transform
- Top header: assistant avatar + name + close (×) + minimize (—)
- Optional gradient header strip
- Body: message stream (mini version of feat/chat-ui)
- Composer at bottom

### 3. Widget message rendering
- Inline mini AnswerCard: source chips (max 2 visible, +N more), confidence dot, no rules display by default (config flag `showGovernance: true` to enable)
- Inline mini RefusalCard: amber strip, refusal reason, no rules timeline
- Click "Powered by FlakersStudio" link in footer (configurable to remove on Pro tier)

### 4. Theme config (read from `/api/v1/public/widget-config/{assistantId}`)
- `primaryColor` (overrides gradient start)
- `accentColor` (overrides gradient end)
- `position`
- `greeting` (first message shown)
- `placeholder`
- `showSources` (default true)
- `showGovernance` (default false — most tenants don't want to expose rules)
- `logoUrl`
- `bubbleSize` ("sm" | "md" | "lg")

### 5. Vanilla TS implementation (no React in the widget — keep bundle <50kb gzipped)
- Use template literals for HTML
- CSS-in-JS via a single `<style>` tag injected into shadow DOM (isolation from host site styles)
- Event bus for state (no framework)
- Persist conversation in localStorage with assistantId-scoped key

### 6. Build pipeline
- esbuild → single ESM bundle + a CSS-injected fallback for legacy script tags
- Output to `frontend/widget/dist/flakers-widget.js` and `flakers-widget.iife.js`
- Add a simple test page at `frontend/widget/test/index.html` that loads the widget against a mock backend

### 7. Documentation
`frontend/widget/README.md` (≤120 lines):
- Install snippet (one-line script tag with `data-assistant-id` attribute)
- Configuration reference
- Theme examples (3 — corporate, bold, minimal)

## CONSTRAINTS
- Shadow DOM isolation — host page styles must NOT leak in or out.
- Bundle size budget: 50kb gzipped. Add a CI check.
- No new runtime deps. esbuild + TypeScript are it.
- Accessibility: focus trap when open, Esc to close, `role="dialog"` with proper aria-labels.
- Do NOT modify backend `public_chat.py`.

## ACCEPTANCE
- Widget loads on test page, opens, sends a message, renders an answer with sources.
- Bundle <50kb gzipped (verified by `ls -la dist/`).
- Works on a host page with conflicting CSS (shadow DOM isolation verified).

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Record a 10-second screen capture of the widget in action and report file size.
