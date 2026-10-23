#!/usr/bin/env node
// Launches a .sh hook with a bash that is not WSL's on Windows.
// Claude Code with `"command": "bash"` usually resolves C:\Windows\System32\bash.exe (WSL).
// This process is Windows Node; here we pick Git Bash if it exists.
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')

// `--client cursor` (from .cursor/hooks.json) tells lib.sh to read and answer in Cursor's hook format
// (openspec change autonomous-run-switch, design D11).
const argv = process.argv.slice(2)
let client = 'claude'
if (argv[0] === '--client') {
  client = argv[1] || 'claude'
  argv.splice(0, 2)
}
const script = argv[0]
if (!script) {
  process.stderr.write('invoke.cjs: missing hook script\n')
  process.exit(1)
}

function exists(p) {
  try {
    return Boolean(p) && fs.existsSync(p)
  } catch {
    return false
  }
}

function gitBashWin() {
  const candidates = [
    process.env.CLAUDE_CODE_GIT_BASH_PATH,
    process.env.GIT_BASH_PATH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ]
  return candidates.find(exists)
}

const bash = process.platform === 'win32' ? gitBashWin() || 'bash' : 'bash'
// Extra arguments go to the script (the doctor's flags; hooks get none).
const result = spawnSync(bash, argv, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: { ...process.env, KIT_HOOK_CLIENT: client },
  windowsHide: true,
})

if (result.error) {
  process.stderr.write(`invoke.cjs: could not run ${bash}: ${result.error.message}\n`)
  process.exit(1)
}

process.exit(result.status === null ? 1 : result.status)
