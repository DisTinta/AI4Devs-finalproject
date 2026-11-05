# 73. Segunda ronda golden de DIS-110: regenerar task-api Q1 (DIS-110 r2)

> Sección 73 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Ronda r2 dentro de una ejecución autónoma

El coordinador de la ejecución autónoma envió a un agente este encargo (resumen fiel de sus pasos):

```
Goal: golden round r2 for DIS-110, fixing task-api Q1 (judged `incorrect` and left unsigned, X15).
1. From an up-to-date final-project-CRN, create branch feature/dis-110-golden-review-r2.
2. Open a small OpenSpec change (golden-review-dis-110-r2) with the local openspec binary: proposal,
   a golden-answers delta that retargets the current round to DIS-110 r2, design.md with Follow-ups,
   tasks.md naming every existing file that changes. Run the spec-auditor until APPROVED.
3. Run the round modelled on DIS-42 r2/r3 and DIS-10 r2: criterion first; regenerate only task-api Q1
   with npm run cache:build (qwen2.5-coder, OLLAMA_CONTEXT_LENGTH=16384); input; retarget the test;
   blind panel (opus, sonnet); resolver; signatures; report; checks; docs. r3 if Q1 is still incorrect.
4. Separate docs(DIS-110) commit fixing the ## Purpose of openspec/specs/explain/spec.md.
5. PR to final-project-CRN, CI green, verify-against-spec and adversarial-review inline, archive.
6. Conventional commits, explicit paths, never stage .claude/. 7. Do NOT merge.
```

### Prompt 2 — Reanudar la ronda

```
Resume the DIS-110 r2 round: the author restarted Ollama on 11434 with OLLAMA_CONTEXT_LENGTH=16384
and edited the explain Purpose by hand. Commit the Purpose edit alone; confirm context_length 16384
in /api/ps after the first load (stop if 4096); pop the stash and continue from task 2.2.
```

**Por qué funcionó.** El `tasks.md` del cambio copió literalmente el grupo Panel de las rondas
anteriores, y el `spec-auditor` obligó a fijar antes de empezar qué hacer si Ollama no respondía y
cómo validar una salida del panel antes de registrarla. La comprobación de `/api/ps` antes de
regenerar evitó repetir el fallo de la primera ejecución.

**Ajuste humano.** El primer intento se paró (texto del agente): el Ollama en marcha servía con
`context_length: 4096`, por eso todas las respuestas eran `invalid-model-output`. Un segundo servidor
con 16384 se quedó sin memoria. La autora reinició Ollama con `OLLAMA_CONTEXT_LENGTH=16384` y editó a
mano el `## Purpose` de `explain`, que el hook de specs principales volvió a denegar al agente.
