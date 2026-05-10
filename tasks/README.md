# Parallel development task plan

This directory contains 17 self-contained task prompts, one per worktree branch. Each file is paste-ready for a Claude Code session running in the matching worktree.

## Quick start

```powershell
# 1. Create all worktrees (one-time, idempotent)
.\scripts\setup-worktrees.ps1

# 2. Spawn agents for a phase (opens one Windows Terminal tab per branch,
#    auto-copies the task to clipboard, starts cd'd to the worktree)
.\scripts\spawn-agents.ps1 -Branches eval-suite,design-system

# 3. Inside each tab: type `claude`, then Ctrl+V to paste the task

# 4. Monitor progress across all worktrees from anywhere
.\scripts\status.ps1
```

## Phase order (cap concurrency at 5)

| Phase | Run together | Why |
|-------|-------------|-----|
| **0 — Foundations** | `eval-suite`, `design-system` | Everything else depends on these. Watch closely, review carefully. |
| **1a — Backend** | `rich-metadata`, `dynamic-html`, `prompt-upgrade`, `intent-fastpath` | All touch different files. `dynamic-html` needs `rich-metadata` merged first if it conflicts on `wordpress_client.py`. |
| **1b — Frontend** | `governance-ui`, `dashboard-ui`, `chat-ui`, `widget-ui`, `auth-landing` | All consume design-system tokens. Disjoint folders. |
| **2 — RAG quality** | `filter-extract` → `hybrid-chunking` → `rerank-boost` | All touch `rag_pipeline.py`. **Serialize merges.** |
| **3 — New content** | `pdf-ingest` | Needs `rich-metadata` + `hybrid-chunking`. |
| **4 — Infra** | `cache`, then `celery` | Highest risk. Do last. |

## Shared-file merge order (don't skip this)

| File | Branches that touch it | Merge order |
|------|------------------------|-------------|
| `backend/retrieval/rag_pipeline.py` | prompt-upgrade, filter-extract, rerank-boost, intent-fastpath | prompt-upgrade → intent-fastpath → filter-extract → rerank-boost |
| `backend/ingestion/wordpress_client.py` | rich-metadata, dynamic-html | rich-metadata → dynamic-html |
| `backend/ingestion/content_processor.py` | rich-metadata, hybrid-chunking | rich-metadata → hybrid-chunking |
| `client/app/globals.css` | design-system only | n/a |

## Universal rules baked into every task

- **Never modify `backend/services/governance.py`** — that's the project's spine.
- **Never commit or push.** Leave changes uncommitted; user reviews and commits.
- **Run the eval suite** (`tests/eval/runner.py`) before declaring any RAG-quality branch done.
- **No new heavy frontend deps.** framer-motion, radix, lucide-react are already in package.json.

## Branch index

| File | Worktree | Phase |
|------|----------|-------|
| `eval-suite.md` | `E:\FS-eval-suite` | 0 |
| `design-system.md` | `E:\FS-design-system` | 0 |
| `rich-metadata.md` | `E:\FS-rich-metadata` | 1a |
| `dynamic-html.md` | `E:\FS-dynamic-html` | 1a |
| `prompt-upgrade.md` | `E:\FS-prompt-upgrade` | 1a |
| `intent-fastpath.md` | `E:\FS-intent-fastpath` | 1a |
| `governance-ui.md` | `E:\FS-governance-ui` | 1b |
| `dashboard-ui.md` | `E:\FS-dashboard-ui` | 1b |
| `chat-ui.md` | `E:\FS-chat-ui` | 1b |
| `widget-ui.md` | `E:\FS-widget-ui` | 1b |
| `auth-landing.md` | `E:\FS-auth-landing` | 1b |
| `filter-extract.md` | `E:\FS-filter-extract` | 2 |
| `hybrid-chunking.md` | `E:\FS-hybrid-chunking` | 2 |
| `rerank-boost.md` | `E:\FS-rerank-boost` | 2 |
| `pdf-ingest.md` | `E:\FS-pdf-ingest` | 3 |
| `cache.md` | `E:\FS-cache` | 4 |
| `celery.md` | `E:\FS-celery` | 4 |

## Editing tasks

Task files are version-controlled. If you discover a missing constraint or want to refine a prompt, edit the markdown file and re-run the spawner — the latest version is always copied to clipboard.
