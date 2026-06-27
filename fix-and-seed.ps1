Write-Host "AEGIS Fix Script Starting..." -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

# 1. Delete conflicting page.tsx files
Write-Host "Step 1: Removing conflicting page.tsx files..." -ForegroundColor Yellow
$f1 = Join-Path $root "src\app\api\intelligence\ai\page.tsx"
$f2 = Join-Path $root "src\app\api\intelligence\rules\page.tsx"
if (Test-Path $f1) { Remove-Item $f1 -Force; Write-Host "  Deleted: ai/page.tsx" -ForegroundColor Green }
else { Write-Host "  Already gone: ai/page.tsx" -ForegroundColor Gray }
if (Test-Path $f2) { Remove-Item $f2 -Force; Write-Host "  Deleted: rules/page.tsx" -ForegroundColor Green }
else { Write-Host "  Already gone: rules/page.tsx" -ForegroundColor Gray }

# 2. Install dependencies (uses package.json versions — Prisma 6.x)
Write-Host "Step 2: Installing dependencies..." -ForegroundColor Yellow
$bunExe = Get-Command bun -ErrorAction SilentlyContinue
if ($bunExe) {
    Write-Host "  Using bun..." -ForegroundColor Gray
    bun install
} else {
    Write-Host "  Using npm..." -ForegroundColor Gray
    npm install
}
Write-Host "  Dependencies installed" -ForegroundColor Green

# 3. Generate Prisma client (use LOCAL prisma 6 from node_modules)
Write-Host "Step 3: Generating Prisma client (v6)..." -ForegroundColor Yellow
node_modules\.bin\prisma generate
Write-Host "  Prisma client generated" -ForegroundColor Green

# 4. Push schema
Write-Host "Step 4: Pushing schema to SQLite..." -ForegroundColor Yellow
node_modules\.bin\prisma db push
Write-Host "  Schema pushed" -ForegroundColor Green

# 5. Seed database
Write-Host "Step 5: Seeding database with users & demo data..." -ForegroundColor Yellow
node_modules\.bin\tsx prisma/seed.ts
Write-Host "  Database seeded" -ForegroundColor Green

Write-Host "All fixes applied!" -ForegroundColor Green
Write-Host "Now run: bun run dev   OR   npm run dev" -ForegroundColor Cyan
Write-Host "Open: http://localhost:3000" -ForegroundColor Cyan
