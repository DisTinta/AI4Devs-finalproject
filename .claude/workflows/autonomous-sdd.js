export const meta = {
  name: 'autonomous-sdd',
  description: 'Autonomous SDD run (docs/AUTONOMOUS-RUN.md §6) over a list of Linear tickets: enrich, propose, spec audit with correction rounds, TDD apply, PR, CI, reviews, archive, merge',
  whenToUse: 'An autonomous run (KIT_AUTONOMOUS_RUN="1") of one block of Linear tickets. args: {tickets: [{id, dependsOn?, ollama?, notes?, panel?}]}; see docs/AUTONOMOUS-RUN.md §10.',
  phases: [{ title: 'Preflight', detail: 'arguments and Ollama' }],
}

// args: { tickets: [{ id: 'DIS-9', dependsOn: ['DIS-x'], ollama: true, notes: '...', panel: { models: ['opus', 'sonnet'] } }] }
// - dependsOn: tickets of this run that must be merged first. A ticket outside the run counts as
//   integrated; the enrich step checks in Linear that every blocker is Done.
// - ollama: the ticket needs a live local model; it stops if the preflight finds Ollama down.
// - notes: extra instructions passed to every step of the ticket.
// - panel: the ticket's judgement work (annotation, review) is done by independent agents, one per
//   model, blind to each other; with two or more models a further agent resolves the disagreements.

const BASE = 'final-project-CRN'
const MAX_ROUNDS = 5

const STEP = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true if the step finished and the ticket can continue' },
    stop_reason: { type: 'string', description: 'If ok=false: the clean-stop reason of docs/AUTONOMOUS-RUN.md §6, in Spanish' },
    summary: { type: 'string', description: 'What was done and the decisions taken, short' },
    branch: { type: 'string' },
    change: { type: 'string', description: 'The OpenSpec change id' },
    report: { type: 'string', description: 'Repository path of the spec-audit report' },
    pr: { type: 'number' },
  },
  required: ['ok', 'summary'],
}

const AUDIT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVED', 'CHANGES REQUIRED'] },
    blocking: { type: 'number', description: 'Number of blocking findings' },
    report_markdown: { type: 'string', description: 'The full audit report, verbatim, starting with the verdict line' },
  },
  required: ['verdict', 'blocking', 'report_markdown'],
}

const PANEL = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    stop_reason: { type: 'string' },
    files: {
      type: 'array',
      description: 'Every output file of this panelist, with the exact path the Panel group of tasks.md gives it',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['ok', 'files', 'summary'],
}

const COMMON = `You are one step of an autonomous SDD run (KIT_AUTONOMOUS_RUN="1"). Follow the contract in docs/AUTONOMOUS-RUN.md §6 strictly, including its correction rounds. In short:
- Never ask anything: decide as lead engineer and record each decision in the Linear ticket and in design.md → Follow-ups with its A/B/C/D destination, marked as the agent's text.
- Code, and any text that mentions commands, is written with the edit tools, never through the shell.
- One git command per Bash call (never chain git switch/merge/push with &&). Stage explicit paths only (no git add -A / commit -a). Never touch or commit .claude/ or .cursor/. No worktrees.
- Shell commands use literal values, not variables. Never cd into openspec/changes/<change>/.
- After any validated npm install run npm audit --audit-level=high; a new high or critical finding stops the ticket.
- PowerShell checks are planned in tasks.md for the author (design.md → Follow-ups, destination C); you do them in Git Bash.
- Waiting for CI: never use Monitor or run_in_background (inside a workflow step they end your turn and you must return at once). Wait in the foreground with the Bash tool: run gh pr checks <n> --watch --interval 60 with timeout 600000, and repeat that call until no check is pending, queued or in progress. The mutation job takes 30-60 minutes. Never return ok=true while a check is pending.
- vitest run, never watch mode. Before returning, run node scripts/dev-processes.mjs stop if you started any test run, build or server.
Base branch: ${BASE}. Use the Linear MCP for the ticket (load its tools with ToolSearch). Linear comments in Spanish. On a clean-stop condition of §6 return ok=false with stop_reason; never work around a hook denial.

Spec-audit report (the hooks parse it): the change has ONE report file, reports/<date>-spec-audit.md. Every audit run and every resolution section is APPENDED to that file; never create a second *spec-audit*.md. A line that is exactly APPROVED or CHANGES REQUIRED may appear only as the verdict line of an audit run; anywhere else the words go inside a sentence or in backticks.`

