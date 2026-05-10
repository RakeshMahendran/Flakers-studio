<#
.SYNOPSIS
  One-time setup: create all 17 git worktrees for the parallel development plan.
  Idempotent — re-running is safe; existing worktrees are skipped.

.EXAMPLE
  .\scripts\setup-worktrees.ps1
#>

$repoRoot = "E:\FlakersStudio"
$worktreeRoot = "E:\"

# Map: short name -> branch name
$plan = @(
  @{ Name = "eval-suite";       Branch = "feat/rag-eval-test-bank" }
  @{ Name = "design-system";    Branch = "feat/design-system-overhaul" }
  @{ Name = "rich-metadata";    Branch = "feat/rich-metadata-extraction" }
  @{ Name = "dynamic-html";     Branch = "feat/wp-dynamic-html-fallback" }
  @{ Name = "prompt-upgrade";   Branch = "feat/prompt-temporal-and-length" }
  @{ Name = "intent-fastpath";  Branch = "feat/two-tier-intent-classifier" }
  @{ Name = "filter-extract";   Branch = "feat/llm-filter-extraction" }
  @{ Name = "hybrid-chunking";  Branch = "feat/hybrid-semantic-chunking" }
  @{ Name = "rerank-boost";     Branch = "feat/rerank-and-factual-overrides" }
  @{ Name = "pdf-ingest";       Branch = "feat/pdf-document-ingestion" }
  @{ Name = "cache";            Branch = "feat/redis-cache" }
  @{ Name = "celery";           Branch = "feat/celery-queue" }
  @{ Name = "governance-ui";    Branch = "feat/governance-trust-ui" }
  @{ Name = "dashboard-ui";     Branch = "feat/dashboard-redesign" }
  @{ Name = "chat-ui";          Branch = "feat/chat-interface-revamp" }
  @{ Name = "widget-ui";        Branch = "feat/widget-redesign" }
  @{ Name = "auth-landing";     Branch = "feat/auth-and-landing" }
)

Set-Location $repoRoot
git fetch origin | Out-Null

$created = 0
$skipped = 0

foreach ($entry in $plan) {
  $path = Join-Path $worktreeRoot ("FS-" + $entry.Name)
  if (Test-Path $path) {
    Write-Host "[skip] FS-$($entry.Name) already exists" -ForegroundColor DarkGray
    $skipped++
    continue
  }
  Write-Host "[+]    FS-$($entry.Name)  ->  $($entry.Branch)" -ForegroundColor Green
  git worktree add $path -b $entry.Branch main 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $created++ } else { Write-Warning "Failed to create $path" }
}

Write-Host ""
Write-Host "Created: $created   Skipped: $skipped" -ForegroundColor Cyan
Write-Host ""
git worktree list
