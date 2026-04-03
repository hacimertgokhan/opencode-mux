param(
  [string]$BinaryPath = "",
  [string]$InstallDir = "$env:LOCALAPPDATA\opencode-mux\bin",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[opencode-mux] $Message"
}

function Resolve-DefaultBinaryPath {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
  $candidates = @(
    (Join-Path $scriptDir "packages\opencode\dist\opencode-mux-windows-x64\bin\opencode-mux.exe"),
    (Join-Path $scriptDir "packages\opencode\dist\opencode-mux-windows-x64-baseline\bin\opencode-mux.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  throw "Built binary not found. Pass -BinaryPath or build opencode-mux first."
}

if (-not $BinaryPath) {
  $BinaryPath = Resolve-DefaultBinaryPath
}

if (-not (Test-Path $BinaryPath)) {
  throw "Binary not found: $BinaryPath"
}

$resolvedBinaryPath = (Resolve-Path $BinaryPath).Path
$resolvedInstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$targetExe = Join-Path $resolvedInstallDir "opencode-mux.exe"
$muxCmd = Join-Path $resolvedInstallDir "mux.cmd"
$muxPs1 = Join-Path $resolvedInstallDir "mux.ps1"
$opencodeMuxCmd = Join-Path $resolvedInstallDir "opencode-mux.cmd"

if ((Test-Path $resolvedInstallDir) -and -not $Force) {
  Write-Step "Installing into existing directory: $resolvedInstallDir"
}

New-Item -ItemType Directory -Force -Path $resolvedInstallDir | Out-Null
Copy-Item -Force $resolvedBinaryPath $targetExe

$cmdWrapper = "@echo off`r`n`"%~dp0opencode-mux.exe`" %*`r`n"
$psWrapper = "& `"$targetExe`" @args`r`n"
Set-Content -Path $muxCmd -Value $cmdWrapper -Encoding ASCII
Set-Content -Path $opencodeMuxCmd -Value $cmdWrapper -Encoding ASCII
Set-Content -Path $muxPs1 -Value $psWrapper -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @()
if ($userPath) {
  $pathEntries = $userPath -split ";" | Where-Object { $_ -and $_.Trim() -ne "" }
}

$hasPath = $false
foreach ($entry in $pathEntries) {
  try {
    if ([System.IO.Path]::GetFullPath($entry).TrimEnd("\") -ieq $resolvedInstallDir.TrimEnd("\")) {
      $hasPath = $true
      break
    }
  } catch {
    if ($entry.TrimEnd("\") -ieq $resolvedInstallDir.TrimEnd("\")) {
      $hasPath = $true
      break
    }
  }
}

if (-not $hasPath) {
  $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
    $resolvedInstallDir
  } else {
    "$userPath;$resolvedInstallDir"
  }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  if ($env:Path -notlike "*$resolvedInstallDir*") {
    $env:Path = "$env:Path;$resolvedInstallDir"
  }
  Write-Step "Added to user PATH: $resolvedInstallDir"
} else {
  Write-Step "PATH already contains: $resolvedInstallDir"
}

Write-Step "Installed binary: $targetExe"
Write-Step "Command aliases: mux, opencode-mux"
Write-Host ""
Write-Host "Run in a new terminal: mux"
Write-Host "Or right now in this session: $muxCmd"
