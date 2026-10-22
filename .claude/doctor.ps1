<#
.SYNOPSIS
    Checks that the SDD Harness Kit is healthy in an already installed project.

.EXAMPLE
    .\doctor.ps1 -Dest C:\proyectos\mi-api
    .\doctor.ps1
    .\doctor.ps1 -Autonomous -ConfigDir $HOME\.claude-autonomo   # preflight of an autonomous run
#>
[CmdletBinding()]
param(
    [string]$Dest = (Get-Location).Path,
    [switch]$Autonomous,
    [string]$ConfigDir = $env:CLAUDE_CONFIG_DIR
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
    'docs-gate','protect-specs-and-tests','spec-audit-gate','post-edit-quality','validate-tasks','verify-tests',
    'autonomous-merge-gate','log-permission-denied','lib'
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
    # Comments are skipped by the safe loader, so only assignment lines count.
    $envRaw = (Get-Content -LiteralPath $envFile | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
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

# Autonomous preflight (openspec change autonomous-run-switch, design D13). Read-only.
function Get-EnvValue($key) {
    if (-not (Test-Path $envFile)) { return '' }
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
    if (-not $line) { return '' }
    return ($line -replace "^$key=", '').Trim().Trim('"').Trim("'")
}

if ($Autonomous) {
    Write-Host ""
    Write-Host "Autonomous run preflight" -ForegroundColor Cyan
    Write-Host ""
    $base = Get-EnvValue 'AUTONOMOUS_MERGE_BASE'

    # Switch and configuration
    if ((Get-EnvValue 'KIT_AUTONOMOUS_RUN') -eq '1') { Ok 'KIT_AUTONOMOUS_RUN="1"' }
    else { Fail 'KIT_AUTONOMOUS_RUN is not "1" in .claude/sdd-harness.env (the author sets it by hand)' }
    if ($base) { Ok "AUTONOMOUS_MERGE_BASE=$base" } else { Fail 'AUTONOMOUS_MERGE_BASE is empty: the merge gate denies every merge' }
    foreach ($key in @('KIT_SPEC_AUDIT_GATE','KIT_PROTECT_SPECS')) {
        if ((Get-EnvValue $key) -eq '0') { Warn "$key=`"0`": unattended mode applies its rules anyway" }
    }

    # Tools: jq, and the Git Bash that invoke.cjs uses
    if (Get-Command jq -ErrorAction SilentlyContinue) { Ok 'jq installed' }
    else { Fail 'jq NOT installed: in an unattended run every guarded hook denies' }
    # Windows PowerShell 5.1 has no $IsWindows; $env:OS covers it.
    $onWindows = ($IsWindows -or $env:OS -eq 'Windows_NT')
    if ($onWindows) {
        $gitBash = @($env:CLAUDE_CODE_GIT_BASH_PATH, $env:GIT_BASH_PATH, 'C:\Program Files\Git\bin\bash.exe',
            'C:\Program Files (x86)\Git\bin\bash.exe') | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
        if ($gitBash) { Ok "Git Bash for invoke.cjs: $gitBash" }
        else { Fail 'Git Bash not found: invoke.cjs would fall back to bash on PATH (maybe WSL)' }
    }

    # Ask rules (they force a prompt even in auto mode)
    function Test-AskRules($file) {
        if (-not (Test-Path -LiteralPath $file)) { return }
        try { $json = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json } catch { Fail "$file is not valid JSON"; return }
        $rules = @()
        if ($json.permissions -and $json.permissions.ask) { $rules = @($json.permissions.ask) }
        if ($rules.Count -gt 0) { foreach ($r in $rules) { Fail "permissions.ask rule $r in ${file}: it waits for a human" } }
        else { Ok "no permissions.ask in $file" }
    }
    if (-not $ConfigDir) { Fail 'no autonomous profile: pass -ConfigDir or set CLAUDE_CONFIG_DIR' }
    elseif (-not (Test-Path -LiteralPath $ConfigDir)) { Fail "autonomous profile $ConfigDir (CLAUDE_CONFIG_DIR) does not exist" }
    else { Ok "autonomous profile $ConfigDir"; Test-AskRules (Join-Path $ConfigDir 'settings.json') }
    Test-AskRules $settings
    Test-AskRules (Join-Path $Dest '.claude\settings.local.json')

    # Secret allowlist: too wide when it matches the canonical token sample (D10)
    $allow = Get-EnvValue 'KIT_SECRET_ALLOWLIST'
    if ($allow) {
        try { if (('ghp_' + ('a' * 36)) -match $allow) { Warn 'KIT_SECRET_ALLOWLIST matches a GitHub token sample: block-secrets ignores it' } } catch {}
    }

    # Merge authorisation in the profile's effective auto-mode configuration
    if ($ConfigDir -and $base -and (Get-Command claude -ErrorAction SilentlyContinue)) {
        $prev = $env:CLAUDE_CONFIG_DIR; $env:CLAUDE_CONFIG_DIR = $ConfigDir
        $auto = (& claude auto-mode config 2>$null) -join "`n"
        $env:CLAUDE_CONFIG_DIR = $prev
        # One rule must name both the merge command and the base: the JSON `allow` list when the
        # output parses, otherwise one line of the text.
        $candidates = $null
        try { $candidates = @((ConvertFrom-Json -InputObject $auto -ErrorAction Stop).allow) } catch { $candidates = @($auto -split "`n") }
        $mergeRule = @($candidates | Where-Object { $_ -is [string] -and $_.Contains('gh pr merge') -and $_.Contains($base) })
        if ($mergeRule.Count -gt 0) { Ok "auto-mode merge authorisation names $base" }
        else { Fail "no auto-mode merge authorisation for $base in the profile (see ai-specs/templates/autonomous/)" }
    } else {
        Fail 'cannot read the auto-mode merge authorisation (needs the profile, AUTONOMOUS_MERGE_BASE and the claude CLI)'
    }

    # Hooks
    foreach ($h in @('block-secret-reads','block-secrets','autonomous-merge-gate','log-permission-denied')) {
        if ((Test-Path $settings) -and (Select-String -Path $settings -Pattern $h -SimpleMatch -Quiet)) { Ok "settings registers $h" }
        else { Fail "settings.json does not register $h" }
    }
    if ((Test-Path $settings) -and (Select-String -Path $settings -Pattern '"Read(.env)"' -SimpleMatch -Quiet)) { Ok 'settings denies reading .env' }
    else { Fail 'settings.json has no Read(.env) deny rule' }
    function Test-RegisteredHooks($file, $label) {
        $found = Select-String -Path $file -Pattern '\.claude/hooks/[A-Za-z0-9_.-]+\.(sh|mjs|cjs)' -AllMatches |
            ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
        foreach ($h in $found) { if (-not (Test-Path (Join-Path $Dest $h))) { Fail "$label runs $h, which does not exist" } }
    }
    if (Test-Path $settings) { Test-RegisteredHooks $settings 'settings.json' }
    foreach ($m in @('vet-package.mjs','shell-words.mjs','paths.mjs')) {
        if (Test-Path (Join-Path $Dest ".claude\hooks\$m")) { Ok "hook helper $m" } else { Fail "missing .claude/hooks/$m" }
    }
    $cursorHooks = Join-Path $Dest '.cursor\hooks.json'
    if (Test-Path $cursorHooks) { Ok '.cursor/hooks.json'; Test-RegisteredHooks $cursorHooks '.cursor/hooks.json' }
    else { Fail 'missing .cursor/hooks.json: Cursor runs none of the kit hooks' }

    # GitHub
    $ghOk = $false
    if (Get-Command gh -ErrorAction SilentlyContinue) { & gh auth status *> $null; $ghOk = ($LASTEXITCODE -eq 0) }
    # gh api / run list output as one JSON value ($null when it does not parse); gh prints the error
    # body on stdout too.
    function Invoke-GhJson {
        $text = (& gh @args 2>$null) -join "`n"
        if (-not $text) { return $null }
        try { return , (ConvertFrom-Json -InputObject $text -ErrorAction Stop) } catch { return $null }
    }
    if (-not $ghOk) { Fail 'gh is not installed or not authenticated (gh auth status)' }
    elseif (-not $base) {
        Ok 'gh authenticated'
        Fail "cannot check the base's CI run and protection: AUTONOMOUS_MERGE_BASE is empty"
    } else {
        Ok 'gh authenticated'
        $run = $null
        try { $run = (& gh run list --branch $base --limit 1 --json status,conclusion 2>$null | ConvertFrom-Json) | Select-Object -First 1 } catch {}
        if ($run -and $run.status -eq 'completed' -and $run.conclusion -eq 'success') { Ok "latest CI run on $base succeeded" }
        else { Fail "latest CI run on $base is not completed and successful ($(if ($run) { "$($run.status)/$($run.conclusion)" } else { 'none' }))" }
        $prot = $null
        try { $prot = & gh api "repos/{owner}/{repo}/branches/$base/protection" 2>$null | ConvertFrom-Json } catch {}
        # On an error gh still prints the body: "Branch not protected", or "Not Found" when the active
        # account lacks admin access to the repository.
        $protErr = if ($prot -and $prot.PSObject.Properties['message']) { "$($prot.message)" } else { '' }
        if ($protErr -and $protErr -ne 'Branch not protected') {
            Fail "cannot read the protection of $base ($protErr): the active gh account needs admin access to the repository (gh auth switch)"
        } elseif ($LASTEXITCODE -eq 0 -and $prot -and -not $protErr) {
            if ($prot.required_pull_request_reviews) { Ok "$base requires a pull request" } else { Fail "$base is protected but does not require a pull request" }
            if (@($prot.required_status_checks.contexts).Count -gt 0) { Ok "$base requires CI checks" } else { Fail "$base does not require CI checks" }
            if ($prot.enforce_admins.enabled -eq $true) { Ok "$base protection applies to administrators" }
            else { Fail "$base protection does not apply to administrators (enforce_admins): the owner's token bypasses it" }
        } else {
            $rulesJson = Invoke-GhJson api "repos/{owner}/{repo}/rules/branches/$base"
            # Rules are the items with a `type`; an error body ({"message": …}) has none.
            $rules = @(@($rulesJson) | ForEach-Object { $_ } | Where-Object { $_ -and $_.PSObject.Properties['type'] })
            if ($rules.Count -gt 0) {
                if ($rules.type -contains 'pull_request') { Ok "$base requires a pull request (ruleset)" }
                else { Fail "$base is protected by rulesets but does not require a pull request" }
                if ($rules.type -contains 'required_status_checks') { Ok "$base requires CI checks (ruleset)" }
                else { Fail "$base is protected by rulesets but does not require CI checks" }
                # The rulesets that provide those rules must have no bypass actors. GitHub returns
                # bypass_actors only to accounts that can edit the ruleset: otherwise it cannot be confirmed.
                $ids = @($rules | Where-Object { $_.type -in @('pull_request','required_status_checks') -and $null -ne $_.ruleset_id } |
                    ForEach-Object { $_.ruleset_id } | Sort-Object -Unique)
                foreach ($id in $ids) {
                    $rs = Invoke-GhJson api "repos/{owner}/{repo}/rulesets/$id"
                    if (-not $rs -or -not $rs.PSObject.Properties['bypass_actors']) {
                        Fail "cannot read the bypass actors of ruleset $id on ${base}: the active gh account needs admin access to the repository (gh auth switch)"
                    } elseif (@($rs.bypass_actors).Count -eq 0) { Ok "$base ruleset $id has no bypass actors" }
                    else { Fail "$base ruleset $id has $(@($rs.bypass_actors).Count) bypass actors: they can merge without the pull request and the CI checks" }
                }
            } else { Fail "$base is not protected on GitHub (a pull request and CI checks must be required)" }
        }
    }

    # Local services and Defender (warnings only)
    $dockerOk = $false
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        # compose runs in the destination project, not the current directory.
        Push-Location -LiteralPath $Dest
        try { & docker compose ps *> $null; $dockerOk = ($LASTEXITCODE -eq 0) } finally { Pop-Location }
    }
    if ($dockerOk) { Ok 'docker compose reachable' } else { Warn 'docker compose not reachable: tests that need the local database will fail' }
    try {
        $excl = @((Get-MpPreference -ErrorAction Stop).ExclusionPath)
        if ($excl -match '^N/A') { Warn 'cannot read the Defender exclusions (needs an elevated shell)' }
        elseif ($excl | Where-Object { $_ -like '*codemind-*' }) { Ok 'Defender excludes the test temp dirs' }
        else { Warn "Defender has no exclusion for $env:TEMP\codemind-* (git tests may fail with Invalid argument)" }
    } catch { Warn 'cannot read the Defender exclusions (needs an elevated shell)' }
}

Write-Host ""
Write-Host "Summary: $fail failures, $warn warnings"
if ($fail -gt 0) { exit 1 }
exit 0