if (!args || !Array.isArray(args.tickets) || args.tickets.length === 0 || args.tickets.some((t) => !t || typeof t.id !== 'string')) {
  throw new Error('args must be {tickets: [{id, dependsOn?, ollama?, notes?, panel?}, ...]}')
}

function context(t) {
  return [
    `Ticket: ${t.id}.`,
    t.branch ? `Branch: ${t.branch}.` : '',
    t.change ? `Change: openspec/changes/${t.change}.` : '',
    t.report ? `Spec-audit report: ${t.report}.` : '',
    t.pr ? `PR: #${t.pr}.` : '',
    t.notes ? `\nInstructions for this ticket from the author: ${t.notes}` : '',
  ].filter(Boolean).join(' ')
}

async function step(t, name, prompt, model) {
  const r = await agent(`${COMMON}\n\n${context(t)}\nStep: ${name}.\n\n${prompt}`,
    { label: `${t.id}:${name}`, phase: t.id, schema: STEP, model })
  if (!r) return { ok: false, stop_reason: `El paso ${name} no devolvió resultado`, summary: '' }
  t.log.push(`${name}: ${r.summary}`)
  for (const key of ['branch', 'change', 'report', 'pr']) if (r[key]) t[key] = r[key]
  return r
}

// Steps that wait for CI. A step that cannot finish its wait in one turn returns ci_pending=true
// and is run again, instead of stopping the ticket with a CI that has not failed.
const WAIT_STEP = {
  ...STEP,
  properties: {
    ...STEP.properties,
    ci_pending: { type: 'boolean', description: 'true if you return while a CI check is still pending, queued or in progress' },
  },
}
const MAX_WAITS = 10

async function waitStep(t, name, prompt, model) {
  let note = ''
  for (let i = 1; i <= MAX_WAITS; i++) {
    const r = await agent(`${COMMON}\n\n${context(t)}\nStep: ${name}.\nFirst make sure the working copy is on branch ${t.branch} and up to date (git switch ${t.branch}, then git pull, separate calls). If you cannot finish the CI wait, return ok=false with ci_pending=true and say in summary what is left; the step will be run again.${note}\n\n${prompt}`,
      { label: `${t.id}:${name}${i > 1 ? `-${i}` : ''}`, phase: t.id, schema: WAIT_STEP, model })
    if (!r) return { ok: false, stop_reason: `El paso ${name} no devolvió resultado`, summary: '' }
    t.log.push(`${name}${i > 1 ? ` (intento ${i})` : ''}: ${r.summary}`)
    for (const key of ['branch', 'change', 'report', 'pr']) if (r[key]) t[key] = r[key]
    if (r.ok || !r.ci_pending) return r
    note = `\nThis step is being resumed (attempt ${i + 1}). The previous attempt returned while CI was pending; do not redo work it already finished. Its summary: ${r.summary}`
  }
  return { ok: false, stop_reason: `La CI del PR #${t.pr} sigue pendiente tras ${MAX_WAITS} intentos de espera`, summary: '' }
}

async function stop(t, reason) {
  await agent(`${COMMON}\n\n${context(t)}\nThe run stops cleanly for this ticket. Reason: ${reason}\nProgress: ${JSON.stringify(t.log)}\nMove the Linear ticket to "In Review" and add a comment in Spanish with the reason, what was done (branch, PR, change, reports, audit rounds) and what the author must do next. If the reason is that the auto-mode classifier denied the merge, say in the comment that the PR is ready for the author to merge and that the tickets depending on it were skipped in this run. Leave the working copy on ${BASE}: git switch ${BASE}, then git pull (separate calls). Run node scripts/dev-processes.mjs stop. Return a one-line summary.`,
    { label: `${t.id}:stop`, phase: t.id, model: 'sonnet' })
  return { ticket: t.id, status: 'stopped', reason, pr: t.pr, branch: t.branch, log: t.log }
}

