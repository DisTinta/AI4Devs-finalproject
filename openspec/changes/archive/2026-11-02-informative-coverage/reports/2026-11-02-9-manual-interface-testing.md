# Manual interface testing (step 9) — informative-coverage (DIS-77)

*Agent's text, autonomous run, 2026-11-02. Windows 11, Node v24.11.1, PowerShell 7.6.9 (`pwsh`) and
Windows PowerShell 5.1.26100.9818 (`powershell.exe`). Paths are given relative to the repository; the OS user
name is masked as `<user>`.*

## 9.1 The npm script and the summary command

`npm run test:coverage -- --project dom --project seed-build --project node` from Bash: exit 0, 178 files and
1842 tests passed, 76.8 s; it wrote `coverage/coverage-summary.json`.

`node scripts/coverage-summary.mjs coverage/coverage-summary.json` from Bash, from `pwsh -NoProfile -Command`
and from `powershell.exe -NoProfile -Command` (no `$env:` variable set): exit code 0 in the three, with the same
table. Output of the real report:

```
## Cobertura por paquete (informativa)

La cobertura no bloquea el pipeline: la puerta es la puntuación de mutación (stryker.config.json).

| Paquete | Líneas | Sentencias | Funciones | Ramas | Objetivo (líneas) |
|---|---:|---:|---:|---:|---|
| adapters/git | 97.3 % | 96.6 % | 96.6 % | 94.9 % | — |
| adapters/llm | 99.3 % | 98.8 % | 97.3 % | 96.5 % | — |
| adapters/store-postgres | 44.2 % | 40.3 % | 28.0 % | 16.1 % | — |
| analyzers/php | 100.0 % | 96.8 % | 100.0 % | 91.6 % | ✓ 70 % |
| analyzers/typescript | 98.2 % | 97.3 % | 94.4 % | 92.9 % | ✓ 70 % |
| api | 92.8 % | 93.2 % | 93.8 % | 96.3 % | — |
| cli | 95.6 % | 95.1 % | 91.6 % | 92.9 % | — |
| core | 99.8 % | 99.7 % | 100.0 % | 98.4 % | ✓ 80 % |
| web | 98.1 % | 98.2 % | 99.4 % | 97.0 % | — |
| Total | 94.3 % | 93.4 % | 89.9 % | 90.9 % | — |
```

Note: in `powershell.exe`, piping the output into `Select-Object -First 8` closed the pipe early and
`$LASTEXITCODE` read `-1`; that is the truncated pipe, not the command. With `| Out-Null` the exit code is 0
in both shells.

## 9.2 Error cases

- `node scripts/coverage-summary.mjs coverage/none.json`: `Sin informe de cobertura: coverage/none.json no existe.`, exit 0.
- A temporary file with the content `{bad` in the scratchpad directory
  (`<scratchpad>/bad.json`): `Informe de cobertura ilegible: <scratchpad>/bad.json.`, exit 0. The file was deleted.

## 9.3 State

`coverage/` ignored and not staged; `git status` shows only the change's files; `node scripts/dev-processes.mjs stop` run.

## 10.1 End-to-end

Not applicable to a screen: the end-to-end evidence is the CI run of the pull request (13.3).
