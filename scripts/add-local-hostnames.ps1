$hostsPath = 'C:\Windows\System32\drivers\etc\hosts'
$entries = @(
  '127.0.0.1 collabboard_front',
  '127.0.0.1 collabboard_api'
)

$current = Get-Content -Path $hostsPath -ErrorAction Stop

foreach ($entry in $entries) {
  if (-not ($current -match [regex]::Escape($entry))) {
    Add-Content -Path $hostsPath -Value $entry
  }
}

Write-Host 'Local Collabboard hostnames are configured:'
Write-Host '  http://collabboard_front'
Write-Host '  http://collabboard_api'
