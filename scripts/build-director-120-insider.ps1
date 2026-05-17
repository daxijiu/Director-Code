[CmdletBinding()]
param(
	[string]$Profile = "docs/upgrade/profiles/120-insider-win32-x64-client.json",
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

if (-not $PSBoundParameters.ContainsKey("Profile")) {
	$PSBoundParameters["Profile"] = $Profile
}

$BuildScript = Join-Path $PSScriptRoot "build-director-116.ps1"
& $BuildScript @PSBoundParameters
