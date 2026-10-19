# Restores the three local simulation services without changing .env or operator auth.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$voiceRoot = Split-Path $PSScriptRoot -Parent
Push-Location $voiceRoot
try {
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Run npm ci and npm run setup first.' }
    $candidates = @($env:CHORUS_NODE_EXE)
    $installed = Get-Command node -ErrorAction SilentlyContinue
    if ($installed) { $candidates += $installed.Source }
    $candidates += (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
    $nodeExe = $null
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $version = & $candidate -p 'process.versions.node'
            if ([version]$version -ge [version]'24.12.0') { $nodeExe = (Resolve-Path -LiteralPath $candidate).Path; break }
        }
    }
    if (-not $nodeExe) { throw 'Install Node 24.12+ or set CHORUS_NODE_EXE to its node.exe.' }
    $configuration = & $nodeExe --env-file=.env scripts/local-runtime-check.mjs configuration | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $configuration.safe -or -not $configuration.origin -or -not $configuration.localDatabase) {
        throw 'This helper requires the documented loopback database/origin and simulation-only configuration. Use DEPLOYMENT.md for other setups.'
    }
    New-Item -ItemType Directory -Path '.data' -Force | Out-Null
    $runtime = @{}
    if (Test-Path -LiteralPath '.data/runtime.private.json') {
        $previous = Get-Content -LiteralPath '.data/runtime.private.json' -Raw | ConvertFrom-Json
        foreach ($property in $previous.PSObject.Properties) { $runtime[$property.Name] = $property.Value }
    }
    function Save-Runtime { $runtime | ConvertTo-Json | Set-Content -LiteralPath '.data/runtime.private.json' }
    function Start-ServiceNode([string]$Name, [string[]]$Arguments) {
        $child = Start-Process -FilePath $nodeExe -ArgumentList $Arguments -WorkingDirectory $voiceRoot -WindowStyle Hidden -RedirectStandardOutput ".data/$Name-runtime.log" -RedirectStandardError ".data/$Name-runtime.error.log" -PassThru
        $runtime[$Name] = $child.Id
        Save-Runtime
        return $child
    }
    function Is-RecordedNode([string]$Name, [string]$EntryPoint) {
        if (-not $runtime.ContainsKey($Name)) { return $false }
        $recorded = Get-CimInstance Win32_Process -Filter "ProcessId = $($runtime[$Name])" -ErrorAction SilentlyContinue
        return $recorded -and $recorded.ExecutablePath -eq $nodeExe -and $recorded.CommandLine.Contains($EntryPoint)
    }
    $databaseReady = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        & $nodeExe --env-file=.env scripts/local-runtime-check.mjs database 2>$null
        if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
        if ($attempt -eq 0) {
            $listener = Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue
            if (-not $listener) { $null = Start-ServiceNode 'database' @('--import','tsx','scripts/local-db.ts') }
            Write-Output 'Waiting for PostgreSQL recovery/readiness. Existing data stays in place.'
        }
        Start-Sleep -Seconds 1
    }
    if (-not $databaseReady) { throw 'Database readiness timed out. Inspect .data/database-runtime.error.log; do not delete .data/postgres.' }
    & $nodeExe --env-file=.env --import tsx scripts/migrate.ts
    if ($LASTEXITCODE -ne 0) { throw 'Database migrations failed.' }
    $webListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($webListener) {
        if (-not (Is-RecordedNode 'web' 'scripts/start.mjs') -or $webListener.OwningProcess -ne $runtime['web']) {
            throw 'Port 3000 belongs to an unrecognized process. This helper will not stop or replace it.'
        }
    } else {
        if (-not (Test-Path -LiteralPath '.next/standalone/server.js')) { throw 'Run npm run build before starting production preview.' }
        $null = Start-ServiceNode 'web' @('scripts/start.mjs')
    }
    $webReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
            if ($health.ok) { $webReady = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $webReady) { throw 'Web readiness failed. Inspect .data/web-runtime.error.log.' }
    if (-not (Is-RecordedNode 'worker' 'worker/index.ts')) {
        $null = Start-ServiceNode 'worker' @('--env-file=.env','--import','tsx','worker/index.ts')
    }
    $workerReady = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (-not (Is-RecordedNode 'worker' 'worker/index.ts')) {
            if ($attempt -ge 5 -and -not (Get-Process -Id $runtime['worker'] -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Seconds 1
            continue
        }
        $workerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($runtime['worker'])" -ErrorAction SilentlyContinue
        if ($workerProcess -and (Test-Path -LiteralPath '.data/worker-runtime.log')) {
            $workerLog = Get-Item -LiteralPath '.data/worker-runtime.log'
            if ($workerLog.LastWriteTimeUtc -ge $workerProcess.CreationDate.ToUniversalTime() -and
                (Select-String -LiteralPath $workerLog.FullName -SimpleMatch 'CHORUS worker ready' -Quiet)) {
                $workerReady = $true; break
            }
        }
        Start-Sleep -Seconds 1
    }
    if (-not $workerReady) { throw 'Worker readiness failed. Inspect .data/worker-runtime.error.log.' }
    Write-Output 'CHORUS simulation is ready: http://localhost:3000/app'
    Write-Output 'Web, PostgreSQL and the separate worker are running in the background. Email login is unchanged.'
    Write-Output 'After a reboot, run this command again. Real calls remain disabled.'
} finally { Pop-Location }
