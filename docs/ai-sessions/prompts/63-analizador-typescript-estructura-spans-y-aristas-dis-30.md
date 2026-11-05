# 63. Analizador TypeScript: estructura, spans y aristas (DIS-30)

> Sección 63 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-30. Branch: feature/dis-30-ts-analyzer-structure. Change: openspec/changes/ts-analyzer-structure. Step: apply.
Run /opsx:apply on change ts-analyzer-structure: every task in TDD (failing test first, then implementation, in the layer order), marking tasks.md as you go, with the mandatory verification steps. Run the tests, lint and typecheck. Commit, push and open the PR to final-project-CRN with /pr-describe (write the "why" yourself and mark it as agent-written). Return pr.
```

**Por qué funcionó.** La spec ya fijaba cada cifra de task-api (38 archivos, 7 clases, 7 interfaces, 24
funciones, 26 métodos, 54 `imports`, 3 `tested_by`), así que cada escenario se convirtió en un test con el
mismo nombre y falló por la razón correcta antes de escribir el analizador. El compilador de TypeScript
sobre un `CompilerHost` en memoria, sin biblioteca estándar, dio justo el resultado de la spec a la primera
sin tocar `packages/core`.

**Ajuste humano.** Ninguno: ejecución autónoma. Decisiones del agente (`design.md` → Follow-ups): las
partes de arista de los escenarios de `tsconfig.json` se comprueban en el mismo `it` de `structure.spec.ts`
y no en un segundo `it` con el mismo nombre, y la prueba manual se hizo con un script de la carpeta
temporal sobre los 38 ficheros rastreados.
