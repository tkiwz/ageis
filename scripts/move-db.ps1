<#
  Copies the AEGIS database (schema + data) from the current Supabase project
  to a new one (e.g. Mumbai). Run it yourself in PowerShell:

      powershell -ExecutionPolicy Bypass -File scripts\move-db.ps1

  - The old connection is read from DIRECT_URL in .env.
  - The new connection string is asked for on screen (input hidden), never saved.
  - The dump file is deleted at the end.
  Needs PostgreSQL 17 client tools (pg_dump, pg_restore, psql) on PATH.
#>
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# Find the PostgreSQL tools (winget installs them under Program Files)
$pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if ($pgBin) { $env:Path = "$($pgBin.FullName);$env:Path" }
foreach ($tool in "pg_dump", "pg_restore", "psql") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool not found. Install PostgreSQL 17 first." }
}

# Old database: DIRECT_URL from .env
$line = Select-String -Path ".env" -Pattern '^DIRECT_URL=' | Select-Object -First 1
if (-not $line) { throw "DIRECT_URL not found in .env" }
$old = ($line.Line -replace '^DIRECT_URL=', '').Trim('"')

# New database: typed by you, hidden
$secure = Read-Host "Paste the NEW project's Session pooler connection string (port 5432, with password)" -AsSecureString
$new = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($new -notmatch '^postgres(ql)?://') { throw "That does not look like a postgresql:// connection string" }
if ($new -match 'ap-northeast-1') { throw "That is still the Tokyo project - use the new Mumbai one" }
if ($new -notmatch 'sslmode=') { $new += $(if ($new -match '\?') { '&' } else { '?' }) + 'sslmode=require' }

$dump = Join-Path $env:TEMP "aegis-move.dump"
try {
  Write-Host "1/3  Copying from the old database..." -ForegroundColor Cyan
  pg_dump --dbname="$old" --schema=public --no-owner --no-privileges -Fc -f "$dump"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

  Write-Host "2/3  Writing into the new database..." -ForegroundColor Cyan
  pg_restore --dbname="$new" --no-owner --no-privileges --clean --if-exists "$dump"
  if ($LASTEXITCODE -gt 1) { throw "pg_restore failed" }   # 1 = warnings only

  Write-Host "3/3  Turning on row-level security for every table..." -ForegroundColor Cyan
  $sql = "do `$`$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I enable row level security', t); end loop; end `$`$;"
  psql "$new" -v ON_ERROR_STOP=1 -q -c $sql
  if ($LASTEXITCODE -ne 0) { throw "enabling RLS failed" }

  # Via a file: Windows PowerShell drops the double quotes in "User" when passing -c arguments
  $check = Join-Path $env:TEMP "aegis-move-check.sql"
  Set-Content -Path $check -Encoding ascii -Value 'select (select count(*) from "User") || '' users, '' || (select count(*) from "Incident") || '' incidents, '' || (select count(*) from "AuditLog") || '' audit rows'';'
  $count = psql "$new" -t -A -f "$check"
  Remove-Item $check -Force
  Write-Host "Done. New database has: $count" -ForegroundColor Green
}
finally {
  if (Test-Path $dump) { Remove-Item $dump -Force }
  $new = $null
}
