# 29. Caso de uso `index-repository`: lectura en `HEAD`, redacción, framework y snapshot único (DIS-85)

> Sección 29 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Cerrar D1, el error de repositorio vacío y las fases antes de escribir la propuesta

Texto literal enviado (respuesta a las tres preguntas del modelo tras `/opsx:propose DIS-85`):

````
Revisé el ticket DIS-85 (reality-map + enhanced) y el código (errors.ts, simple-git-history.ts). Elijo la
  opción 1 en las tres preguntas, pero hay una laguna que conviene cerrar ahora.

  D1 — Cómo se lee el repositorio → 1. git ls-files en HEAD

  - Lo que se lee es el mismo commit que se guarda como indexedCommit = head. Si se recorre el árbol de trabajo
    y está sucio, el grafo y su contentHash describirían un estado que ningún commit tiene. Eso es incoherencia
    de datos, no solo una cuestión de gusto.
  - Deja fuera vendor/, node_modules/ y lo ignorado sin escribir reglas propias. Además descarta los enlaces
    simbólicos (modo 120000) con un dato fiable, lo que refuerza el doble confinamiento de DIS-84.
  - No añade dependencias, porque simple-git ya está en packages/adapters/git/package.json. Puede reutilizar
    assertRepositoryRoot, así que el error NotAGitRepository sigue la misma regla en los dos puertos.
  - No hace falta ADR.

  Laguna detectada (pedir que la propuesta la cierre): en un repositorio sin commits, el adaptador falla antes
  que readHistory. readFiles es el paso 2 y readHistory el paso 7, y git ls-files/ls-tree sobre HEAD no tiene
  nada que leer. El contrato de SourceTreePort no dice qué hace readFiles en ese caso.
  - Recomiendo que readFiles lance EmptyRepository y que haya un escenario para ello en git-source-tree.spec.ts.
  - La alternativa es devolver { files: [], skipped: [] } y dejar que lo detecte readHistory. Es aceptable, pero
    tiene que quedar escrito en la spec. Si no, la implementación decidirá por su cuenta.

  Error de dominio → 1. EmptyRepository

  - Sigue el patrón que ya tiene errors.ts: nombres cortos de sustantivo o estado (ProjectNotFound,
    InvalidGraph, NotAGitRepository) con su code en SCREAMING_SNAKE.
  - EMPTY_REPOSITORY es estable y fácil de asignar a un código de salida en DIS-86.
  - La JSDoc debe aclarar que «vacío» significa «sin commits», no «sin ficheros». Así no se confunde con un
    repositorio que tiene commits pero ningún .php.

  IndexPhase → 1. Las 6 del ticket

  - detectFramework es una función pura y barata, y se salta cuando llega input.framework. Una fase propia daría
    al CLI un paso instantáneo y opcional. También rompería la regla de «cada fase una vez, en orden», o la
    volvería condicional, y eso complica E1.
  - Añadir una fase más adelante no rompe nada. Quitarla sí rompe el contrato con DIS-86.
  - Pedir que la spec diga a qué fase pertenece cada paso. Por ejemplo: detect cae dentro de redact o al inicio
    de analyze; save incluye assertValidGraph + createProject + saveGraph; history incluye la redacción de los
    mensajes y las aristas co-change. Sin ese reparto, el test de orden de onProgress no comprueba nada.
  - Revisar también que onProgress('confine') se emita antes de un rechazo de E4, o que la spec diga que no se
    emite. Un espía en E4 lo detectaría.
````

**Por qué funcionó.** Cada elección llegaba con su razón, y el modelo la copió literal en `design.md`
(D1, D4, D5) en lugar de inventar una. La laguna del repositorio sin commits quedó cerrada en la spec
antes de escribir código: `readFiles` lanza `EmptyRepository` y tiene su escenario. Pedir el reparto de
pasos por fase convirtió el test de `onProgress` en una comprobación real: cada escenario de fallo
afirma en qué fase se paró.

**Ajuste humano.** El modelo implementó D1 con `git ls-tree -r -z --full-tree HEAD` en lugar de
`git ls-files`, que lista el índice y no `HEAD`; la autora lo aceptó y lo llevó a Linear.

### Prompt 2 — Endurecer la spec: raíz inexistente y ruta real oculta

Texto literal enviado:

