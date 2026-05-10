# Run Celery worker for FlakersStudio
# This script starts a Celery worker with proper configuration

param(
    [int]$Concurrency = 4,
    [string]$LogLevel = "info",
    [switch]$Legacy
)

Write-Host "Starting FlakersStudio Celery Worker..." -ForegroundColor Green
Write-Host "Concurrency: $Concurrency" -ForegroundColor Cyan
Write-Host "Log Level: $LogLevel" -ForegroundColor Cyan

# Check if Redis is running
Write-Host "Checking Redis connection..." -ForegroundColor Yellow
try {
    $redisTest = docker exec flakers-redis redis-cli ping 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Redis is not running. Please run .\scripts\run-redis-docker.ps1 first" -ForegroundColor Red
        exit 1
    }
    Write-Host "Redis is available" -ForegroundColor Green
} catch {
    Write-Host "Redis is not running. Please run .\scripts\run-redis-docker.ps1 first" -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:PYTHONUNBUFFERED = "1"

# Change to server directory
Set-Location -Path "$PSScriptRoot\..\server"

# Start Celery worker
if ($Legacy) {
    Write-Host "Starting legacy polling worker..." -ForegroundColor Yellow
    python -m backend.workers.ingestion_worker --legacy
} else {
    Write-Host "Starting Celery worker..." -ForegroundColor Green
    celery -A backend.queue.celery_app worker `
        --loglevel=$LogLevel `
        --concurrency=$Concurrency `
        --pool=solo `
        --queues=ingestion `
        --hostname=worker@%h
}

# If Celery exits, show message
Write-Host ""
Write-Host "Celery worker stopped" -ForegroundColor Yellow
