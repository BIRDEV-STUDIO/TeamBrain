param([string]$Root = (Get-Location).Path, [string]$Project = "teambrain")
$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot '..\bin\teambrain.js') bootstrap --root $Root --project $Project
