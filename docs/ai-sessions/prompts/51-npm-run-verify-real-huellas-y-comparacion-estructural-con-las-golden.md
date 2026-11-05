# 51. `npm run verify` real: huellas y comparación estructural con las golden, sin LLM, y job `verify` en CI (DIS-44)

> Sección 51 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-44 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El diseño (C1–C12) y las enmiendas A1–A13 de la descripción `[enhanced]` ya
fijaban los tres módulos nuevos, el orden de las comprobaciones, el texto exacto de cada mensaje y
que ningún fichero tocado fuera entrada de una huella, así que `verify` nació verde contra la
semilla y la golden versionadas. Recalcular las huellas en un `git worktree` limpio antes de
escribir código (A13) descartó que coincidieran solo por ficheros sin versionar. Las *seams* de
`VerifyDeps` (también `listProjects`, A12) dejaron toda la lógica cubierta por tests unitarios, que
son los que ve Stryker: 91,30 % en la primera pasada y 97,39 % tras cinco tests nuevos para los supervivientes con sentido sobre `verify.ts`, `compare-golden.ts` y `seed-header.ts`. La
ejecución real tardó 2,97 s, y las pruebas manuales, con copia de seguridad de la base y de los
ficheros, enseñaron cada camino con su salida exacta.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en el change y en los informes: la tríada TDD la hizo el propio agente del paso (sin
herramienta de subagentes), y la composición real de `verify.ts` se escribió entera en la tarea 3.2,
así que el escenario de integración «Every golden answer matches» salió verde a la primera; su
eficacia se comprobó rompiendo `useCache` a propósito (rojo) y restaurándolo. La base avanzó con la
fusión de DIS-34 (Q3 y Q4 regeneradas) y la rama se rebasó antes de escribir código. Tres tests de
integración de git fallan en esta máquina por un motivo ajeno al cambio (Windows no deja abrir un
fichero cuyo contenido es exactamente `<?php // b` seguido de salto de línea; se reprodujo fuera de
los tests) y quedan anotados para que CI, en Linux, los confirme.
