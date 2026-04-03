@echo off
REM opencode-mux release helper for Windows
REM Usage: script\release.bat [patch^|minor^|major^|version]
REM
REM Without --ci: runs local autonomous build
REM With --ci:     triggers GitHub Actions workflow

setlocal

if "%1"=="--ci" (
  echo [release] Triggering CI-based release via GitHub Actions...
  if "%2"=="" (
    gh workflow run publish.yml -f bump=patch
  ) else (
    gh workflow run publish.yml -f bump=%2
  )
  echo [release] Workflow triggered.
  goto :eof
)

echo [release] Starting local autonomous release...
if "%1"=="" (
  bun script\release-local.ts patch
) else (
  bun script\release-local.ts %1
)
