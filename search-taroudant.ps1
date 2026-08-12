$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzQ2MDg0MCwiZXhwIjoyMDk5MDM2ODQwfQ.RnDHx5589GTY43_9E2XT3zakh9UeHaQLTzfofGG75xs"
$h = @{ "Authorization" = "Bearer $key"; "apikey" = $key }
$base = "https://wxfialbmyfkafobtkrde.supabase.co/rest/v1"

# Search Taroudant variants: taro, taroud
Write-Host "=== coliaty_cities contenant 'taro' ==="
$r = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*taro*&select=id,name&order=name" -Headers $h -UseBasicParsing
$r.Content | ConvertFrom-Json | ForEach-Object { Write-Host "  id=$($_.id)  name=$($_.name)" }

Write-Host ""
Write-Host "=== coliaty_cities contenant 'taroud' ==="
$r2 = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*taroud*&select=id,name&order=name" -Headers $h -UseBasicParsing
$r2.Content | ConvertFrom-Json | ForEach-Object { Write-Host "  id=$($_.id)  name=$($_.name)" }

Write-Host ""
Write-Host "=== coliaty_cities contenant 'tarodd' OR 'taroudan' ==="
$r3 = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*taroud*&select=id,name" -Headers $h -UseBasicParsing
Write-Host $r3.Content

Write-Host ""
Write-Host "=== coliaty_cities contenant 'ouarzaz' ==="
$r4 = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*ouarzaz*&select=id,name&order=name" -Headers $h -UseBasicParsing
$r4.Content | ConvertFrom-Json | ForEach-Object { Write-Host "  id=$($_.id)  name=$($_.name)" }
