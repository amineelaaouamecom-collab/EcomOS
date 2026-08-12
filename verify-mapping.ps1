$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzQ2MDg0MCwiZXhwIjoyMDk5MDM2ODQwfQ.RnDHx5589GTY43_9E2XT3zakh9UeHaQLTzfofGG75xs"
$h = @{ "Authorization" = "Bearer $key"; "apikey" = $key }
$base = "https://wxfialbmyfkafobtkrde.supabase.co/rest/v1"

# Total count per carrier
Write-Host "=== COUNT per carrier ==="
$all = (Invoke-WebRequest -Uri "$base/city_arabic_names?select=carrier" -Headers $h -UseBasicParsing).Content | ConvertFrom-Json
$all | Group-Object carrier | Select-Object Name, Count | Format-Table | Out-String | Write-Host

# Coliaty sample: 20 rows with carrier_city_id + coliaty city name
Write-Host "=== SAMPLE 20 coliaty rows (with city name) ==="
$r = Invoke-WebRequest -Uri "$base/city_arabic_names?carrier=eq.coliaty&select=id,arabic_name,carrier_city_id,coliaty_cities(name)&order=id&limit=20" -Headers $h -UseBasicParsing
$rows = $r.Content | ConvertFrom-Json
$rows | ForEach-Object {
    $cityName = if ($_.coliaty_cities) { $_.coliaty_cities.name } else { "?" }
    Write-Host "id=$($_.id) | carrier_city_id=$($_.carrier_city_id) | coliaty_name=$cityName | arabic=$($_.arabic_name)"
}

# Check for duplicates: any arabic_name + carrier combo appearing more than once
Write-Host ""
Write-Host "=== DUPLICATE CHECK (arabic_name + carrier) ==="
$coliaty = (Invoke-WebRequest -Uri "$base/city_arabic_names?carrier=eq.coliaty&select=arabic_name" -Headers $h -UseBasicParsing).Content | ConvertFrom-Json
$dups = $coliaty | Group-Object arabic_name | Where-Object { $_.Count -gt 1 }
if ($dups) {
    Write-Host "DUPLICATES FOUND:"
    $dups | ForEach-Object { Write-Host "  '$($_.Name)' appears $($_.Count) times" }
} else {
    Write-Host "No duplicates — all arabic_name values are unique within carrier=coliaty"
}
