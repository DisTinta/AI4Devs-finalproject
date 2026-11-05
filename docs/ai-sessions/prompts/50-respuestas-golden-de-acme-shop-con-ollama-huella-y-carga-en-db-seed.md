# 50. Respuestas *golden* de acme-shop con Ollama, huella y carga en `db:seed` (DIS-26)

> Sección 50 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-26 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El diseño (C1–C10) ya fijaba los ficheros nuevos de `packages/cli/src/cache/`,
el orden de comprobaciones de `cache:build`, los *seams* y que `db:seed` guardara las golden con
`saveCacheEntry` sin tocar ninguna entrada de la huella de la semilla. La ejecución real con Ollama
en CPU, en segundo plano y vigilada por su log, respondió Q1, Q3 y Q4 al primer intento en 22 min
24 s, con la `fetch` propia sin el corte de 300 s de Node. Stryker no ejecuta los specs de
integración, así que la primera pasada sobre el código nuevo dio 77,03 %; con 20 tests unitarios de
reintentos, semilla vieja, contenido inseguro, regeneración parcial y guardado en `db:seed`, subió a
91,50 %.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en la descripción `[enhanced]` de DIS-26 y en los informes del change: la tríada TDD la
hizo el propio agente del paso (sin herramienta de subagentes); el test existente «Loading again
changes nothing and keeps the user's projects» compara ahora las entradas de caché de los proyectos
de muestra sin su id, porque cada carga las reinserta con ids nuevos tal como pide el requisito
modificado; el valor sintético `AKIA…` que cita la spec se permitió en `.gitleaks.toml` por su valor
exacto; y `.env.example` no se pudo editar en este paso (los permisos de la sesión deniegan leer
ese fichero), así que `CACHE_BUILD_TIMEOUT_MS` queda documentada en `readme.md` y en
`docs/project-context.md` y la tarea 15.3 sigue abierta para ese fichero.

### Prompt 2 — Revisiones previas al merge dentro del workflow autónomo

El mismo script del workflow envió al paso siguiente este texto literal:

```
YOUR STEP 4/6 — pre-merge reviews.
Run, in this order, the review tasks of the change's tasks.md: /show-spec-working, /verify-against-spec, /adversarial-review, and the security-reviewer agent if the diff touches HTTP inputs, rate limits, secrets or personal data. Save each report where tasks.md says. Every finding gets an A/B/C/D destination in design.md → Follow-ups and is fixed in this change when fixable (behaviour changes via TDD; spec edits via /opsx:update with an addendum to the spec-audit report). Re-run a check whose findings led to non-trivial fixes until no Blocker/Major remain. Mark the tasks. Suite green. Commit.
```

**Por qué funcionó.** Ejecutar `cache:build` y `db:seed` de verdad, con variables limpias y moviendo
la semilla o la golden a un lado, enseñó cada camino de error con su línea exacta y sin tocar el
fichero versionado; servir las golden por la CLI y por la API en modo evaluación probó el DoD de punta
a punta. La lectura hostil encontró lo que los tests no cuentan: la respuesta golden de Q4 afirma algo
que el código no hace (pasa a DIS-34, que es quien revisa, regenera o retira golden) y la transacción
de un intento bloquea también los `ask` sobre acme-shop, no solo un `db:seed` (se documentó). La
única conducta sin especificar, una semilla sin la fila de acme-shop, se añadió a la spec con
`/opsx:update`.
La suite completa destapó además que el test de integración del propio change fallaba si otro
fichero confirmaba un proyecto en paralelo; una sonda que confirmaba un proyecto desde otra conexión
lo reprodujo en rojo y la instantánea se acotó a las filas que el build puede tocar.

**Ajuste humano.** Ninguno: ejecución autónoma. Los skills bifurcados `verify-against-spec` y
`adversarial-review` no devolvieron su salida al agente del paso dentro de la espera razonable, así
que el agente hizo ambas revisiones con sus mismas listas de comprobación y lo deja escrito en los
informes; la revisión de seguridad se hizo igual, con la lista de `.claude/agents/security-reviewer.md`.
`.env.example` siguió sin poder leerse ni editarse, así que esa línea queda como deuda explícita para
la autora en DIS-26 y la tarea 15.3 sigue abierta.
