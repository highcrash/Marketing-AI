# Wrapper that runs `git push origin main` then redeploys to the
# droplet. Use this instead of plain `git push` whenever you want the
# live ai.eatrobd.com site updated with the new commit.
#
# Usage:
#   $env:MARKETING_AI_DEPLOY_PW = '<droplet root password>'
#   powershell -ExecutionPolicy Bypass -File .deploy/push-and-deploy.ps1
#
# The password defaults to the value in .deploy/.deploy_pw if present
# so future Claude sessions / scripts don't need to set the env var.

$ErrorActionPreference = 'Stop'

$deployRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $deployRoot

if (-not $env:MARKETING_AI_DEPLOY_PW) {
  $pwFile = Join-Path $deployRoot '.deploy_pw'
  if (Test-Path $pwFile) {
    $env:MARKETING_AI_DEPLOY_PW = (Get-Content $pwFile -Raw).Trim()
  } else {
    throw 'Set MARKETING_AI_DEPLOY_PW env var or create .deploy/.deploy_pw'
  }
}

Push-Location $repoRoot
try {
  Write-Host '=== git push origin main ===' -ForegroundColor Cyan
  & git push origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

Write-Host '=== deploying to droplet ===' -ForegroundColor Cyan
& (Join-Path $deployRoot 'deploy.ps1')
if ($LASTEXITCODE -ne 0) { throw "deploy failed ($LASTEXITCODE)" }