async function audit(t, run) {
  const a = await agent(`Audit the OpenSpec change ${t.change} (openspec/changes/${t.change}) for Linear ticket ${t.id}, per your instructions and docs/base-standards.md §7.1. Judge the change as it is now; ${run > 1 ? 'the report file holds earlier runs and their resolution sections for context. Decisions marked as the agent\'s text are acceptable answers to earlier questions for the author unless they contradict the ticket or the project.' : 'this is the first audit.'} Return the verdict, the number of blocking findings and the full report, starting with the verdict line.`,
    { label: `${t.id}:audit-${run}`, phase: t.id, schema: AUDIT, agentType: 'spec-auditor', model: 'opus' })
  if (!a) return null
  const target = t.report
    ? `Append it to ${t.report}, after everything already in it, as:\n\n---\n\n## Run ${run} (<today's date>)\n\n<the report verbatim>`
    : `Create openspec/changes/${t.change}/reports/<today's date, YYYY-MM-DD>-spec-audit.md with the report verbatim, and return its repository path as report.`
  const r = await step(t, `audit-record-${run}`, `Record this spec-auditor run. ${target}\n\nThe verdict line must stay a line of its own that is exactly "${a.verdict}"; if the report body repeats a standalone APPROVED or CHANGES REQUIRED line anywhere else, wrap that other occurrence in backticks. Commit the report (explicit path) and push. Verdict: ${a.verdict}, blocking findings: ${a.blocking}.\n\nREPORT:\n${a.report_markdown}`, 'sonnet')
  if (!r.ok) return { stopped: r.stop_reason }
  log(`${t.id}: audit ${run} → ${a.verdict} (${a.blocking} blocking)`)
  return a
}

async function runPanel(t) {
  const models = t.panel.models && t.panel.models.length ? t.panel.models : ['opus']
  const outputs = await parallel(models.map((model, i) => () => agent(`You are panelist ${i + 1} of ${models.length} for Linear ticket ${t.id}, OpenSpec change openspec/changes/${t.change}. Read the ticket (Linear MCP) and the group titled Panel in openspec/changes/${t.change}/tasks.md: it gives the input set, the written criterion, the output format and the exact output path for panelist ${i + 1}. Do that judgement work alone, from the sources the Panel group allows (the fixture source code, the criterion, the inputs it names).
Forbidden: running the analyzer or any measurement script; reading the graph tables, the database, the answer cache or any measurement output; reading any other panelist's output or any resolution file, even if one exists; asking anything. Do not write or commit any file: return every output file, with its exact path and full content, in files. Cite file:line of the fixture for every judgement, as the Panel group asks.${t.notes ? `\nInstructions for this ticket from the author: ${t.notes}` : ''}`,
    { label: `${t.id}:panel-${model}`, phase: t.id, schema: PANEL, model })))
  for (const [i, o] of outputs.entries()) {
    if (!o || !o.ok) return { ok: false, stop_reason: `El panelista ${i + 1} (${models[i]}) no completó su trabajo${o && o.stop_reason ? `: ${o.stop_reason}` : ''}` }
  }
  const files = outputs.flatMap((o) => o.files)
  let r = await step(t, 'panel-record', `Write these panelist output files exactly as given, with the edit tools, commit them (explicit paths) and push. Then do the tasks of the Panel group that compute the agreement between panelists, if it has them. Do not change any panelist's content.\n\nFILES:\n${JSON.stringify(files)}`, 'sonnet')
  if (!r.ok || models.length < 2) return r
  return step(t, 'panel-resolve', `Resolve the disagreements between the panelists, as the Panel group of tasks.md says, and only those. Read the panelist outputs and the fixture code; justify each resolution with file:line. Forbidden: running the analyzer or any measurement script, reading the graph tables, the database, the answer cache or any measurement output. Write the resolution file at the path the Panel group gives, commit it (explicit path) and push.`, 'opus')
}

