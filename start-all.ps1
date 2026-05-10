param(
    [switch]$WithWorker,
    [switch]$DryRun,
    [switch]$WithCelery,
    [switch]$LegacyWorker
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root "server"
$clientDir = Join-Path $root "client"
$workerScript = Join-Path $root "backend/workers/ingestion_worker.py"

function Resolve-PythonPath {
    param([string]$ServerPath)

    $venvCandidates = @(
        (Join-Path $ServerPath "venv/Scripts/python.exe"),
        (Join-Path $ServerPath ".venv/Scripts/python.exe")
    )

    foreach ($candidate in $venvCandidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return "python"
}

function Start-ServiceTerminal {
    param(
        [string]$Title,
        [string]$WorkingDir,
        [string]$Command
    )

    $inner = @(
        '$Host.UI.RawUI.WindowTitle = "' + $Title + '"',
        'Set-Location "' + $WorkingDir + '"',
        $Command
    ) -join "; "

    if ($DryRun) {
        Write-Host "[DRY RUN] powershell -NoExit -Command $inner"
        return
    }

    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        $inner
    ) | Out-Null
}

function Get-PortOwner {
    param([int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) {
        return $null
    }

    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if (-not $process) {
        return "PID $($connection.OwningProcess)"
    }

    return "$($process.ProcessName) (PID $($process.Id))"
}

if (-not (Test-Path $serverDir)) {
    throw "Missing folder: $serverDir"
}

if (-not (Test-Path $clientDir)) {
    throw "Missing folder: $clientDir"
}

$pythonPath = Resolve-PythonPath -ServerPath $serverDir
$backendPort = 8000
$frontendPort = 3000

$backendPortOwner = Get-PortOwner -Port $backendPort
if ($backendPortOwner) {
    throw "Port $backendPort is already in use by $backendPortOwner. Stop that process or switch backend port before launching."
}

$frontendPortOwner = Get-PortOwner -Port $frontendPort
if ($frontendPortOwner) {
    throw "Port $frontendPort is already in use by $frontendPortOwner. Stop that process before launching frontend."
}

$backendCommand = "& `"$pythonPath`" server/main.py"
$frontendCommand = "npm run dev"
$workerCommand = "& `"$pythonPath`" `"$workerScript`""
$celeryWorkerCommand = "& `"$pythonPath`" -m celery -A backend.queue.celery_app worker --loglevel=info --concurrency=4 --pool=solo --queues=ingestion"
$legacyWorkerCommand = "& `"$pythonPath`" `"$workerScript`" --legacy"

Write-Host "Starting FlakersStudio services..."
Start-ServiceTerminal -Title "FlakersStudio Backend" -WorkingDir $root -Command $backendCommand
Start-ServiceTerminal -Title "FlakersStudio Frontend" -WorkingDir $clientDir -Command $frontendCommand

if ($WithCelery) {
    Write-Host "Starting Redis (if not running)..."
    $redisCheck = docker ps --filter "name=flakers-redis" --format "{{.Names}}" 2>$null
    if ($redisCheck -ne "flakers-redis") {
        & "$root\scripts\run-redis-docker.ps1"
    }
    Start-ServiceTerminal -Title "FlakersStudio Celery Worker" -WorkingDir $root -Command $celeryWorkerCommand
}
elseif ($WithWorker) {
    if ($LegacyWorker) {
        Start-ServiceTerminal -Title "FlakersStudio Worker (Legacy)" -WorkingDir $root -Command $legacyWorkerCommand
    }
    else {
        Start-ServiceTerminal -Title "FlakersStudio Worker" -WorkingDir $root -Command $workerCommand
    }
}

Write-Host ""
Write-Host "Started:"
Write-Host "- Backend:  http://localhost:8000"
Write-Host "- Frontend: http://localhost:3000"
if ($WithCelery) {
    Write-Host "- Celery Worker: Async task queue with Redis"
    Write-Host "- Redis: localhost:6379"
}
elseif ($WithWorker) {
    if ($LegacyWorker) {
        Write-Host "- Worker: Legacy polling process"
    }
    else {
        Write-Host "- Worker: Celery-aware polling process"
    }
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run mode was enabled; no terminals were launched."
}
