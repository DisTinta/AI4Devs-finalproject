# 47. Base HTTP de la API: formato de error, Zod, `/docs`, límite por IP y composición (DIS-76)

> Sección 47 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change dentro del workflow autónomo

La autora lanzó la ejecución con «usa un workflow»; el script del workflow (ADR
`20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-76 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer agents; for tdd-implementer and tdd-refactorer pass model "sonnet" if the Agent tool lets you). Stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review, PR, archive): those are later steps. Full suite, lint, typecheck and architecture lint must be green. Commit in small conventional commits.
```

**Por qué funcionó.** El diseño ya fijaba el orden de registro (compiladores, manejador de errores,
OpenAPI, límite, `/health`) y una tabla única de errores, así que cada escenario fue un ciclo corto
RED → GREEN con `inject` y sin base de datos. Confirmar en el código instalado de Fastify 5.12.7 los
códigos de error del cuerpo (`FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`) y el
serializador de petición por defecto (que registra `accept-version` como `version`) evitó adivinar.
La primera pasada de Stryker dejó `packages/api` en 77,64 %: los supervivientes con sentido (límites
del 4xx, rangos de la configuración, `isUnlimited`, la conversión a OpenAPI) se cerraron con tests de
límites y dos simplificaciones (el `Retry-After` solo lo pone el manejador; `logger` solo como
objeto), y la pasada forzada quedó en 96,81 %.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en el informe del paso 12: el sentinel `SENTINEL-key-3c9d` que exige la spec se permite por
su valor exacto en `.gitleaks.toml` (como los de DIS-17 y DIS-40); `.env.example` no se pudo leer ni
editar porque la configuración de permisos de la sesión lo bloquea, así que la tarea 15.3 queda abierta;
la parada con `SIGINT` no se pudo enviar en Windows desde la shell del agente y su camino de cierre lo
cubre el test de integración.

### Prompt 2 — Revisiones previas al merge dentro del workflow autónomo

El mismo script del workflow envió al paso siguiente este texto literal:

```
YOUR STEP 4/6 — pre-merge reviews.
Run, in this order, the review tasks of the change's tasks.md: /show-spec-working, /verify-against-spec, /adversarial-review, and the security-reviewer agent if the diff touches auth, inputs from HTTP, rate limits, secrets or personal data. Save each report where tasks.md says. Every finding gets an A/B/C/D destination in design.md → Follow-ups and is fixed in this change when fixable (behaviour changes via TDD). Re-run a check whose findings led to non-trivial fixes until no Blocker/Major remain. Mark the tasks. Suite green. Commit.
```

**Por qué funcionó.** Ejecutar la API real con `curl` en vez de reutilizar solo el informe del paso 13
destapó lo que los tests con `inject` no cubrían: un `POST` con cuerpo JSON roto o enorme a una ruta
inexistente respondía `400`/`413` en lugar de `404`, porque Fastify parsea el cuerpo antes del
manejador de «no encontrado». Se corrigió con un escenario nuevo en la spec y un ciclo RED → GREEN
(`request.is404`). La lectura hostil de `composeFromEnv` encontró que el pool se abría antes de
construir el modelo; reordenarlo cerró la fuga sin tocar ningún test existente.

**Ajuste humano.** Ninguno: ejecución autónoma. Los skills bifurcados `verify-against-spec` y
`adversarial-review` terminaron sin devolver su salida al agente orquestador, así que ambas
revisiones las rehízo el agente del paso con las mismas listas de comprobación, y lo deja escrito en
el informe de la revisión adversarial. `.env.example` sí se pudo editar en este paso y la tarea 15.3
quedó cerrada.
