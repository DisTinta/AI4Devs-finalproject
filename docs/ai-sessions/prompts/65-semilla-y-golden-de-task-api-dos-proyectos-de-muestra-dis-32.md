# 65. Semilla y golden de task-api, dos proyectos de muestra (DIS-32)

> Sección 65 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-32. Branch: feature/dis-32-task-api-seed-golden. Change: openspec/changes/task-api-seed-golden. Step: apply.
Run /opsx:apply on change task-api-seed-golden: every task in TDD (failing test first, then implementation, in the layer order), marking tasks.md as you go, with the mandatory verification steps. Run the tests, lint and typecheck. Commit, push and open the PR to final-project-CRN with /pr-describe.
```

**Por qué funcionó.** Cuatro auditorías habían fijado el orden de capas (deuda de DIS-30, CLI, semilla, caché) y cada escenario se convirtió en un test con su nombre. Lo que más ahorró tiempo fue el escenario que exige que toda pregunta golden ancle un símbolo de su proyecto: un test lo comprobó contra la semilla antes de gastar una hora de CPU con Ollama.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Decisiones: `GOLDEN_PROJECTS` sustituye a `GOLDEN_QUESTIONS`; la primera regeneración de las respuestas golden falló con `invalid-model-output` hasta servir Ollama con `OLLAMA_CONTEXT_LENGTH=16384`, como ya decía `docs/project-context.md`; y la autora añadió durante el apply la decisión de que `npm run up` reconstruya también la historia de task-api.