async function runTicket(t) {
  phase(t.id)
  t.log = []
  let r = await step(t, 'enrich', `Make sure the working copy is on ${BASE}, up to date and clean apart from .claude/sdd-harness.env (git switch ${BASE}, then git pull, then git status, in separate calls). Check in Linear that every issue blocking ${t.id} is Done; if one is not, return ok=false ("bloqueado por <ticket> sin cerrar"). Move the ticket to "In Progress". Run /enrich-us on it: write the Enhanced description in the ticket, deciding the open points yourself and recording them.`, 'opus')
  if (!r.ok) return stop(t, r.stop_reason)

  const panelRule = t.panel
    ? ` This ticket's judgement work is done by a panel of independent agents (${(t.panel.models || ['opus']).join(', ')}), outside the apply: tasks.md must contain a task group titled Panel stating the input set, the criterion (written before any judgement), the output format, the exact output path of each panelist and, with two or more panelists, of the resolution of their disagreements, the agreement measure (percent and Cohen's kappa when there are two or more) and the sources a panelist must not read. Tasks before the Panel group are the preparation; tasks after it record the agreement, freeze the outputs and finish the change.`
    : ''
  r = await step(t, 'propose', `Create the feature branch from ${BASE} using BRANCH_PREFIX from .claude/sdd-harness.env and the ticket id (e.g. feature/dis-xxx-short-slug). Run /opsx:propose for the enriched ticket, following docs/openspec-tasks-mandatory-steps.md for tasks.md (name every existing test a task changes).${panelRule} Run openspec validate <change> --strict. Commit the change artifacts and push the branch. Return branch and change.`, 'opus')
  if (!r.ok) return stop(t, r.stop_reason)
  if (!t.change || !t.branch) return stop(t, 'El paso propose no devolvió la rama o el cambio')

  let verdict = await audit(t, 1)
  if (!verdict) return stop(t, 'La auditoría 1 del spec-auditor no devolvió resultado')
  if (verdict.stopped) return stop(t, verdict.stopped)
  for (let round = 1; round <= MAX_ROUNDS && verdict.verdict !== 'APPROVED'; round++) {
    r = await step(t, `correct-${round}`, `Correction round ${round} of ${MAX_ROUNDS}. Read ${t.report}, focusing on its LAST audit run, plus the change artifacts, the Linear ticket and its comments, and the real code they reference. Then:
1. Answer every question for the author yourself as lead engineer: pick the option that best fulfils the ticket and, when in doubt, the one that widens scope least. Record each decision, marked as the agent's text, in design.md → Follow-ups with its A/B/C/D destination.
2. Apply every blocking and improvable correction to the change artifacts (/opsx:update or equivalent edits with the edit tools), following docs/openspec-tasks-mandatory-steps.md for tasks.md. No new Linear issues. Run openspec validate ${t.change} --strict.
3. Append to the report a section "## Resolution of run ${round}" listing, per finding, how it was resolved: fixed, rejected with the reason, or decided by the agent. No standalone verdict lines.
4. Post a Spanish Linear comment summarising the decisions of this round.
5. Commit the artifacts and the report (explicit paths) and push.`, 'opus')
    if (!r.ok) return stop(t, r.stop_reason)
    verdict = await audit(t, round + 1)
    if (!verdict) return stop(t, `La auditoría ${round + 1} del spec-auditor no devolvió resultado`)
    if (verdict.stopped) return stop(t, verdict.stopped)
  }
  if (verdict.verdict !== 'APPROVED') return stop(t, `La auditoría del spec-auditor sigue en CHANGES REQUIRED tras ${MAX_ROUNDS} rondas de corrección: el ticket vuelve a la autora con el informe`)

  const applyOpen = `Run /opsx:apply on change ${t.change}: every task in TDD (failing test first, then implementation, in the layer order), marking tasks.md as you go, with the mandatory verification steps. Run the tests, lint and typecheck.`
  const applyClose = `Commit, push and open the PR to ${BASE} with /pr-describe (write the "why" yourself and mark it as agent-written). Return pr.`
  if (t.panel) {
    r = await step(t, 'apply-prepare', `${applyOpen} Do ONLY the tasks before the Panel group, then commit and push. Do not open the PR.`, 'sonnet')
    if (!r.ok) return stop(t, r.stop_reason)
    r = await runPanel(t)
    if (!r.ok) return stop(t, r.stop_reason)
    r = await step(t, 'apply-finish', `${applyOpen} The tasks up to and including the Panel group are done (the panel outputs are committed): do the tasks after it, without changing any panel output. ${applyClose}`, 'sonnet')
  } else {
    r = await step(t, 'apply', `${applyOpen} ${applyClose}`, 'sonnet')
  }
  if (!r.ok) return stop(t, r.stop_reason)
  if (!t.pr) return stop(t, 'El paso apply no devolvió el número del PR')

  r = await waitStep(t, 'ci', `Wait for the CI of PR #${t.pr} until no check is pending. If one fails, read the failing log, fix it in the same branch, push and wait again: at most 2 fixes. If it is still red after 2 fixes, return ok=false ("CI en rojo tras 2 correcciones").`, 'sonnet')
  if (!r.ok) return stop(t, r.stop_reason)

  r = await waitStep(t, 'review', `Run /show-spec-working, then verify-against-spec and adversarial-review in their Inline mode: read their SKILL.md and follow it yourself, never invoke them as a skill or a fork. Change ${t.change}, PR #${t.pr}. Save their reports under the change's reports/. Fix every real finding in the same PR (code fixes happen now, before the archive), commit, push and wait for the CI until no check is pending (at most 2 CI fixes). Return ok=false if a blocking verdict cannot be resolved.`, 'opus')
  if (!r.ok) return stop(t, r.stop_reason)

  r = await waitStep(t, 'archive', `Run /opsx:archive on change ${t.change} (sync the specs) from the repository root, run /update-docs for the docs gate, commit, push and wait for the CI of PR #${t.pr} until no check is pending. No code changes at this point: if one is needed, return ok=false ("corrección de código necesaria después del archive").`, 'sonnet')
  if (!r.ok) return stop(t, r.stop_reason)

  r = await waitStep(t, 'merge', `Check that gh pr checks ${t.pr} shows no pending or failing check (wait if one is pending). Merge with exactly \`gh pr merge ${t.pr} --merge\`, alone on the line, through the merge gate. If the gate denies, re-read the PR (gh pr view ${t.pr}, gh pr checks ${t.pr}), fix the condition if it is only waiting and retry once. If the auto-mode classifier denies, return ok=false with stop_reason "el clasificador denegó el merge". On success move the Linear ticket to "Done" with a short Spanish comment linking the PR, then git switch ${BASE} and git pull (separate calls).`, 'sonnet')
  if (!r.ok) return stop(t, r.stop_reason)

  return { ticket: t.id, status: 'merged', pr: t.pr, branch: t.branch, log: t.log }
}

