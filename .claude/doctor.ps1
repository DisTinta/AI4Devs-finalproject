<#
.SYNOPSIS
    Checks that the SDD Harness Kit is healthy in an already installed project.

.EXAMPLE
    .\doctor.ps1 -Dest C:\proyectos\mi-api
    .\doctor.ps1
#>
[CmdletBinding()]
param(
    [string]$Dest = (Get-Location).Path
)

$ErrorActionPreference = 'Continue'
$Dest = (Resolve-Path -LiteralPath $Dest).Path
$fail = 0
$warn = 0

function Ok($t)   { Write-Host "  OK   $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  WARN $t" -ForegroundColor Yellow; $script:warn++ }
function Fail($t) { Write-Host "  FAIL $t" -ForegroundColor Red; $script:fail++ }

Write-Host ""
Write-Host "SDD Harness Kit doctor — $Dest" -ForegroundColor Cyan
Write-Host ""

function Test-File($rel) {
    $p = Join-Path $Dest $rel
    if (Test-Path -LiteralPath $p) { Ok $rel } else { Fail "missing $rel" }
}

Test-File 'docs\base-standards.md'
Test-File 'docs\project-context.md'
$ctx = Join-Path $Dest 'docs\project-context.md'
if ((Test-Path $ctx) -and (Select-String -Path $ctx -Pattern '\{\{' -Quiet)) {
    Warn 'docs/project-context.md still has unfilled {{...}} placeholders'
}
Test-File '.claude\sdd-harness.env'

foreach ($f in @('CLAUDE.md','AGENTS.md')) {
    if (Test-Path (Join-Path $Dest $f)) { Ok "$f present" }
    else { Warn "missing $f" }
}

if (Test-Path (Join-Path $Dest 'ai-specs\skills')) { Ok 'ai-specs/skills' } else { Fail 'missing ai-specs/skills' }
$skillN = @(Get-ChildItem (Join-Path $Dest 'ai-specs\skills') -Directory -ErrorAction SilentlyContinue).Count
Ok "canonical skills: $skillN"

$hooks = @(
    'session-context','block-secrets','block-secret-reads','block-dangerous-bash',
    'docs-gate','protect-specs-and-tests','post-edit-quality','validate-tasks','verify-tests','lib'
)
foreach ($h in $hooks) {
    $hp = Join-Path $Dest ".claude\hooks\$h.sh"
    if (Test-Path $hp) { Ok "hook $h" } else { Fail "missing hook $h.sh" }
}
$invoke = Join-Path $Dest '.claude\hooks\invoke.cjs'
if (Test-Path $invoke) { Ok 'hook invoke.cjs' } else { Fail 'missing hook invoke.cjs' }

$settings = Join-Path $Dest '.claude\settings.json'
if (Test-Path $settings) {
    Ok 'settings.json'
    if (Select-String -Path $settings -Pattern 'block-secret-reads' -Quiet) { Ok 'settings registers block-secret-reads' }
    else { Warn 'settings.json does not reference block-secret-reads' }
    if (Select-String -Path $settings -Pattern 'invoke\.cjs' -Quiet) { Ok 'settings launches hooks via invoke.cjs' }
    else { Warn 'settings.json does not use invoke.cjs (on Windows `bash` may be WSL)' }
} else { Fail 'missing .claude/settings.json' }

if (Get-Command jq -ErrorAction SilentlyContinue) { Ok 'jq installed' }
else { Warn 'jq NOT installed — winget install jqlang.jq' }
if (Get-Command bash -ErrorAction SilentlyContinue) { Ok 'bash available' }
else { Fail 'bash not available — install Git for Windows' }
if (Get-Command git -ErrorAction SilentlyContinue) { Ok 'git available' } else { Warn 'git not available' }
if (Get-Command openspec -ErrorAction SilentlyContinue) { Ok 'openspec CLI' }
else { Warn 'openspec is not on PATH' }

if (Test-Path (Join-Path $Dest 'openspec')) { Ok 'openspec/ present' }
else { Warn 'openspec/ not initialized — openspec init' }

$mcp = Join-Path $Dest '.mcp.json'
if (Test-Path $mcp) {
    Ok '.mcp.json (Claude Code)'
    if (Select-String -Path $mcp -Pattern '"context7"' -Quiet) { Ok 'MCP context7 in .mcp.json' }
    else { Warn '.mcp.json does not declare context7' }
    if (Select-String -Path $mcp -Pattern '"playwright"' -Quiet) { Ok 'MCP playwright in .mcp.json' }
    else { Warn 'MCP playwright not in .mcp.json (normal with -NoFrontend)' }
} else {
    Warn 'missing .mcp.json — the kit installer copies it; without it Context7/Playwright do not load in Claude Code'
}
$cursorMcp = Join-Path $Dest '.cursor\mcp.json'
if (Test-Path $cursorMcp) {
    Ok '.cursor/mcp.json (Cursor)'
    if (Select-String -Path $cursorMcp -Pattern '"context7"' -Quiet) { Ok 'MCP context7 in .cursor/mcp.json' }
    else { Warn '.cursor/mcp.json does not declare context7' }
} else {
    Warn 'missing .cursor/mcp.json — the kit installer copies it; without it Context7/Playwright do not load in Cursor'
}

$envFile = Join-Path $Dest '.claude\sdd-harness.env'
if (Test-Path $envFile) {
    if (Select-String -Path $envFile -Pattern '^BRANCH_PREFIX=' -Quiet) { Ok 'BRANCH_PREFIX defined' }
    else { Warn 'BRANCH_PREFIX is not in sdd-harness.env' }
    $envRaw = Get-Content -LiteralPath $envFile -Raw
    if ($envRaw -match '\$\(' -or $envRaw -match '`') {
        Fail 'sdd-harness.env contains command substitution — clean up the file'
    }
}

# Regression H1: the kit contract must be readable by the agent. If is_secret_path
# caught it, block-secret-reads would deny the Read and subagents could not read commands/paths.
$libSh = Join-Path $Dest '.claude\hooks\lib.sh'
if (Test-Path $libSh) {
    if (Select-String -Path $libSh -Pattern 'sdd-harness\.env\) return 1' -Quiet) {
        Ok 'is_secret_path exempts .claude/sdd-harness.env (subagents can read the contract)'
    } else {
        Fail 'is_secret_path does NOT exempt .claude/sdd-harness.env: block-secret-reads will treat it as a secret and subagents will not be able to read the contract. Update lib.sh.'
    }
}

Write-Host ""
Write-Host "Summary: $fail failures, $warn warnings"
if ($fail -gt 0) { exit 1 }
exit 0
