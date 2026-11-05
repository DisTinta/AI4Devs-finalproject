# 52. Guion de demostración, despliegue y tests con salida real (DIS-45)

> Sección 52 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Escribir los documentos dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-45 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** La descripción `[enhanced]` del ticket ya decidía el flujo ligero sin change
de OpenSpec (D1), qué mostrar en cada paso que Entrega 2 no alcanza (D3–D6) y qué ediciones de la
salida se permiten (D7), así que el paso se redujo a capturar y pegar. La captura se hizo con un
script que ejecuta los mismos comandos del guion sobre una base nueva (`codemind_demo`) y guarda
una salida por bloque; ejecutarlo dos veces y comparar, ignorando solo los campos variables que el
propio guion enumera, comprobó que los bloques se reproducen tal cual.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en la descripción `[enhanced]` del ticket (D12–D14): al capturar `make up`, la API no
arrancaba nunca en Windows, porque `tsx watch` lee su stdin y se lo pasa a la API, y `concurrently`
da a cada hijo un stdin en tubería que no se cierra. Se arregló en este mismo cambio (script `dev`
con `node --watch` y tsx registrado con `tsconfig.run.json`, más un test de integración que lo
reproduce), aunque el ticket era solo de documentación. `curl` desde Git Bash estropeaba las tildes
de la pregunta, así que la API se llama con `node`. Y en una de las dos ejecuciones completas de la
suite falló un test por una carrera entre dos ficheros de integración ya existentes; como un test
existente no se toca para que la suite pase, `docs/TESTING.md` la documenta.

### Prompt 2 — Revisiones previas al merge dentro del workflow autónomo

El mismo script del workflow envió al paso siguiente este texto literal:

```
YOUR STEP 4/6 — pre-merge reviews.
Run, in this order and IN THE FOREGROUND inside your own context (do not fork them to background subagents: their results get lost or blocked by the block-secrets hook when they quote test secrets), the review tasks of the change's tasks.md: /show-spec-working, /verify-against-spec, /adversarial-review, and the security-reviewer agent if the diff touches HTTP inputs, rate limits, secrets or personal data. Save each report where tasks.md says. Every finding gets an A/B/C/D destination in design.md → Follow-ups and is fixed in this change when fixable (behaviour changes via TDD; spec edits via /opsx:update with an addendum to the spec-audit report). Re-run a check whose findings led to non-trivial fixes until no Blocker/Major remain. Mark the tasks. Suite green. Commit.
```

**Por qué funcionó.** Sin change de OpenSpec no hay `tasks.md` ni `design.md`: los resultados y el
destino de cada hallazgo van a la descripción `[enhanced]` del ticket y a un comentario de Linear
(D1). Volver a ejecutar el guion entero sobre una base nueva y comparar cada bloque de salida con un
`diff` mecánico, en lugar de mirarlo, dejó como única diferencia `latencyMs`, que el DEMO ya declara
variable. La lectura hostil del arreglo de `npm run dev` encontró que `dev-register.mjs` resolvía
`tsconfig.run.json` contra el directorio de trabajo: arrancado desde la raíz fallaba con un error de
tsx. Se arregló por TDD (test en rojo, resolución desde `import.meta.url`, verde). La ayuda `ask_api`
del DEMO rompía con un `TypeError` ante cualquier respuesta de error; ahora imprime el cuerpo del
error, y se volvió a capturar el guion con la ayuda copiada del propio documento.

**Ajuste humano.** Ninguno: ejecución autónoma. `verify-against-spec` y `adversarial-review` se
bifurcan a un agente en segundo plano por su configuración, así que el agente hizo ambas revisiones
en primer plano con sus mismas listas de comprobación. La suite completa en paralelo falló en las
tres ejecuciones del paso por las carreras entre tests de integración ya existentes (también sin el
test nuevo); como un test existente no se toca para que la suite pase, `docs/TESTING.md` documenta
ambas carreras y la ejecución sin paralelismo entre ficheros, que pasó entera.
