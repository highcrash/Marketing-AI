# Marketing AI -> droplet deploy script.
#
# 1. Builds the Next standalone bundle locally
# 2. Packs .next/standalone + .next/static + public + prisma into release.tar.gz
# 3. SCPs the tarball to /root/release.tar.gz on the droplet
# 4. SSHes in, EXTRACTS directly into /opt/marketing-ai (preserving .env,
#    prisma/dev.db, public/uploads), runs prisma migrate, restarts service
#
# Direct-extract avoids the cp doubling that broke the first attempt
# on this 10 GB / 458 MB droplet.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot  = Join-Path $repoRoot 'web'
$deployRoot = $PSScriptRoot
$ssh = Join-Path $deployRoot 'ssh.py'
$python = "C:\Python314\python.exe"

if (-not $env:MARKETING_AI_DEPLOY_PW) {
  throw 'MARKETING_AI_DEPLOY_PW env var must be set'
}

Push-Location $webRoot
try {
  Write-Host '=== building standalone bundle ===' -ForegroundColor Cyan
  & pnpm.cmd build
  if ($LASTEXITCODE -ne 0) { throw "pnpm build failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

# Stage the things we need into a temp tree so tar produces a clean
# archive without dragging unrelated files. Standalone already
# includes its trimmed node_modules; we add static + public + prisma
# (the migrations + schema, for runtime migrate deploy) at the right
# paths.
$stage = Join-Path $env:TEMP "marketing-ai-stage-$(Get-Random)"
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
  Write-Host '=== staging files ===' -ForegroundColor Cyan
  Copy-Item -Path (Join-Path $webRoot '.next\standalone\*') -Destination $stage -Recurse -Force

  $standaloneWeb = Join-Path $stage 'web'
  if (-not (Test-Path $standaloneWeb)) {
    $standaloneWeb = $stage
  }
  $nextStatic = Join-Path $standaloneWeb '.next\static'
  New-Item -ItemType Directory -Path (Split-Path $nextStatic) -Force | Out-Null
  Copy-Item -Path (Join-Path $webRoot '.next\static') -Destination $nextStatic -Recurse -Force
  Copy-Item -Path (Join-Path $webRoot 'public') -Destination (Join-Path $standaloneWeb 'public') -Recurse -Force
  Copy-Item -Path (Join-Path $webRoot 'prisma') -Destination (Join-Path $standaloneWeb 'prisma') -Recurse -Force

  # Strip the Windows Prisma query engine -- we only need the Linux
  # binary on the droplet. Saves ~21 MB and trims a binary that won't
  # run on Ubuntu anyway.
  Get-ChildItem -Path $standaloneWeb -Recurse -Filter 'query_engine-windows*' -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  # Also drop the WASM engine -- server-side runtime uses the native
  # .so.node binary, the wasm variant is only for edge/wasm runtimes.
  Get-ChildItem -Path $standaloneWeb -Recurse -Filter 'query_engine_bg*' -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $standaloneWeb -Recurse -Filter 'libquery_engine-*.dylib*' -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

  $tarball = Join-Path $env:TEMP 'marketing-ai-release.tar.gz'
  if (Test-Path $tarball) { Remove-Item $tarball -Force }
  Write-Host '=== packing release.tar.gz ===' -ForegroundColor Cyan
  # Windows Defender + the just-finished Copy-Item briefly hold a
  # handle on files in $stage, which makes the first tar invocation
  # error out with exit 2 (one or more files vanished mid-read).
  # Retry up to 3 times with backoff before giving up.
  function Invoke-Tar {
    param([string]$Workdir, [string]$Tarball)
    Push-Location $Workdir
    try {
      for ($attempt = 1; $attempt -le 5; $attempt++) {
        if (Test-Path $Tarball) { Remove-Item $Tarball -Force }
        # Capture stderr so we can see WHICH file tar bails on. Exit 2
        # = "warning, some files vanished mid-read"; usually Windows
        # holding a handle on something the build just touched.
        $stderrFile = Join-Path $env:TEMP "mai-tar-err-$attempt.txt"
        & tar -czf $Tarball . 2> $stderrFile
        if ($LASTEXITCODE -eq 0) {
          Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue
          return
        }
        $errs = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { '' }
        $head = if ($errs.Length -gt 400) { $errs.Substring(0, 400) } else { $errs }
        Write-Warning "tar attempt $attempt exit $LASTEXITCODE -- stderr: $head"
        Start-Sleep -Seconds $attempt
      }
      throw "tar failed after 5 attempts (exit $LASTEXITCODE) -- see /tmp stderr files"
    } finally { Pop-Location }
  }

  # The `web/` leading component is in the archive because that's how
  # we staged. Move out of `web/` so the tarball has the standalone
  # tree at its root.
  $tarRoot = if (Test-Path (Join-Path $stage 'web')) { Join-Path $stage 'web' } else { $stage }
  Invoke-Tar -Workdir $tarRoot -Tarball $tarball
  $sizeMB = [math]::Round((Get-Item $tarball).Length / 1MB, 1)
  Write-Host "tarball: $tarball ($sizeMB MB)"

  Write-Host '=== uploading ===' -ForegroundColor Cyan
  & $python $ssh put $tarball '/root/release.tar.gz'
  if ($LASTEXITCODE -ne 0) { throw "scp upload failed ($LASTEXITCODE)" }

  Write-Host '=== remote unpack + restart ===' -ForegroundColor Cyan
  # ssh.py exec takes ONE argument; PowerShell splits a here-string at
  # whitespace when passing it as argv. Solution: ship the script as a
  # file and have the remote bash it.
  $remoteScriptPath = Join-Path $env:TEMP 'mai-remote-deploy.sh'
  $remoteScriptBody = @'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/marketing-ai
echo '-- stopping service (frees memory) --'
systemctl stop marketing-ai.service 2>/dev/null || true
echo '-- preserving .env / db / uploads --'
mkdir -p "$APP_DIR/prisma" "$APP_DIR/public/uploads"
[ -f "$APP_DIR/.env" ] && cp -a "$APP_DIR/.env" /tmp/mai-keep.env
[ -f "$APP_DIR/prisma/dev.db" ] && cp -a "$APP_DIR/prisma/dev.db" /tmp/mai-keep.db
if [ -d "$APP_DIR/public/uploads" ] && [ "$(ls -A "$APP_DIR/public/uploads" 2>/dev/null)" ]; then
  rm -rf /tmp/mai-keep-uploads
  cp -a "$APP_DIR/public/uploads" /tmp/mai-keep-uploads
fi
echo '-- clearing old release (preserving .env) --'
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' -exec rm -rf {} +
echo '-- extracting new release --'
tar -xzf /root/release.tar.gz -C "$APP_DIR"
rm -f /root/release.tar.gz
echo '-- restoring preserved data --'
[ -f /tmp/mai-keep.env ] && mv /tmp/mai-keep.env "$APP_DIR/.env"
[ -f /tmp/mai-keep.db ] && mv /tmp/mai-keep.db "$APP_DIR/prisma/dev.db"
if [ -d /tmp/mai-keep-uploads ]; then
  rm -rf "$APP_DIR/public/uploads"
  mv /tmp/mai-keep-uploads "$APP_DIR/public/uploads"
fi
echo '-- running prisma migrate deploy --'
# prisma cli installed globally at /usr/local/bin/prisma (npm i -g
# prisma@6.19.3 one-off). Reads DATABASE_URL from /opt/marketing-ai/.env.
cd "$APP_DIR" && prisma migrate deploy || echo 'migrate deploy failed (non-fatal - service will still start; check logs)'
echo '-- starting service --'
systemctl start marketing-ai.service
sleep 3
systemctl status marketing-ai.service --no-pager --lines=12 || true
echo
echo '-- listening on :3000 ? --'
ss -tlnp 'sport = :3000' || true
echo
df -h /
'@
  # WriteAllText with UTF8Encoding(false) avoids the BOM that
  # PowerShell's Set-Content -Encoding UTF8 prepends. The BOM breaks
  # bash's shebang parsing.
  [System.IO.File]::WriteAllText($remoteScriptPath, $remoteScriptBody, [System.Text.UTF8Encoding]::new($false))
  & $python $ssh put $remoteScriptPath '/root/mai-remote-deploy.sh'
  if ($LASTEXITCODE -ne 0) { throw "scp deploy.sh failed ($LASTEXITCODE)" }
  & $python $ssh exec 'bash /root/mai-remote-deploy.sh'
  if ($LASTEXITCODE -ne 0) { throw "remote deploy failed ($LASTEXITCODE)" }

  Write-Host '=== done -- http://ai.eatrobd.com/ ===' -ForegroundColor Green
} finally {
  Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}
