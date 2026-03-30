# Run when C: is low on space. Prisma caches engines under XDG_CACHE_HOME\prisma (else %USERPROFILE%\.cache on C:).
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path "D:\temp\crm-install", "D:\PrismaCache", "D:\npm-cache" | Out-Null
$env:TEMP = "D:\temp\crm-install"
$env:TMP = "D:\temp\crm-install"
$env:XDG_CACHE_HOME = "D:\PrismaCache"
npm config set cache "D:\npm-cache"
Set-Location $PSScriptRoot\..
Write-Host "npm install..."
npm install
Write-Host "prisma generate..."
npm run db:generate
Write-Host "Done. Configure .env, run db:migrate or db:push, db:seed, then npm run dev"