phase('Preflight')
const tickets = args.tickets.map((t) => ({ ...t, dependsOn: t.dependsOn || [] }))
let ollamaUp = true
if (tickets.some((t) => t.ollama)) {
  const o = await agent(`Check whether the local Ollama server can generate. Run curl -s -m 10 http://localhost:11434/api/version and curl -s -m 10 http://localhost:11434/api/tags; ok=true only if both answer and at least one model is listed. Then generate a few tokens with the first listed model (curl -s -m 300 http://localhost:11434/api/generate -d with model, a short prompt and "stream": false) and run curl -s -m 10 http://localhost:11434/api/ps: say in summary whether the model loaded on the GPU (size_vram greater than 0) or on the CPU only. Do not read .env. Do not change anything.`,
    { label: 'preflight:ollama', phase: 'Preflight', schema: STEP, model: 'sonnet' })
  ollamaUp = Boolean(o && o.ok)
  log(`Ollama: ${ollamaUp ? 'up' : 'down'}${o ? `, ${o.summary}` : ''}`)
}

const results = []
const status = new Map()
for (const t of tickets) {
  const blocked = t.dependsOn.filter((d) => status.has(d) && status.get(d) !== 'merged')
  let res
  if (blocked.length) {
    res = { ticket: t.id, status: 'skipped', reason: `depende de ${blocked.join(', ')}, que no se integró en esta ejecución` }
  } else if (t.ollama && !ollamaUp) {
    t.log = []
    res = await stop(t, 'Ollama no responde: el ticket necesita un modelo local')
  } else {
    res = await runTicket(t)
  }
  status.set(t.id, res.status)
  results.push(res)
  log(`${t.id}: ${res.status}`)
}
return results
