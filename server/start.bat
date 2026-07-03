@echo off
:: ============================================================================
:: start.bat — One-command NEXUS 2.0 server start (Windows)
::
:: No PostgreSQL required. SQLite is used by default — just run this script.
:: Set DATABASE_URL to use PostgreSQL instead.
:: ============================================================================

@echo ╔═══════════════════════════════════════════════════════════════╗
@echo ║          NEXUS 2.0 — AI Agent OS Server                      ║
@echo ╚═══════════════════════════════════════════════════════════════╝
@echo.

:: Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Node.js is not installed or not on your PATH.
  echo        Download it from https://nodejs.org (v20 or later)
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 20 (
  echo ERROR: Node.js v20+ is required.
  node -v
  pause
  exit /b 1
)

echo ✔ Node.js detected
echo.

:: Install dependencies if needed
if not exist "node_modules" (
  echo ^→ Installing dependencies...
  call npm install
  echo ✔ Dependencies installed
  echo.
)

:: Print mode
if defined DATABASE_URL (
  echo ◆ Database: PostgreSQL (DATABASE_URL is set)
) else (
  echo ◆ Database: SQLite (agentic-os.db — no external DB needed)
)
echo.

echo ^→ Starting server...
echo.
npx tsx src/index.ts
pause
