-- Fix duplicate index issue
-- Run this against your PostgreSQL database

-- Drop the duplicate index if it exists
DROP INDEX IF EXISTS idx_job_status;

-- The application will recreate the properly named indexes on next startup
