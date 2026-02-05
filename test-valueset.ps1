# Test script to fetch and submit a ValueSet bundle to the SLS service

$bundleUrl = "https://build.fhir.org/ig/SHIFT-Task-Force/SLS-ValueSets/branches/main/Bundle-LeapSlsBundledSensitiveKindCodes.json"

Write-Host "Fetching ValueSet bundle from: $bundleUrl" -ForegroundColor Cyan

try {
    # Fetch the bundle
    $bundle = Invoke-WebRequest -Uri $bundleUrl -UseBasicParsing | Select-Object -ExpandProperty Content
    
    Write-Host "`nSubmitting to SLS service..." -ForegroundColor Cyan
    
    # Submit to the SLS service
    $response = Invoke-WebRequest `
        -Uri "http://localhost:3000/api/v1/valuesets" `
        -Method POST `
        -ContentType "application/json" `
        -Body $bundle `
        -UseBasicParsing
    
    Write-Host "`nResponse from SLS service:" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
}
