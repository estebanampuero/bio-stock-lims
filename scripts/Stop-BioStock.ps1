#Requires -Version 5.1
<#
.SYNOPSIS
    BIO-STOCK LIMS — Detener todos los servicios
.EXAMPLE
    .\Stop-BioStock.ps1
#>
. (Join-Path $PSScriptRoot 'BioStockConfig.ps1')

if (-not (Test-Administrator)) { Write-BioLog 'Requiere Administrador.' ERROR; exit 1 }

Write-BioLog 'Deteniendo BIO-STOCK LIMS...' INFO
Stop-Service -Name $script:BioStock.ServiceNginx -Force -ErrorAction SilentlyContinue
Stop-Service -Name $script:BioStock.ServiceApi   -Force -ErrorAction SilentlyContinue
Write-BioLog 'Servicios detenidos.' OK
