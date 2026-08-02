# Manual de Instalación — BIO-STOCK LIMS

> Para el personal de IT del laboratorio. Instalación tipo software comercial:
> doble clic, sin instalar Node, Python, Docker ni nada más.

## Requisitos

- Windows 10 u 11, 64 bits.
- ~200 MB de disco. ~150 MB de RAM.
- Puerto 3000 libre (o el que elijas en el wizard).
- Permisos de **Administrador** en el PC que hará de servidor.
- **No** requiere internet para funcionar (sí para descargar el instalador y, si se
  activa, la autoactualización).

## Elegir el PC servidor

Un único PC actúa como **servidor**. El resto de los equipos acceden desde el navegador
por la IP de ese PC. Elige uno que esté encendido durante el horario del laboratorio.

## Instalación (doble clic)

1. Copia `BioStock-Setup-x.y.z.exe` al PC servidor.
2. Doble clic. Si aparece **"Editor desconocido"** (SmartScreen):
   *Más información* → *Ejecutar de todas formas* (el instalador no está firmado).
3. Acepta el control de cuentas de usuario (UAC).
4. En el wizard:
   - **Carpeta**: deja `C:\BioStock`.
   - **Puerto**: deja `3000` salvo que esté ocupado.
   - **HTTPS**: actívalo si manejas información sensible en la red (genera un certificado
     autofirmado; los navegadores mostrarán un aviso que se puede aceptar, o importar el
     certificado raíz — ver más abajo).
   - **Autoactualización semanal**: recomendado dejarlo activo.
   - **Acceso directo en el Escritorio**: opcional.
5. Al terminar, se **abre el navegador** en `http://localhost:3000` automáticamente.

### Primer ingreso

- Usuario: **admin** — PIN inicial: **1234** (o el PIN generado que muestra el instalador
  en `C:\BioStock\INITIAL_PIN.txt`, si aplica).
- **Cambia el PIN del admin de inmediato** desde *Personal*.

## Acceso desde los otros PC de la red

1. En el servidor, averigua su IP: PowerShell → `ipconfig` (dirección IPv4, ej. `192.168.1.100`).
2. En los otros equipos, abre el navegador en `http://192.168.1.100:3000`
   (o `https://…` si activaste TLS).
3. El firewall ya quedó abierto para ese puerto en perfiles Domain/Private.

## Qué instaló exactamente

- Servicio Windows **`BioStock-API`** (autoarranque al encender, se reinicia si se cae).
  Verlo en `services.msc` o `Get-Service BioStock-API`.
- Regla de firewall **`BioStock-HTTP`** para el puerto elegido.
- Tareas programadas: **backup diario 02:00** + **verificación 02:15** (y **Check-Update**
  domingos 03:30 si activaste autoactualización).
- Carpeta `C:\BioStock` con: `BioStock-LIMS.exe`, `data\`/DB, `secrets\` (ACL estricta),
  `backups\`, `logs\`, `scripts\`.

## Instalación silenciosa (despliegue masivo)

```powershell
BioStock-Setup-1.1.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

## Importar datos de las pruebas en la nube

Si probaste en `biostock.aurik.cl` y quieres traer esos datos:

1. Descarga la DB desde *Respaldos → Descargar base de datos* (archivo `.db`).
2. Instala normalmente, luego detén el servicio, reemplaza `C:\BioStock\inventario_biorad.db`
   por el descargado y reinicia:
   ```powershell
   Stop-Service BioStock-API
   Copy-Item C:\Users\Lab\Downloads\biostock_xxxx.db C:\BioStock\inventario_biorad.db -Force
   Start-Service BioStock-API
   ```
   (O usa el instalador manual por PowerShell con `-ImportDb`, ver `scripts\Install-BioStock.ps1`.)

## TLS: quitar el aviso del navegador

En cada PC cliente, importar el certificado raíz una vez:

```powershell
certutil -addstore -f Root "\\192.168.1.100\...\cert.pem"
```

## Verificación post-instalación

```powershell
Get-Service BioStock-API                     # Debe estar 'Running'
Invoke-RestMethod http://localhost:3000/health   # { status: ok, version: x.y.z }
.\scripts\Get-BioStockStatus.ps1             # Panel de estado completo
```

## Problemas comunes

| Síntoma | Causa / Solución |
|---|---|
| El navegador no abre / "no se puede conectar" | El servicio tarda unos segundos. Reintenta; revisa `Get-Service BioStock-API`. |
| Puerto 3000 ocupado | Reinstala eligiendo otro puerto, o libera el 3000. |
| Otros PC no acceden | Verifica la IP del servidor y que estén en la misma red; revisa el firewall. |
| SmartScreen bloquea | *Más información → Ejecutar de todas formas* (instalador sin firmar). |
| `/health` no responde | Revisa `C:\BioStock\logs\api-stderr.log`. |
