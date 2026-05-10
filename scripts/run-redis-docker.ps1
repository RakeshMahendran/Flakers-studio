# Run Redis in Docker for local development
# This script starts a Redis container on port 6379

Write-Host "Starting Redis container for FlakersStudio..." -ForegroundColor Green

# Check if Redis container already exists
$existingContainer = docker ps -a --filter "name=flakers-redis" --format "{{.Names}}"

if ($existingContainer -eq "flakers-redis") {
    Write-Host "Redis container already exists. Starting it..." -ForegroundColor Yellow
    docker start flakers-redis
} else {
    Write-Host "Creating new Redis container..." -ForegroundColor Green
    docker run -d `
        --name flakers-redis `
        -p 6379:6379 `
        redis:7-alpine
}

# Wait for Redis to be ready
Write-Host "Waiting for Redis to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Test Redis connection
Write-Host "Testing Redis connection..." -ForegroundColor Yellow
docker exec flakers-redis redis-cli ping

if ($LASTEXITCODE -eq 0) {
    Write-Host "Redis is running and ready!" -ForegroundColor Green
    Write-Host "Connection: redis://localhost:6379" -ForegroundColor Cyan
} else {
    Write-Host "Failed to connect to Redis" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "To stop Redis: docker stop flakers-redis" -ForegroundColor Gray
Write-Host "To remove Redis: docker rm flakers-redis" -ForegroundColor Gray
