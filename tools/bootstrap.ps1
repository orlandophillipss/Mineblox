param([switch]$MinecraftAssets, [switch]$ImportAudio, [switch]$MinecraftClient, [switch]$ClientOnly, [switch]$Manager, [string]$MinecraftName = 'MinebloxJava')
$ErrorActionPreference = 'Stop'
if (($MinecraftClient -or $ClientOnly) -and $MinecraftName -cnotmatch '^[A-Za-z0-9_]{3,16}$') { throw 'MinecraftName must contain 3-16 letters, numbers or underscores' }
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
New-Item -ItemType Directory -Path '.local/tools' -Force | Out-Null
function File-Hash($Filename) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $workspace $Filename))
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
}
function Get-VerifiedFile($Url, $Destination, $Hash) {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
    if ((File-Hash $Destination) -ne $Hash.ToLowerInvariant()) { throw 'Download integrity mismatch' }
}
$nodeVersion = if (Get-Command node -ErrorAction SilentlyContinue) { & node --version } else { '' }
if ($nodeVersion -notmatch '^v(2[4-9]|[3-9][0-9])\.') {
    $version = 'v24.16.0'
    $filename = "node-$version-win-x64.zip"
    $base = "https://nodejs.org/dist/$version"
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
    $hash = (($checksums -split "`n" | Where-Object { $_ -match [regex]::Escape($filename) }) -split '\s+')[0]
    Get-VerifiedFile "$base/$filename" '.local/tools/node.zip' $hash
    Expand-Archive -LiteralPath '.local/tools/node.zip' -DestinationPath '.local/tools' -Force
    $env:PATH = "$workspace\.local\tools\node-$version-win-x64;$env:PATH"
}
$javaVersion = if (Get-Command java -ErrorAction SilentlyContinue) { (& node tools/runtime-info.js java | Out-String) } else { '' }
if ($javaVersion -notmatch 'version "(2[1-9]|[3-9][0-9])') {
    $release = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows'
    $package = $release[0].binary.package
    Get-VerifiedFile $package.link '.local/tools/java.zip' $package.checksum
    Expand-Archive -LiteralPath '.local/tools/java.zip' -DestinationPath '.local/tools/java' -Force
    $env:MINEBLOX_JAVA = (Get-ChildItem -LiteralPath '.local/tools/java' -Filter java.exe -Recurse | Select-Object -First 1).FullName
}
if ($MinecraftClient -or $ClientOnly -or $Manager) {
    $clientRuntime = Get-ChildItem -LiteralPath '.local/tools/java21' -Filter javaw.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $clientRuntime) {
        Write-Output 'Installing the Minecraft client Java 21 runtime…'
        $release = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows'
        $package = $release[0].binary.package
        Get-VerifiedFile $package.link '.local/tools/java21.zip' $package.checksum
        Expand-Archive -LiteralPath '.local/tools/java21.zip' -DestinationPath '.local/tools/java21' -Force
        $clientRuntime = Get-ChildItem -LiteralPath '.local/tools/java21' -Filter javaw.exe -Recurse | Select-Object -First 1
    }
    if (-not $clientRuntime) { throw 'Java 21 client runtime is missing after installation' }
    $env:MINEBLOX_CLIENT_JAVA = $clientRuntime.FullName
}
& node tools/install-tools.js
if ($LASTEXITCODE -ne 0) { throw 'Roblox build tool installation failed' }
$lockHash = File-Hash 'package-lock.json'
$installedHash = if (Test-Path -LiteralPath '.local/dependencies.sha256') { Get-Content -LiteralPath '.local/dependencies.sha256' -Raw } else { '' }
if (-not (Test-Path -LiteralPath 'node_modules/mineflayer') -or $lockHash -ne $installedHash.Trim()) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    Set-Content -LiteralPath '.local/dependencies.sha256' -Value $lockHash
}
if ($ImportAudio) {
    & node --env-file-if-exists=.env tools/import-audio.js --upload
    if ($LASTEXITCODE -ne 0) { throw 'Audio import failed; inspect the saved operation journal before retrying' }
}
if ($MinecraftAssets) { & node tools/prepare-roblox-assets.js --remote } else { & node tools/prepare-roblox-assets.js }
if ($LASTEXITCODE -ne 0) { throw 'Asset preparation failed' }
if ($Manager) {
    & node tools/manager.js
} elseif ($ClientOnly) {
    & node tools/native-client.js --ensure-server --username $MinecraftName --stay-open
} else {
    $launchArgs = @('tools/launcher.js')
    if ($MinecraftClient) { $launchArgs += @('--minecraft-client', '--minecraft-name', $MinecraftName) }
    & node @launchArgs
}
exit $LASTEXITCODE
