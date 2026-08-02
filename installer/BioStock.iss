; ═══════════════════════════════════════════════════════════════════════════
;  BIO-STOCK LIMS — Instalador Windows (Inno Setup 6)
; ═══════════════════════════════════════════════════════════════════════════
;  Empaqueta el .exe autocontenido (Node + React + SQLite embebidos) en un
;  instalador de doble clic tipo software comercial:
;    · Copia binarios a C:\BioStock (sin tocar la base de datos existente).
;    · Registra el servicio Windows, firewall y backups vía Install-BioStock.ps1.
;    · Crea accesos directos y abre el navegador al terminar.
;    · Update-in-place: detiene el servicio, respalda y reemplaza; conserva datos.
;    · Desinstalador limpio que conserva los datos (o los purga si se pide).
;
;  Se compila con ISCC (Inno Setup Compiler). Ver installer/build-installer.ps1.
;  Variables inyectables por línea de comando (/D):
;    AppVersion   → versión (default lee de ..\release\VERSION.txt vía build script)
;    SourceDir    → carpeta con el payload (default ..\release)
; ═══════════════════════════════════════════════════════════════════════════

#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\release"
#endif

#define AppName "BIO-STOCK LIMS"
#define AppPublisher "BIO-STOCK"
#define AppExeName "BioStock-LIMS.exe"
#define AppURL "https://github.com/estebanampuero/bio-stock-lims"
#define ServiceName "BioStock-API"

