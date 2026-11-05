# 34. Carga de la semilla, `cli projects` y constante de proyectos de muestra (DIS-92)

> Sección 34 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Cerrar la desviación de contadores y fijar las salidas literales

Tras `/enrich-us DIS-92`, la autora revisó el `[enhanced]` y envió este mensaje:

```
  Ajusta la spec de DIS-92 añadiendo:
  - D6 en «Decisiones para el design.md»: `projects` muestra `nodeCount` (= ficheros + símbolos) y `edgeCount`
  de `Project`, no ficheros/símbolos/commits por separado como pide el criterio de DIS-88, porque el título
  exige leer vía `StorePort.listProjects` y ampliar `Project`/`StorePort` está fuera de alcance; los cuatro
  contadores separados solo existen en la constante web. Deja un comentario en DIS-88 (en español) registrando
  la desviación.
  - Plantillas literales de salida en el contrato y en C1/C4. `db:seed`: primera línea `1 project loaded` (`N
  projects loaded` si N ≠ 1); después, por proyecto, `  <name>  <language>/<framework|->  <node_count> nodes ·
  <edge_count> edges` (dos espacios como separador, sin padding de columnas). `projects`: por proyecto, `<name>
  <id>  <language>/<framework|->  <nodeCount> nodes · <edgeCount> edges  <indexedAt ISO|not indexed>[
  sample]`. Los escenarios comparan la línea completa, no «contiene».
  - Contrato de D3: la línea de stdout de `seed:build` no cambia; el orden de escritura es primero
  `packages/web/src/data/sample-projects.ts` y después `seeds/graph-dump.sql`, cada fichero con
  `writeAtomically`; si falla cualquiera de las dos escrituras, exit 1 con error JSON; el test de coherencia de
  C5 es la red de seguridad si queda un estado a medias. Añade un escenario unitario para «falla la escritura de
  la constante → la semilla no se escribe, exit 1».
  - En C5: el texto generado de la constante pasa `npm run lint` y `npm run typecheck` (incluye
  `packages/web/tsconfig.json`) sin excepciones de eslint para ese fichero.
  Actualiza también la descripción de la tarea con: en la Definición de hecho, «regenerar `seeds/graph-dump.sql`
  y `sample-projects.ts` es el último commit antes del PR y se repite tras cualquier cambio posterior
  (incluidas las rondas de revisión) bajo `packages/adapters/store-postgres/src/`, `packages/cli/src/seed/`,
  `packages/cli/src/seed-build.ts` o `packages/cli/src/compose-index.ts`»; en Docs, añadir a
  `docs/project-context.md` que cada `db:seed` / `make up` borra por CASCADE `query_log`, `claim`, `evidence` y
  `cache_entry` de los proyectos de muestra (D2) y que el formato de la línea de `make up` difiere del readme
  §1.4 hasta CM-HU-18 (D5); y marca D1–D5 como aceptadas con las precisiones de D3 indicadas arriba.
```

**Por qué funcionó.** El enriquecimiento había detectado que el criterio de DIS-88 (ficheros, símbolos
y commits en `projects`) chocaba con el título de DIS-92 (leer por `StorePort.listProjects`). La autora
lo resolvió como desviación registrada en la HU padre, en vez de ampliar el puerto en silencio. Las
plantillas literales hicieron comprobables línea a línea las salidas de `db:seed` y `projects`.

**Ajuste humano.** El modelo señaló que, con la constante escrita antes que la semilla, el mensaje
`seed build failed; nothing was written` sería falso si fallaba la segunda escritura. En dos mensajes
de seguimiento la autora decidió el código `PARTIAL_WRITE` y limitó aquel mensaje a los fallos
anteriores a cualquier escritura.

### Prompt 2 — Ajustar la spec antes del apply

