# Branch: feat/chat-interface-revamp
**Worktree:** `E:\FS-chat-ui`
**Phase:** 1b — Frontend tokens cascade
**Depends on:** design-system + governance-ui (ideally merged)

---

You are in worktree FS-chat-ui on branch feat/chat-interface-revamp.

## GOAL
Redesign the chat surface so it feels like a 2026 AI copilot: clean message stream, streaming token rendering, suggested follow-ups, feedback buttons, and quick-actions. Render `<AnswerCard>`/`<RefusalCard>` from feat/governance-trust-ui as the assistant message body.

## READ FIRST
1. `client/src/components/flakers-studio/screens/chat-interface-tambo.tsx`
2. `client/src/components/flakers-studio/screens/chat-interface.tsx` (legacy — figure out which is active)
3. `client/src/components/tambo/message.tsx` and `thread-content.tsx`
4. `client/src/components/tambo/message-input.tsx`
5. `client/src/components/tambo/message-suggestions.tsx`
6. `client/src/components/governance/decision-renderer.tsx` (from feat/governance-trust-ui — if not merged, leave a TODO and import a stub)

## DELIVERABLES

### 1. Layout structure
`chat-interface-tambo.tsx` as canonical, deprecate the legacy file with a `console.warn`:
- 3-pane: left = thread history, center = active conversation, right = optional governance panel
- Center pane max-width 768px, generous vertical rhythm
- Floating composer at bottom, `--elevation-2`

### 2. Message stream
- User message: right-aligned bubble, `--color-brand` background, white text, max-width 80%
- Assistant message: left-aligned, NOT a bubble — use `<AnswerCard>` or `<RefusalCard>` (full-width within the 768px column)
- Streaming indicator: animated 3-dot pulse with `--color-brand`, replaced by message content as tokens arrive
- Per-message timestamp: subtle, only on hover or after a 60s gap
- Smooth scroll to bottom; pause auto-scroll if user scrolls up

### 3. Composer (`message-input.tsx`)
- Multi-line auto-grow textarea (max 6 lines, then scrolls)
- Bottom-left: attachment button (file/image), voice dictation button (already exists), assistant selector dropdown
- Bottom-right: character count (only if > 80% of limit), Send button (`--gradient-brand`)
- Cmd+Enter to send, Shift+Enter for newline
- Placeholder cycles through example questions every 4s when empty

### 4. Suggested follow-ups (after each assistant answer)
- Row of 3-4 chips below the answer
- Chip variant "suggestion": subtle border, hover lifts to `--color-brand`
- Click = pre-fills composer (doesn't auto-send)

### 5. Empty state (new conversation)
- Centered: gradient logo mark + assistant name + 1-line description
- 4 starter-question cards in a 2x2 grid, each click = pre-fills composer
- No fake typing animation; respect "AI as copilot, not autopilot"

### 6. Thread history (left pane)
- Search box at top
- Threads grouped by Today / Yesterday / This week / Older
- Each thread: 1-line preview + relative timestamp
- Active thread: `--color-brand` background tint + left border accent (3px gradient)
- Hover reveals delete + rename icons

### 7. Streaming UX
- Use ReadableStream from fetch (already wired through Tambo); render tokens as they arrive
- When governance decision arrives at the END (REFUSE), animate the partial answer fading out and the RefusalCard sliding in
- For ANSWER: morph the streaming text into the AnswerCard structure (sources/rules animate in after stream completes)

### 8. Feedback buttons (already in AnswerCard from governance-ui branch)
- On click → POST `/api/v1/feedback` with `message_id`, `value` (up/down), optional reason
- Show toast confirmation ("Thanks for your feedback")

## CONSTRAINTS
- Use design-system tokens; no hard-coded colors.
- Do NOT modify backend chat routes — assume the existing API.
- Do NOT modify AnswerCard/RefusalCard internals (governance-ui branch owns those).
- Mobile: thread history collapses behind a hamburger; right governance pane becomes a bottom sheet.
- Performance: virtualize thread history if >50 items (use a simple windowing approach, no react-window dep).

## ACCEPTANCE
- Chat works end-to-end with mocked stream.
- Streaming feels smooth (60fps).
- Cmd+Enter sends; Shift+Enter newlines.
- `npm run build` passes.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Screenshot the chat in 3 states: empty, mid-stream, after-answer.
