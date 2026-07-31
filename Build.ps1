[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",
    [ValidateSet("windows-vs2022", "windows-vs2026")]
    [string] $Preset = "windows-vs2026",
    [string] $QtRoot = $env:CROWN_QT_ROOT,
    [switch] $Test
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$configureArguments = @("--preset", $Preset)
if (-not [string]::IsNullOrWhiteSpace($QtRoot)) {
    $configureArguments += "-DCROWN_QT_ROOT=$([System.IO.Path]::GetFullPath($QtRoot))"
}

& cmake @configureArguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& cmake --build --preset $Preset --config $Configuration
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if ($Test) {
    $buildDir = Join-Path $repoRoot "Build/$Preset"
    & ctest --test-dir $buildDir -C $Configuration --output-on-failure
    exit $LASTEXITCODE
}

