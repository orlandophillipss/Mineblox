param(
    [Parameter(Mandatory = $true)][ValidateSet('FindStudio', 'ClearPorts')][string]$Mode,
    [string]$Place,
    [int]$PreferredId = 0,
    [string]$Ports,
    [int]$ProtectedId = 0
)
$ErrorActionPreference = 'Stop'
try {
    if ($Mode -eq 'FindStudio') {
        if ([string]::IsNullOrWhiteSpace($Place)) { throw 'Missing Studio place path' }
        $windows = @(Get-Process -Name RobloxStudioBeta -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle.StartsWith($Place, [System.StringComparison]::OrdinalIgnoreCase) } |
            Sort-Object Id)
        $selected = $windows | Where-Object { $_.Id -eq $PreferredId } | Select-Object -First 1
        if (-not $selected) { $selected = $windows | Select-Object -First 1 }
        if ($selected) { Write-Output ([string]$selected.Id) } else { Write-Output 'null' }
        # No matching window is a successful query, including a stale saved PID.
        exit 0
    }
    if ($Ports -notmatch '^\d{1,5}(,\d{1,5})*$') { throw 'Invalid required ports' }
    $required = @($Ports.Split(',') | ForEach-Object { [int]$_ } | Sort-Object -Unique)
    if (@($required | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count) { throw 'Invalid required port range' }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { $required -contains $_.LocalPort })
    $stopped = @()
    foreach ($owner in @($listeners | Group-Object OwningProcess)) {
        $ownerId = [int]$owner.Name
        if ($ownerId -le 4 -or $ownerId -eq $ProtectedId -or $ownerId -eq $PID) {
            throw "Cannot stop protected process $ownerId on a required port"
        }
        $process = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        # Recheck ownership immediately before stopping this process, not its tree.
        $current = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
            Where-Object { $_.OwningProcess -eq $ownerId -and $required -contains $_.LocalPort })
        if (-not $current.Count -or $process.HasExited) { continue }
        $name = $process.ProcessName
        Stop-Process -InputObject $process -Force -ErrorAction Stop
        $stopped += @{ pid = $ownerId; name = $name; ports = @($current.LocalPort | Sort-Object -Unique) }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $remaining = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
            Where-Object { $required -contains $_.LocalPort })
        if (-not $remaining.Count) { break }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Required ports did not become available after stopping their owners' }
        Start-Sleep -Milliseconds 100
    } while ($true)
    ConvertTo-Json -InputObject $stopped -Compress -Depth 3
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
