<#
.SYNOPSIS
  Spawn one Claude Code session per branch in a separate Windows Terminal tab,
  with the corresponding task file pre-copied to the clipboard.

.PARAMETER Branches
  One or more short branch names matching tasks\<name>.md.
  Examples: eval-suite, rich-metadata, design-system

.PARAMETER RootPath
  Parent directory holding all FS-* worktrees. Defaults to E:\

.PARAMETER Headless
  Run claude in non-interactive mode (claude -p) and tee logs to logs\<name>.jsonl
  Use only for branches with crisp specs. Risky for shared-file branches.

.EXAMPLE
  # Phase 0 — foundations
  .\scripts\spawn-agents.ps1 -Branches eval-suite,design-system

.EXAMPLE
  # Phase 1a backend track
  .\scripts\spawn-agents.ps1 -Branches rich-metadata,dynamic-html,prompt-upgrade,intent-fastpath

.EXAMPLE
  # Headless run for a single small branch
  .\scripts\spawn-agents.ps1 -Branches dynamic-html -Headless
#>
param(
  [Parameter(Mandatory)] [string[]] $Branches,
  [string] $RootPath = "E:\",
  [switch] $Headless
)

$repoRoot  = "E:\FlakersStudio"
$tasksDir  = Join-Path $repoRoot "tasks"
$logsDir   = Join-Path $repoRoot "logs"

if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

foreach ($b in $Branches) {
  $worktree = Join-Path $RootPath "FS-$b"
  $taskFile = Join-Path $tasksDir  "$b.md"

  if (-not (Test-Path $worktree)) {
    Write-Error "Missing worktree: $worktree"
    Write-Host "  Run: git worktree add `"$worktree`" -b feat/<branch> main" -ForegroundColor Yellow
    continue
  }
  if (-not (Test-Path $taskFile)) {
    Write-Error "Missing task file: $taskFile"
    continue
  }

  if ($Headless) {
    $logFile = Join-Path $logsDir "$b.jsonl"
    Write-Host "[HEADLESS] $b -> $worktree (log: $logFile)" -ForegroundColor Cyan

    $taskContent = Get-Content $taskFile -Raw
    $cmd = "Set-Location '$worktree'; `$task = Get-Content '$taskFile' -Raw; `$task | claude -p --permission-mode acceptEdits --output-format stream-json | Tee-Object '$logFile'"

    Start-Process pwsh -ArgumentList "-NoExit","-Command",$cmd -WindowStyle Normal
  }
  else {
    Write-Host "[INTERACTIVE] $b -> $worktree" -ForegroundColor Cyan

    $bootCmd = "Set-Location '$worktree'; Get-Content '$taskFile' -Raw | Set-Clipboard; Write-Host '----------------------------------------' -ForegroundColor DarkGray; Write-Host '[OK] Task copied to clipboard for: $b' -ForegroundColor Green; Write-Host '     Worktree: $worktree' -ForegroundColor Gray; Write-Host '     Run: claude   then paste with Ctrl+V' -ForegroundColor Gray; Write-Host '----------------------------------------' -ForegroundColor DarkGray"

    & wt -w 0 nt -d $worktree --title $b pwsh -NoExit -Command $bootCmd
  }
}

Write-Host ""
Write-Host "Spawned $($Branches.Count) agent(s)." -ForegroundColor Green
Write-Host "Run .\scripts\status.ps1 to monitor progress across all worktrees." -ForegroundColor Gray
