# 33. Semilla reproducible: `seed:build` con huella y volcado determinista (DIS-91)

> Sección 33 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Cerrar las decisiones abiertas del enriquecimiento

Tras `/enrich-us DIS-91`, la autora revisó el `[enhanced]` y envió este mensaje:

```
  Actualiza la descripción de DIS-91 en Linear. NO toques el bloque [original]. Edita solo [enhanced] (y
  [reality-map] si hace falta). Todo en español.

  1. §3 Contexto técnico, paso 3: sustituye «commit no confirma… después siempre ROLLBACK» por un mecanismo
  implementable con la API real de packages/cli/src/compose-index.ts. Ahora mismo indexWithEnvironment llama a
  commit() y luego a release() en el finally, y un error dentro de commit() se convierte en CommitUncertain
  («may have been saved»). Decisión: la OpenTransaction propia de seed-build hace en su commit() la exportación
  con export-seed.ts sobre transaction.client, guarda las filas en un cierre y después ejecuta ROLLBACK;
  release() cierra el cliente. seed-build.ts captura CommitUncertain y lo traduce a INTERNAL con el mensaje
  «seed build failed; nothing was written» (nunca «may have been saved»). Añade a C4 el caso (e): «la
  exportación falla dentro de commit() → exit 1, INTERNAL, sin "may have been saved", fichero previo intacto,
  rollback y release llamados».

  2. C5 y §3 paso 4, claves naturales de los UUID v5: namespace UUID fijo, constante en deterministic-ids.ts.
  Todas las claves llevan el nombre del proyecto delante, para que no choquen cuando entre task-api (DIS-32):
  project: name; file: name+path; symbol: name+path+kind+start_line+symbol.name; commit: name+sha; edge:
  name+kind+resolution+extractor+tipo y clave natural del origen+tipo y clave natural del destino (archivo o
  símbolo). Las aristas no tienen UNIQUE en el esquema ni se comprueban en validate-graph.ts: si dos aristas
  comparten la clave completa, se ordenan por (weight, ordinal de aparición) y se les añade un índice de
  ocurrencia #0, #1… a la clave. Añade a C5 un caso con dos aristas idénticas: dos UUID distintos, mismo
  resultado se mezclen como se mezclen las filas de entrada. Separa los componentes de la clave con un
  delimitador que no pueda aparecer en ellos (\u0000) y documéntalo.

  3. §3 paso 4: formato canónico de valores. timestamptz como literal ISO-8601 UTC con milisegundos
  ('2024-01-02T03:04:05.000Z'), sin depender de TZ ni de la configuración de la sesión. double precision con la
  representación más corta que vuelve exacta (Number#toString de JS), y NULL literal para nulos. Añade a C2: «el
  resultado es idéntico con TZ=UTC y TZ=America/Bogota».

  4. D5: cierra la decisión. Se indexa con el nombre temporal constante '__codemind_seed_build__' y el volcado
  escribe name = 'acme-shop'. No hay DELETE en ningún caso. C2 sigue cubriendo una base que ya tiene un proyecto
  acme-shop.

  5. D4: cierra la pregunta abierta. analyzer-fingerprint = packages/analyzers/php/src/**,
  packages/core/src/index/** y packages/core/src/knowledge/**, más las versiones resueltas de tree-sitter-php y
  web-tree-sitter leídas de package-lock.json (entrada sintética «deps:<nombre>@<versión>»).
  contract-fingerprint = packages/core/src/ports/AnalyzerPort.ts y
  packages/adapters/store-postgres/migrations/*.up.sql. Justificación: todo lo que da forma a las filas;
  invalidar de más es el fallo seguro de verify (CM-HU-14.1). Quita «Riesgo: D4 abierta» de INVEST y la nota «Si
  D4 queda abierta» de la DoD. Añade a C3 el caso (f): «cambiar la versión resuelta de una dependencia del
  parser → huella distinta».

  6. Añade un comentario en Linear, en español, que resuma estos cambios.
```

**Por qué funcionó.** El enriquecimiento ya había destapado las cuatro fuentes de no determinismo
(ids `gen_random_uuid()`, `indexed_at` de reloj, `root_path` real, `is_sample` sin parámetro) y dejado
D4 y D5 como preguntas. La autora contestó cada una contra la API real (`indexWithEnvironment`,
`CommitUncertain`) en lugar de aceptar la frase «el commit no confirma», que no era implementable tal
cual.

**Ajuste humano.** Las seis decisiones son de la autora; el modelo solo comprobó antes de escribir que
`validate-graph.ts` no mira la unicidad de las aristas y las versiones resueltas en `package-lock.json`.

