<#
.SYNOPSIS
  Status board for all FlakersStudio worktrees. Shows branch, dirty-file count,
  and commits ahead of main per worktree.

.EXAMPLE
  .\scripts\status.ps1
#>

$worktrees = git worktree list --porcelain | Out-String
$lines = $worktrees -split "`n" | Where-Object { $_ -match '^worktree ' }

$rows = @()
foreach ($line in $lines) {
  $path = ($line -replace '^worktree ', '').Trim()
  if (-not (Test-Path $path)) { continue }

  Push-Location $path
  try {
    $branch  = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
    $dirty   = (git status --porcelain 2>$null | Measure-Object).Count
    $ahead   = 0
    $behind  = 0
    if ($branch -ne 'main' -and $branch) {
      try {
        $ahead  = [int]((git rev-list --count "main..$branch" 2>$null) -as [int])
        $behind = [int]((git rev-list --count "$branch..main" 2>$null) -as [int])
      } catch { }
    }
    $lastCommit = (git log -1 --format="%h %s" 2>$null)
    if ($lastCommit.Length -gt 60) { $lastCommit = $lastCommit.Substring(0,60) + "..." }

    $rows += [PSCustomObject]@{
      Branch     = $branch
      Path       = $path
      Dirty      = $dirty
      Ahead      = $ahead
      Behind     = $behind
      LastCommit = $lastCommit
    }
  } finally {
    Pop-Location
  }
}

$rows | Sort-Object Branch | Format-Table -AutoSize Branch, Dirty, Ahead, Behind, Path, LastCommit

Write-Host ""
Write-Host "Legend:" -ForegroundColor Gray
Write-Host "  Dirty  = uncommitted files (staged + unstaged + untracked)" -ForegroundColor Gray
Write-Host "  Ahead  = commits this branch has that main does not" -ForegroundColor Gray
Write-Host "  Behind = commits main has that this branch does not (rebase candidate)" -ForegroundColor Gray
