# ---------------------------------------------------------
# Project Digital - API connectivity test (Windows / PowerShell)
# Phase 1 checklist item: "APIs tested (Claude, OpenAI, Bitly)".
#
# Reads keys from .env in the project root. Makes one cheap, real
# call per configured API and reports OK / FAIL / SKIPPED.
#
# NOTE: kept ASCII-only on purpose. Windows PowerShell 5.1 misreads
# UTF-8 files without a BOM, which breaks parsing if fancy box/dash
# characters are present. Do not add non-ASCII characters here.
#
# Usage (from project root):
#   ./scripts/test-apis.ps1
# ---------------------------------------------------------

$ErrorActionPreference = 'Stop'

# -- Load .env --
$envPath = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envPath)) {
  Write-Host "No .env found at $envPath - copy .env.example to .env first." -ForegroundColor Red
  exit 1
}

$envVars = @{}
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $k, $v = $line -split '=', 2
  $envVars[$k.Trim()] = $v.Trim()
}

function Get-Key($name) {
  if ($envVars.ContainsKey($name) -and $envVars[$name]) { return $envVars[$name] }
  return $null
}

# Pull the real API error message out of a failed request, not the
# generic ".NET (400) Bad Request" that $_.Exception.Message returns.
function Get-ApiError($err) {
  $resp = $err.Exception.Response
  if ($resp) {
    try {
      $body = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
      $j = $body | ConvertFrom-Json
      if ($j.error.message) { return "HTTP $([int]$resp.StatusCode): $($j.error.message)" }
      return "HTTP $([int]$resp.StatusCode): $body"
    } catch { return $err.Exception.Message }
  }
  return $err.Exception.Message
}

$results = @()
function Record($name, $status, $detail) {
  $script:results += [pscustomobject]@{ API = $name; Status = $status; Detail = $detail }
  $color = switch ($status) { 'OK' {'Green'} 'FAIL' {'Red'} default {'Yellow'} }
  Write-Host ("  [{0,-7}] {1,-12} {2}" -f $status, $name, $detail) -ForegroundColor $color
}

Write-Host "`nTesting Project Digital APIs...`n" -ForegroundColor Cyan

# -- Anthropic (Claude) --
$anthropic = Get-Key 'ANTHROPIC_API_KEY'
if (-not $anthropic) { Record 'Claude' 'SKIPPED' 'ANTHROPIC_API_KEY not set' }
else {
  try {
    $body = @{
      model = 'claude-haiku-4-5-20251001'
      max_tokens = 8
      messages = @(@{ role = 'user'; content = 'ping' })
    } | ConvertTo-Json -Depth 5
    $r = Invoke-RestMethod -Method Post -Uri 'https://api.anthropic.com/v1/messages' `
      -Headers @{ 'x-api-key' = $anthropic; 'anthropic-version' = '2023-06-01'; 'content-type' = 'application/json' } `
      -Body $body
    Record 'Claude' 'OK' ("model {0}" -f $r.model)
  } catch { Record 'Claude' 'FAIL' (Get-ApiError $_) }
}

# -- OpenAI (image gen) --
$openai = Get-Key 'OPENAI_API_KEY'
if (-not $openai) { Record 'OpenAI' 'SKIPPED' 'OPENAI_API_KEY not set' }
else {
  try {
    $r = Invoke-RestMethod -Method Get -Uri 'https://api.openai.com/v1/models' `
      -Headers @{ 'Authorization' = "Bearer $openai" }
    Record 'OpenAI' 'OK' ("{0} models available" -f $r.data.Count)
  } catch { Record 'OpenAI' 'FAIL' (Get-ApiError $_) }
}

# -- Bitly --
$bitly = Get-Key 'BITLY_ACCESS_TOKEN'
if (-not $bitly) { Record 'Bitly' 'SKIPPED' 'BITLY_ACCESS_TOKEN not set' }
else {
  try {
    $r = Invoke-RestMethod -Method Get -Uri 'https://api-ssl.bitly.com/v4/user' `
      -Headers @{ 'Authorization' = "Bearer $bitly" }
    Record 'Bitly' 'OK' ("user {0}" -f $r.login)
  } catch { Record 'Bitly' 'FAIL' (Get-ApiError $_) }
}

# -- Buffer (Phase 3, optional now) --
$buffer = Get-Key 'BUFFER_ACCESS_TOKEN'
if (-not $buffer) { Record 'Buffer' 'SKIPPED' 'BUFFER_ACCESS_TOKEN not set (Phase 3)' }
else {
  try {
    $r = Invoke-RestMethod -Method Get -Uri "https://api.bufferapp.com/1/user.json?access_token=$buffer"
    Record 'Buffer' 'OK' ("user {0}" -f $r.id)
  } catch { Record 'Buffer' 'FAIL' (Get-ApiError $_) }
}

Write-Host ""
$failed = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
if ($failed -gt 0) { Write-Host "$failed API(s) failed.`n" -ForegroundColor Red; exit 1 }
Write-Host "Done. No failures.`n" -ForegroundColor Green