````
 Ajusta la spec de DIS-85 (openspec/changes/index-repository) añadiendo:
  - Requirement "Indexing order and no partial write": cuando la confinación sobre rutas reales falla,
  ForbiddenPathError SHALL nombrar el `repoPath` tal como se pidió, nunca la ruta real resuelta (no revelar el
  destino de un enlace simbólico). Añade a la escenario "A symbolic link escaping the allowed root is rejected
  before reading" un AND: el error tiene `requestedPath = 'acme-shop'` y su mensaje no contiene `/elsewhere`.
  Refleja en design D4/D3 cómo se consigue (capturar y relanzar con input.repoPath o comprobar sin delegar el
  mensaje) y añade el caso a tasks 4.3.
  - Requirement "Indexing order and no partial write": si `realPath(allowedRoot)` rechaza porque la raíz no
  existe, indexar SHALL rechazar con IndexingDisabled (raíz configurada pero inutilizable = indexado
  desactivado), no con NotAGitRepository; `realPath` del repositorio que no existe sigue dando
  NotAGitRepository. Nuevo escenario "An allowed root that does not exist disables indexing": fake realPath que
  rechaza para '/repos' → IndexingDisabled, el espía solo recibió `confine`, no se llamó a
  readFiles/analyze/readHistory/createProject/saveGraph. Actualiza D1 (mapeo ENOENT), el conteo de escenarios
  (21) en tasks 7.2, y el contrato para DIS-86 en Follow-ups.
  - Escenario "A taken project name saves no graph": añade que la última fase del espía es `save`, como en el
  resto de escenarios de fallo.
  Vuelve a ejecutar `openspec validate index-repository --strict`.

  Actualiza también la descripción de DIS-85 en Linear, solo en la sección [enhanced] (no toques el bloque
  [original]), en español, con: D1 resuelto (adaptador Git leyendo HEAD con `git ls-tree -r -z --full-tree
  HEAD`, no `ls-files`, porque ls-files lista el índice); nombre de error confirmado `EmptyRepository` /
  `EMPTY_REPOSITORY`, que también lanza `readFiles`; las 6 fases confirmadas y su reparto (detección en
  `redact`; `history` incluye redacción de mensajes, filtro de fileCommits huérfanos y aristas co-change; `save`
  incluye assertValidGraph + createProject + saveGraph); el campo nuevo `frameworkSource: 'detected' |
  'explicit'`; Laravel gana si hay ambos manifiestos y solo se leen los de la raíz; los segmentos vacíos, `.` y
  `..` cuentan como `invalid-path`; un `allowedRoot` inexistente da IndexingDisabled; ForbiddenPathError nunca
  muestra la ruta real. Quita los "(nombre a confirmar en la propuesta)" y "(o la lista final que se decida en
  la propuesta)".
````

**Por qué funcionó.** Las dos reglas nuevas llegaron con su escenario y su aserción exacta, así que en
el apply bastó con verlas fallar: el test del enlace simbólico recibió la ruta real como
`requestedPath` y la raíz inexistente dio `NotAGitRepository`. La prueba manual con una *junction* de
Windows lo confirmó con los adaptadores reales («Forbidden path: escape»).

**Ajuste humano.** La autora pidió además quitar el último «(nombre a confirmar en la propuesta)», que
estaba en la sección [reality-map].

### Prompt 3 — Corregir el rumbo a mitad del apply: un escenario para el analizador

Texto literal enviado (respuesta al hallazgo de la mutación (2), que no hacía fallar ningún escenario):

````
  Opción 1, con estos ajustes (vía /opsx:update):
  - Nuevo escenario en el requirement "Secrets never reach the store": "The analyzer only receives redacted
  content". GIVEN un readFiles falso con un fichero kept cuyo contenido tiene una clave AWS sintética construida
  por concatenación y otro fichero limpio, y un analizador falso que registra lo que recibe; WHEN se indexa;
  THEN el analizador recibe el fichero con `[REDACTED: possible secret]` y sin ninguna subcadena de 8+
  caracteres de la clave; AND en el grafo guardado ese fichero tiene `redacted: true` y el limpio `redacted:
  false`.
  - Promueve el caso extra de 4.9 a ese escenario (quítalo de extras para no duplicar el test) y añade la tarea
  RED → GREEN en el paso 4.
  - Tasks 4.10 mutación (2): debe hacer fallar "The analyzer only receives redacted content" (no "o el caso
  extra").
  - Conteo de escenarios: 22 en tasks 7.2.
  - design.md Risks: el oráculo /AKIA[A-Z0-9]{16}/ sobre symbol.signature en acme-shop no ejercita la ruta (el
  secreto vive en un array de config sin símbolo); la garantía la cubre el escenario unitario nuevo.
  - Linear DIS-85, solo [enhanced], en español: añade a «Decisiones cerradas en la propuesta» el escenario nuevo
  y el motivo (el de acme-shop no detecta un analizador que reciba contenido sin redactar).
  - `openspec validate index-repository --strict` en verde.
````

**Por qué funcionó.** La garantía central del cambio («el analizador nunca ve un secreto») pasó de un
caso extra a un escenario de la spec, con su RED demostrado por la misma mutación que lo había
destapado. El oráculo de acme-shop no podía verlo: la clave plantada está en un array de configuración
que no genera símbolos.

**Ajuste humano.** Antes del prompt, la autora decidió afinar el guard de capa del hook post-edit
(`GUARD_HTTP_IN_BUSINESS`), que bloqueaba `framework-detect.ts` por contener la palabra `fastify`
(un valor de dominio en core): ahora busca imports del transporte, en un commit aparte y verificado con
`grep -qE`. Después pidió partir lo hecho en seis commits por pasos, cada uno con su suite en verde.
Tropiezos del propio modelo, registrados en `tasks.md` y en los informes:
1. Escribió el orden del informe con `<` (unidades UTF-16) cuando la spec pedía orden de bytes; se
   corrigió en D10 y Stryker obligó después a reescribir la comparación sobre puntos de código.
2. Los heredocs de Git Bash volvieron a comerse barras invertidas y comillas invertidas en scripts de
   apoyo; se rehicieron con ficheros creados con la herramienta Write.
3. El test de integración de acme-shop superó el timeout de 5 s de Vitest (unos 6 s por indexado, un
   proceso `git cat-file` por blob); se subió a 60 s y se anotó en los Risks.
