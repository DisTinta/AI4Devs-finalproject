<#
.SYNOPSIS
    Rebuilds the references from .claude and .cursor to the canonical source in ai-specs.

.DESCRIPTION
    ai-specs/ is the canonical source. This script tries to link with symlinks and falls back
    to copying when the platform does not allow them (Windows without developer mode).

    Entries under .claude/.cursor that are not in ai-specs/ are classified:
    KEEP    — OpenSpec native skills (openspec-*), installed by `openspec init`. Leave them.
    ORPHAN  — anything else. Real drift; the human decides whether to delete.

.PARAMETER Check
    Report only, change nothing.

.PARAMETER Force
    Overwrite copies that diverge from the canonical source.
#>
[CmdletBinding()]
param([switch]$Check, [switch]$Force)

$ErrorActionPreference = 'Stop'
$root = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { (Get-Location).Path }
Set-Location $root

if (-not (Test-Path 'ai-specs')) { throw "No ai-specs/ directory: nothing to sync." }

$linked = 0; $copied = 0; $ok = 0; $conflicts = 0; $orphans = 0; $keep = 0
function Report($tag, $msg) { Write-Host ("  {0,-9} {1}" -f $tag, $msg) }

function Test-ExpectedForeign([string]$Name, [string]$Kind) {
    # OpenSpec init writes openspec-* skills into .claude/skills and .cursor/skills.
    # Kit-owned openspec-implement lives in ai-specs, so it never hits this branch.
    return ($Kind -eq 'skills') -and ($Name -like 'openspec-*')
}

function Test-OsJunkName([string]$Name) {
    $n = $Name.ToLowerInvariant()
    return $n -eq 'desktop.ini' -or $n -eq 'thumbs.db' -or $n -eq '.ds_store'
}

function Remove-OsJunk($Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Where-Object { Test-OsJunkName $_.Name } |
        Remove-Item -Force
}

function Sync-One($src, $dst) {
    $item = Get-Item -LiteralPath $dst -Force -ErrorAction SilentlyContinue

    # Existing symlink
    if ($item -and $item.LinkType -eq 'SymbolicLink') {
        if (Test-Path -LiteralPath $dst) { $script:ok++; return }
        if ($Check) { Report 'BROKEN' $dst; return }
        Remove-Item -LiteralPath $dst -Force
        $item = $null
    }

    # A materialised symlink: small text file containing a relative path
    if ($item -and -not $item.PSIsContainer -and $item.Length -lt 200) {
        $content = Get-Content -LiteralPath $dst -Raw -ErrorAction SilentlyContinue
        if ($content -match '^\.\./') {
            if ($Check) { Report 'TEXT' "$dst (materialised symlink)"; return }
            Remove-Item -LiteralPath $dst -Force
            $item = $null
        }
    }

    # Real existing copy
    if ($item) {
        $diff = $null
        try {
            $a = Get-ChildItem -LiteralPath $src -Recurse -File -Force -ErrorAction SilentlyContinue |
                Where-Object { -not (Test-OsJunkName $_.Name) } | Sort-Object FullName
            $b = Get-ChildItem -LiteralPath $dst -Recurse -File -Force -ErrorAction SilentlyContinue |
                Where-Object { -not (Test-OsJunkName $_.Name) } | Sort-Object FullName
            $diff = Compare-Object ($a | Get-FileHash).Hash ($b | Get-FileHash).Hash
        } catch { $diff = 'unknown' }
        if (-not $diff) { $script:ok++; return }
        if (-not $Force) {
            Report 'DIVERGES' "$dst - differs from ai-specs. Use -Force to overwrite, or move your change into ai-specs/"
            $script:conflicts++; return
        }
        if ($Check) { Report 'STALE' $dst; return }
        Remove-Item -LiteralPath $dst -Recurse -Force
    }

    if ($Check) { Report 'MISSING' $dst; return }
    $parent = Split-Path -Parent $dst
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $depth = ($parent -split '[\\/]').Count
    $rel = ('..\' * $depth) + $src.Replace('/', '\')
    try {
        New-Item -ItemType SymbolicLink -Path $dst -Target $rel -ErrorAction Stop | Out-Null
        $script:linked++
    } catch {
        Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
        Remove-OsJunk $dst
        $script:copied++
    }
}

Write-Host "Syncing artifacts from ai-specs/"
foreach ($tool in @('.claude', '.cursor')) {
    foreach ($kind in @('skills', 'agents')) {
        $srcDir = Join-Path 'ai-specs' $kind
        if (-not (Test-Path $srcDir)) { continue }
        $dstDir = Join-Path $tool $kind
        if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

        Get-ChildItem -LiteralPath $srcDir -Force | Where-Object { -not (Test-OsJunkName $_.Name) } | ForEach-Object {
            Sync-One "$srcDir/$($_.Name)" (Join-Path $dstDir $_.Name)
        }
        Get-ChildItem -LiteralPath $dstDir -Force -ErrorAction SilentlyContinue | Where-Object { -not (Test-OsJunkName $_.Name) } | ForEach-Object {
            if (-not (Test-Path (Join-Path $srcDir $_.Name))) {
                if (Test-ExpectedForeign $_.Name $kind) {
                    Report 'KEEP' "$dstDir\$($_.Name) - OpenSpec native skill (not from ai-specs; do not delete)"
                    $script:keep++
                } else {
                    Report 'ORPHAN' "$dstDir\$($_.Name) - not present in $srcDir"
                    $script:orphans++
                }
            }
        }
    }
}

Write-Host ""
Write-Host ("  linked {0} · copied {1} · ok {2} · diverging {3} · orphans {4} · keep {5}" -f $linked, $copied, $ok, $conflicts, $orphans, $keep)
if ($copied -gt 0) {
    Write-Host ""
    Write-Host "  This platform does not allow symlinks, so copies were made."
    Write-Host "  Always edit ai-specs/ and re-run this script to propagate."
}
if ($keep -gt 0) {
    Write-Host ""
    Write-Host "  KEEP = OpenSpec skills from 'openspec init'. They do not live in ai-specs/. Do not delete them."
}
if ($conflicts -gt 0 -or $orphans -gt 0) { exit 1 }
