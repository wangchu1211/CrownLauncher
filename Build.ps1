[CmdletBinding()]
param(
    [switch] $Test,
    [switch] $Package
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath "node_modules")) {
        & npm ci
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    & npm run build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    if ($Test) {
        & npm test
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }

    if ($Package) {
        & npm run package
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
