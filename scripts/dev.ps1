# Starts the Project Digital API and dashboard in two new PowerShell windows,
# then opens the dashboard. Run from anywhere:  .\scripts\dev.ps1
# First-time setup is in README.md (Getting started).

$root = Split-Path -Parent $PSScriptRoot

$api = "Set-Location '$root\backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
$web = "Set-Location '$root\dashboard'; npm run dev"

Start-Process powershell -ArgumentList '-NoExit', '-Command', $api
Start-Process powershell -ArgumentList '-NoExit', '-Command', $web

Start-Sleep -Seconds 5
Start-Process 'http://localhost:3000'
