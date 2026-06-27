@echo off
chcp 65001 >nul
echo.
echo ==========================================
echo   AEGIS Fix and Seed Script
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/5] Removing conflicting page.tsx files...
if exist "src\app\api\intelligence\ai\page.tsx" (
    del /f /q "src\app\api\intelligence\ai\page.tsx"
    echo   Deleted: ai\page.tsx
) else (
    echo   Already gone: ai\page.tsx
)
if exist "src\app\api\intelligence\rules\page.tsx" (
    del /f /q "src\app\api\intelligence\rules\page.tsx"
    echo   Deleted: rules\page.tsx
) else (
    echo   Already gone: rules\page.tsx
)

echo.
echo [2/5] Installing dependencies (Prisma 6 from package.json)...
where bun >nul 2>&1
if %errorlevel%==0 (
    echo   Using bun...
    bun install
) else (
    echo   Using npm...
    npm install
)

echo.
echo [3/5] Generating Prisma client...
node_modules\.bin\prisma generate

echo.
echo [4/5] Pushing schema to SQLite database...
node_modules\.bin\prisma db push

echo.
echo [5/5] Seeding database with users and demo data...
node_modules\.bin\tsx prisma\seed.ts

echo.
echo ==========================================
echo   Done! All fixes applied.
echo ==========================================
echo.
echo   Run:   bun run dev
echo   Open:  http://localhost:3000
echo.
pause
