param(
	[string]$AppExe = "$env:LOCALAPPDATA\Programs\Director-Code\Director-Code.exe",
	[string]$UserDataDir = "$PSScriptRoot\..\..\artifacts\wave2-provider-smoke-profile",
	[switch]$PostCheck
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
	$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PathValue)
}

$ResolvedUserDataDir = Resolve-FullPath $UserDataDir

if ($PostCheck) {
	Write-Host "Checking smoke profile: $ResolvedUserDataDir"
	$registry = Get-ChildItem -LiteralPath $ResolvedUserDataDir -Recurse -Filter directorCodeProviders.json -ErrorAction SilentlyContinue | Select-Object -First 1
	$projection = Get-ChildItem -LiteralPath $ResolvedUserDataDir -Recurse -Filter chatLanguageModels.json -ErrorAction SilentlyContinue | Select-Object -First 1
	if (-not $registry) {
		throw "directorCodeProviders.json was not found under the smoke profile."
	}
	if (-not $projection) {
		throw "chatLanguageModels.json was not found under the smoke profile."
	}
	Write-Host "Director provider registry: $($registry.FullName)"
	Write-Host "VS Code model projection: $($projection.FullName)"
	Write-Host "Post-check passed. Inspect both JSON files if a UI/provider issue remains."
	exit 0
}

if (-not (Test-Path -LiteralPath $AppExe)) {
	throw "Director-Code executable not found: $AppExe"
}

New-Item -ItemType Directory -Force -Path $ResolvedUserDataDir | Out-Null

Write-Host "Launching Director-Code with isolated user data:"
Write-Host "  $ResolvedUserDataDir"
Write-Host ""
Write-Host "Manual Wave 2 smoke steps:"
Write-Host "1. Open Director Code Settings."
Write-Host "2. Create or edit an OpenAI API-key provider instance; add a model and save."
Write-Host "3. Create or edit an OpenAI OAuth provider instance; sign in and save."
Write-Host "4. Create an OpenAI-compatible provider instance with a custom base URL and manual model list."
Write-Host "5. Create an env-var API-key provider instance, then restart from a shell where the env var is set."
Write-Host "6. Open Manage Models and confirm Director instances appear as groups."
Write-Host "7. Send one Ask/Agent request with a selected Director model."
Write-Host ""
Write-Host "After closing the app, run:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -UserDataDir `"$ResolvedUserDataDir`" -PostCheck"

Start-Process -FilePath $AppExe -ArgumentList @(
	"--user-data-dir", "`"$ResolvedUserDataDir`"",
	"--disable-workspace-trust"
)
