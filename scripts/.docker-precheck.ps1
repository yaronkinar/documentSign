$ErrorActionPreference = 'SilentlyContinue'
'--- docker version ---'
docker version --format 'client={{.Client.Version}} server={{.Server.Version}}'
if ($LASTEXITCODE -ne 0) { 'docker NOT available or daemon not running' }
'--- compose ---'
docker compose version
'--- .env present? ---'
"repo .env: $(Test-Path .env)"
"apps/api/.env: $(Test-Path apps/api/.env)"
'--- port listeners (3000/3001/27017/6379) ---'
$ports = 3000, 3001, 27017, 6379
foreach ($p in $ports) {
  $own = (Get-NetTCPConnection -LocalPort $p -State Listen | Select-Object -ExpandProperty OwningProcess -First 1)
  "port $p owner: $own"
}
