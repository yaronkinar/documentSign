$ErrorActionPreference = 'SilentlyContinue'
# Stop whatever local process is listening on 3000/3001 (the local `npm run dev` stack),
# including child processes, so the Docker web/api containers can bind those ports.
$targetPorts = 3000, 3001
$pids = @()
foreach ($p in $targetPorts) {
  $pids += (Get-NetTCPConnection -LocalPort $p -State Listen | Select-Object -ExpandProperty OwningProcess)
}
$pids = $pids | Sort-Object -Unique | Where-Object { $_ -and $_ -ne 0 }

if (-not $pids) {
  'No local listeners on 3000/3001 - nothing to stop.'
} else {
  foreach ($procId in $pids) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"
    if (-not $proc) { continue }
    # Only touch node.exe (the dev servers); never kill wslrelay/docker.
    if ($proc.Name -ne 'node.exe') {
      "Skipping PID $procId ($($proc.Name)) - not a node dev server."
      continue
    }
    "Stopping node PID $procId tree..."
    taskkill /PID $procId /T /F | Out-Null
  }
}

Start-Sleep -Seconds 1
'--- ports after ---'
foreach ($p in $targetPorts) {
  $own = (Get-NetTCPConnection -LocalPort $p -State Listen | Select-Object -ExpandProperty OwningProcess -First 1)
  if ($own) { "port $p STILL held by $own" } else { "port $p free" }
}