```
  Ajusta la spec de seed-load-and-projects (DIS-92) añadiendo:
  - seed-load, «Command contract and configuration»: una semilla con cabecera válida pero sin ningún `INSERT
  INTO project`, o con una sentencia que el lector de la semilla no sabe leer, falla con `INVALID_SEED` antes de
  conectar; el éxito siempre carga al menos un proyecto (nunca `0 projects loaded`). Amplía el escenario «An
  invalid seed file fails before connecting» con esos dos casos y quita de la tarea 3.3 el caso extra «`N
  projects loaded` para 0»; deja «2 loaded».
  - cli-projects: sustituye «`USAGE` for any argument» por «`USAGE` for any positional argument or unknown
  option; `--help` prints the help to stdout and exits `0`», y añade `--help` al escenario «Configuration,
  connection and usage errors» o déjalo como caso extra explícito en 5.2.
  - seed-build delta, escenario «Missing configuration fails before anything else»: GIVEN añade una constante
  previa con contenido conocido; THEN «the previous seed file and the previous constant are unchanged».
  - design D1, paso 2: cambia el motivo a «hace falta el nombre para el mensaje y `details.name` antes de
  ejecutar, y el `detail` del servidor se traduce»; añade que un `23505` por carrera entre el SELECT y el INSERT
  acaba en `INTERNAL` `seed load failed; the database is unchanged` (cierto por el rollback). El mensaje de
  `PROJECT_NAME_TAKEN` escapa el nombre con `escapeLiteral`, como `index`.
  Actualiza también la descripción de la tarea con:
  - proposal.md, Impact: `seed-load.ts` NO reutiliza `CommitUncertain` (su mensaje es «the project may have been
  saved»); un fallo del commit se reporta con su propio `CliError('INTERNAL', 1, 'unexpected error; the seed
  may have been loaded')`. Ajusta design D1 paso 4 en el mismo sentido.
  - tasks.md 4.5: ejecutar a la vez `seed-load.spec.ts`, `projects-command.spec.ts` y `seed-build.spec.ts`, dos
  veces, con la base local poblada (acme-shop de `make up` + un proyecto propio confirmado); si hay esperas o
  interbloqueos, serializar los tres con `poolMatchGlobs`/`fileParallelism` y documentarlo en Risks.
  - tasks.md 6.3: indicar que entre 6.3 y 6.4 `npm run typecheck` falla a propósito (propiedad
  `sampleProjectsPath` aún no aceptada) y que se vuelve a poner en verde en 6.4.
  - tasks.md 7.3: timeout explícito en el test de lint/tipos (ESLint y el compilador por API son lentos).
```

**Por qué funcionó.** Cerró, antes de escribir código, los huecos que un apply habría resuelto
improvisando: el «0 projects loaded» silencioso, el `--help` sin contrato, el mensaje heredado de
`CommitUncertain` y el orden de las tareas, que deja `typecheck` en rojo a propósito entre 6.3 y 6.4.
La tarea 4.5, con la base local poblada, fue la que más rindió en el apply.

**Ajuste humano.** El modelo añadió por coherencia una nota en la tarea 6.3: ampliar el test existente
«Missing configuration fails before anything else», cuyo escenario cambiaba.

### Prompt 3 — Aplicar el change

Texto literal enviado: `/opsx:apply seed-load-and-projects`. Durante la aplicación el modelo preguntó
con opciones cerradas por un conflicto entre la spec y el design: `escapeLiteral` (el de `index`)
pone el nombre entre comillas JSON, y la spec fijaba el mensaje sin comillas. Respuesta elegida:
«Spec con comillas (Recomendado)»; el mensaje quedó como `a project named "acme-shop" already exists
and is not a sample`.

**Por qué funcionó.** La tarea 4.5 (los tres ficheros de integración juntos, sobre una base con un
acme-shop confirmado por `make up`) destapó que dos tests de DIS-91 fallaban incluso solos en cuanto la
semilla estaba cargada: comparaban los ids deterministas de la semilla con los de la base y creaban
otro `acme-shop`. Se corrigieron en este change, vaciando sus proyectos dentro de la transacción del
harness. Stryker pasó del 85,96 % al 94,28 % con casos que matan los mutantes con valor.

**Ajuste humano.** La elección del formato del mensaje.