[Setup]
AppId={{B105T0CK-1119-4A2E-9C3D-B105706C4157}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
DefaultDirName=C:\BioStock
DisableDirPage=no
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\dist-installer
OutputBaseFilename=BioStock-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayName={#AppName} {#AppVersion}
UninstallDisplayIcon={app}\{#AppExeName}
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Dirs]
; La base de datos y los secretos viven aquí. No se sobrescriben en updates.
Name: "{app}\data"
Name: "{app}\backups"
Name: "{app}\logs"
Name: "{app}\secrets"
Name: "{app}\tools"
Name: "{app}\scripts"

[Files]
; Binario principal y binding nativo SQLite (deben viajar juntos).
Source: "{#SourceDir}\{#AppExeName}";      DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\node_sqlite3.node";  DestDir: "{app}"; Flags: ignoreversion
; CLI SQLite para Verify-Backup (opcional si existe en el payload).
Source: "{#SourceDir}\sqlite3.exe";         DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#SourceDir}\VERSION.txt";         DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#SourceDir}\COMO-INSTALAR.txt";   DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#SourceDir}\Iniciar.bat";         DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
; NSSM (gestor de servicio). Lo provee build-installer.ps1 en {#SourceDir}\tools.
Source: "{#SourceDir}\tools\nssm.exe";      DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
; Todos los scripts PowerShell de operación.
Source: "{#SourceDir}\scripts\*.ps1";       DestDir: "{app}\scripts"; Flags: ignoreversion

[INI]
; Acceso directo de internet que abre la UI en el navegador por defecto.
Filename: "{app}\Abrir BIO-STOCK.url"; Section: "InternetShortcut"; Key: "URL"; String: "{code:GetAppUrl}"

[Icons]
Name: "{group}\Abrir BIO-STOCK";               Filename: "{app}\Abrir BIO-STOCK.url"
Name: "{group}\Estado del sistema";            Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\Get-BioStockStatus.ps1"""; WorkingDir: "{app}"
Name: "{group}\Buscar actualizaciones";        Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\Check-Update.ps1"" -Port {code:GetPort}"; WorkingDir: "{app}"
Name: "{group}\Como instalar (manual)";        Filename: "{app}\COMO-INSTALAR.txt"
Name: "{group}\Desinstalar {#AppName}";        Filename: "{uninstallexe}"
Name: "{autodesktop}\Abrir BIO-STOCK";         Filename: "{app}\Abrir BIO-STOCK.url"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"

[Run]
; 1. Registrar servicio + firewall + backups + arranque (reutiliza el script canónico).
Filename: "powershell.exe"; \
  Parameters: "{code:PSInstallArgs}"; \
  StatusMsg: "Registrando servicio Windows, firewall y backups..."; \
  Flags: runhidden waituntilterminated

; 2. Registrar tarea semanal de autoactualización (si el usuario la eligió).
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\Register-UpdateTask.ps1"" -InstallPath ""{app}"" -Port {code:GetPort}"; \
  StatusMsg: "Registrando autoactualización semanal..."; \
  Flags: runhidden waituntilterminated; Check: WantsAutoUpdate

; 3. Abrir la app en el navegador al finalizar (checkbox en la última página).
Filename: "{app}\Abrir BIO-STOCK.url"; \
  Description: "Abrir BIO-STOCK LIMS ahora"; \
  Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
; Detiene y remueve el servicio, firewall y tareas. Conserva los datos.
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\Uninstall-BioStock.ps1"" -InstallPath ""{app}"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "UninstallBioStockService"

[UninstallDelete]
Type: files; Name: "{app}\Abrir BIO-STOCK.url"

[Code]
var
  PortPage: TInputQueryWizardPage;
  OptPage:  TInputOptionWizardPage;

procedure InitializeWizard;
begin
  { Página de puerto }
  PortPage := CreateInputQueryPage(wpSelectDir,
    'Configuración de red',
    'Puerto del servidor',
    'BIO-STOCK correrá como servicio y escuchará en este puerto. Los otros PC de la ' +
    'red accederán vía http://IP-DE-ESTE-PC:PUERTO. Deje 3000 si no tiene un motivo para cambiarlo.');
  PortPage.Add('Puerto HTTP/HTTPS:', False);
  PortPage.Values[0] := '3000';

  { Página de opciones }
  OptPage := CreateInputOptionPage(PortPage.ID,
    'Seguridad y mantenimiento',
    'Opciones recomendadas',
    'Puede cambiar esto más tarde reinstalando o con los scripts de PowerShell.',
    False, False);
  OptPage.Add('Habilitar HTTPS con certificado autofirmado (recomendado si se maneja información sensible)');
  OptPage.Add('Buscar actualizaciones automáticamente cada semana (recomendado)');
  OptPage.Values[0] := False;
  OptPage.Values[1] := True;
end;

function GetPort(Param: String): String;
begin
  Result := Trim(PortPage.Values[0]);
  if Result = '' then Result := '3000';
end;

function IsTLS: Boolean;
begin
  Result := OptPage.Values[0];
end;

function WantsAutoUpdate: Boolean;
begin
  Result := OptPage.Values[1];
end;

function GetAppUrl(Param: String): String;
var
  Scheme: String;
begin
  if IsTLS then Scheme := 'https' else Scheme := 'http';
  Result := Scheme + '://localhost:' + GetPort('');
end;

{ Argumentos para Install-BioStock.ps1 -InPlace }
function PSInstallArgs(Param: String): String;
begin
  Result := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\Install-BioStock.ps1') + '"' +
            ' -InPlace -InstallPath "' + ExpandConstant('{app}') + '"' +
            ' -Port ' + GetPort('');
  if IsTLS then
    Result := Result + ' -EnableTLS';
end;

{ Valida que el puerto sea numérico y esté en rango antes de avanzar. }
function NextButtonClick(CurPageID: Integer): Boolean;
var
  P: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    P := StrToIntDef(Trim(PortPage.Values[0]), -1);
    if (P < 1) or (P > 65535) then
    begin
      MsgBox('El puerto debe ser un número entre 1 y 65535.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ Antes de copiar archivos: detener el servicio para liberar el .exe (updates). }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  NssmPath: String;
begin
  Result := '';
  NssmPath := ExpandConstant('{app}\tools\nssm.exe');
  if FileExists(NssmPath) then
    Exec(NssmPath, 'stop {#ServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
  else
    Exec('net.exe', 'stop {#ServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1500);
end;
