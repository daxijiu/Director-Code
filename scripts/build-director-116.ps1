[CmdletBinding()]
param(
	[string]$Profile = "docs/upgrade/profiles/116-stable-win32-x64-client.json",
	[string]$Target = "vscode.generated",
	[switch]$SkipReplay,
	[switch]$SkipNpmCi,
	[switch]$ForceNpmCi,
	[switch]$SkipCompileCheck,
	[switch]$SkipCoreCi,
	[switch]$SkipMin,
	[switch]$SkipInstallers,
	[switch]$SystemOnly,
	[switch]$UserOnly
)

$ErrorActionPreference = "Stop"

if ($SystemOnly -and $UserOnly) {
	throw "Use either -SystemOnly or -UserOnly, not both."
}

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$RepoRootWithSlash = $RepoRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
Set-Location -LiteralPath $RepoRoot

function Get-RepoPath {
	param([Parameter(Mandatory = $true)][string]$Path)
	if ([IO.Path]::IsPathRooted($Path)) {
		return [IO.Path]::GetFullPath($Path)
	}
	return [IO.Path]::GetFullPath((Join-Path $RepoRoot $Path))
}

function Assert-UnderRepo {
	param([Parameter(Mandatory = $true)][string]$Path)
	$fullPath = [IO.Path]::GetFullPath($Path)
	if ($fullPath -ne $RepoRoot -and -not $fullPath.StartsWith($RepoRootWithSlash, [StringComparison]::OrdinalIgnoreCase)) {
		throw "Path is outside repository root: $fullPath"
	}
	return $fullPath
}

function Invoke-Step {
	param(
		[Parameter(Mandatory = $true)][string]$Name,
		[Parameter(Mandatory = $true)][scriptblock]$Script
	)
	Write-Host ""
	Write-Host "==> $Name"
	& $Script
}

function Invoke-External {
	param(
		[Parameter(Mandatory = $true)][string]$FilePath,
		[Parameter(Mandatory = $true)][string[]]$Arguments,
		[string]$WorkingDirectory = (Get-Location).Path
	)
	Push-Location -LiteralPath $WorkingDirectory
	try {
		& $FilePath @Arguments
		$exitCode = $LASTEXITCODE
		if ($null -ne $exitCode -and $exitCode -ne 0) {
			throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
		}
	} finally {
		Pop-Location
	}
}

function Copy-Installer {
	param(
		[Parameter(Mandatory = $true)][string]$Source,
		[Parameter(Mandatory = $true)][string]$Destination
	)
	if (-not (Test-Path -LiteralPath $Source)) {
		throw "Installer was not produced: $Source"
	}
	$destinationDir = Split-Path -Parent $Destination
	New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
	Copy-Item -LiteralPath $Source -Destination $Destination -Force
	$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
	Write-Host "$Destination"
	Write-Host "  sha256: $hash"
}

$ProfilePath = Assert-UnderRepo (Get-RepoPath $Profile)
if (-not (Test-Path -LiteralPath $ProfilePath)) {
	throw "Profile not found: $ProfilePath"
}

$TargetPath = Assert-UnderRepo (Get-RepoPath $Target)
$ProfileJson = Get-Content -LiteralPath $ProfilePath -Raw | ConvertFrom-Json
$RelativeProfile = $ProfilePath
if ($ProfilePath.StartsWith($RepoRootWithSlash, [StringComparison]::OrdinalIgnoreCase)) {
	$RelativeProfile = $ProfilePath.Substring($RepoRootWithSlash.Length)
}
$RelativeProfile = $RelativeProfile.Replace("\", "/")

$env:npm_config_arch = $ProfileJson.arch
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = "1"
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
$env:APP_NAME = $ProfileJson.APP_NAME
$env:BINARY_NAME = $ProfileJson.BINARY_NAME
$env:VSCODE_QUALITY = $ProfileJson.VSCODE_QUALITY
$env:OS_NAME = $ProfileJson.OS_NAME
$env:VSCODE_ARCH = $ProfileJson.VSCODE_ARCH
$env:BUILD_SOURCEVERSION = $ProfileJson.BUILD_SOURCEVERSION
$env:RELEASE_VERSION = $ProfileJson.releaseVersion

if (-not $SkipReplay) {
	Invoke-Step "Materialize Director source from replay" {
		Invoke-External "bash" @(
			"scripts/upgrade/materialize-vscode.sh",
			"--profile", $RelativeProfile,
			"--target", $Target,
			"--up-to-layer", "director",
			"--force"
		) $RepoRoot
	}
}

$VscodeRoot = Assert-UnderRepo (Join-Path $TargetPath "layers/director/vscode")
if (-not (Test-Path -LiteralPath $VscodeRoot)) {
	throw "Director source not found: $VscodeRoot"
}

Invoke-Step "Install dependencies when needed" {
	$nodeModules = Join-Path $VscodeRoot "node_modules"
	if ($SkipNpmCi) {
		Write-Host "Skipping npm ci."
	} elseif ($ForceNpmCi -or -not (Test-Path -LiteralPath $nodeModules)) {
		Invoke-External "npm" @("ci") $VscodeRoot
	} else {
		Write-Host "node_modules exists; skipping npm ci. Use -ForceNpmCi to reinstall."
	}
}

if (-not $SkipCompileCheck) {
	Invoke-Step "TypeScript compile check" {
		Invoke-External "npm" @("run", "compile-check-ts-native") $VscodeRoot
	}
}

if (-not $SkipCoreCi) {
	Invoke-Step "Core CI build" {
		Invoke-External "npm" @("run", "gulp", "--", "core-ci") $VscodeRoot
	}
}

if (-not $SkipMin) {
	Invoke-Step "Minified win32-x64 build" {
		Invoke-External "npm" @("run", "gulp", "--", "vscode-win32-x64-min-ci") $VscodeRoot
	}
}

if (-not $SkipInstallers) {
	Invoke-Step "Inno updater metadata" {
		Invoke-External "npm" @("run", "gulp", "--", "vscode-win32-x64-inno-updater") $VscodeRoot
	}

	if (-not $UserOnly) {
		Invoke-Step "System installer" {
			Invoke-External "npm" @("run", "gulp", "--", "vscode-win32-x64-system-setup") $VscodeRoot
		}
	}

	if (-not $SystemOnly) {
		Invoke-Step "User installer" {
			Invoke-External "npm" @("run", "gulp", "--", "vscode-win32-x64-user-setup") $VscodeRoot
		}
	}

	$outRoot = Assert-UnderRepo (Join-Path $RepoRoot ($ProfileJson.artifactPaths.outRoot))
	$version = $ProfileJson.directorVersion
	if (-not $UserOnly) {
		Copy-Installer `
			(Join-Path $VscodeRoot ".build/win32-x64/system-setup/VSCodeSetup.exe") `
			(Join-Path $outRoot "system-setup/Director-CodeSetup-x64-$version.exe")
	}
	if (-not $SystemOnly) {
		Copy-Installer `
			(Join-Path $VscodeRoot ".build/win32-x64/user-setup/VSCodeSetup.exe") `
			(Join-Path $outRoot "user-setup/Director-CodeUserSetup-x64-$version.exe")
	}
}

Write-Host ""
Write-Host "Director build completed."
