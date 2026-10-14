$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

Write-Host ''
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host ' SheRise V8.1 - Windows Setup' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan

foreach ($cmd in @('node','npm','psql')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd is required and was not found in PATH."
    }
}

$databaseUrl = Read-Host 'PostgreSQL DATABASE_URL (example: postgresql://postgres:YOUR_PASSWORD@localhost:5432/sherise)'
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'DATABASE_URL cannot be empty.' }

@"
DATABASE_URL="$databaseUrl"
JWT_SECRET="sherise-windows-development-change-this"
PORT=4000
FRONTEND_URL="http://localhost:5173"
"@ | Set-Content -Path (Join-Path $Backend '.env') -Encoding UTF8

'VITE_API_URL="http://localhost:4000/api"' | Set-Content -Path (Join-Path $Frontend '.env') -Encoding UTF8

Write-Host 'Installing backend dependencies...' -ForegroundColor Yellow
Push-Location $Backend
npm install --no-audit --no-fund
npx prisma generate
Write-Host 'Synchronizing PostgreSQL schema...' -ForegroundColor Yellow
npx prisma db push
if (Test-Path 'prisma/upgrade-v8-1-seller-contact.sql') {
    Write-Host 'Applying idempotent V8.1 seller contact SQL...' -ForegroundColor Yellow
    psql $databaseUrl -f 'prisma/upgrade-v8-1-seller-contact.sql'
}
Write-Host 'Seeding development catalog/accounts...' -ForegroundColor Yellow
npm run seed
Pop-Location

Write-Host 'Installing frontend dependencies...' -ForegroundColor Yellow
Push-Location $Frontend
npm install --no-audit --no-fund
Pop-Location

Write-Host ''
Write-Host 'SheRise V8.1 Windows setup completed successfully.' -ForegroundColor Green
Write-Host 'Backend:  start-backend-windows.bat'
Write-Host 'Frontend: start-frontend-windows.bat'
Write-Host 'Browser:  http://localhost:5173'
