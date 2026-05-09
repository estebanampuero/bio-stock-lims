#Requires -Version 5.1
<#
.SYNOPSIS
    Configura la Política de Ejecución de PowerShell para BIO-STOCK LIMS
    Ejecutar UNA SOLA VEZ como Administrador antes del primer uso de los scripts.
#>

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'ERROR: Ejecutar como Administrador.' -ForegroundColor Red
    exit 1
}

$scriptDir = Split-Path $PSScriptRoot -Parent

# Política para el directorio del proyecto (no afecta política global)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force
Write-Host "[OK] Política de ejecución configurada: RemoteSigned (LocalMachine)" -ForegroundColor Green

# Desbloquear scripts descargados
Get-ChildItem (Join-Path $scriptDir 'scripts') -Filter '*.ps1' | ForEach-Object {
    Unblock-File -Path $_.FullName
    Write-Host "  Desbloqueado: $($_.Name)" -ForegroundColor Gray
}

Write-Host "`n[OK] Scripts de BIO-STOCK listos para ejecutar." -ForegroundColor Green
Write-Host '     Siguiente paso: .\scripts\Install-BioStock.ps1' -ForegroundColor Cyan
