# 9. Construcción de `fixtures`

> Sección 9 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

Primer hito de código de la Entrega 2: crear los dos repositorios de muestra
`fixtures/acme-shop` (Laravel) y `fixtures/task-api` (TypeScript), con su historia
de Git, su *drift* plantado y el documento de verdad-terreno `fixtures/README.md`.

### Prompt 1 — Encargo de construcción de los fixtures

Prompt literal con el que se abrió la fase (define contexto, objetivo, fuera de
alcance, requisitos de contenido y forma de trabajo):

```
## Contexto

Trabajas en **CODEMIND**, el proyecto final de AI4Devs de Cristina Rodríguez Núñez. Repositorio: fork `DisTinta/AI4Devs-finalproject`. Hoy no hay una sola línea de código de producto: la Entrega 1 fue solo documentación.

Antes de escribir nada, lee estos ficheros de la raíz y trabaja a partir de ellos, no de suposiciones:

- `CODEMIND-ROADMAP.md` — brújula viva: estado, bloqueos, cola de hitos y reglas duras.
- `readme.md` — producto y diseño. Secciones que te afectan directamente: **1.2** (F1–F7), **1.4** (instalación y comandos de ejemplo), **2.2** (componentes y analizadores), **2.3** (árbol de ficheros), **2.5** (seguridad), **2.6** (los fixtures como arnés de pruebas y las Tablas 1 y 2), **3** (modelo de datos), **5** (HU1–HU3), **6** (Ticket 3, tarea 9: `seed:build`).
- `prompts.md` — registro de uso de IA; §6 del roadmap fija la norma de registro.

`ai4devs-requisitos-y-encaje.md` y `proposal-codemind/` son histórico. No son spec viva. No los uses como fuente de requisitos.

## Objetivo de esta fase

**Hito 1 de la cola del roadmap y nada más:** crear los dos repositorios de muestra en `fixtures/`, con su historia de Git, su *drift* plantado y su documento de verdad-terreno.

- `fixtures/acme-shop/` — Laravel 11, PHP 8.2, ~47 ficheros, con drift plantado.
- `fixtures/task-api/` — TypeScript + Fastify, ~38 ficheros.

Estos dos árboles tienen **uso cuádruple** (readme §2.6): tests deterministas, demo alojada, arranque local sin dependencias y caso de la funcionalidad F6. Todo lo que decidas aquí condiciona los tests de integración, las semillas SQL y las mediciones publicadas. No son código de relleno.

## Fuera de alcance — no lo hagas

- **No** inicialices el esqueleto del monorepo (workspaces, `docker-compose`, `Makefile`, CI). Es el hito 2.
- **No** instales el harness (`sdd-harness-kit`) ni crees `docs/project-context.md`, `AGENTS.md`, `CLAUDE.md`, `ai-specs/` ni `openspec/`. Los genera el kit, después del esqueleto.
- **No** escribas nada de `packages/`, ni analizadores, ni migraciones, ni `seeds/graph-dump.sql`.
- **No** elijas proveedor de LLM, ni añadas claves, ni configures despliegue. Son los dos bloqueos abiertos del roadmap §2 y los decide la autora.
- **No** copies código de proyectos reales ni de tutoriales con licencia restrictiva. Todo original.

## Requisitos de contenido

### Comunes a los dos fixtures

1. **Tamaño y forma.** Respeta el orden de magnitud del readme §1.4 (47 y 38 ficheros). No inventes ni ajustes las cifras de símbolos y aristas (312/1840, 264/2110): esas salen del analizador, que aún no existe. Si tu recuento final de ficheros se desvía, **no toques el readme**: anótalo en el informe final para que la autora decida.
2. **Historia de Git real.** El extractor de Git (`simple-git`) consume commits, ficheros modificados por commit, señal de co-cambio y número de PR extraído del mensaje. Un árbol de ficheros sin historia deja HU3 y media Tabla 1 sin material. Necesitas **entre 25 y 40 commits por fixture**, con:
   - fechas escalonadas y coherentes (varios meses),
   - al menos 2–3 autores distintos (nombres ficticios; el sistema los seudonimiza igualmente),
   - varios mensajes con formato `... (#123)` para que `pr_number` tenga de dónde salir,
   - **pares de co-cambio deliberados**: ficheros que cambian sistemáticamente juntos sin que ninguna arista estática los relacione. Esa es la señal `[git]` que HU3 debe separar de la señal `[grafo]`.
3. **Decisión pendiente — cómo se versiona esa historia.** Un repositorio Git anidado dentro del repositorio de entrega no se puede commitear tal cual. Antes de generar nada, **párate y presenta a la autora 2 o 3 opciones** con sus consecuencias sobre `npm run seed:build`, el clonado del evaluador y el peso del repositorio (por ejemplo: `.gitbundle` versionado y desempaquetado por un script; guion determinista que reconstruye la historia desde parches; historia sintética en un fichero de datos que el extractor sepa leer en modo fixture). Recomienda una y **espera confirmación** antes de implementarla.
4. **Un secreto plantado, obviamente falso.** HU1 exige que un secreto detectable se almacene redactado. Necesitas exactamente uno por fixture, detectable por `gitleaks`, con valor manifiestamente sintético y un comentario que lo declare como fixture. Anota en el informe que habrá que añadir una excepción de `gitleaks` a nivel de repositorio cuando exista CI, para que el escaneo del propio proyecto no falle por su material de pruebas.
5. **Sin dependencias instaladas.** Nada de `vendor/` ni `node_modules/` versionados. Los fixtures son **árboles de código fuente que se analizan, no aplicaciones que se ejecutan**: los tests que contienen son ficheros que el grafo lee, no suites que este proyecto corra. Que sean coherentes y creíbles como código sí importa; que arranquen, no.

### `acme-shop` (PHP/Laravel) — el fixture difícil, a propósito

El readme §2.1 declara que el grafo de llamadas nunca será completo en PHP y que eso **se mide y se publica** en lugar de disimularse. Este fixture es el que produce esa medición, así que tiene que contener de forma deliberada lo que rompe el análisis estático:

- Dominio: pedidos, líneas de pedido, descuentos, impuestos, envío. La consulta de referencia de la demo es *«¿Cómo se calcula el precio final de un pedido?»* y su respuesta correcta implica que **los descuentos se aplican antes de los impuestos**. Esa cadena debe existir en el código, ser rastreable y estar cubierta por tests.
- La consulta de impacto de referencia es *«cambiar el cálculo de descuentos»*: tiene que haber impacto directo, impacto indirecto a 2 saltos, tests afectados y documentación relacionada.
- **Trampas para el analizador, repartidas y anotadas**: facades, resolución por contenedor de servicios, `__call`, atributos mágicos de Eloquent, rutas resueltas por *string*, `dispatch` de jobs y eventos. Cada una es un sitio de llamada que el analizador solo podrá marcar `heuristic`, nunca `exact`.
- **Drift plantado (F6), dos casos distintos y documentados**:
  - una divergencia real entre documentación y código — el `README` o un doc del fixture describe un comportamiento que el código contradice (p. ej. el orden descuento/impuesto, o un umbral que cambió y el doc no);
  - una regla de negocio **implementada y cubierta por tests pero no documentada en ningún sitio**.
  - El drift debe ser detectable por diferencia de fechas: el commit que cambió el código es **posterior** al último que tocó el documento que lo describe.

### `task-api` (TypeScript + Fastify) — el fixture preciso

Su función es el contraste: mismo núcleo, grafo notablemente mejor, porque el compilador resuelve referencias.

- Dominio: API de tareas (CRUD, filtros, paginación, estados). La consulta de referencia es *«¿Cómo se validan las peticiones entrantes?»*, así que la validación por esquema (Zod o el JSON Schema de Fastify) tiene que ser el patrón real y visible del código, no un detalle.
- Referencias **resolubles**: imports explícitos, tipos anotados, sin `any` gratuito ni acrobacias dinámicas. Aquí no se plantan trampas: la gracia es que salga limpio.
- Tests unitarios y de integración como ficheros del árbol, con la misma calidad de escritura.
- No hace falta plantar drift aquí: F6 se demuestra en `acme-shop`.

## Entregable adicional: la verdad-terreno

Escribe `fixtures/README.md` — es el documento que hace que los fixtures sirvan como arnés de pruebas en vez de ser dos carpetas de código bonito. Debe contener, para cada fixture:

- qué es, qué stack y qué recuento real de ficheros;
- el **inventario del drift plantado**: qué afirma el documento, qué hace el código, en qué commit divergieron;
- la **regla de negocio no documentada** y los tests que la cubren;
- las **preguntas de demostración** con su respuesta esperada y los ficheros y rangos de línea que deberían aparecer como evidencia (esto es la base del `npm run verify` del hito 6, y de las ~12 preguntas cacheadas del modo demo);
- los **sitios de llamada anotados**: cuáles esperas `exact` y cuáles `heuristic`, con el motivo. El readme §2.6 pide 50 anotados a mano por lenguaje para la Tabla 2; deja al menos el formato y una primera tanda, y di en el informe cuántos faltan;
- los **pares de co-cambio** plantados en la historia de Git;
- dónde está el secreto plantado.

Rangos de línea: si te resulta frágil fijarlos ahora, ancla la evidencia a símbolos (clase y método) y deja el rango como pendiente de generar. No inventes números de línea que no hayas comprobado.

## Cómo trabajar

1. **Lee primero, planifica después.** Empieza por los ficheros de la sección Contexto. No escribas código hasta haber presentado el plan.
2. **Plan antes de generar**: propuesta de árbol de ficheros de cada fixture, dominio concreto, lista de trampas de PHP, inventario de drift previsto, y las opciones del punto 3 de Requisitos comunes. **Párate ahí y espera revisión.**
3. Después, por partes y en este orden: `task-api` (el simple, para fijar el criterio de calidad) → `acme-shop` → historia de Git de ambos → `fixtures/README.md`.
4. **Git**: crea `feature/entrega-2-CRN` a partir de `main` y trabaja ahí, en commits pequeños de un solo objetivo. **No hagas push ni abras PR sin confirmación.** Ojo al estado actual del repositorio: la rama activa es `feature/entrega-1-CRN`, `readme.md` tiene cambios en el índice y `CODEMIND-ROADMAP.md` está sin versionar — pregunta qué hacer con eso antes de cambiar de rama, no lo resuelvas por tu cuenta.

## Criterios de aceptación

- `fixtures/acme-shop/` y `fixtures/task-api/` existen, con recuentos de ficheros del orden documentado, y todo el código es original y coherente.
- Cada fixture tiene historia de Git con el rango de commits pedido, autores múltiples, referencias a PR y pares de co-cambio deliberados; y la forma de versionar esa historia es la que la autora aprobó.
- `acme-shop` contiene los dos casos de drift y las trampas de análisis estático, todos ellos inventariados en `fixtures/README.md`.
- `task-api` no tiene trampas: sus referencias son resolubles por el compilador.
- Un secreto sintético por fixture, detectable por `gitleaks`, declarado en el inventario.
- Nada de `vendor/`, `node_modules/`, claves reales ni ficheros de más de 1 MB.
- `fixtures/README.md` cubre los siete puntos de la sección anterior.
- No se ha tocado `packages/`, ni `docs/`, ni la configuración del monorepo, ni el harness.

## Al cerrar

1. Marca la fila 1 de la cola en `CODEMIND-ROADMAP.md` §4 y reescribe §3 «Siguiente paso concreto» en una o dos frases (pasa a ser el esqueleto del monorepo). Actualiza la fecha del encabezado.
2. Aplica la norma §6 del roadmap sobre `prompts.md`: registra en **esta misma sesión** el prompt significativo de esta fase, **literal**, en bloque de código, con su `**Ajuste humano.**`. Máximo 3 por sección. Prohibido reconstruir prompts de memoria y presentarlos como transcripción.
3. Informe final, breve: recuentos reales, decisiones tomadas, desviaciones respecto a lo pedido y lo que queda pendiente para la Tabla 2.
```

**Por qué funcionó.** Dos condiciones de parada dentro del propio prompt: «no escribas código hasta haber presentado el plan» y, en el punto 3 de requisitos comunes, «párate y presenta 2 o 3 opciones … espera confirmación». Eso convirtió una tarea de generación en una con dos revisiones humanas antes de tocar nada — el estado Git y la estrategia de versionado de la historia, que son justo donde un agente mete la pata de forma cara.

### Prompt 2 — Estado Git antes de cambiar de rama - Versionado de la historia y del readme

```
En vez de salir de la rama main sal de la rama feature/entrega-1-CRN, así no perdemos el acumulativo. Guion determinista reconstruye historia
```

**Ajuste humano.** El prompt inicial pedía ramificar `feature/entrega-2-CRN` **desde `main`**; lo corregí a ramificar **desde `feature/entrega-1-CRN`**, porque `main` no tenía ni el roadmap ni el retoque del readme y salir de ahí habría perdido el acumulativo de la entrega. La regla escrita cede ante el hecho concreto de dónde vive el trabajo. Y de las tres formas de versionar la historia Git anidada que se me ofrecieron —bundle binario, datos sintéticos en «modo fixture», o guion determinista que la reconstruye— elegí el **guion determinista**: es la única que deja un `.git` real sobre el que corre el extractor `simple-git` de verdad, sin blob binario y revisable en diff. El fichero de datos era más cómodo de versionar pero habría dejado sin probar justo el componente que los fixtures existen para alimentar.

### Prompt 3 — Corrección de los cuatro defectos del hito 1

Prompt con el que se abrió la sesión de corrección. Proviene del informe de revisión de ingeniería (`docs/ai-sessions/01-revision-fixtures-y-prompt-correccion.md` §3), preparado por un modelo diferente (con Cursor) en una sesión anterior y revisado mi antes de pegarlo:

````
## Contexto

Trabajas en **CODEMIND** (fork `DisTinta/AI4Devs-finalproject`). El hito 1 de la Entrega 2 —los fixtures `fixtures/acme-shop` y `fixtures/task-api`— está construido y commiteado en la rama `feature/entrega-2-CRN`. Una revisión de ingeniería ha encontrado cuatro defectos que hay que corregir **antes** de seguir con el esqueleto del monorepo.

Lee antes de tocar nada: `CODEMIND-ROADMAP.md`, `fixtures/README.md`, `readme.md` §1.1, §1.2, §2.5, §2.6 y §5 (HU1). El informe completo de la revisión está en `revision-fixtures-y-prompt-correccion.md` §2, en la raíz.

## Reglas duras — léelas dos veces

1. **Solo se toca `fixtures/`.** Nada de `packages/`, `docs/`, `openspec/`, `ai-specs/`, `.claude/`, harness, `docker-compose`, `Makefile` ni workspaces. El esqueleto del monorepo es el hito 2 y no es esta tarea.
2. **El comportamiento del dominio no cambia.** Ni un número. Siguen valiendo exactamente: orden descuento→impuesto, umbral de envío gratis `75.00`, IVA `21.0/23.0/20.0/19.0`, lealtad `5.0/10.0`, `VOLUME_LINE_THRESHOLD = 5`, `VOLUME_BONUS_PERCENT = 5.0`, `MAX_DISCOUNT_PERCENT = 30.0`, tarifas `490/590/690`, y el total del ejemplo trabajado **7242 céntimos (€72.42)**. Si un cambio tuyo mueve cualquiera de esas cifras, el cambio está mal.
3. **No se renombra ni se mueve ningún fichero existente.** No se borra ninguno salvo que este prompt lo diga.
4. **Todo fichero que añadas o elimines debe reflejarse en el manifiesto de historia correspondiente**, y la comprobación de cobertura (§ Verificación) tiene que seguir dando 0 huérfanos y 0 fantasmas.
5. **No toques `readme.md` ni `CODEMIND-ROADMAP.md` sin preguntar.** Hay dos cambios propuestos para ellos al final; se proponen, no se aplican por tu cuenta.
6. **No inventes.** Si una comprobación no la puedes ejecutar, dilo; no escribas en la verdad-terreno nada que no hayas verificado con un comando cuya salida puedas enseñar. Es el defecto que se está corrigiendo: no lo repitas.
7. **Commits pequeños, uno por defecto corregido.** No hagas push ni abras PR sin confirmación.

## Defecto 1 — Descontaminar el corpus (prioridad máxima)

Los ficheros indexables no pueden hablar del arnés. Un comentario puede explicar **el dominio**; no puede mencionar CODEMIND, fixtures, trampas de analizador, drift plantado, preguntas de demostración ni la verdad-terreno.

**Ficheros a limpiar** (19 en `acme-shop`, 7 en `task-api`):

```
acme-shop/README.md
acme-shop/composer.json                         ← description y keywords mencionan "fixture"/"CODEMIND"
acme-shop/config/app.php
acme-shop/config/shop.php
acme-shop/routes/api.php
acme-shop/routes/web.php
acme-shop/app/Facades/Pricing.php
acme-shop/app/Jobs/RecalculateTotals.php
acme-shop/app/Models/Order.php
acme-shop/app/Observers/OrderObserver.php
acme-shop/app/Providers/AppServiceProvider.php
acme-shop/app/Providers/EventServiceProvider.php
acme-shop/app/Services/CarrierGateway.php
acme-shop/app/Services/DiscountService.php
acme-shop/app/Services/PriceCalculator.php
acme-shop/app/Services/ShippingService.php
acme-shop/tests/Unit/DiscountServiceTest.php
acme-shop/tests/Unit/ShippingServiceTest.php
task-api/README.md
task-api/src/config/env.ts
task-api/src/domain/task-status.ts
task-api/src/plugins/swagger.ts
task-api/src/repositories/in-memory-task.repository.ts
task-api/src/services/task.service.ts
task-api/tests/integration/validation.test.ts
```

**No toques** `acme-shop/app/Support/Money.php` (su «floating-point drift» es vocabulario de dominio legítimo) ni la frase de `swagger.ts` sobre que la especificación no se desincroniza de la validación: son falsos positivos del grep.

Reglas de reescritura:

- Prohibidas en código y en los README de los fixtures, en cualquier idioma: `CODEMIND`, `fixture`, `harness`, `analyzer`, `ANALYZER TRAP`, `planted`, `drift` (salvo los dos falsos positivos citados), `ground truth`, `reference demo`, `demo question`, `undocumented`, `heuristic`/`exact` en el sentido de aristas, y cualquier referencia a `fixtures/README.md`.
- Sustituye cada comentario meta por uno que un desarrollador de ese proyecto habría escrito de verdad, o bórralo. `PriceCalculator` puede documentar sus parámetros; **no puede** enunciar el orden descuento-antes-de-impuesto en prosa: eso es la respuesta a Q1 y tiene que deducirse leyendo el código y sus tests.
- `acme-shop/README.md`: reescríbelo como el README de un proyecto real. Que remita a `docs/pricing.md` como referencia canónica de precios y **que no describa el orden de operaciones**. Fuera el párrafo «A note for readers».
- `docs/pricing.md` no se toca: su contenido equivocado es el material de F6 y ya es internamente coherente.
- `DiscountService`: fuera toda mención a que la regla de volumen no está documentada. La regla se queda tal cual en el código. Los **nombres** de los tests de `DiscountServiceTest` se quedan (un test se llama así en cualquier proyecto); lo que se va es el docblock que explica que son el caso plantado.
- `config/app.php` y `src/config/env.ts`: fuera los comentarios que anuncian el secreto falso (ver Defecto 3). El valor sigue siendo obviamente sintético y su declaración vive en `fixtures/README.md`, que no se indexa.

## Defecto 2 — Que los diffs digan la verdad

Hoy cada commit intermedio de `build-history.mjs` escribe el contenido final más un marcador `// hist:rN`, así que el diff de `fix: apply discount before tax and raise free-shipping threshold to 75 (#61)` consiste en borrar `// hist:r12`.

Implementación pedida, sin desviarte de ella:

1. Extiende el formato del manifiesto para que un fichero de un commit pueda declarar su contenido **anterior**:
   `files: ['config/shop.php']` sigue valiendo, y además se admite `files: [{ path: 'config/shop.php', before: 'snapshots/r31/config/shop.php' }]`, con la ruta relativa a `fixtures/history/`.
2. `build-history.mjs`: cuando un toque declara `before`, escribe ese contenido en ese commit en lugar del contenido final más marcador. El resto sigue con el marcador. El último toque de cada fichero sigue escribiendo el contenido final exacto.
3. Crea los snapshots **solo** para los commits con carga semántica, que son estos y ningún otro:

   | Fixture | Commit | Snapshot que hay que crear |
   |---|---|---|
   | acme-shop | `fix: apply discount before tax and raise free-shipping threshold to 75 (#61)` | versión previa de `PriceCalculator.php` (impuesto sobre el subtotal bruto) y de `config/shop.php` (`free_shipping_threshold => 50.00`) |
   | acme-shop | `refactor: extend shipping zones and discount stacking (#55)` | versión previa de `DiscountService.php` y `ShippingService.php` |
   | acme-shop | `refactor: tune loyalty tiers and shipping fees (#33)` | ídem, un escalón más atrás |
   | task-api | `refactor: tighten create and update validation (#31)` | versión previa de `task.schema.ts` y `task.service.ts` |
   | task-api | `refactor: align schema defaults with service (#40)` | ídem |

   Cada versión previa tiene que ser **código coherente que compila y cuadra con el mensaje del commit**: la de `PriceCalculator` anterior a #61 calcula el impuesto sobre el subtotal bruto —que es justo lo que `docs/pricing.md` sigue describiendo— y la de `config/shop.php` tiene el umbral en `50.00`. Así el documento no es que esté mal: es que **se quedó atrás**, y el commit #61 es la prueba fechada.
4. Documenta el mecanismo en `fixtures/README.md`, sin adornos: los commits con snapshot llevan un diff real, el resto son de relleno con un marcador y su valor es la señal de co-cambio, la fecha y el `pr_number`, no el contenido. Que se lea como una limitación declarada, porque lo es.

## Defecto 3 — Verdad-terreno verificada

1. **Secreto de `acme-shop`.** El `APP_KEY` falso de `config/app.php` no lo detecta gitleaks; comprobado con `gitleaks 8.24`. Sustitúyelo por un secreto plantado que **sí** dispare una regla y que sea plausible en un Laravel real: unas credenciales AWS en `config/services.php` (`'s3' => ['key' => 'AKIA…']`) son el camino corto, porque la regla `aws-access-token` ya se dispara con el patrón que usa `task-api`. Si añades `config/services.php`, añádelo también al manifiesto de historia (regla dura 4).
2. **Demuéstralo, no lo afirmes.** El criterio es la salida de `gitleaks detect --no-git --source fixtures`: exactamente **dos** hallazgos, uno por fixture. Pega esa salida en el informe final.
3. **Etiquetas.** Quita los `pragma: allowlist secret (fixture)`: son sintaxis de detect-secrets, no de gitleaks, y además incumplen el Defecto 1. **No** los sustituyas por `gitleaks:allow`, que suprimiría el hallazgo que HU1 necesita. La exención, cuando exista CI, irá en un `.gitleaksignore` a nivel de repositorio, por *fingerprint*; anótalo como pendiente del hito 2, no lo crees ahora.
4. **Trampa #12 del inventario.** Corrige la razón: la cadena está completamente cualificada, así que no hay namespace que adivinar. Sigue siendo `heuristic` porque es una cadena y no una referencia de clase, y el analizador tiene que aplicar la convención `Controlador@método` de Laravel. Revisa de paso las otras 21 filas del primer lote de la Tabla 2 con el mismo criterio: cada «Reason» tiene que ser cierta, no plausible.

## Defecto 4 — Que `task-api` compile

`npx tsc --noEmit` da tres `TS2379` en `src/controllers/tasks.controller.ts` (líneas 14, 30 y 38) por `exactOptionalPropertyTypes: true`.

- **No relajes el `tsconfig.json`.** Quitar `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` o `strict` es exactamente la solución equivocada: la estrictez es lo que respalda la afirmación de que en este fixture el compilador resuelve todo.
- Arregla los tipos: alinea `TaskQuery`, `CreateTaskInput` y `UpdateTaskInput` con lo que Zod infiere realmente (propiedades opcionales que admiten `undefined`), o normaliza en el controlador antes de pasar al servicio. Lo que sea más idiomático; que no se note que fue un parche.
- Los 25 tests siguen pasando. Si alguno se cae, el arreglo está mal.

## Menor — decisión que no tomas tú

`acme-shop/tests/CreatesApplication.php` hace `require __DIR__.'/../bootstrap/app.php'` y no existe `bootstrap/`: la suite PHP no puede ejecutarse ni instalando `vendor/`. Hay dos salidas y **las presentas, no eliges**:

- **(a)** Declararlo en `fixtures/README.md`: el fixture PHP se analiza, no se ejecuta, y las cifras de Q1 están verificadas a mano. Coste cero, honesto, coherente con `acme-shop/README.md`.
- **(b)** Añadir un `bootstrap/app.php` mínimo para que PHPUnit arranque con `vendor/` instalado. Más trabajo y requiere PHP en el entorno.

Recomienda una en una frase y espera respuesta antes de tocar nada de esto.

## Verificación — todo esto tiene que pasar

Ejecuta y pega la salida real. Nada de «debería funcionar».

```bash
# 1. Historia: se reconstruye, es determinista y deja el árbol limpio
node fixtures/build-history.mjs
git -C fixtures/acme-shop rev-parse HEAD && git -C fixtures/task-api rev-parse HEAD
node fixtures/build-history.mjs          # los SHA deben repetirse
git -C fixtures/acme-shop status --short # vacío
git -C fixtures/task-api  status --short # vacío
git status --short                       # el repo padre, sin cambios en fuentes de fixtures

# 2. El commit del drift lleva un diff real que corresponde a su mensaje
git -C fixtures/acme-shop show $(git -C fixtures/acme-shop log --format=%H --grep="#61") --stat
git -C fixtures/acme-shop log -1 --format=%ad -- docs/pricing.md              # 2024-02-19
git -C fixtures/acme-shop log -1 --format=%ad -- app/Services/PriceCalculator.php  # 2024-05-02

# 3. Cobertura de los manifiestos: 0 huérfanos, 0 fantasmas
node -e "
const {execFileSync}=require('node:child_process');
(async()=>{for(const n of ['acme-shop','task-api']){
  const c=(await import('./fixtures/history/'+n+'.commits.mjs')).default;
  const m=new Set(c.flatMap(x=>x.files.map(f=>typeof f==='string'?f:f.path)));
  const t=execFileSync('git',['ls-files','fixtures/'+n],{encoding:'utf8'}).trim().split('\n').map(p=>p.replace('fixtures/'+n+'/',''));
  console.log(n,'tracked',t.length,'manifest',m.size,
    '| huerfanos',t.filter(f=>!m.has(f)),'| fantasmas',[...m].filter(f=>!t.includes(f)));
}})();"

# 4. TypeScript: compila y pasa
cd fixtures/task-api && npm install && npx tsc --noEmit && npx vitest run && cd ../..

# 5. PHP: parsea entero (php-parser vale; no hace falta PHP instalado)
# 6. Secretos: exactamente 2 hallazgos, uno por fixture
gitleaks detect --no-git --source fixtures -v

# 7. Descontaminación: 0 coincidencias fuera de la lista blanca
grep -rniE "codemind|analyzer trap|planted|ground truth|reference demo|demo question|undocumented|fixture" \
  fixtures/acme-shop fixtures/task-api \
  --include='*.php' --include='*.ts' --include='*.md' --include='*.json' --include='*.xml'
```

Criterios de aceptación, en corto:

- Los 7 bloques anteriores pasan; el 7 solo devuelve, como mucho, los dos falsos positivos declarados.
- Ninguna cifra del dominio ha cambiado; el ejemplo trabajado sigue dando **7242**.
- Los 5 commits con carga semántica tienen diff real; el resto queda declarado como relleno en `fixtures/README.md`.
- `fixtures/README.md` no contiene ninguna afirmación que no hayas verificado con uno de esos comandos.
- No existe ningún fichero nuevo fuera de `fixtures/`.

## Al cerrar

1. Informe final breve: qué se corrigió, salida de las verificaciones, y la recomendación (a)/(b) del menor pendiente.
2. Propón —sin aplicar— estos dos cambios, para que los decida la autora:
   - `readme.md` §1.4: marcar `47 files · 312 symbols · 1840 edges` como cifras ilustrativas hasta que las emita el analizador, o actualizarlas a los recuentos reales.
   - `CODEMIND-ROADMAP.md`: sigue sin versionar; la brújula del proyecto vive solo en local y el ✅ del hito 1 no está en el repositorio.
3. Aplica la norma §6 del roadmap sobre `prompts.md` **en esta misma sesión**: el prompt de corrección va literal, en bloque de código, dentro de §9, con su `**Ajuste humano.**`. Máximo 3 prompts por sección; si §9 ya tiene tres, sustituye el menos significativo y dilo en el informe.
````

**Ajuste humano.** El prompt llegaba con cuatro defectos numerados y un «menor» que requería decisión. Decidí antes de dejar actuar al agente: (a) opción del menor → declarar en `fixtures/README.md` que el fixture PHP se analiza pero no se ejecuta, sin añadir `bootstrap/app.php`. El agente cumplió la restricción de tocar solo `fixtures/` y no tocó `readme.md` ni `CODEMIND-ROADMAP.md`. El único ajuste de fondo: el mecanismo de snapshots del Defecto 2 requirió dos iteraciones para ubicar el campo `before` en el commit correcto (toque previo al semántico, no en el semántico mismo).
