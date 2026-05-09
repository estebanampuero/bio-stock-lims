#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Iniciar todos los servicios
.EXAMPLE
    .\Start-BioStock.ps1
#>
. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')

if (-not (Test-Administrator)) { Write-BioLog 'Requiere Administrador.' ERROR; exit 1 }

Write-BioLog 'Iniciando BIO-STOCK LIMS...' INFO
Start-Service -Name $script:BioStock.ServiceApi   -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Start-Service -Name $script:BioStock.ServiceNginx -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if (Test-ApiHealth) {
    Write-BioLog "Sistema en línea: http://$(Get-ServerIP)" OK
} else {
    Write-BioLog 'Servicios iniciados, pero API no responde aún. Espera unos segundos.' WARN
}
