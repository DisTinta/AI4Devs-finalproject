#!/usr/bin/env node
// Launches a .sh hook with a bash that is not WSL's on Windows.
// Claude Code with `"command": "bash"` usually resolves C:\Windows\System32\bash.exe (WSL).
// This process is Windows Node; here we pick Git Bash if it exists.
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')

const script = process.argv[2]
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
const result = spawnSync(bash, [script], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
  windowsHide: true,
})

if (result.error) {
  process.stderr.write(`invoke.cjs: could not run ${bash}: ${result.error.message}\n`)
  process.exit(1)
}

process.exit(result.status === null ? 1 : result.status)
