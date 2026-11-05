# 26. Deuda del analizador PHP: rutas duplicadas, carga del parser y regla sin I/O (DIS-96)

> Sección 26 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change y decidir las rutas duplicadas

Texto literal enviado: `/opsx:propose DIS-96`.

Y, ante la pregunta del modelo sobre qué hacer con las rutas duplicadas:

````
1, con: formato duplicate path \"<path>\"; kept the first; descartar antes de parsear e indexar (escenario sin duplicate symbol espurio); comparación exacta de rutas, normalizar es non-goal; un diagnostic por cada entrada descartada."
````

**Por qué funcionó.** El modelo paró en el único punto que la issue dejaba abierto («decidir aquí si
además el analizador lo diagnostica») y ofreció tres opciones con su efecto en el contrato. La
respuesta fijó mensaje, momento del descarte, comparación y número de diagnostics, y el escenario de la
spec cubre cada uno: un `README.md` duplicado (no solo `.php`), `app/a.php` frente a `app/A.php` y el
contenido descartado (`class B`) que no aparece.

**Ajuste humano.** La política de duplicados es de la autora.

### Prompt 2 — Ajustar la spec antes del apply

Texto literal enviado:

````
Ajusta la spec de DIS-96 (change openspec/changes/analyzer-php-debt) así:

1. Contrato del puerto en core (proposal.md Non-goals + Impact, design.md nueva decisión D9, tasks.md):
   - Cambia el non-goal "Any change to AnalyzerPort or packages/core (git diff empty)" por: "No type, runtime
     or test change in packages/core; the only allowed diff is the JSDoc of packages/core/src/ports/AnalyzerPort.ts".
   - Añade D9 "Port JSDoc follows the contract": actualizar en AnalyzerPort.ts (a) AnalyzerInput.files: "order does
     not affect the result, except that when several inputs share a path only the first is analysed";
     (b) AnalysisResult.files: "One GraphFile per distinct input path"; (c) JSDoc de AnalysisResult.diagnostics,
     AnalyzerDiagnostic y AnalyzerPort.analyze: añadir "one per input discarded as a duplicate path (no line)".
   - En specs/code-analysis/spec.md, tras el párrafo de rutas duplicadas, añade: "Apart from inputs discarded as
     duplicate paths, the order of the inputs SHALL NOT affect the result."
   - tasks.md: nueva tarea 1.4 con esos cambios de JSDoc; en 8.3 sustituye "git diff --stat ... packages/core is
     empty" por "only AnalyzerPort.ts changed, and only comment lines"; ajusta Goals de design.md
     ("packages/core untouched" → "packages/core: JSDoc of AnalyzerPort.ts only").

2. parser.ts: en design.md D2 y en la tarea 2.2, actualiza el JSDoc de loadPhpParser: quita "call this at most
   once per instance" y explica que createPhpAnalyzer memoiza la promesa y la olvida si se rechaza.

3. proposal.md, viñeta "Symbol-order tie-break asserted": "the D6 order" → "the order of design D6 of
   analyzer-port-and-php-structure".

4. design.md D4 y tareas 5.1/5.2: añade worker_threads y cluster al patrón
   ('^(node:)?(fs|net|tls|dgram|dns|http|https|http2|child_process|worker_threads|cluster)(/|$)'), con un
   fallo forzado (l) `import 'node:worker_threads';`. Añade en Risks: "[global fetch and createRequire from
   node:module are not imports the rule can see] → covered only by review and the Ghost scenario; node:module stays
   allowed because the grammar load needs it".

5. design.md D3 y tareas 2.1/2.3: cada test de parser-load.spec.ts crea su propio createPhpAnalyzer(); un
   beforeEach llama a vi.clearAllMocks() y cada test configura su propio mockRejectedValueOnce; el caso 2.3 usa
   Promise.allSettled para las dos llamadas concurrentes.

Actualiza también la tarea en Linear (DIS-96), en español, sin modificar el texto existente de la descripción:
añade al final una sección "Decisiones de la propuesta (2026-10-04)" y un comentario con lo mismo:
- Rutas duplicadas: el analizador se queda con la primera en orden de entrada, compara exacto sin normalizar,
  descarta las siguientes antes de parsear y emite `duplicate path "<path>"; kept the first` (sin line). Se aplica
  a cualquier tipo de fichero. DIS-85 sigue sin deber pasar duplicadas.
- El contrato de AnalyzerPort (solo JSDoc en core) se actualiza para reflejarlo.
- La regla analyzers-no-io cubre fs, red, child_process, worker_threads y cluster; fetch global y createRequire
  quedan fuera de la regla.
````

**Por qué funcionó.** La revisión de la autora detectó lo que la propuesta había pasado por alto: si la
spec cambia lo que promete `AnalyzerPort`, su JSDoc en core queda desfasado, así que «core sin diff»
era incompatible con la propia spec. El ajuste lo resolvió acotando el diff a comentarios, y la tarea
8.3 lo comprueba línea a línea. Linear se actualizó con un `append`, sin reescribir la descripción.

**Ajuste humano.** Todo el prompt. En una ronda posterior, la autora corrigió también el punto 5:
en Vitest 1.6 `vi.clearAllMocks()` no vacía la cola de `…Once` y `mockReset` borra la implementación
por defecto, así que el `beforeEach` hace `mockReset()` seguido de `.mockImplementation(realLoadPhpParser)`.

### Prompt 3 — Implementación completa

Texto literal enviado: `/opsx:apply`.

**Por qué funcionó.** DIS-96 pasó a In Progress antes de tocar código. Los dos cambios de
comportamiento se vieron en RED por el motivo correcto. En el del parser, que la primera llamada
rechazara demostró que el `vi.mock` (el primero del repositorio) intercepta el módulo real. Los doce
fallos forzados (a)–(l) se detectaron todos, cada uno restaurado y comprobado por SHA-256.

**Ajuste humano.** Ninguno durante la implementación. Tropiezos del propio modelo, registrados en
`tasks.md`:
1. Un `node -e` para editar el JSDoc de core falló porque el shell interpretó los backticks del texto.
   Abortó sin escribir nada y se rehízo con ediciones literales.
2. El hook del repositorio bloquea `rm`, así que el script de la prueba manual queda en el scratchpad
   de la sesión, fuera del repositorio, en lugar de borrarse como pedía la tarea 9.5.