### Prompt 2 — Contrato de salida con `/opsx:update`

```
  Ajusta la spec de DIS-91 (change openspec/changes/seed-build) con /opsx:update:

  - design.md D1 y spec.md «Command contract and configuration»: seed-build pasa a indexWithEnvironment un
  onProgress que no hace nada. Cambia «the last line of stdout SHALL be …» por «on success stdout SHALL be
  exactly one line …» y añade «and stderr SHALL be empty». Al fallar, stderr tiene exactamente una línea (la del
  error JSON) y nada más.
  - spec.md, mismo requisito: <output> es la ruta de la salida relativa a repoRoot, con separadores `/`, cuando
  la salida está dentro de repoRoot. Si está fuera (tests en el directorio temporal; en Windows, quizá en otra
  unidad), se imprime solo el nombre del fichero. Ninguna salida contiene una ruta absoluta.
  - spec.md, scenario «The acme-shop seed is generated»: cambia «the last stdout line names the same counts» por
  «stdout is exactly one line naming the same counts and the output file name, and stderr is empty».
  - spec.md, scenario «A failed indexing leaves the previous seed intact»: añade «stderr holds exactly one
  line».
  - tasks.md 6.2: añade «onProgress no-op». Tasks 6.1/6.3: comprueba que stderr no tiene líneas de progreso.
  Task 7.1: comprueba que stdout tiene una línea exacta y que stderr está vacío al terminar bien.

  Actualiza también la descripción de DIS-91 en Linear, solo el bloque [enhanced] (el [original] no se toca):
  - §2 Contrato: la línea de resumen usa `->` en lugar de `→` (mismo estilo que build-history.mjs). Al terminar
  bien, stdout tiene exactamente una línea y stderr queda vacío. <output> es la ruta relativa a la raíz del
  repositorio, o solo el nombre del fichero si la salida está fuera.
  - §3 paso 2: buildOne recibe una opción `log` opcional (por defecto console.log; los usos actuales no
  cambian). seed-build pasa `log: () => {}` para que no salga la ruta absoluta de fixtures/.
  - §3 paso 3: la OpenTransaction de seed-build envuelve a defaultOpenTransaction(DATABASE_URL)
  (createSeedTransaction en packages/cli/src/seed/seed-transaction.ts), en lugar de abrir su propio pg.Client.
  Así hereda el mapeo a DATABASE_UNAVAILABLE. onProgress no hace nada.
  - §3 paso 4, formato canónico: un texto con un carácter de U+0000 a U+001F (salvo LF) o U+007F se escribe como
  E'…'. Dentro, la `\` y la `'` van dobladas y cada carácter de control va como \uXXXX. Motivo: un \r sin
  escapar chocaría con `eol=lf` y el `git diff` dejaría de salir vacío.
  - §3 To create: añade packages/cli/src/seed/seed-transaction.ts y la modificación de
  fixtures/build-history.mjs.
  Deja un comentario en español en DIS-91 con estos cambios.
```

**Por qué funcionó.** Convirtió en contrato (spec, design, tareas y Linear a la vez) tres decisiones
que el modelo había tomado por su cuenta en `/opsx:propose` y señalado como tales: la opción `log` de
`buildOne`, el `->` del resumen y los literales `E'…'`. «La última línea de stdout» dejaba hueco a
salidas extra; «exactamente una línea» lo cierra y es comprobable.

**Ajuste humano.** El modelo añadió por coherencia el mismo criterio a la tarea 11.2 (prueba manual),
la única que lo contradecía.

### Prompt 3 — Aplicar el change

Texto literal enviado: `/opsx:apply`. Durante la aplicación el modelo preguntó con opciones cerradas
qué hacer porque el `.env` de la autora no definía `AUTHOR_HASH_SALT`, imprescindible para que dos
ejecuciones dejen el `git diff` vacío (PH-11: la sal no se versiona). Respuesta elegida: «Genera una y
la guardo»: el modelo generó un valor aleatorio, lo mostró una vez para copiarlo en `.env` y regeneró
la semilla con él.

**Por qué funcionó.** El TDD sacó a la luz dos cosas que el plan no preveía: Vitest 1.6 ejecuta los
ficheros en *worker threads*, donde asignar `process.env.TZ` no cambia la zona (el escenario de zona
horaria falló en su aserción de guarda, no en silencio), y Git Bash reescribe `TZ` al lanzar
programas de Windows. Lo primero se resolvió con `poolMatchGlobs` → `forks` para ese único fichero y
quedó en design D9; lo segundo, lanzando la prueba manual desde Node.

**Ajuste humano.** La elección de la sal; el valor no está en ningún fichero del change.
