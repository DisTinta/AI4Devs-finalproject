# CODEMIND

**Comprensión de repositorios de código con evidencia verificable**

Proyecto Final del Máster AI4Devs · Cristina Rodríguez Núñez

---

> **Estado de la entrega**
>
> Este documento corresponde a la **Entrega 3 — entrega final** (12 de noviembre de 2026). Describe el sistema tal como está en la rama `final-project-CRN`, con todos los tickets de Linear cerrados.
>
> - **Entrega 1** (24 de septiembre): documentación técnica.
> - **Entrega 2** (22 de octubre): flujo principal operativo por CLI y API — indexar un repositorio PHP/Laravel, preguntar con evidencia verificada, confianza calculada, uso y coste por consulta, caché de respuestas y `npm run verify` — y la web con las pantallas 1 (selección de proyecto) y 2 (consulta).
> - **Entrega 3** (12 de noviembre): se entregaron el analizador TypeScript (DIS-30, DIS-31), el reindexado por API e incremental (DIS-9, DIS-10), el impacto por CLI, API y Pantalla 3 (DIS-89, DIS-90, DIS-94, DIS-95, DIS-14), la deriva documental `drift` (DIS-71, DIS-73), la caché semántica de 768 dimensiones con su tasa de acierto (DIS-67, DIS-69), las Tablas 1 y 2 medidas (DIS-79, DIS-81, DIS-82), los tests E2E con Playwright (DIS-75), la cobertura informativa junto a la mutación (DIS-77) y las respuestas en el idioma de la pregunta (DIS-104).
>
> La sección 7 recoge las pull requests reales de las Entregas 2 y 3, y la [sección 8](#8-flujo-de-trabajo-con-ia-y-sdd-harness-kit) el flujo de trabajo con IA con el que se han hecho.
>
> **Sobre la evidencia de funcionamiento:** el repositorio levantable en local (`npm run up`, el mismo comando en PowerShell y en Bash), el guion [`docs/DEMO.md`](docs/DEMO.md) con la salida real de cada paso y `npm run verify`. Los wireframes de las tres pantallas siguen en [1.3](#13-diseño-y-experiencia-de-usuario) como referencia visual de la web.
>
> **Recomendaciones de la revisión de la Entrega 1**
>
> | Recomendación | Estado | Dónde |
> |---|---|---|
> | Medir la latencia y las llamadas del verificador en cada consulta | Aplicado tras la revisión (14-10-2026) | `query_log.verify_latency_ms` y `verify_calls`, DIS-74 ([3.2](#32-descripción-de-entidades-principales)) |
> | Alinear el contrato OpenAPI con la decisión de indexar solo por CLI | Aplicado tras la revisión | [4](#4-especificación-de-la-api): `/index` sale del contrato y vuelve con DIS-9 solo como reindexado de un proyecto ya creado por la CLI, sin rutas (cuerpo `{incremental?}`) |
> | Decidir qué pasa con los embeddings | Aplicado tras la revisión: se documenta el estado | Nota de [2.2](#22-descripción-de-componentes-principales); la decisión del puerto la tomó DIS-67 ([ADR](docs/adr/20261103-embeddings-stay-on-llm-port.md)) |
> | Mostrar la IA en las fases de Pruebas, Despliegue y Mantenimiento | Aplicado tras la revisión | [8.3](#83-ia-en-las-seis-fases-del-ciclo) |
> | Medir el verificador | Aplicado (DIS-81) | Tabla 1 de [2.6](#26-tests) e [informe de la medición](docs/measurements/context-savings.md); la Tabla 2 la midió DIS-79 |
> | Aristas con un extremo polimórfico sin clave foránea | Ya resuelto antes de la revisión | Dos FK por extremo y `CHECK` (ADR `20260928-edge-endpoints-as-fk-pairs`) |
> | Confinamiento de rutas con `startsWith` | Ya resuelto antes de la revisión | `path.relative` en `path-policy.ts` ([2.5](#25-seguridad)) |
> | Acceso a Git detrás de un puerto | Ya resuelto antes de la revisión | `GitPort` (DIS-35) |
> | Harness de trabajo con IA instalado en el repositorio | Ya resuelto antes de la revisión | `ai-specs/`, `.claude/`, `openspec/` ([8.1](#81-el-kit-sdd-harness-kit)) |
> | Que el servidor no acepte rutas de repositorio | Ya resuelto antes de la revisión | La API no recibe rutas: solo reindexa un proyecto creado por la CLI desde su raíz guardada |
> | Acotar el proyecto a un solo analizador | **No aplicado** | La planificación en Linear (hitos M1–M9) ya ordena las entregas: PHP en la Entrega 2 y TypeScript en la 3. Los dos analizadores están entregados (TypeScript en las PR #74 y #75) y medidos en la Tabla 2 de [2.6](#26-tests) (DIS-79) |
>
> **Decisión (5 sep 2026).** Antes: evidencia = demo alojada + local. Ahora: **solo local**. Motivo: sin coste de hosting/dominio y un único entorno fiable el día de la revisión. Detalle en `proposal-codemind/05-propuesta-v4-evidencia-local-hibrido-ollama.md`.

---

## Índice

0. [Ficha del proyecto](#0-ficha-del-proyecto)
1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)
8. [Flujo de trabajo con IA y `sdd-harness-kit`](#8-flujo-de-trabajo-con-ia-y-sdd-harness-kit)

---

## 0. Ficha del proyecto

### **0.1. Tu nombre completo:**

Cristina Rodríguez Núñez

### **0.2. Nombre del proyecto:**

CODEMIND

### **0.3. Descripción breve del proyecto:**

CODEMIND indexa un repositorio de código —PHP/Laravel o TypeScript— y construye un grafo de conocimiento a partir de cuatro fuentes que normalmente nadie mantiene relacionadas: el código, el historial de Git, los tests y la documentación. Sobre ese grafo responde dos preguntas: **cómo funciona una parte del proyecto** y **qué se rompería al cambiarla**.

Se diferencia de un asistente de código convencional en tres comportamientos verificables: **verifica que cada cita sustenta realmente lo que afirma** en lugar de limitarse a adjuntarla; **distingue explícitamente lo observado de lo inferido**; y **responde que no lo sabe** cuando no hay evidencia suficiente, en lugar de generar una explicación plausible. Además envía al modelo solo los fragmentos necesarios en lugar del repositorio completo, más las instrucciones y la verificación que hacen posible lo anterior. Lo que eso supone en tokens se mide en la [Tabla 1](#26-tests): en los dos repositorios de muestra, que son muy pequeños, ese coste fijo pesa más que lo que se ahorra, y CODEMIND envía más tokens que el código citado sin procesar.

### **0.4. URL del proyecto:**

La evidencia ejecutable es el propio repositorio público, levantado en local:

https://github.com/DisTinta/AI4Devs-finalproject/tree/final-project-CRN — clonar esa rama (`final-project-CRN`) y seguir la [guía de evaluación](#guía-de-evaluación-paso-a-paso) de 1.4 (`npm run up`).

No hay URL de servicio web alojado: quien evalúa prueba en su máquina con Docker y Node.

> **Decisión (5 sep 2026).** Antes: §0.4 apuntaba a una demo alojada en servidor propio (pendiente Entrega 3). Ahora: la “URL del proyecto” es el **repo + arranque local**. Motivo: eliminar dependencia de un servidor el día de la revisión y evitar coste de hosting/dominio.

### 0.5. URL o archivo comprimido del repositorio

https://github.com/DisTinta/AI4Devs-finalproject/tree/final-project-CRN — **público**, rama de la entrega. Fork de `LIDR-academy/AI4Devs-finalproject`.

**Rama de la entrega: `final-project-CRN`.** `main` conserva la plantilla del máster tal como llegó con el fork (este readme y `prompts.md` sin rellenar), así que clonar sin indicar la rama deja una carpeta sin el proyecto. Cada entrega tiene su rama, y cada una contiene a la anterior: `feature/entrega-1-CRN` (Entrega 1, documentación técnica), `feature/entrega-2-CRN` (Entrega 2, hasta la PR #60) y **`final-project-CRN`, la entrega final**, que parte de la Entrega 2 y contiene todo el proyecto. Las dos primeras se conservan como estaban al entregarse. Las ramas `feature/…` de cada ticket se fusionan por pull request en la rama de su entrega ([sección 7](#7-pull-requests)). Para clonarla directamente:

```shell
git clone -b final-project-CRN https://github.com/DisTinta/AI4Devs-finalproject
```

En el proyecto intervienen **tres repositorios distintos**, y conviene no confundirlos:

| | Repositorio | Visibilidad | Papel |
|---|---|---|---|
| **1** | Este — `AI4Devs-finalproject` | Público | **Es la entrega:** CODEMIND, la herramienta que se evalúa |
| **2** | Un proyecto Laravel real, ya existente | Privado | Sirve para comprobar que el analizador aguanta código real ([observación](docs/measurements/private-repo-observation.md)). Es **material de entrada** —como el fichero que se le pasa a un programa— y no forma parte de la entrega |
| **3** | `acme-shop` y `task-api` | Públicos, **incluidos dentro del 1** | Repositorios de muestra pequeños, con su grafo ya construido, en `fixtures/`. Son lo que permite reproducir la demo sin credenciales de nadie |

Que el número 2 sea privado **no obliga a que CODEMIND sea público o privado**: el repositorio analizado es dato de entrada, no el producto entregado. Pero tiene una consecuencia de diseño, y es la que explica el número 3: nadie ajeno puede abrir el número 2, así que no sirve para demostrar nada. Los repositorios de muestra existen para que la evaluación sea reproducible por cualquiera, y por eso viajan dentro de la entrega en lugar de enlazarse desde fuera.

**Kit de trabajo con IA:** el proyecto se construye con [`DisTinta/sdd-harness-kit`](https://github.com/DisTinta/sdd-harness-kit), un kit propio de Spec-Driven Development con hooks, skills y subagentes. Cómo se ha usado está en la [sección 8](#8-flujo-de-trabajo-con-ia-y-sdd-harness-kit).

---

## 1. Descripción general del producto

### **1.1. Objetivo:**

#### El problema

Cuando alguien se incorpora a un proyecto que no escribió —o vuelve a uno que no toca desde hace meses— la información que necesita existe, pero está repartida en cuatro sitios que nadie mantiene sincronizados:

- el **código** dice *qué* hace el sistema;
- los **tests** dicen *qué comportamiento se garantiza*;
- el **historial de Git** dice *por qué* se cambió algo;
- la **documentación** dice lo que alguien creyó cierto en su momento.

Los asistentes de código actuales recuperan fragmentos por similitud semántica. Eso funciona bien para «escríbeme una función parecida a esta» y falla para «explícame por qué este descuento se aplica antes de los impuestos», porque la respuesta no está en ningún fragmento: está en la **relación** entre un método, un test y un pull request de hace dos años.

Y falla de una forma concreta y difícil de detectar: cuando no encuentra la respuesta, la genera. Con una cita que parece válida.

#### Qué aporta CODEMIND

Cuatro comportamientos que un asistente convencional no tiene:

1. **Relaciona las cuatro fuentes** en un grafo consultable, en lugar de tratarlas como texto indiferenciado.
2. **Verifica sus propias citas.** No basta con adjuntar `PriceCalculator.php:42`: el sistema comprueba que ese fragmento sustenta la afirmación, y elimina o degrada lo que no pasa la comprobación.
3. **Sabe callarse.** Si no hay evidencia suficiente, responde `UNKNOWN` en lugar de producir una explicación plausible.
4. **Envía solo lo necesario.** Selecciona fragmentos guiándose por el grafo, no ficheros completos, y muestra el ahorro frente al contexto bruto, que en los dos repositorios de muestra, muy pequeños, sale negativo ([Tabla 1](#26-tests)).

#### Independencia del lenguaje

El núcleo no conoce ningún lenguaje: los analizadores son adaptadores que implementan un puerto. Para **demostrarlo y no solo afirmarlo**, el proyecto incluye dos analizadores completos —PHP/Laravel y TypeScript— y el criterio de aceptación del segundo es que su pull request **no modifique una sola línea del núcleo**. Es una afirmación comprobable con `git diff`, no una promesa de diseño. Comprobado: las PR #74 y #75 del analizador TypeScript no tocan `packages/core`.

#### Para quién

Desarrolladores que trabajan sobre código que no escribieron: incorporaciones a un equipo, mantenimiento de sistemas heredados, revisión de un módulo antes de modificarlo.

### **1.2. Características y funcionalidades principales:**

| # | Funcionalidad | Prioridad |
|---|---|---|
| **F1** | Indexar un repositorio **PHP/Laravel o TypeScript** y construir su grafo de conocimiento | must |
| **F2** | Explicar cómo funciona una parte del proyecto, con evidencia verificada por afirmación | must |
| **F3** | Analizar qué se vería afectado por un cambio, separando grafo determinista de señal histórica | must |
| **F4** | **Probar el sistema sin configurar nada**: dos repositorios de muestra ya indexados | must |
| **F5** | Mostrar tokens consumidos, coste y ahorro frente a enviar contexto bruto | must |
| **F6** | Detectar contradicciones entre la documentación y el código | should |
| **F7** | Caché semántica de consultas con métrica de acierto | should |

**F4 merece una nota**. Los wireframes de [1.3](#13-diseño-y-experiencia-de-usuario) muestran el diseño; F4 es la evidencia de que el sistema **funciona realmente**. Se concreta en un único camino garantizado:

- **Local, en cuatro comandos.** Se clona el repositorio, se copia `.env.example` a `.env` (sin obligar a una API key) y se levanta con `npm run up`, el mismo comando en PowerShell y en Bash (`make up` es su atajo en Git Bash o WSL). Los dos proyectos de muestra quedan consultables. **Sin PHP instalado, sin clonar repositorios ajenos, sin esperar ningún indexado**, porque los grafos y las respuestas de evaluación van versionados como semillas SQL / caché.

*Estado en la Entrega 3:* la semilla carga `acme-shop` (174 nodos y 170 aristas) y `task-api` (102 nodos y 100 aristas, analizador TypeScript, CM-HU-18), cada uno con tres respuestas *golden*. F1 funciona por la CLI `index` y, para un proyecto ya creado, por el reindexado `POST /api/projects/{id}/index` (DIS-9, incremental desde DIS-10); F2, F4 y F5 funcionan por CLI, por `POST /ask` y en la web; F3 (impacto) funciona por la CLI `impact`, por `POST /impact` (DIS-95) y en la Pantalla 3 (DIS-14); F6 (deriva documental) está entregada en la CLI `drift` (DIS-71, DIS-73), con un informe *golden* en `seeds/drift/acme-shop.json` que carga `db:seed`; y F7 tiene el acierto exacto por pregunta normalizada, el acierto por similitud de embedding con `LLM_EMBED_MODEL` configurado (DIS-67) y su métrica de acierto (DIS-69: CLI `projects`, `usage.projectCache` en la respuesta de `POST /ask` y la línea «Caché del proyecto» del panel de uso).

**Modo híbrido LLM (parte de F4):**

| Situación | Qué puede hacer quien evalúa |
|---|---|
| Sin endpoint LLM (`LLM_BASE_URL` y `LLM_API_KEY` vacías) | Preguntas sugeridas y `npm run verify` desde caché/golden, `impact`, `drift` (informe *golden*) e indexado de un repositorio propio con `ALLOWED_REPOS_DIR` y `AUTHOR_HASH_SALT` (**0 $**, sin cuenta de proveedor): indexar no necesita LLM |
| Con LLM (p. ej. Ollama local o API cloud) | Pregunta libre (y `drift --doc`) |

> **Decisión (5 sep 2026).** Antes: Camino A (demo alojada) + Camino B (local). Ahora: solo el local, con evaluación sin key. Motivo: fricción cero para el evaluador y sin servidor propio.

#### Lo que el producto no hace

Declarado desde el principio: **no modifica código, no genera pull requests, no ejecuta comandos y no sustituye al IDE.** Es un sistema de solo lectura, y eso es una decisión de seguridad antes que una limitación de alcance — ver [2.5](#25-seguridad).

### **1.3. Diseño y experiencia de usuario:**

#### Evidencia de esta sección

Los wireframes de las tres pantallas muestran el flujo completo del producto. La evidencia ejecutable complementa las imágenes:

1. **El repositorio levantable en local** en cuatro comandos (ver [1.4](#14-instrucciones-de-instalación)).
2. **`docs/DEMO.md`**: guion de demostración con los comandos exactos y **la salida real de terminal** que producen. Se puede copiar, ejecutar y comparar con lo que uno obtiene.
3. **`npm run verify`**: prueba de humo ejecutable que consulta cada repositorio de muestra y compara con la salida esperada (**sin llamar al LLM**: golden/caché versionada).
4. **`npm run test:e2e`**: la suite de Playwright que recorre la web (pantallas 2 y 3 y el caso `UNKNOWN`) sobre la semilla (DIS-75); en CI es el job `e2e`.

> **Decisión (5 sep 2026).** Se eliminó la demo alojada de esta lista. La evidencia queda acotada a local + DEMO.md + verify.

**Estado de la web en la Entrega 3.** Los wireframes se mantienen como referencia visual y de textos de la web. La web ya cubre las tres pantallas:

| Pieza | Estado |
|---|---|
| Andamiaje web: Tailwind con los colores de los wireframes, rutas, cliente tipado de la API, puerta de accesibilidad `test:a11y` | Fusionado (DIS-58, PR #53) |
| Pantalla 1 — tarjetas de los proyectos de muestra desde `data/sample-projects.ts`, aviso de API caída y pantalla de error | Fusionado (DIS-60, PR #54) |
| Pantalla 2 — pregunta, preguntas sugeridas (las *golden*), afirmaciones tipadas con distintivos de tipo y de verificación, evidencia desplegable, panel de uso (confianza, tokens, coste, latencia, ahorro y caché), estados `UNKNOWN` y avisos de `429` y de error | Fusionado (DIS-65, PR #56; DIS-66, PR #57) |
| Pantalla 3 — impacto: campo «Cambio», «Saltos del grafo», informe por secciones con la etiqueta de origen `[grafo]`/`[git]` de cada elemento, riesgo con su justificación, estado `unknown` y avisos de error (sin panel de tokens y coste: `/impact` no llama al modelo) | Fusionado (DIS-14, PR #98); la CLI `impact` (DIS-90) y la ruta `POST /impact` (DIS-95) ya existían |

Con `npm run up` (web en http://localhost:5173), los pasos 1 a 4 y el 6 del recorrido de abajo se hacen en el navegador (el 4, impacto, en la Pantalla 3; el 6, con la tarjeta `task-api`). [`docs/DEMO.md`](docs/DEMO.md) ejecuta los siete pasos por la CLI (del 1 al 5 contra `acme-shop`, el 6 contra `task-api` y el 7 con `drift`), con la salida real de cada uno, y recorre las tres pantallas en [Recorrido por la web](docs/DEMO.md#recorrido-por-la-web).

#### Las tres pantallas

El principio de diseño es que **la fiabilidad y el coste sean legibles en la propia respuesta**, no un detalle escondido en un log.

*Los wireframes son de la Entrega 1 y sus cifras son ilustrativas* (número de aristas, tokens, riesgo, PR citadas): no coinciden con la semilla real. Lo que imprime de verdad cada paso está en [`docs/DEMO.md`](docs/DEMO.md).

**Pantalla 1 — Selección de proyecto**

![Pantalla 1 — Selección de proyecto](images/pantalla-1-seleccion.svg)



```text
┌──────────────────────────────────────────────────────────────────┐
│  CODEMIND                                                        │
├──────────────────────────────────────────────────────────────────┤
│  Elige un proyecto para explorar:                                │
│                                                                  │
│  ┌────────────────────────────┐  ┌────────────────────────────┐  │
│  │ acme-shop                  │  │ task-api                   │  │
│  │ PHP 8.2 / Laravel 11       │  │ TypeScript / Fastify       │  │
│  │ 47 ficheros · 312 símb.    │  │ 38 ficheros · 264 símb.    │  │
│  │ 1 840 aristas · 62 commits │  │ 2 110 aristas · 51 commits │  │
│  │ [ok] indexado · listo      │  │ [ok] indexado · listo      │  │
│  └────────────────────────────┘  └────────────────────────────┘  │
│                                                                  │
│  + Indexar mi propio repositorio                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Pantalla 2 — Consulta**

![Pantalla 2 — Consulta con evidencia verificada](images/pantalla-2-consulta.svg)

```text
┌───────────────────────────────────────────────────────────────────┐
│  <- acme-shop    PHP/Laravel  ·  1 840 aristas  ·  (recargar)     │
├───────────────────────────────────────────────────────────────────┤
│  ¿Cómo se calcula el precio final de un pedido?          [->]     │
│                                                                   │
│  Prueba:  · ¿Cómo se validan los cupones?                         │
│           · ¿Qué hace OrderObserver?                              │
│           · ¿Por qué existe el campo legacy_ref?                  │
├───────────────────────────────────────────────────────────────────┤
│  RESPUESTA                                                        │
│                                                                   │
│  El precio final se calcula en PriceCalculator::compute().        │
│                                                                   │
│  1. Se obtiene el precio base del artículo.         [verificado]  │
│  2. Se aplica el descuento del cliente.             [verificado]  │
│  3. Se calculan los impuestos sobre el subtotal.    [verificado]  │
│                                                                   │
│  (!) El orden descuento-antes-de-impuestos no está documentado.   │
│      Se deduce del test y del PR #381.                [INFERIDO]  │
│                                                                   │
│  EVIDENCIA                                                        │
│  > app/Services/PriceCalculator.php:42-58    entailed             │
│  > tests/Unit/PricingTest.php:91-104         entailed             │
│  > PR #381                                   entailed             │
│                                                                   │
│  Confianza 0.71                                                   │
│  4 812 tokens · $0.014 · 2.1 s · ahorro 88 % vs contexto          │
│  bruto (41 200 tokens)                              [caché: sí]  │
└───────────────────────────────────────────────────────────────────┘
```

El valor de confianza que aparece al pie de la respuesta **no lo autoinforma el modelo**: se calcula a partir de señales del grafo y del verificador, y se presenta como indicador ordinal, no como probabilidad. El cálculo está en [3.2](#32-descripción-de-entidades-principales).

**Pantalla 3 — Impacto**

![Pantalla 3 — Análisis de impacto](images/pantalla-3-impacto.svg)

```text
┌───────────────────────────────────────────────────────────────┐
│  IMPACTO DE: "cambiar el cálculo de descuentos"               │
├───────────────────────────────────────────────────────────────┤
│  DIRECTO       PriceCalculator · DiscountService     [grafo]  │
│  INDIRECTO     OrderService · OrdersController       [grafo]  │
│  TESTS         PricingTest · OrderPricingTest        [grafo]  │
│  DOCUMENTACIÓN docs/pricing.md   (!) desactualizada           │
│  HISTORIAL     PR #381 · PR #402 (co-cambian 80 %)   [git]    │
│                                                               │
│  RIESGO  MEDIO                                                │
│  4 ficheros afectados, 2 tests que cubren el cambio,          │
│  1 documento desalineado desde el commit a3f9c21.             │
│                                                               │
│  3 140 tokens · $0.009                                        │
└───────────────────────────────────────────────────────────────┘
```

Cada elemento del informe de impacto indica su **origen**: `[grafo]` para lo derivado del análisis determinista, `[git]` para la señal histórica de co-cambio. Mezclarlos sin distinguir haría el informe imposible de calibrar — quien lo lee no sabría cuánto confiar en cada línea y acabaría desconfiando de todas.

#### Recorrido de demostración

`docs/DEMO.md` lleva en unos cinco minutos a los momentos que definen el producto:

| Paso | Acción | Qué demuestra |
|---|---|---|
| 1 | Elegir `acme-shop` y preguntar por el cálculo del precio | Respuesta con evidencia verificada y ahorro de tokens visible |
| 2 | Pulsar una evidencia | La cita resuelve a un fragmento real del código |
| 3 | Preguntar algo que el repositorio no puede responder | **El sistema responde `UNKNOWN` en lugar de inventar** |
| 4 | Pedir el impacto de cambiar los descuentos | Separación entre grafo determinista y señal histórica |
| 5 | *Solo con un modelo de embeddings configurado.* Repetir el paso 1 reformulando la pregunta («¿Cómo se calcula el precio total de un pedido?») | Acierto de caché por similitud sobre la respuesta *golden* sembrada, coste 0 (solo con `LLM_EMBED_MODEL=nomic-embed-text` configurado; sin él, o en modo evaluación, solo hay acierto exacto), y la línea «Caché del proyecto» del panel de uso con la tasa de aciertos del proyecto |
| 6 | Cambiar a `task-api` y repetir el paso 1 | **El mismo núcleo sobre TypeScript**, con un grafo de más cobertura y sin aristas heurísticas (Tabla 2 de [2.6](#26-tests): cobertura 100 % frente al 77,4 % de PHP, precisión 100 % en ambos) |
| 7 | Comprobar si la documentación contradice el código (`drift acme-shop`) | Deriva entre documentación y código, con la cita de los dos lados (F6) |

El paso 3 es el más característico: un sistema que sabe callarse.

Con el `.env` de `.env.example` (modo evaluación, sin modelo), **el paso 5 responde `UNKNOWN (llm-required)`**: la reformulación solo acierta por similitud con `LLM_EMBED_MODEL=nomic-embed-text` configurado; sin modelo solo hay acierto exacto. En el paso 7, el informe *golden* trae dos contradicciones y **una es un falso positivo del modelo** que lo generó: la del `README.md` del fixture, que dice algo cierto. La real es la de `docs/pricing.md` (envío gratis desde 50 € frente a los 75 € del código). El informe no está revisado y se publica tal cual ([`docs/DEMO.md`, paso 7](docs/DEMO.md#paso-7--comprobar-si-la-documentación-contradice-el-código-drift)).

### **1.4. Instrucciones de instalación:**

Al ser el arranque local **la única evidencia de que el sistema funciona ante quien evalúa**, esta sección se trata como crítica. El camino corto no requiere nada más que **Docker y Node 22.12 o posterior**: ni PHP instalado, ni clonar repositorios ajenos, ni esperar un indexado, **ni una API key de LLM**. Para indexar un repositorio hace falta además **Git 2.45.1 o posterior** (o las versiones de mantenimiento de mayo de 2024 2.43.4 y 2.44.1): las anteriores ignoran `GIT_NO_LAZY_FETCH`, que impide que un *partial clone* ejecute el programa de su remoto al leer un objeto que falta, o no leen `attr.tree`, que hace que los atributos salgan siempre del `.gitattributes` de `HEAD`.

#### Guía de evaluación paso a paso

El recorrido completo, en orden. Cada paso remite a su detalle más abajo o en [`docs/DEMO.md`](docs/DEMO.md), que trae la salida real de cada comando. Del 1 al 6 no hace falta ninguna cuenta ni ningún modelo.

| Paso | Qué hacer | Qué se espera |
|---|---|---|
| 1 | **Arrancar** ([Camino corto](#camino-corto--sistema-operativo-en-cuatro-comandos)): clonar la rama `final-project-CRN`, copiar `.env.example` a `.env` y `npm run up` | La línea `Server listening at http://127.0.0.1:3000` y la web en http://localhost:5173. **Esa terminal queda ocupada** con la API y la web: lo demás va en una segunda terminal, en la carpeta del clon |
| 2 | **Comprobar la instalación** ([Verificación](#verificación-de-la-instalación)): `npm run verify` | Sale con código `0`: las seis preguntas *golden* coinciden con lo esperado |
| 3 | **Web**: abrir http://localhost:5173 y seguir los pasos 1 a 4 y 6 del [recorrido de demostración](#recorrido-de-demostración) | Pantalla 1, pregunta con evidencia y panel de uso (pantalla 2), un `UNKNOWN` y el informe de impacto (pantalla 3). El paso 5 necesita un modelo de embeddings |
| 4 | **CLI** ([El mismo flujo por CLI](#el-mismo-flujo-por-cli)): `projects`, `ask`, `impact` y `drift` | Las mismas respuestas que en la web, más el informe de deriva (con un falso positivo conocido) |
| 5 | **API**: abrir http://localhost:3000/docs | La documentación OpenAPI de la API, con «Try it out» |
| 6 | **Tests** ([Pasar los tests](#pasar-los-tests)): `npm test`, con o sin base de datos de pruebas | Todo en verde; sin base de datos, los de integración se saltan con un aviso |
| 7 | *Opcional.* **Indexar un repositorio propio** ([Camino completo](#camino-completo--indexar-tu-propio-repositorio-o-pregunta-libre)) | Su informe de indexado, y `impact` sobre él. **Solo por CLI y API**: la web muestra únicamente los dos proyectos de muestra |
| 8 | *Opcional.* **Preguntar libremente con un modelo real** ([Probar con un modelo real](#probar-con-un-modelo-real)) | Respuestas nuevas, de varios minutos en CPU |
| 9 | **Parar** ([Parar el sistema](#parar-el-sistema)): Ctrl+C en la primera terminal y `npm run down` | El contenedor se para; los datos se conservan para el siguiente arranque |

#### Camino corto — sistema operativo en cuatro comandos

```shell
git clone -b final-project-CRN https://github.com/DisTinta/AI4Devs-finalproject
cd AI4Devs-finalproject
cp .env.example .env
npm run up
```

Los cuatro comandos son los mismos en PowerShell y en Bash. El `-b final-project-CRN` es necesario: `main` solo tiene la plantilla del máster (ver [0.5](#05-url-o-archivo-comprimido-del-repositorio)). En PowerShell, `cp` es un alias de `Copy-Item` y funciona igual. `.env.example` trae el `DATABASE_URL` del contenedor local y deja vacías las variables `LLM_*` (modo evaluación; ver las variables abajo). Si el puerto 5432 ya está ocupado, `docs/DEMO.md` → [Antes de empezar](docs/DEMO.md#antes-de-empezar) explica cómo cambiarlo (`POSTGRES_PORT`).

`npm run up` (`scripts/up.mjs`) carga `.env` y encapsula la secuencia completa, escribiendo una línea `[up] <comando>` antes de cada paso; `make up` hace lo mismo desde Git Bash o WSL:

```bash
docker compose up -d --wait        # PostgreSQL 16 + pgvector, esperando a que acepte conexiones
npm install
npm run db:migrate                 # esquema
npm run db:seed                    # ← los dos repositorios de muestra YA indexados + respuestas golden + informe golden de deriva
node fixtures/build-history.mjs acme-shop   # historial de Git del fixture (~11 s), lo leen las respuestas en vivo
node fixtures/build-history.mjs task-api    # ídem para task-api (`npm run up` hace los dos)
npm run dev                        # API en :3000 · web en :5173
```

`npm run dev` arranca la API desde `packages/api/src/server.ts` y necesita `DATABASE_URL`, que `npm run dev` lee de `.env` (una variable ya definida en la terminal gana sobre `.env`); sin ella la API imprime una sola línea `INVALID_CONFIG` en stderr y no arranca, mientras la web sigue en marcha. La API escucha en `127.0.0.1:3000` (no en todas las interfaces: no tiene autenticación); su documentación OpenAPI se abre en `http://localhost:3000/docs` (el documento en `/docs/json`). Conviene abrirla en `localhost` y no en `127.0.0.1`: el servidor declarado en el documento es `http://localhost:3000` y, desde otro origen, «Try it out» fallaría (no hay CORS). Si `localhost` resuelve a `::1` y no conecta, `HOST=::1` o `HOST=0.0.0.0` lo exponen de otra forma, como decisión explícita.

Lo que imprime al terminar (extracto de la ejecución real del 20-10-2026, en PowerShell y en Bash, con la línea de la migración `0005_embedding-768`, que llegó después con DIS-67; la salida completa está en el paso 0 de [`docs/DEMO.md`](docs/DEMO.md)):

```text
[up] docker compose up -d --wait
…
[up] npm install
…
[up] npm run db:migrate
…
### MIGRATION 0001_graph-l1 (UP) ###
### MIGRATION 0002_history-claims (UP) ###
### MIGRATION 0003_indexes-stale (UP) ###
### MIGRATION 0004_query-log-verification (UP) ###
### MIGRATION 0005_embedding-768 (UP) ###
[up] npm run db:seed
…
2 projects loaded
  acme-shop  php/laravel  174 nodes · 170 edges
  task-api  typescript/fastify  102 nodes · 100 edges
[up] node fixtures/build-history.mjs acme-shop
acme-shop: 32 commits, 3 authors -> <repo>\fixtures\acme-shop\.git
[up] node fixtures/build-history.mjs task-api
task-api: 28 commits, 3 authors -> <repo>\fixtures\task-api\.git
[up] npm run dev
…
[1]   ➜  Local:   http://localhost:5173/
[0] {"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}
```

`docker-compose.yml` solo levanta PostgreSQL 16 con pgvector; la API y la web corren en la máquina con `npm run dev`. No hay `Dockerfile`.

**`npm run up` no devuelve la terminal**: termina dejando la API y la web en marcha en primer plano. Los comandos de los apartados siguientes se escriben en **una segunda terminal**, en la misma carpeta.

#### Verificación de la instalación

```bash
npm run verify
```

Hace cada pregunta golden de los repositorios de muestra (versionadas en `seeds/cache/`) y compara la estructura de la respuesta servida con la esperada: tipos de afirmación, verificación y citas, nunca el texto (**determinista: no llama al LLM**). Antes comprueba que la semilla y las golden corresponden al código actual (huellas). Necesita `DATABASE_URL` de una base cargada con `npm run db:seed` y sale con `0` solo si todas coinciden. Sirve como prueba de humo para quien evalúa y como test de integración en CI (job `verify`, con su propia base). El job `e2e` también siembra su propia base (`e2e`) y recorre la web con Playwright.

#### El mismo flujo por CLI

Sin necesidad de abrir la web, en la segunda terminal. La CLI va directa a la base de datos, así que **no necesita la API arrancada**; basta con que el contenedor de PostgreSQL esté en marcha (`projects`, `ask`, `impact` y `drift` leen `DATABASE_URL` de `.env`):

```shell
npm run cli -- projects
npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
npm run cli -- impact acme-shop "cambiar los descuentos de DiscountService"
npm run cli -- drift acme-shop
npm run cli -- ask task-api "¿Cómo valida taskRoutes las peticiones entrantes?"
```

Como se dice en el [recorrido](#recorrido-de-demostración), de las dos contradicciones del informe de `drift acme-shop` la del `README.md` del fixture es un falso positivo del modelo; la de `docs/pricing.md` es la deriva plantada.

Cada línea de `projects` termina con el campo `cache <aciertos>/<consultas> (<tasa>%)` (DIS-69): las consultas `explain` del proyecto y las que se sirvieron desde la caché de respuestas, por clave exacta o por similitud (`cache 0/0` si el proyecto aún no tiene consultas; `impact` y `drift` no cuentan), por ejemplo `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z  cache 3/4 (75%) sample`.

**Estado en la Entrega 3:** desde DIS-21, sin `LLM_*` (modo evaluación) `ask` responde desde la caché de respuestas del proyecto cualquier pregunta que ya tenga entrada (misma pregunta normalizada: sin distinguir mayúsculas, tildes, signos ni espacios), sin llamar al modelo y a coste 0. Desde DIS-26, `npm run db:seed` (y con él `npm run up`) carga además las respuestas *golden* versionadas en `seeds/cache/acme-shop.json` para tres preguntas de muestra de acme-shop: Q1 «¿Cómo se calcula el precio final de un pedido?», Q3 «¿Cómo se validan los cupones?» y Q4 «¿Qué hace OrderObserver al crear un pedido?», y desde DIS-32 también las de `seeds/cache/task-api.json` para tres preguntas de task-api. Esas seis responden al instante, sin modelo y a coste 0 (también escritas con otras mayúsculas, tildes o signos). Una pregunta sin entrada responde:

```text
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
```

`impact` (DIS-90) no llama al modelo: lee el grafo y escribe una fila `impact` en `query_log` por cada informe que devuelve. Sobre la semilla imprime esto (`--max-hops` de 1 a 3, 2 por omisión):

```text
DIRECTO
  DiscountApplied  app/Events/DiscountApplied.php  0 saltos  exact  [grafo]
  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]
  RecordDiscountAudit  app/Listeners/RecordDiscountAudit.php  0 saltos  exact  [grafo]
  PriceCalculator  app/Services/PriceCalculator.php  1 salto  exact  [grafo]
  app/Providers/AppServiceProvider.php  1 salto  exact  [grafo]
  app/Providers/EventServiceProvider.php  1 salto  exact  [grafo]

INDIRECTO
  CheckoutController  app/Http/Controllers/CheckoutController.php  2 saltos  heuristic  [grafo]
  OrderController  app/Http/Controllers/OrderController.php  2 saltos  heuristic  [grafo]
  RecalculateTotals  app/Jobs/RecalculateTotals.php  2 saltos  heuristic  [grafo]
  SendOrderConfirmation  app/Listeners/SendOrderConfirmation.php  2 saltos  heuristic  [grafo]

TESTS
  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]
  OrderPricingTest  tests/Feature/OrderPricingTest.php  [grafo]
  PriceCalculatorTest  tests/Unit/PriceCalculatorTest.php  [grafo]

DOCUMENTACIÓN
  README.md  al día

HISTORIAL
  app/Services/ShippingService.php  co-cambia 100 %  PR #24, #33, #55  [git]

RIESGO HIGH
10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística.
```

`DOCUMENTACIÓN` (DIS-94) lista los documentos con una arista `describes` hacia el código del informe y dice si están `al día` o `desactualizado desde <sha>` (un commit del código descrito posterior al último que tocó el documento; se compara por fecha de commit). `HISTORIAL` (DIS-94) lista los ficheros que co-cambian con los del ancla en el historial de Git, con el porcentaje de co-cambio y las PR; es la señal `[git]`, separada de la del grafo.

El nivel es `HIGH` porque cuatro de los seis componentes directos no tienen un test (`tested_by`): la clase de evento, su listener y los dos ficheros de service providers. La regla es la de PH-15: `HIGH` si algún directo no tiene test o solo se alcanza por cadenas heurísticas, `LOW` si todos tienen test y son `exact`, `MEDIUM` en otro caso. Desde DIS-94, un documento desactualizado convierte un `LOW` en `MEDIUM` (nunca cambia un `HIGH` ni un `MEDIUM`), y la rationale añade `, <n> documento(s) desalineado(s)` solo cuando hay alguno. Nota sobre el texto: el literal «cambiar el cálculo de descuentos» no ancla `DiscountService` (el ancla es léxico: `descu` no es `disco`), por eso la demo usa «cambiar los descuentos de DiscountService». `task-api` está en la semilla con tres preguntas golden (la de arriba es la primera; las otras dos son «¿Qué hace buildPage con los resultados paginados?» y «¿Qué transiciones de estado son válidas?»), así que en modo evaluación `ask task-api …` las responde desde la caché; una pregunta sin ancla, como «¿Cómo se autentican los usuarios?», responde `UNKNOWN (no-anchor)`.

#### Camino completo — indexar tu propio repositorio o pregunta libre

**Indexar no necesita LLM ni PHP**: el analizador PHP usa Tree-sitter (WebAssembly) y solo lee los objetos de Git del repositorio, sin ejecutar nada de él. Se indexa PHP (`--language php`) y TypeScript (`--language typescript`), cada uno con su analizador; el de TypeScript usa la API del compilador de TypeScript.

Antes de indexar, **edita `.env`**, que en `.env.example` trae vacías las dos variables que hacen falta:

1. `ALLOWED_REPOS_DIR`: la carpeta que **contiene** el repositorio, en ruta absoluta (por ejemplo `C:/repos` o `/home/yo/repos`). El repositorio tiene que estar dentro; en el comando, su ruta puede ser absoluta o relativa a esa carpeta.
2. `AUTHOR_HASH_SALT`: cualquier cadena larga y aleatoria. Es la clave con la que se seudonimiza el autor de cada commit; no se versiona.

El repositorio tiene que ser un clon de Git, no una carpeta descomprimida de un ZIP. Qué se puede hacer después:

- **`impact` funciona sin modelo** sobre el proyecto nuevo: no llama nunca al LLM.
- **`ask` y `drift` necesitan un LLM configurado** (recomendado: **Ollama** local; ver [Probar con un modelo real](#probar-con-un-modelo-real)); sin él responden `UNKNOWN (llm-required)`, porque solo los proyectos de muestra tienen respuestas e informe *golden*. Sobre un repositorio real el prompt es mayor que sobre los de muestra: en CPU, sube `LLM_TIMEOUT_MS` (con el valor por defecto, 120 s, una pregunta sobre un repositorio Laravel de 2 690 ficheros agotó el tiempo; con 600 s respondió en 107 s, ver la [observación](docs/measurements/private-repo-observation.md)).
- **El proyecto solo se ve por la CLI y la API**: la web muestra únicamente los dos proyectos de muestra, que lee de una constante generada con la semilla ([4](#4-especificación-de-la-api)).
- La CLI `index` solo crea proyectos nuevos y falla con un nombre repetido; un proyecto ya indexado se reindexa con `POST /api/projects/{id}/index` (incremental por omisión, completo con `{"incremental": false}`; DIS-9, DIS-10).

```shell
npm run cli '--' index mi-repo --name mi-proyecto --language php
npm run cli '--' index mi-repo --name otro --language php --framework none --json
npm run cli -- impact mi-proyecto "cambiar el cálculo de los pagos"
npm run cli -- ask mi-proyecto "¿Cómo funciona el módulo de pagos?"
```

El primero imprime el informe en texto, el segundo en JSON, y el último necesita un LLM en `.env`.

**Por qué `'--'` entre comillas.** En PowerShell (5.1 y 7), `npm` es el script `npm.ps1` y PowerShell se come el `--` suelto, así que las opciones (`--name`, `--language`, `--json`, `--max-hops`…) le llegan a npm y no a la CLI (`required option '--name <name>' not specified`). Con comillas funciona igual en PowerShell y en Bash, que las quita. Los comandos sin opciones, como `ask` o `impact` con su texto, funcionan con el `--` sin comillas (DIS-42).

`index` escribe el progreso por fase y los eventos de redacción de secretos (JSON por línea) en stderr, y solo el informe en stdout. Sale con `0` si todo va bien, `1` ante un error de dominio, configuración o ejecución (por ejemplo, ruta fuera de `ALLOWED_REPOS_DIR` o nombre de proyecto repetido) y `2` ante un uso incorrecto; el error es una línea `{"error":{"code","message","details"}}` en stderr.

`ask <proyecto> "<pregunta>"` busca el proyecto por su **nombre exacto** (sin recortar espacios ni ignorar mayúsculas) y escribe en stdout solo la respuesta: el texto del modelo, cada afirmación numerada y tipada (`[FACT]` o `[INFERENCE]`, más `[stale]` si está desactualizada) con sus evidencias `ruta:inicio-fin`, los extractos citados (como mucho 5 líneas cada uno), las afirmaciones previas sobre el mismo código si las hay y, al final, `note: claims not saved` si no pudieron guardarse. Por ejemplo:

```text
El precio final lo calcula PriceCalculator::compute.

statements:
1. [FACT] PriceCalculator::compute calcula el precio final.
   evidence: app/Services/PriceCalculator.php:16-44

evidence:
app/Services/PriceCalculator.php:16-44
    class PriceCalculator
    {
        public function __construct(
            private readonly DiscountService $discounts,
            private readonly TaxService $taxes,
    … (+24 lines)
```

Sin respuesta posible imprime `UNKNOWN (<reason>)` (`no-anchor`, `llm-required`, `over-budget`, `invalid-model-output`, `no-evidence` o `broken-evidence`). Los eventos (JSON por línea) y los errores van a stderr y nunca contienen la pregunta. Sale con `0` ante una respuesta o un `UNKNOWN`, `1` ante un error de configuración, conexión o dominio (por ejemplo `PROJECT_NOT_FOUND`, `LLM_UNAVAILABLE`, `BUDGET_EXHAUSTED`) y `2` ante un uso incorrecto o una pregunta inválida.

#### Probar con un modelo real

Sin `LLM_*` (modo evaluación) no hace falta ningún modelo: las tres preguntas *golden* de cada repositorio de muestra (Q1, Q3 y Q4 de `acme-shop`; Q1, Q2 y Q3 de `task-api`) se sirven al instante desde la caché, con `cacheHit: true` y `costUsd: 0`, y cualquier otra pregunta responde `UNKNOWN (llm-required)` (ver [`docs/DEMO.md`](docs/DEMO.md), pasos 1 y 5). Con la semilla cargada y `LLM_EMBED_MODEL=nomic-embed-text` (los vectores de las respuestas *golden* versionadas son de ese modelo, DIS-69), «¿Cómo se calcula el precio total de un pedido?» se responde desde la entrada golden de Q1 por similitud; el modo evaluación sigue siendo solo de clave exacta. Para preguntar libremente hace falta un endpoint compatible con OpenAI, y conviene saber de antemano cuánto tarda:

| Modo | Tiempo por pregunta | Fuente |
|---|---|---|
| Modo evaluación, pregunta *golden* | Instantáneo (milisegundos) | `docs/DEMO.md` |
| Ollama en CPU, `qwen2.5-coder` (7B) | **≈ 3,5–9 min, medido** | Una pregunta completa: 211,8 s, de los que 68,1 s fueron el `verify` con 4 llamadas (`openspec/changes/archive/2026-10-16-query-usage-log/reports/2026-10-16-13-manual-interface-testing.md`). `npm run cache:build`: las 3 *golden* en 22 min 24 s, entre 4 y 9 min por intento (`openspec/changes/archive/2026-10-17-golden-cache-build/reports/`) |
| Ollama con GPU, modelo de 7B | ≈ 10–30 s | **Estimado, no medido en este proyecto** |
| API alojada compatible con OpenAI | ≈ 5–20 s | **Estimado, no medido en este proyecto** |

Los 2–3 min que cita la propuesta de DIS-74 no son el tiempo de una pregunta: son la cota del `verify` en CPU, limitada por el tope de 20 llamadas de verificación por respuesta (`MAX_VERIFY_CALLS_PER_ANSWER`).

La receta paso a paso, igual en PowerShell y en Bash, está en [`docs/DEMO.md` → Probar con un modelo real](docs/DEMO.md#probar-con-un-modelo-real): Ollama con GPU o en CPU, una API alojada compatible con OpenAI y Claude por el endpoint compatible con OpenAI de Anthropic (estos dos, no verificados). Lo esencial para Ollama:

- **El historial de `acme-shop` y de `task-api`.** Las respuestas en vivo leen el código del fixture desde `fixtures/<nombre>/.git`, que no viaja con el clon; `npm run up` construye los dos en cada arranque (`node fixtures/build-history.mjs acme-shop` y `… task-api` para quien no use `up`). Sin él, la pregunta termina con `SOURCE_UNAVAILABLE` (`not-a-repository`).
- **`OLLAMA_CONTEXT_LENGTH=16384`.** El prompt de `explain` ocupa entre 5 000 y 7 000 tokens. Con el contexto por defecto, Ollama lo recorta (`truncating input prompt` en su log), se pierde el *system prompt* y toda respuesta sale `UNKNOWN (invalid-model-output)`.
- **`LLM_TIMEOUT_MS=1200000` en CPU.** `LLM_TIMEOUT_MS` admite de 1 a 3 600 000 ms (una hora); el cliente envía con `node:http`, así que no hay otro límite por debajo (el `fetch` de Node cortaba a los 300 s). Con GPU o una API alojada basta el valor por defecto, 120 000 ms.
- **Reiniciar tras editar `.env`.** La API lee `.env` al arrancar: Ctrl+C en la terminal de `npm run up` y otra vez `npm run up`. `npm run cli` lo lee en cada ejecución.
- **Modelo:** `qwen2.5-coder` (7B). `llama3.2` (3B) no produce el JSON estricto que exige la cuarentena y responde `invalid-model-output`.
- **Salida con valla:** desde DIS-72 se acepta una única valla ```` ```json ```` que envuelva toda la salida, porque algunos modelos responden así ([2.5](#25-seguridad), práctica 2).

#### Pasar los tests

`npm test` ejecuta toda la suite de Vitest (unitarios e integración). Sin base de datos de pruebas, los tests de integración se saltan con un aviso y el resto pasa: **2 443 pasan y 301 se saltan** ([2.6](#26-tests)). Para pasarlos todos (**2 796**), crea una base de datos propia para los tests, **nunca la que sembró `npm run up`**, y pásala en el propio comando: la suite no lee `.env`.

```shell
docker compose exec postgres createdb -U codemind codemind_test
```

```bash
DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npm test
```

```powershell
$env:DATABASE_URL='postgresql://codemind:codemind@localhost:5432/codemind_test'; npm test
```

En PowerShell la variable sigue definida en esa terminal y gana sobre `.env`: después, `Remove-Item Env:DATABASE_URL` o abre otra terminal. El resto de suites (`npm run test:e2e` con Playwright, `npm run test:a11y`, `npm run test:mutation`) y sus requisitos están en [`docs/TESTING.md`](docs/TESTING.md); `test:e2e` necesita parar antes `npm run up`, porque arranca su propia API y su propia web en los mismos puertos.

#### Parar el sistema

Ctrl+C en la terminal de `npm run up`: termina con `[up] stopped (Ctrl+C)` y el código `130`, que es el final esperado (npm puede añadir sus propias líneas de error con `code 130`). Después, en cualquier terminal:

```shell
npm run down
```

`npm run down` para y elimina el contenedor; los datos se quedan en el volumen `pgdata`, así que el siguiente `npm run up` no recrea la base de datos desde cero.

#### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `LLM_API_KEY` | no | Credencial del endpoint LLM; si está, se envía como `Authorization: Bearer …`. Opcional en modo vivo: con Ollama se deja **vacía**. Con clave pero sin `LLM_BASE_URL`, el arranque falla |
| `LLM_BASE_URL` | no | Base URL compatible OpenAI (`http`/`https`); **decide el modo**: con URL → modo vivo; sin URL ni clave → **modo evaluación** (solo caché / verify). En desarrollo: Ollama (`http://localhost:11434/v1`) |
| `LLM_MODEL` | sí en modo vivo | Modelo para generación; con `LLM_BASE_URL` y sin `LLM_MODEL`, el arranque falla |
| `LLM_MODEL_VERIFY` | no | Modelo económico para la verificación de evidencias en vivo; sin él se usa `LLM_MODEL` |
| `LLM_EMBED_MODEL` | no | Modelo de embeddings; sin él, los embeddings no están disponibles (sin usar `LLM_MODEL`). Sus vectores deben tener 768 dimensiones, las de `vector(768)` del esquema (DIS-67): `nomic-embed-text` funciona; un modelo de 1536 falla con `dimension-mismatch`, lo que solo salta el paso de similitud de la caché. Tras cambiar de modelo hay que invalidar la caché de cada proyecto: `POST /api/projects/{id}/index` con `{"incremental": false}` (la respuesta trae `cacheEntriesInvalidated`); la regla de cambio de modelo con la misma dimensión está en el [ADR de los embeddings](docs/adr/20261103-embeddings-stay-on-llm-port.md) |
| `LLM_TIMEOUT_MS` | no | Tiempo máximo por petición al LLM, en ms (entero de 1 a 3600000). Por defecto `120000`, para el arranque en frío de Ollama; en CPU, `1200000` (ver [Probar con un modelo real](#probar-con-un-modelo-real)) |
| `DATABASE_URL` | **sí** (scripts `db:*`, `index` y la API) | Cadena de conexión de PostgreSQL. La API no arranca sin ella (`INVALID_CONFIG`). `.env.example` trae la del contenedor local. Los comandos `npm run` de la guía (`up`, `dev`, `db:*`, `cli` —con `ask`, `impact`, `drift` y `projects`—, `verify`, `cache:build`, `cache:embed`, `drift:build`, `seed:build` y `demo:ask`) la leen de `.env`, y una variable ya definida en la terminal gana sobre `.env`; sin ella en ninguno de los dos sitios, `db:migrate` / `db:rollback` salen con error |
| `POSTGRES_PORT` | no | Puerto del host en el que `docker compose` publica PostgreSQL. Por defecto `5432`. Si lo cambias (otro programa ya usa el 5432), cambia también el puerto de `DATABASE_URL`: los dos van juntos |
| `PORT` | no | Puerto de la API: solo dígitos, de 1 a 65535. Por defecto `3000` |
| `HOST` | no | Dirección en la que escucha la API. Por defecto `127.0.0.1` (solo local); `0.0.0.0` la expone a la red, y la API no tiene autenticación |
| `RATE_LIMIT_MAX` | no | Peticiones por IP dentro de la ventana: solo dígitos, de 1 a 1000000. Por defecto `30` |
| `RATE_LIMIT_WINDOW_MS` | no | Longitud de la ventana del límite, en ms: solo dígitos, de 1 a 86400000. Por defecto `60000` |
| `ALLOWED_REPOS_DIR` | no (sí para indexar) | Directorio raíz permitido para indexar (ver [2.5](#25-seguridad)); vacío = indexado deshabilitado. La API también la lee para `POST /api/projects/{id}/index`: sin ella, o sin `AUTHOR_HASH_SALT`, responde `403 INDEXING_DISABLED`. Solo debe poder escribir en él el usuario que ejecuta Codemind, y solo debe contener repositorios de confianza (ver `docs/DEPLOYMENT.md`) |
| `AUTHOR_HASH_SALT` | **sí** (para indexar) | Clave del seudónimo de los autores de commits (`author_hash`). No se versiona; cambiarla cambia todos los `author_hash`. La API también la necesita para el reindexado (`POST /api/projects/{id}/index`; sin ella, `403 INDEXING_DISABLED`) |
| `DAILY_BUDGET_USD` | no | Techo de gasto diario en USD si se usa un proveedor cloud de pago: decimal positivo (`2.5`), solo en modo vivo; vacía = sin techo (lo normal con Ollama local). El gasto del día es la suma de `query_log.cost_usd` desde las 00:00 UTC; al alcanzarlo, el LLM deja de llamarse hasta el día UTC siguiente. Con techo, `LLM_MODEL`, `LLM_MODEL_VERIFY` y `LLM_EMBED_MODEL` deben tener precio en `COST_TABLE` (`packages/core/src/llm/cost-table.ts`); si no, la configuración del LLM es inválida. *Estado:* `ask` envuelve el modelo con el techo cuando hay `DAILY_BUDGET_USD`, y desde DIS-74 cada `explain` escribe su `cost_usd` en `query_log`, verificación incluida. El gasto de un `ask` en curso solo se ve al escribir su fila, así que cada `ask` en curso puede pasarse del techo como mucho en una llamada `answer` y `MAX_VERIFY_CALLS_PER_ANSWER` (20) llamadas `verify` (N ejecuciones simultáneas, N veces eso) |
| `CACHE_BUILD_TIMEOUT_MS` | no | Solo para `npm run cache:build` (desarrollo): tiempo máximo de cada petición al modelo al generar las respuestas *golden*, en ms (entero de 1 a 3600000). Por defecto `1200000` (20 min), porque en CPU una respuesta tarda varios minutos. `LLM_TIMEOUT_MS` no se aplica a ese comando |

> **Decisión (5 sep 2026).** Antes: `LLM_API_KEY` obligatoria. Ahora: **opcional**; evaluación sin key; desarrollo libre con Ollama. Motivo: 0 € y 0 fricción para quien evalúa.

Las semillas se regeneran con `npm run seed:build`, que indexa los dos repositorios de muestra y volca el grafo a `seeds/graph-dump.sql`, versionado en el repositorio. Así la instalación es determinista y no depende de que el indexado se comporte igual en otra máquina. Las respuestas *golden* de evaluación (DIS-26) se regeneran en desarrollo con `npm run cache:build`, **después** de `seed:build`: el comando comprueba que la semilla está al día con el código, trabaja por proyecto (`npm run cache:build [-- --project <name> [<id>...]]`), pregunta cada pregunta *golden* a un LLM vivo (la referencia es Ollama local con `qwen2.5-coder`, servido con `OLLAMA_CONTEXT_LENGTH=16384`; en CPU tarda unos 30 minutos por proyecto) sobre la semilla cargada en una transacción que siempre deshace, y escribe `seeds/cache/<proyecto>.json` de una vez, solo si todas las de ese proyecto salieron bien. El fichero viaja versionado con las huellas de la semilla y una huella de las respuestas (prompts, reglas de tipado y verificación, pesos de confianza y formato guardado), para que `verify` sepa cuándo se han quedado viejas sin necesitar modelo. `npm run cache:build -- --project acme-shop Q3` regenera solo esa pregunta si las huellas no han cambiado (los ids exigen `--project`). El informe *golden* de deriva se regenera con `npm run drift:build`, que reescribe `seeds/drift/acme-shop.json`; la receta completa tras cambiar el código es `seed:build` → `cache:build` → `drift:build` ([ADR](docs/adr/20261103-drift-golden-freshness-in-unit-suite.md)). Desde DIS-69 cada entrada del fichero lleva además `questionEmbedding`, el vector de su pregunta normalizada: `cache:build` escribe `null` en lo que regenera y `npm run cache:embed [-- --project <name>]` lo rellena con el modelo de `LLM_EMBED_MODEL` (la referencia es `nomic-embed-text`, 768 dimensiones) sin volver a preguntar nada ni tocar la base de datos, así que no cambia ninguna respuesta ni ninguna revisión; `db:seed` guarda el vector con la entrada y una pregunta reformulada puede acertar por similitud nada más sembrar.

---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

```mermaid
flowchart TB
    subgraph client["Cliente"]
        WEB["Web · React 18 + Vite<br/>3 pantallas"]
        CLI["CLI · commander<br/>index · ask · impact · projects · drift"]
    end

    subgraph api["API · Node 22 + Fastify"]
        REST["REST: POST /ask · POST /impact · POST /index · GET /health<br/>OpenAPI + validación por esquema"]
        RATE["Rate limiting<br/>+ modo demo"]
        ORCH["Orquestador<br/>intención · plan · política"]
    end

    subgraph engine["Motor · packages/core"]
        CTX["Context Engine<br/>anclaje · expansión · ranking · presupuesto"]
        SEC["Security Gateway<br/>secretos · sanitización · aislamiento"]
        VER["Verificador de evidencias<br/>¿la cita sustenta la afirmación?"]
        CACHE["Caché semántica<br/>hit rate + ahorro"]
        IMP["Impacto<br/>recorrido inverso + riesgo"]
        DRIFT["Deriva documental<br/>documento ↔ código"]
    end

    subgraph ports["Puertos · core/ports"]
        AP(["AnalyzerPort"])
        LP(["LlmPort"])
        SP(["StorePort"])
        GP(["GitPort"])
        STP(["SourceTreePort"])
    end

    subgraph adapters["Adaptadores"]
        PHP["analyzers/php<br/>Tree-sitter + reglas Laravel"]
        TSA["analyzers/typescript<br/>TS Compiler API"]
        GIT["adapters/git"]
        LLMA["adapters/llm"]
        PGA["adapters/store-postgres"]
    end

    PG[("PostgreSQL 16 + pgvector<br/>L1 determinista · L2 inferida")]
    LLM["Proveedor de LLM"]

    WEB --> REST
    CLI --> ORCH
    REST --> RATE --> ORCH
    ORCH <--> CTX
    ORCH --> CACHE
    ORCH --> IMP
    ORCH --> DRIFT
    CTX --> SEC
    CTX --> VER
    CTX -.-> AP
    CTX -.-> LP
    CTX -.-> GP
    SEC -.-> SP
    SEC -.-> STP
    IMP -.-> SP
    DRIFT -.-> LP
    AP --- PHP
    AP --- TSA
    LP --- LLMA --> LLM
    SP --- PGA --> PG
    GP --- GIT
    STP --- GIT
```

#### Patrón: arquitectura hexagonal (puertos y adaptadores) con extracción offline

**Justificación de cada decisión:**

- **El núcleo no conoce ni el lenguaje analizado ni el proveedor de LLM.** Ambos son adaptadores detrás de un puerto. Esto es lo que hace *comprobable* la independencia del lenguaje: el criterio de aceptación del analizador de TypeScript es que su pull request **no toque `packages/core`**. Una afirmación falsable con `git diff`, no una promesa, y se cumplió: las PR #74 y #75 no tocan `packages/core`.
- **La extracción es offline y separada de la consulta.** Indexar es lento y determinista; consultar es rápido. Mezclarlas obligaría a reanalizar el repositorio en cada pregunta.
- **El verificador es un paso posterior obligatorio**, no una instrucción dentro del prompt. Pedirle al modelo «cita tus fuentes» produce citas; comprobarlas mecánicamente produce citas válidas. Es la diferencia que justifica el producto. Su mitad sintáctica (DIS-68, `packages/core/src/verify/`) ya corre en `explain` tras tipar las afirmaciones: relee de git, en el commit y la raíz que leyó el paquete de contexto, los ficheros citados (una sola lectura en lote) y exige que cada `excerpt` sea exactamente el texto de su rango; una cita rota se quita de la afirmación, la afirmación que se queda sin citas desaparece y, si no queda ninguna, la respuesta es `UNKNOWN (broken-evidence)`. Su mitad semántica (DIS-70) corre a continuación sobre cada par (afirmación, cita) que queda: una llamada con propósito `verify` (el modelo de `LLM_MODEL_VERIFY`) por par distinto, en secuencia, que solo recibe la afirmación y el fragmento envueltos como dato no confiable y solo puede responder `{"entails": true|false}`. Una afirmación es `FACT` solo si su cadena de evidencia lo permite **y** todas sus citas quedan `entailed`; si alguna queda `cited`, es `INFERENCE`, nunca se elimina. Si el verificador responde otra cosa, no está disponible o se agota el presupuesto, la cita se queda en `cited` (falla cerrado) con un evento `entailment_unverified`. Los veredictos se cachean en memoria por par durante el proceso, y la respuesta lleva en `usage.verification` las llamadas, aciertos de caché, tokens y coste del verificador.
- **Repository Pattern en la persistencia.** El dominio habla con `StorePort`, no con PostgreSQL. Como efecto secundario útil, las semillas precargadas del arranque local no necesitan ninguna lógica especial.
- **Flujo de control en bucle, no en cascada.** El orquestador y el Context Engine se invocan mutuamente: el agente solicita información de forma incremental en lugar de recibir todo el contexto de una vez. Es lo que permite el presupuesto de tokens.

**Beneficios principales:** sustituibilidad del LLM y de los analizadores; un único grafo reutilizado por las tres capacidades; coste de contexto medible en un solo punto; y un arranque local sin dependencias externas.

#### Sacrificios y déficits

**1. El grafo de llamadas nunca será completo en PHP/Laravel.** Las facades, el contenedor de servicios, `__call`, los atributos mágicos de Eloquent y las rutas resueltas por *string* hacen que parte del grafo real sea invisible para un analizador estático. En TypeScript, en cambio, el compilador resuelve referencias con precisión, y el mismo núcleo produjo un grafo con más cobertura: 100 % frente a 77,4 % en la Tabla 2, sin aristas heurísticas. **Ese contraste se mide y se publica** ([2.6](#26-tests)) en lugar de disimularse. Consecuencia práctica: en PHP el sistema depende más de la señal histórica de co-cambio, que no requiere análisis estático.

**2. Indexar cuesta tiempo y dinero por adelantado.** Un asistente basado solo en recuperación semántica no tiene ese coste inicial. La apuesta es que se amortiza en consultas repetidas; las mediciones de [2.6](#26-tests) permiten juzgarlo con datos.

**3. La capa inferida depende del LLM** y hereda su falibilidad. Se acota con procedencia obligatoria y con la regla —impuesta en la base de datos, no solo en el código— de que una inferencia nunca se etiquete como hecho.

**4. La extracción offline implica desfase.** El grafo refleja el último indexado, no el estado actual del repositorio. El reindexado incremental (DIS-10, por `POST /api/projects/{id}/index`, DIS-9) y la actualización perezosa de las afirmaciones `stale` (DIS-42, [ADR](docs/adr/20261029-stale-claims-refreshed-in-place.md)) lo reducen; no lo eliminan.

**5. Tres pantallas no son un producto terminado.** La web es evidencia de funcionamiento y superficie para probar, no una interfaz completa.

**6. El repositorio de validación real es privado**, así que las cifras obtenidas sobre él no son reproducibles por terceros. Por eso las mediciones publicables se hacen sobre los dos repositorios de muestra públicos, y las del privado se reportan aparte como [observación](docs/measurements/private-repo-observation.md): el indexado aguanta un repositorio real de 7 390 commits en 78 s sin diagnósticos, y la prueba deja a la vista límites que los repositorios de muestra no enseñan (tests de `Feature` casi sin aristas `tested_by`, ruido de documentos archivados y de recursos de terceros, y un modo vivo que con un modelo local pequeño no escala).

### **2.2. Descripción de componentes principales:**

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| CLI | TypeScript + `commander` | `index`, `ask`, `impact`, `projects`, `drift` (F6, DIS-73) |
| API | Node 22 + **Fastify** 5 + Zod | `POST /api/projects/{projectId}/ask`, `POST /api/projects/{projectId}/impact`, `POST /api/projects/{projectId}/index` (reindexado completo o incremental, DIS-9, DIS-10) y `GET /health`, validación por esquema, OpenAPI generado en `/docs` (DIS-76, DIS-78, DIS-95) |
| Web | React 18 + TypeScript + **Vite** + Tailwind | Andamiaje, rutas y cliente tipado (DIS-58); selección de proyecto (DIS-60), consulta con panel de uso y estados (DIS-65, DIS-66), Pantalla 3 de impacto (DIS-14) y tasa de acierto de caché en el panel de uso (DIS-69) |
| Orquestador | TypeScript | Clasifica intención, coordina el bucle, aplica política de seguridad |
| **Analizador PHP** | **Tree-sitter** (`tree-sitter-php`) + reglas Laravel | Ficheros, clases, métodos, rutas, spans, llamadas |
| **Analizador TypeScript** | **TypeScript Compiler API** (`typescript`, `TypeChecker`) | Lo mismo, con referencias resueltas por el compilador |
| Extractor de Git | `simple-git` | Commits, ficheros modificados, co-cambio, número de PR |
| Context Engine | TypeScript | Anclaje de entidades, expansión por grafo, ranking híbrido, presupuesto de tokens. El texto de los spans se lee de git en el commit indexado (la base de datos no guarda contenido), todos los ficheros del paquete en una sola lectura por lotes con un número fijo de procesos git (DIS-39), y los tokens se estiman en local como `ceil(caracteres / 4)`, declarado como `chars-div-4` |
| Verificador de evidencias | TypeScript + LLM acotado | Validación sintáctica (git en el commit del paquete) y semántica (*entailment* con `LLM_MODEL_VERIFY`, salida `{"entails": boolean}`, caché en memoria por par) de cada cita |
| Caché de respuestas | TypeScript (+ pgvector) | Reutiliza la respuesta de una pregunta ya respondida, por su forma normalizada (DIS-21) o, con `LLM_EMBED_MODEL` configurado, por similitud de embedding (DIS-67); sostiene el modo demo. Tasa de acierto por proyecto en la CLI, la API y el panel de uso, y vectores de pregunta versionados en las *golden* (DIS-69, script `cache:embed`) |
| Security Gateway | Reglas propias en proceso + `gitleaks` en CI | Secretos antes de indexar, sanitización, aislamiento por proyecto; escaneo de secretos del repositorio en cada PR y cada push a `main` |
| Persistencia | **PostgreSQL 16 + pgvector** | Nodos, aristas, embeddings, afirmaciones, evidencias, uso |

**Caso de uso `explain` (DIS-39).** Responde una pregunta sobre un proyecto indexado en **una sola pasada** Context Engine → modelo, en este orden: valida la entrada (pregunta de 1 a 1 000 code points que no sea solo espacios; un error, no un `UNKNOWN`), ancla la pregunta una vez, y responde `UNKNOWN` sin construir el paquete si no hay ancla (`no-anchor`) o si el modelo está en modo evaluación (`llm-required`, con el mensaje PH-08). Entre ambos pasos (DIS-21), salvo con `useCache: false`, busca la pregunta normalizada en la caché de respuestas del proyecto: una entrada válida responde, en los dos modos, la respuesta guardada sin construir el paquete, sin llamar al modelo y sin escribir afirmaciones, con `usage.cacheHit: true` y coste 0, y suma un acierto a la entrada; una entrada que no supera la validación cuenta como fallo de caché. Después construye el paquete (`over-budget` si no cabe ningún span), lee las afirmaciones ya guardadas que se solapan con sus spans (como mucho las 20 más recientes, antes de llamar al modelo), llama al modelo una vez, pasa su salida por la cuarentena (`invalid-model-output`) y, si no trae ninguna afirmación, responde `UNKNOWN` con `no-evidence` en lugar de devolver el texto del modelo. Cada afirmación se tipa `FACT` o `INFERENCE` por las citas y se guarda como `CLAIM` con su evidencia y su procedencia, todo en una transacción. Si el proyecto se reindexó a otro commit mientras se respondía, las afirmaciones se guardan `stale` y la respuesta las muestra con aviso, nunca como `FACT`. Si la escritura falla, la respuesta se devuelve igual, con `persisted: false` y un evento `claims_not_persisted` que no lleva ningún texto. Core devuelve los eventos y no escribe en ningún log. La respuesta se redacta en el idioma de la pregunta, español o inglés (DIS-104, `packages/core/src/explain/question-language.ts`), y las afirmaciones `stale` que alcanza la pregunta se recalculan de forma perezosa (DIS-42, `stale-refresh.ts`; ver CLAIM en [3.2](#32-descripción-de-entidades-principales)).

**Nota sobre los embeddings (DIS-67).** El esquema tiene columnas `vector(768)` en `FILE`, `SYMBOL` y `CACHE_ENTRY`, con sus índices HNSW ([3.2](#32-descripción-de-entidades-principales) → Índices); la migración `0005` las movió de 1536 a 768, la dimensión de `nomic-embed-text` (Ollama, 0 $). `LlmPort.embed()` lo usa por primera vez el paso de similitud de la caché de `explain` (`packages/core/src/cache/similarity-cache.ts`): en modo vivo, con `LLM_EMBED_MODEL` configurado y tras no acertar la clave exacta, embebe la clave normalizada una vez y busca la entrada más parecida del proyecto (`findSimilarCacheEntry`); la respuesta en vivo cacheable guarda ese vector en `cache_entry.question_embedding`. Siguen sin escribirse `file.embedding` y `symbol.embedding`, y el anclaje de la pregunta es léxico (`packages/core/src/context/anchor.ts`). Sin modelo de embeddings, en modo evaluación o con un fallo del endpoint, el paso se salta sin error; un fallo configurado o un techo agotado añaden el evento `semantic_cache_skipped` (código `embedding-unavailable` o `budget-exhausted`) a los eventos de `/ask` y `ask`. La decisión del puerto (los embeddings siguen en `LlmPort.embed()`, sin `EmbeddingPort`), de la dimensión y de la regla de cambio de modelo (otra dimensión exige migración; el mismo número de dimensiones exige invalidar la caché de cada proyecto) está en el ADR [`20261103-embeddings-stay-on-llm-port.md`](docs/adr/20261103-embeddings-stay-on-llm-port.md).

**Sobre `drift`.** Es el comando de la funcionalidad F6, que era *should-have* y vivía en la reserva del calendario. Desde DIS-73 está **entregado**: `codemind drift <proyecto> [--doc <ruta>]` imprime, por documento, las afirmaciones que el código contradice, con la cita de los dos lados, y cada ejecución deja una fila `drift` en `QUERY_LOG`. Sin `LLM_*` (modo evaluación) imprime el informe *golden* versionado en `seeds/drift/acme-shop.json` (que `npm run db:seed` carga y `npm run drift:build` regenera con un modelo real). Con un modelo configurado, `drift acme-shop` sobre el proyecto entero también sirve ese informe *golden* sin llamar al modelo (la salida termina con `note: golden report (answer cache)`); `--doc <ruta>` no tiene informe *golden* y ejecuta el modelo sobre ese documento. La distinción entre lo previsto y lo entregado no era cosmética: un README que anuncia un comando que el código no tiene es exactamente la divergencia entre documentación y código que F6 existe para detectar.

**Por qué Fastify y no NestJS.** Con cuatro endpoints (`ask`, `impact`, `index` y `health`, más `/docs`) y el dominio ya aislado en `packages/core`, la estructura de módulos y la inyección de dependencias de NestJS resuelven un problema que este proyecto no tiene. Fastify aporta validación por esquema y generación de OpenAPI, que es exactamente lo que se necesita.

**Por qué dos tecnologías de análisis distintas.** Tree-sitter da estructura sintáctica pero no resuelve tipos, lo que en PHP obliga a añadir reglas heurísticas para las convenciones de Laravel. En TypeScript, la API del compilador ya devuelve referencias resueltas, así que usarla es más simple *y* más preciso. Que los dos analizadores tengan perfiles de precisión distintos detrás del mismo puerto es justamente lo que valida la arquitectura.

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

```
AI4Devs-finalproject/
├── packages/
│   ├── core/src/                   # dominio — CERO dependencias de infraestructura
│   │   ├── knowledge/              #   entidades L1/L2, afirmaciones, evidencia, confianza, uso
│   │   ├── index/                  #   caso de uso de indexado, gateway de seguridad, detección de framework
│   │   ├── context/                #   Context Engine: anclaje, expansión, ranking, presupuesto de tokens
│   │   ├── explain/                #   caso de uso explain: prompt, cuarentena, tipado, política UNKNOWN
│   │   ├── verify/                 #   verificador de evidencias (sintáctico y semántico)
│   │   ├── cache/                  #   caché de respuestas: clave normalizada, similitud de embedding y tasa de acierto
│   │   ├── impact/                 #   caso de uso impact: recorrido inverso, documentación, co-cambio, riesgo
│   │   ├── drift/                  #   caso de uso drift: afirmaciones de los documentos frente al código
│   │   ├── llm/                    #   presupuesto diario, tabla de costes, errores del modelo
│   │   └── ports/                  #   AnalyzerPort · LlmPort · StorePort · GitPort · SourceTreePort
│   │
│   ├── analyzers/                  # adaptadores de lenguaje
│   │   ├── php/                    #   Tree-sitter (WebAssembly) + reglas Laravel
│   │   └── typescript/             #   TypeScript Compiler API: símbolos, spans y llamadas exact por el TypeChecker
│   │
│   ├── adapters/                   # adaptadores de infraestructura
│   │   ├── store-postgres/         #   StorePort + migraciones (node-pg-migrate)
│   │   ├── llm/                    #   cliente compatible OpenAI (Ollama o API alojada)
│   │   └── git/                    #   historial y lectura del árbol con simple-git
│   │
│   ├── api/                        # Fastify: /ask, /impact, /index, /health, /docs, errores, límite por IP
│   ├── cli/                        # projects · index · ask · impact · drift · db:seed · seed:build · cache:build · cache:embed · drift:build · verify
│   └── web/                        # React + Vite + Tailwind: rutas, cliente tipado, Pantallas 1, 2 y 3
│
├── fixtures/                       # los 2 repositorios de muestra y lo que los acompaña
│   ├── acme-shop/                  #   Laravel 11, con drift plantado — en la semilla
│   ├── task-api/                   #   TypeScript + Fastify — en la semilla
│   ├── annotations/                #   sitios de llamada anotados de la Tabla 2
│   ├── history/                    #   commits de cada fixture, que reproduce build-history.mjs
│   └── build-history.mjs           #   construye fixtures/<nombre>/.git
│
├── seeds/
│   ├── graph-dump.sql              # grafo ya construido de acme-shop y task-api, versionado
│   ├── cache/acme-shop.json        # respuestas golden Q1, Q3 y Q4 con su huella y el embedding de la pregunta (DIS-69)
│   ├── cache/task-api.json         # respuestas golden Q1, Q2 y Q3 de task-api
│   └── drift/acme-shop.json        # informe de deriva golden (DIS-73)
│
├── docs/                           # ── del proyecto ──
│   ├── DEMO.md                     # guion reproducible: comandos + salida real
│   ├── CONFIDENCE.md               # fórmula, señales, los 6 pesos (+ saturación) con valor y motivo, límites
│   ├── TESTING.md
│   ├── DEPLOYMENT.md
│   ├── AUTONOMOUS-RUN.md           # cómo se ejecuta una tanda autónoma de tickets
│   ├── adr/                        # decisiones de arquitectura (15 ADR)
│   ├── ai-sessions/                # sesiones con IA citadas en prompts.md
│   ├── api/                        # referencia del código generada con TypeDoc
│   ├── measurements/               # Tablas 1 y 2: método, datos en bruto, revisiones y anotaciones
│   ├── golden-review/              # revisión de las respuestas golden (DIS-34, DIS-33, DIS-107, DIS-9, DIS-10, DIS-10 r2, DIS-42, DIS-42 r2, DIS-42 r3, DIS-110, DIS-110 r2, DIS-104) y panel/
│   │                               # ── del harness: se reemplazan al actualizarlo ──
│   ├── base-standards.md
│   ├── documentation-standards.md
│   ├── openspec-tasks-mandatory-steps.md
│   ├── backend-standards.md        #   capas y convenciones del adaptador de stack
│   ├── frontend-standards.md
│   └── project-context.md          #   el único que se escribe a mano y sobrevive
│
├── ai-specs/                       # harness: 29 skills, 9 subagentes y plantillas (fuente canónica)
├── openspec/
│   ├── specs/                      # 43 capacidades vigentes
│   └── changes/archive/            # 76 changes archivados, cada uno con sus informes en reports/
├── .claude/                        # referencias a ai-specs, comandos /opsx:*, 12 hooks + invoke.cjs + lib.sh
├── .cursor/                        # las mismas referencias y reglas para Cursor
├── .mcp.json                       # MCP del proyecto: Context7, Playwright y Linear
├── CLAUDE.md · AGENTS.md           # punteros a la doctrina
│
├── images/                         # los 3 wireframes de 1.3, en SVG
│
├── tests/
│   ├── unit/
│   ├── integration/                #   con PostgreSQL; se saltan sin DATABASE_URL
│   ├── a11y/                       #   puerta de accesibilidad con axe (test:a11y)
│   ├── harness/                    #   tests de los hooks del kit (DIS-106)
│   ├── support/                    #   dobles y factorías compartidas
│   └── e2e/                        #   specs de Playwright (npm run test:e2e)
│
├── .github/workflows/              # ci.yml · frontend.yml · claude-auto-review.yml · claude-interactive.yml
├── scripts/                        # npm run up · demo:ask · demo:excerpt · measure:graph · measure:context, la carga de .env y los auxiliares de medición, CI y la tanda autónoma (answer-review, annotation-agreement, coverage-summary, dev-processes); solo módulos de Node
├── docker-compose.yml              # solo PostgreSQL 16 + pgvector (no hay Dockerfile)
├── Makefile                        # atajos de npm run up / npm run down para Git Bash o WSL
├── stryker.config.json             # pruebas de mutación, umbral 80
├── .gitignore · .gitattributes · .gitleaks.toml · .gitleaksignore
├── readme.md
└── prompts.md
```

**Monorepo con workspaces de npm.** La regla de dependencias es unidireccional y **se comprueba en CI**: `core` no importa nada de `adapters`, `analyzers` ni `api`; solo define los puertos que ellos implementan. Un test de arquitectura con `dependency-cruiser` falla el build si alguien la rompe, de modo que la afirmación de independencia del lenguaje está protegida por el pipeline y no por la buena voluntad. La misma configuración (`.dependency-cruiser.cjs`) impide además que la web importe código del backend (`web-no-backend`) y que la API acceda a SQL (`api-no-sql`).

**Parte del árbol es un harness de desarrollo, no código del producto.** `ai-specs/`, `openspec/`, `.claude/hooks/`, los estándares de `docs/` y los cuatro ficheros de memoria son el andamiaje de trabajo con IA. Se instala desde [`sdd-harness-kit`](https://github.com/DisTinta/sdd-harness-kit), un kit propio de Spec-Driven Development cuya procedencia está en `prompts.md` §0.2 y cuyo uso en este proyecto se cuenta en la [sección 8](#8-flujo-de-trabajo-con-ia-y-sdd-harness-kit). En la Entrega 1 el kit traía 9 hooks; el décimo, `spec-audit-gate`, se añadió en la Entrega 2 (PR #35), y el undécimo y el duodécimo, `autonomous-merge-gate` y `log-permission-denied`, llegaron con el modo autónomo (DIS-106). Omitir el harness dejaría esta sección incompleta.

Tiene dos consecuencias que conviene declarar. La primera es operativa: los ficheros de `docs/` que instala el harness **se reemplazan cuando el harness se actualiza**, así que la documentación del proyecto no puede compartir nombre con ellos — de ahí que estén separados en dos grupos en el árbol. La segunda es de diseño, y es deliberada: uno de los hooks comprueba, al guardar un fichero de `packages/core`, que no mencione `adapters/` ni `analyzers/`. Es la **misma** regla que `dependency-cruiser` impone en CI. La redundancia es intencionada: el hook es rápido y local y avisa mientras escribes; el CI es la autoridad y no se puede saltar.

**`docs/` no duplica este README.** Guarda solo lo que aquí no cabe: el guion de demostración con salidas reales, los pesos de la fórmula de confianza, las guías de tests y despliegue, y las transcripciones de las sesiones con IA que `prompts.md` cita.

El Ejemplo 1 oficial reparte las secciones de la plantilla en ocho documentos numerados que la espejan. Aquí se ha evitado a propósito: **cada copia de un contenido es un sitio más donde puede quedar desincronizado**, y detectar exactamente eso es la funcionalidad F6 de este producto. Documentar de una forma que genere el problema que el sistema pretende resolver sería una mala señal sobre el criterio con el que está hecho.

### **2.4. Infraestructura y despliegue**

En este proyecto, **«despliegue» (Entrega 3) significa artefacto reproducible**: el mismo `docker-compose` que usa quien evalúa, más CI que comprueba que sigue funcionando. No hay servicio web público permanente.

```mermaid
flowchart LR
    DEV["Local<br/>npm run up<br/>Postgres + pgvector"]
    GH["GitHub<br/>fork de la plantilla"]
    CI["GitHub Actions<br/>lint · tipos · arquitectura · migraciones · tests · verify · e2e · mutación · secretos"]
    DB[("Postgres<br/>en Compose / CI")]
    LLM["LLM opcional<br/>Ollama u otro"]

    DEV --> GH --> CI
    DEV --> DB
    CI --> DB
    DEV -.-> LLM
```

> **Decisión (5 sep 2026).** Antes: el diagrama incluía registro de imágenes → servidor propio + proxy TLS + API LLM obligatoria. Ese destino de hosting se **descartó para la evaluación** (coste, dominio, punto único de fallo). El Compose local sigue siendo el artefacto único de ejecución.

#### Proceso de verificación continua

Cada pull request y cada push a una rama de entrega ejecutan, en `.github/workflows/ci.yml`:

| Job | Qué comprueba |
|---|---|
| `scope` | Qué ficheros cambia un push a un PR abierto: si solo toca documentación (`openspec/**`, `docs/**`, `*.md`) y el commit anterior estaba en verde —por ejemplo, el commit de `/opsx:archive`—, salta `quality`, `verify`, `mutation` y `e2e`. Al abrir o reabrir un PR, y en cada push a una rama de entrega, corren siempre |
| `quality` | ESLint, `tsc` (`npm run typecheck`), la regla de dependencias con `dependency-cruiser`, migraciones aplicadas y revertidas, la suite de Vitest con PostgreSQL en contenedor (con los tests de los hooks del kit), el resumen de cobertura informativo (`Coverage summary (informative)`), los presupuestos de tiempo (`Timing budgets`) y el tiempo de los hooks (`Hook timing`) |
| `verify` | `db:migrate`, `db:seed` y **`npm run verify`** sobre una base propia: las golden contra el código actual, sin LLM (DIS-44) |
| `e2e` | `db:migrate`, `db:seed` y `npm run test:e2e` (Playwright, Chromium) sobre su propia base (`e2e`), con la API y la web que arranca la suite en modo evaluación; sube el informe de Playwright si falla (DIS-75) |
| `mutation` | Stryker sobre los caminos críticos, con umbral de rotura 80: incremental en los PR y en cada push; la pasada completa (`test:mutation:full`) solo se lanza a mano (`workflow_dispatch`). Se salta si el cambio no toca código mutado |
| `secrets` | `gitleaks` 8.30.1 sobre el árbol y los commits del evento (DIS-87) |

`frontend.yml` ejecuta las comprobaciones de la web cuando cambia código de frontend. `claude-auto-review.yml` y `claude-interactive.yml` vienen del kit y están en el repositorio, pero **no están activados** en GitHub (dependen de la variable `CLAUDE_ENABLED` y de una clave que no se han configurado), así que no cuentan como evidencia de uso. No hay `Dockerfile`: `docker-compose.yml` solo levanta PostgreSQL con la imagen `pgvector/pgvector:pg16` para [1.4](#14-instrucciones-de-instalación), y los jobs `quality`, `verify` y `e2e` de CI levantan esa misma imagen como contenedor de servicio.

#### Dos entornos de ejecución

| Entorno | Cómo se levanta | Para qué sirve | Garantía |
|---|---|---|---|
| **Local** | `npm run up` — Docker y Node, en PowerShell o Bash | Que quien evalúe pruebe el sistema y la CLI | **Única vía de evidencia.** No depende de un servidor de la autora |
| **CI** | GitHub Actions con Postgres en contenedor | Que el artefacto no se rompa en cada push | Automatizada; misma semilla / verify |

**Que local y CI usen el mismo Compose (o el mismo servicio Postgres + las mismas migraciones/semillas) es deliberado**: elimina la clase de fallo «en mi máquina funciona».

#### Modo evaluación / híbrido LLM

| Tipo de consulta | Comportamiento | Coste |
|---|---|---|
| Una de las 6 preguntas sugeridas (sin LLM) | Se sirve desde las respuestas *golden* versionadas en `seeds/cache/`, que `db:seed` carga en la caché (DIS-26 y DIS-32: Q1, Q3 y Q4 de acme-shop y Q1, Q2 y Q3 de task-api, las de `packages/web/src/data/suggested-questions.ts`) | **0 $** |
| Informe de impacto (`impact`) | Determinista: lee el grafo, sin LLM (DIS-90) | **0 $** |
| Deriva documental de todo el proyecto (`drift acme-shop`) | Sirve el informe *golden* de `seeds/drift/acme-shop.json` (DIS-73) | **0 $** |
| Pregunta ya respondida, escrita igual salvo mayúsculas, tildes, signos o espacios | Acierto de caché exacto por la pregunta normalizada (DIS-21), en modo vivo y en modo evaluación; `useCache: false` lo salta | **0 $** |
| Pregunta libre semánticamente equivalente a una cacheada | Acierto de caché por similitud de embedding (DIS-67): solo en modo vivo con `LLM_EMBED_MODEL` configurado, tras no acertar la clave exacta, con similitud coseno ≥ 0,85 sobre las entradas del proyecto; en modo evaluación solo hay acierto exacto; `useCache: false` lo salta | **0 $** |
| Pregunta libre nueva | Requiere LLM configurado (Ollama u otro); opcionalmente con presupuesto si el proveedor es de pago | 0 $ con Ollama; acotado con cloud |
| Sin LLM y pregunta no cacheada | Aviso claro: modo solo-caché / configurar `LLM_*` | 0 $ |

Así la evaluación es siempre utilizable sin cuenta de proveedor. La métrica de acierto de caché se muestra en la propia interfaz cuando aplica. Con Ollama, F5 puede mostrar tokens y ahorro frente a contexto bruto; el coste en USD puede ser 0.

#### Secretos

Solo por variables de entorno. `.env` en `.gitignore`, `.env.example` sin valores reales. Ninguna clave en el repositorio ni en la imagen. No hay gestor de secretos de hosting porque no hay despliegue público.

### **2.5. Seguridad**

Referencias normativas: **OWASP Top 10 for LLM Applications (2025)** y **OWASP Top 10 for Agentic Applications (edición 2026)**.

#### 1. El sistema es de solo lectura, por diseño

No existe ninguna herramienta con efectos secundarios: ni escritura de ficheros, ni ejecución de comandos, ni peticiones de red arbitrarias. Es la mitigación más eficaz de la inyección indirecta de prompt, porque **elimina la clase de ataque** en lugar de intentar detectarla. Que CODEMIND no modifique código es una decisión de seguridad antes que una limitación de alcance.

#### 2. Agente en cuarentena

El contenido del repositorio no es de confianza: un comentario, un mensaje de commit o el cuerpo de un issue puede contener instrucciones dirigidas al modelo. El componente que procesa ese contenido **no puede invocar herramientas** y solo devuelve datos conformes a esquema.

La cuarentena está en core (`packages/core/src/explain/statement-schema.ts`, DIS-38). La salida del modelo se comprueba, nunca se interpreta, y cualquier fallo la descarta **entera**:

```ts
const result = parseModelOutput(llmText, knownEvidenceIds); // ids E1…En que el prompt dio al modelo
if (!result.ok) {
  logger.warn(result.event);       // lo escribe el transporte; core no escribe en ningún log
  return unknown('invalid-model-output'); // política UNKNOWN: DIS-39
}
```

1. Tamaño: más de 64 KiB en UTF-8 se rechaza sin llegar a `JSON.parse` (`output_too_large`).
2. JSON válido (`invalid_json`): la salida entera, o el contenido de **una única** valla Markdown (```` ``` ```` o ```` ```json ````) que la envuelva por completo, con solo espacios JSON alrededor (espacio, tabulador, CR, LF), porque algunos modelos envuelven así su JSON (DIS-72). Cualquier texto fuera de la valla, dos vallas o una valla sin cerrar siguen siendo `invalid_json`; el tamaño y el evento de auditoría usan la salida tal como llega.
3. Esquema estricto en todos los niveles (`z.strictObject`): `answer` y `statements[{ text, evidenceIds }]`, sin campo `type`, porque el tipo de cada afirmación lo decide la regla hecho/inferencia y no el modelo. Una clave extra da `invalid_shape`; un `evidenceIds` vacío, `empty_evidence`; superar un límite (`answer` 2000, 20 afirmaciones, `text` 500, 10 citas; longitudes en code points), `limit_exceeded`.
4. Ningún id citado dos veces en una afirmación (`duplicate_evidence_id`) y ninguno que el prompt no diera (`unknown_evidence_id`).

El evento `schema_violation` (`stage: 'l2_inference'`) lleva el subcódigo, el tamaño en bytes, el SHA-256 de la salida (para correlacionar, no para anonimizar) y, de cada fallo, solo su ruta y su código: como mucho 20 issues, con `issueCount` para el total, de modo que el tamaño del evento no depende de la salida. **Nunca** lleva la salida ni ningún fragmento suyo: ni valores, ni mensajes del validador, ni nombres de claves inesperadas, que los habría escrito el modelo.

Una afirmación es `FACT` solo si todas las evidencias que cita llegaron al contexto como ancla o por aristas `exact`; una sola `heuristic` la convierte en `INFERENCE` (`typing-rules.ts`).

A la entrada, la pregunta y cada span del pack se sanean antes del prompt (`packages/core/src/explain/sanitize.ts`, DIS-41), sin bloquear nada:

- **Delimitación.** Cada texto va entre marcadores fijos, `<<<UNTRUSTED_DATA E1>>>` … `<<<END_UNTRUSTED_DATA E1>>>` (o `question`), y el system prompt declara que lo delimitado es dato y nunca instrucción. Una secuencia de marcador dentro del texto, de la pregunta o de la ruta del fichero (que también viene del repositorio y va junto a los marcadores) se neutraliza en el prompt insertando U+200B tras su primer `<`, de modo que el texto no puede cerrar su marcador; lo mismo con un `[TRUNCATED:` escrito en el repositorio, para que no pase por la marca real. Ningún otro carácter cambia (un heredoc de PHP o un `>>>` llegan intactos). Los marcadores son deterministas: la misma pregunta y el mismo pack dan el mismo `promptHash`.
- **Tamaño.** Un span de más de 8000 code points (`MAX_EVIDENCE_TEXT_CHARS`, provisional) se recorta en la última línea completa que cabe, o en code points si la primera línea sola no cabe; el prompt lleva la marca `[TRUNCATED: …]`. El span recortado es el span en todo lo que sigue: un claim nunca cita líneas que el modelo no vio.
- **Patrones.** Cuatro patrones burdos, por línea (también partida en `\r`, U+2028 y U+2029) y sobre el texto conservado y la ruta: `ignore-instructions`, `role-override`, `system-impersonation` y `delimiter-spoof`. Una coincidencia no cambia el texto: añade `flags` (o `questionFlags`) a la entrada del prompt. Se aceptan falsos positivos, como claves YAML `system:` o comentarios `// ignore all lint rules`, y falsos negativos.
- **Eventos.** `untrusted_content_flagged` (origen, id de evidencia, ruta, línea, código) y `untrusted_content_truncated` (id, ruta, última línea original y conservada) van primero en los eventos de toda respuesta que llegó al prompt, y el CLI los escribe en stderr. Nunca llevan el texto, un prefijo ni un hash.

#### 3. Los secretos no entran en el índice

La detección se ejecuta **antes de indexar**, no antes de enviar al modelo. Un secreto que nunca entra en la base de datos no puede filtrarse por una consulta posterior.

Core aplica cuatro reglas por prioridad (`private-key`, `jwt`, `aws-access-key-id`, `generic-high-entropy`) y sustituye solo el tramo del secreto, sin cambiar el número de líneas. Los eventos se devuelven como datos; core no escribe en ningún log, eso lo hace el transporte (CLI o API) con su logger estructurado.

```ts
const { file: safe, redacted, events } = redactSecrets(file); // contenido con '[REDACTED: possible secret]'
// events: [{ type: 'secret_redacted', file, line, column, rule }] — nunca el valor, un prefijo ni un hash
for (const event of events) logger.info(event);
```

Las respuestas *golden* versionadas (DIS-26) solo contienen respuestas del modelo sobre fragmentos ya redactados de la muestra sintética, y aun así `npm run cache:build` descarta, sin reintentar, cualquier respuesta cuyo JSON contenga el patrón `AKIA[A-Z0-9]{16}`, la ruta absoluta del repositorio o del espacio de trabajo, `DATABASE_URL`, `LLM_BASE_URL` o `LLM_API_KEY` (`GOLDEN_NOT_CACHEABLE` con motivo `unsafe-content`); un test comprueba además que el fichero versionado no lleva ese patrón. `db:seed` valida cada fichero antes de conectar y lo guarda con el SQL parametrizado del almacén, solo para los proyectos de muestra.

#### 4. Validación de entrada y prevención de *path traversal*

Todos los endpoints validan con Zod antes de que los datos lleguen al dominio. Las rutas de repositorio se normalizan y se comprueba que resuelven dentro del directorio permitido.

La comprobación usa `path.relative`, no `startsWith`: con `startsWith`, `/repos-evil` pasaría por estar dentro de `/repos`. `ALLOWED_REPOS_DIR` lo lee solo la raíz de composición; si está vacío, el indexado queda deshabilitado.

```ts
// core: confinePath(requested, allowedRoot)
const root = path.resolve(allowedRoot);          // IndexingDisabled si allowedRoot está vacío
const resolved = path.resolve(root, requested);
const rel = path.relative(root, resolved);
if (rel !== '' && (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))) {
  throw new ForbiddenPathError(requested);
}
```

#### 5. Aislamiento por proyecto

Cada consulta lleva su `project_id` y toda consulta al almacén lo filtra. Ninguna respuesta puede mezclar información de dos repositorios distintos — relevante cuando uno de ellos es privado.

#### 6. Límite de uso y protección de la cuota

*Rate limiting* por IP y, si el LLM es un proveedor cloud de pago, presupuesto diario global de gasto, para que un uso intensivo en local (o una futura exposición) no agote la cuota. Al alcanzar el techo, el sistema deja de llamar al modelo y degrada a modo solo-caché con aviso, sin caerse: `POST /ask` responde `429 BUDGET_EXHAUSTED` con `details.cacheOnly: true` (DIS-78); lo que no necesita llamar al modelo (por ejemplo, un `UNKNOWN` `no-anchor`) sigue contestando, y desde DIS-21 también una pregunta que ya está en la caché de respuestas: la caché se consulta antes de cualquier llamada al modelo, así que responde `200` con el techo agotado; con `useCache: false` o sin entrada, el techo agotado sigue respondiendo `429`. Con Ollama local el presupuesto en USD no aplica.

El límite (DIS-76) cuenta, en memoria, las peticiones de cada IP —la del socket: `X-Forwarded-For` y similares se ignoran— dentro de una ventana: **30 peticiones cada 60 s** por defecto (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`). La petición que lo supera recibe `429 RATE_LIMITED` con `details.retryAfterSeconds` y la cabecera `Retry-After`, sin llegar al dominio. Cuenta toda petición a una ruta limitada, también las rechazadas por validación; `/health`, `/docs` y todo lo que cuelga de `/docs/` no se limitan ni se cuentan, y tampoco una petición a una ruta que no existe (`404`). Los contadores se reinician al reiniciar la API (un único proceso local); el techo de gasto, en cambio, vive en la base de datos.

#### Riesgos aceptados, declarados

La sanitización de contenido no confiable es **defensa en profundidad, no una barrera**: en un LLM no existe separación real entre datos e instrucciones dentro del prompt, y cualquier detector de inyecciones tiene falsos negativos (la de CODEMIND, descrita en la práctica 2, solo delimita, recorta y marca). Lo que protege de verdad es que el agente no disponga de herramientas con efectos secundarios (práctica 1) y que su salida se valide por esquema (práctica 2).

#### Protección de datos (RGPD)

El historial de Git contiene nombres y direcciones de correo de contribuidores, que son **datos personales**. Medidas adoptadas:

- El autor de un commit se almacena **seudonimizado** (hash con sal). No se indexan nombres ni correos.
- **No se realiza ningún análisis por individuo.** Una funcionalidad candidata —detectar qué personas concentran el conocimiento de un módulo— se descartó por este motivo y porque es sensible en el plano laboral.
- Los repositorios de muestra se generan con autores ficticios.
- El repositorio privado que se usa como validación tiene **17 autores distintos** en su historial. Solo se indexó en local: en la base de datos quedan sus `author_hash`, nunca nombres ni correos, y la [observación](docs/measurements/private-repo-observation.md) publica únicamente cifras agregadas, sin nombre del proyecto, código ni personas.

### **2.6. Tests**

Los tests forman parte de la **definición de hecho de cada ticket**, no de una fase final.

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| **Arquitectura** | `dependency-cruiser` en CI | Que `core` no importe de `adapters`, `analyzers` ni `api`. **Falla el build si se rompe** |
| Unitarios | **Vitest** | Context Engine (presupuesto respetado, ranking), verificador de evidencias, reglas de tipado hecho/inferencia, confianza, caché, impacto, deriva, reindexado, analizadores PHP y TypeScript, API y componentes web (RTL + jsdom) |
| Integración | Vitest + PostgreSQL en contenedor | Indexado de `acme-shop` y `task-api`, reindexado, travesía del grafo, impacto y deriva, `/ask`, `/impact`, `/index` y `/health`, migraciones reversibles, git real en repositorios temporales |
| Accesibilidad | axe-core + jsdom (`npm run test:a11y`) | Cada ruta de la web sin violaciones de axe: selección de proyecto, consulta e impacto (`project-picker`, `ask-page`, `impact-page`; DIS-58) |
| Hooks del kit | Vitest (`tests/harness`) | Los hooks de `.claude/hooks/` y el modo autónomo (DIS-106); en CI, dentro de `quality` |
| Cobertura (informativa) | V8 (`npm run test:coverage`) | Resumen por paquete, sin umbral: la puerta es la mutación ([`docs/TESTING.md`](docs/TESTING.md#cobertura), DIS-77) |
| **Mutación** | **Stryker** | Que los tests detecten cambios en el código de los caminos críticos; umbral de rotura 80 |
| **E2E** | **Playwright** (`npm run test:e2e`) | El flujo elegir proyecto → preguntar → evidencia y coste, el caso `UNKNOWN`, el informe de impacto y axe a 320 y 1280 px sobre la pantalla 2, con la API y la web arrancadas por la suite sobre la semilla (DIS-75) |
| **Prueba de humo** | `npm run verify` | Cada golden de `acme-shop` y de `task-api` comparada por estructura con la respuesta servida, sin LLM (DIS-44) |
| Estáticos | ESLint + `tsc --noEmit` | En CI |

**Estado medido (04-11-2026).** `npx vitest run` en local (todos los proyectos de Vitest, incluidos los tests de los hooks del kit) con la base de datos de pruebas `codemind_test` (`docs/TESTING.md`): **2 796 tests en 267 ficheros, todos en verde**, sin ninguno saltado. Sin `DATABASE_URL`: 235 ficheros pasan y 32 se saltan; **2 443 tests pasan** y 301 se saltan (los de integración, que necesitan base de datos; en CI corren con PostgreSQL). Mutación: **93,76 %** en el último job `mutation` de CI en `final-project-CRN` (incremental); la última pasada completa, en local con DIS-69, dio 92,76 %.

**`npm run verify` cumple una función doble:** es un test de integración en CI **y** el mecanismo por el que alguien externo comprueba que su instalación local reproduce lo documentado. Los wireframes de [1.3](#13-diseño-y-experiencia-de-usuario) muestran el diseño de las pantallas, no el sistema en marcha, y no se aporta vídeo: **la evidencia de funcionamiento es ejecutable**, y esta es la pieza que la hace comprobable en un solo comando.

**Los dos repositorios de muestra son también el arnés de pruebas.** Uso cuádruple: tests deterministas, arranque local sin dependencias de LLM, caso de la funcionalidad F6, y material de `npm run verify` / `docs/DEMO.md`. `acme-shop` incluye a propósito una divergencia entre documentación y código, y una regla de negocio implementada y cubierta por tests pero sin documentar.

**Objetivo de cobertura:** >80 % en `packages/core`, >70 % en `analyzers`. No se persigue cobertura alta en adaptadores de infraestructura. Desde DIS-77 la cobertura se mide y se publica, pero es informativa y no es una puerta ([`docs/TESTING.md`](docs/TESTING.md#cobertura)). Medición del 02-11-2026, sin base de datos: `core` 99,8 % de líneas, `analyzers/php` 100 %, `analyzers/typescript` 98,2 % y 94,3 % en total (`adapters/store-postgres` se queda en 44,2 % porque sus tests de integración se saltan sin base de datos).

#### Mediciones que se publicarán

Las dos tablas ya están medidas y publicadas. La columna «Correctas» de la Tabla 1 sale de la revisión de las 40 respuestas por dos agentes revisores (DIS-82), congelada por hash y comprobada por `tests/unit/docs/answer-review.spec.ts`. La Tabla 2 la rellena `npm run measure:graph` (DIS-79) a partir de la semilla `seeds/graph-dump.sql` y de las anotaciones congeladas, y `tests/unit/docs/graph-quality.spec.ts` falla si sus cifras dejan de coincidir con la medición. La Tabla 1 la rellena `npm run measure:context` (DIS-81) con 20 preguntas congeladas por repositorio, hechas a la API con un modelo local, y `tests/unit/docs/context-savings.spec.ts` falla si sus cifras dejan de ser la agregación de los datos en bruto versionados.

**Tabla 1 — Ahorro de contexto** (20 preguntas por repositorio)

| Repositorio | Contexto bruto | CODEMIND | Ahorro | Correctas (de 20) |
|---|---|---|---|---|
| `acme-shop` (PHP/Laravel) | 86 355 | 116 025 | -34,4 % | 10 |
| `task-api` (TypeScript) | 52 420 | 85 200 | -62,5 % | 12 |

- `acme-shop`: 17 respondidas y 3 UNKNOWN (invalid-model-output 1, no-anchor 2); verificación 28,1 % de los tokens y 18,2 % del tiempo; coste de verificación n/a (0 USD con Ollama local); latencia mediana 162,5 s (verificación 24,7 s)
- `task-api`: 16 respondidas y 4 UNKNOWN (invalid-model-output 2, no-anchor 2); verificación 36,3 % de los tokens y 24,1 % del tiempo; coste de verificación n/a (0 USD con Ollama local); latencia mediana 93,6 s (verificación 11,5 s)
- Desviación de `baselineTokens` (chars/4) frente al tokenizador de `qwen2.5-coder:latest` en 89 ficheros: +2,4 % en total (mínimo -31,2 %, máximo +43,3 % por fichero)
- `acme-shop`: 10 correctas, 9 parciales, 1 incorrectas (de 20); concordancia entre revisores 95 % (19/20), kappa 0,908
- `task-api`: 12 correctas, 2 parciales, 6 incorrectas (de 20); concordancia entre revisores 90 % (18/20), kappa 0,826

La columna «Correctas» cuenta solo las respuestas que dos agentes revisores independientes de modelos distintos, ciegos entre sí, juzgaron `correct` contra el código del repositorio de ejemplo, con un criterio escrito antes de leer ninguna respuesta y con un tercer agente para los tres desacuerdos. El criterio, las salidas, los veredictos de las 40 respuestas y los hashes están en [`docs/measurements/answer-review.md`](docs/measurements/answer-review.md).

**Qué dice la columna «Correctas».** *(Texto del agente, DIS-82.)* De las 40 respuestas, 22 son correctas, 11 parciales y 7 incorrectas; solo las correctas entran en la tabla. En `acme-shop`, 9 de las 20 son parciales: lo central es cierto y falla una afirmación secundaria, por ejemplo una que el código contradice o que no tiene respaldo en él. En `task-api` hay más fallos de fondo: de las 6 incorrectas, 2 son respuestas `UNKNOWN` a preguntas que el código sí contesta (`invalid-model-output`) y 4 son respuestas con contenido que no contestan la pregunta o afirman algo que el código contradice. Las 4 respuestas `UNKNOWN` a preguntas cuyo `expected` es `unknown` cuentan como correctas, porque el repositorio no implementa lo que se pregunta. Son 40 respuestas de una sola ejecución juzgadas por modelos de una misma familia, con una concordancia alta pero con un kappa inestable a este tamaño: la columna describe estas respuestas, no la calidad del producto en general, y no se ha ajustado ninguna cifra.

**Por qué CODEMIND envía más tokens que el contexto bruto.** *(Texto del agente, DIS-81.)* En estos dos repositorios de muestra, creados a propósito y pequeños (sus ficheros tienen entre decenas y unos pocos cientos de tokens), el contexto bruto de una respuesta son los pocos ficheros que cita, y CODEMIND envía además el prompt de sistema, los fragmentos con sus metadatos y una o varias llamadas de verificación (el 28,1 % y el 36,3 % de los tokens enviados). Con ficheros así de cortos eso pesa más que lo que se ahorra al no mandar el resto del repositorio. El ahorro es una medición, no una promesa: no se ha ajustado ninguna cifra, y con repositorios grandes (donde el contexto bruto crece con el tamaño y el paquete no) el signo puede cambiar, algo que esta medición no comprueba. El método, el entorno y las limitaciones están en [`docs/measurements/context-savings.md`](docs/measurements/context-savings.md); los datos en bruto, el CSV y el JSON, en `docs/measurements/context/`.

**Tabla 2 — Calidad del grafo por analizador** (50 sitios de llamada por lenguaje anotados por dos agentes independientes; [método, concordancia y hashes](docs/measurements/annotation-agreement.md))

| Analizador | Cobertura | Precisión | Aristas `exact` | Aristas `heuristic` |
|---|---|---|---|---|
| PHP/Laravel | 77,4 % (24/31) | 100,0 % (24/24) | 47 | 17 |
| TypeScript | 100,0 % (26/26) | 100,0 % (26/26) | 37 | 0 |

Concordancia entre los dos agentes anotadores (de `docs/measurements/annotation/agreement.json`):

- `acme-shop`: concordancia 100 % (50/50), kappa 1
- `task-api`: concordancia 100 % (50/50), kappa 1

Método, definiciones, desglose por construcción, sitios fallados y limitaciones: [`docs/measurements/graph-quality.md`](docs/measurements/graph-quality.md).

La Tabla 2 es la medición más interesante del proyecto: TypeScript sale mejor (cobertura del 100 % frente al 77,4 % de PHP, las dos con precisión del 100 %) porque el compilador resuelve referencias, mientras PHP depende de heurísticas sobre las convenciones de Laravel. **Medir el límite del propio sistema y explicar por qué existe es mejor material que ocultarlo**, y da contenido concreto al primer sacrificio de [2.1](#21-diagrama-de-arquitectura).

**Limitaciones a declarar junto a las tablas:** una sola ejecución, sin repeticiones; preguntas de la Tabla 1 escritas por un agente y congeladas antes de la ejecución (el hash está en el informe), con un modelo local de 7,6B parámetros; `baselineTokens` es una estimación local (chars/4, PH-16) cuya desviación medida se da bajo la tabla; la relación de verificación se mide por tokens y latencia (PH-27) y una verificación respondida desde la caché en memoria de la API no cuesta ningún token; anotación de los sitios de llamada de la Tabla 2 realizada por dos agentes anotadores independientes de modelos distintos (DIS-80); veredictos de corrección de la Tabla 1 dados por dos agentes revisores independientes de modelos distintos (DIS-82); repositorios de muestra pequeños y creados a propósito. No son resultados de investigación, son mediciones de producto.

---

## 3. Modelo de Datos

### **3.1. Diagrama del modelo de datos:**

```mermaid
erDiagram
    PROJECT ||--o{ FILE : contains
    PROJECT ||--o{ COMMIT : has
    PROJECT ||--o{ CLAIM : has
    PROJECT ||--o{ QUERY_LOG : records
    PROJECT ||--o{ CACHE_ENTRY : caches
    FILE ||--o{ SYMBOL : declares
    FILE ||--o{ FILE_COMMIT : touched_in
    COMMIT ||--o{ FILE_COMMIT : touches
    PROJECT ||--o{ EDGE : scopes
    SYMBOL |o--o{ EDGE : source
    SYMBOL |o--o{ EDGE : target
    FILE |o--o{ EDGE : source
    FILE |o--o{ EDGE : target
    CLAIM ||--|{ EVIDENCE : supported_by
    FILE ||--o{ EVIDENCE : located_in

    PROJECT {
        uuid id PK
        text name "not null, unique"
        text root_path "not null"
        text language "enum: php, typescript — not null"
        text framework "nullable: laravel, fastify, none"
        boolean is_sample "true para los repositorios de muestra"
        text indexed_commit "sha del último indexado"
        int node_count
        int edge_count
        timestamptz indexed_at
        timestamptz created_at
    }

    FILE {
        uuid id PK
        uuid project_id FK "not null, on delete cascade"
        text path "not null, unique(project_id, path)"
        text kind "enum: source, test, doc, config — not null"
        int loc
        text content_hash "sha256 — detecta cambios en reindexado"
        boolean redacted "true si contenía secretos"
        vector embedding "pgvector(768), nullable"
    }

    SYMBOL {
        uuid id PK
        uuid file_id FK "not null, on delete cascade"
        text name "not null"
        text kind "enum: class, interface, method, function, route"
        int start_line "not null, check > 0"
        int end_line "not null, check >= start_line"
        text signature
        vector embedding "pgvector(768), nullable"
    }

    EDGE {
        uuid id PK
        uuid project_id FK "not null, on delete cascade"
        uuid source_symbol_id FK "nullable — exactamente uno de source_symbol_id / source_file_id"
        uuid source_file_id FK "nullable"
        uuid target_symbol_id FK "nullable — exactamente uno de target_symbol_id / target_file_id"
        uuid target_file_id FK "nullable"
        text kind "enum: calls, imports, extends, implements, tested_by, co_changed, describes"
        text resolution "enum: exact, heuristic — not null"
        text extractor "not null, no vacío — qué componente creó la arista"
        float weight "nullable, check 0..1 — co_changed: frecuencia"
    }

    COMMIT {
        uuid id PK
        uuid project_id FK "not null, on delete cascade"
        text sha "not null, unique(project_id, sha)"
        text message
        text author_hash "SEUDONIMIZADO — sin nombre ni correo"
        timestamptz committed_at
        int pr_number "nullable"
    }

    FILE_COMMIT {
        uuid file_id PK, FK "clave primaria compuesta, on delete cascade"
        uuid commit_id PK, FK "clave primaria compuesta, on delete cascade"
        int lines_added
        int lines_removed
    }

    CLAIM {
        uuid id PK
        uuid project_id FK "not null, on delete cascade"
        text subject "not null"
        text predicate "not null"
        text object
        text layer "enum: L1, L2 — not null"
        text type "enum: FACT, INFERENCE, UNKNOWN — not null"
        float confidence "check 0..1 — calculado, no autoinformado"
        text status "enum: current, stale — default current"
        jsonb provenance "obligatorio si layer = L2"
        timestamptz created_at
        timestamptz updated_at
    }

    EVIDENCE {
        uuid id PK
        uuid claim_id FK "not null, on delete cascade"
        uuid file_id FK "not null, on delete cascade"
        int start_line "not null, check > 0"
        int end_line "not null, check >= start_line"
        text verification "enum: none, cited, entailed, broken — not null"
        text excerpt "fragmento exacto citado, congelado"
    }

    QUERY_LOG {
        uuid id PK
        uuid project_id FK "not null, on delete cascade"
        text question "not null"
        text capability "enum: explain, impact, drift — not null, drift (F6, DIS-73)"
        int input_tokens
        int output_tokens
        int baseline_tokens "coste que habría tenido el contexto bruto"
        numeric cost_usd "precision 10,6"
        int latency_ms
        boolean cache_hit "default false"
        timestamptz created_at
        int verify_input_tokens "desglose de verificación (PH-27)"
        int verify_output_tokens
        numeric verify_cost_usd "precision 10,6"
        int verify_calls "llamadas del verificador resueltas"
        int verify_latency_ms "tiempo del chequeo semántico"
    }

    CACHE_ENTRY {
        uuid id PK
        uuid project_id FK "not null, on delete cascade"
        text question_normalized "not null"
        vector question_embedding "pgvector(768) — acierto por similitud"
        jsonb response "respuesta completa serializada"
        int hit_count "default 0"
        timestamptz created_at
        timestamptz last_hit_at
    }
```

### **3.2. Descripción de entidades principales:**

#### PROJECT

Un repositorio indexado. `indexed_commit` decide el reindexado sin cambios: si ningún `content_hash` cambió y `HEAD` sigue siendo `indexed_commit`, el reindexado incremental (DIS-10) no analiza nada y solo vacía la caché; si algo cambió, se vuelve a analizar el repositorio completo y se guarda la foto entera. El plan por hash solo determina `filesQueued` y `filesSkipped` (`packages/core/src/index/reindex-project.ts`, `incremental-plan.ts`). `language` selecciona el analizador a través de `AnalyzerPort`. `is_sample` distingue los repositorios de muestra, que se cargan por semilla y se ofrecen en la pantalla de selección. Cada guardado del grafo (`StorePort.saveGraph`, DIS-23) fija `indexed_commit`, `indexed_at`, `node_count` (ficheros + símbolos) y `edge_count` (aristas), y no toca nada más: `framework` se fija al crear el proyecto.

#### FILE

`content_hash` (SHA-256 del contenido ya redactado, para que el hash nunca dependa de un secreto) alimenta el plan del reindexado incremental y es el disparador de la invalidación de afirmaciones; no sirve para saltarse ficheros uno a uno: si alguno cambió, se analiza el repositorio completo. `kind` distingue fuente, test, documentación y configuración porque el Context Engine los pondera de forma distinta: para una pregunta de comportamiento, un test pesa más que un README. `redacted` marca ficheros de los que se eliminó un secreto. El grafo se guarda como una foto completa del proyecto: cada fichero se actualiza en su sitio por `(project_id, path)` y conserva su `id`, con lo que se mantienen su historial y las evidencias que lo citan; los ficheros que ya no están en la foto se borran (DIS-23).

#### SYMBOL

Clase, interfaz, método, función o ruta. `start_line` y `end_line` delimitan el **span**, que es la unidad de contexto del sistema: nunca se envía un fichero completo si basta un span. Es el mecanismo concreto del ahorro de tokens. La base de datos no guarda el texto: el Context Engine lo lee de git en el `indexed_commit` del proyecto, así que `start_line` y `end_line` siempre casan con el contenido (DIS-28, ADR `docs/adr/20261011-span-text-read-from-git-at-indexed-commit.md`).

#### EDGE

La tabla central del grafo. Dos campos la hacen especial:

- **`resolution`** (`exact` | `heuristic`) es obligatorio y decisivo. Solo las aristas `exact` pueden sustentar una afirmación de tipo `FACT`. Una llamada resuelta por convención de Laravel —una facade, un binding del contenedor— es `heuristic` y degrada la afirmación a `INFERENCE`. Es la traducción a esquema de la honestidad epistémica del producto. Se eligió un enum de dos valores en lugar de una puntuación continua porque una puntuación obligaría a fijar umbrales que no se pueden justificar con datos y daría una precisión aparente que el sistema no tiene.
- **`extractor`** permite auditar el origen de cada arista, y es lo que hace comparables los dos analizadores en la Tabla 2 de [2.6](#26-tests).

Cada extremo de la arista apunta a un `SYMBOL` **o** a un `FILE` (una importación o un `describes` desde un documento no tienen símbolo). En lugar de una columna polimórfica sin clave foránea, cada extremo tiene dos claves foráneas anulables —`source_symbol_id` / `source_file_id` y `target_symbol_id` / `target_file_id`— y un `CHECK (num_nonnulls(...) = 1)` exige exactamente una por extremo. Así la integridad referencial y el borrado en cascada los garantiza la base de datos. La base de datos **no** comprueba que los extremos pertenezcan al mismo proyecto que `edge.project_id`: es un riesgo aceptado en L1 y la coherencia es responsabilidad de los analizadores que escriben el grafo ([ADR](docs/adr/20260928-edge-endpoints-as-fk-pairs.md)).

#### COMMIT

`author_hash` almacena el autor **seudonimizado**, no su nombre ni su correo: el historial de Git contiene datos personales y el producto no necesita identidades para funcionar. Es un HMAC-SHA256, con la sal `AUTHOR_HASH_SALT` como clave, del correo normalizado (sin espacios y en minúsculas; del nombre si el correo está vacío). Sin sal, el extractor no arranca. El mensaje se guarda sin los tráileres que identifican a personas (`Co-authored-by:`, `Signed-off-by:`…); el resto del texto libre del mensaje se guarda tal cual. `pr_number` se extrae del asunto del commit cuando está presente: el último `(#N)`, o `Merge pull request #N`, y solo entre 0 y 2147483647, el rango de la columna (DIS-35).

#### FILE_COMMIT

Tabla de unión entre `FILE` y `COMMIT`, con clave primaria compuesta. Parece un detalle de normalización y no lo es: **es de donde sale el `weight` de las aristas `co_changed`.** Dos ficheros que aparecen juntos en 8 de los 10 commits que tocan a cualquiera de los dos tienen una relación que ningún analizador estático puede ver, y esa señal es la que sostiene el informe de impacto en PHP/Laravel, donde las facades y el contenedor de servicios dejan huecos en el grafo de llamadas (ver el primer sacrificio de [2.1](#21-diagrama-de-arquitectura)).

`lines_added` y `lines_removed` permitirían ponderar: un commit que toca dos ficheros con 200 líneas cada uno es una señal más fuerte que uno que corrige una errata en ambos. La versión actual (DIS-36) no lo hace: el `weight` es el Jaccard de commits (commits compartidos entre commits que tocan a cualquiera de los dos), con al menos 2 commits compartidos y sin contar los commits de más de 100 ficheros. La ponderación por líneas queda para más adelante.

**Borrado en cascada.** Todas las claves foráneas de `COMMIT`, `FILE_COMMIT`, `CLAIM`, `EVIDENCE`, `QUERY_LOG` y `CACHE_ENTRY` usan `on delete cascade`, igual que las tablas del grafo L1: borrar un proyecto elimina su historial, sus afirmaciones, su registro de uso y su caché; borrar un fichero elimina sus filas de `FILE_COMMIT` y las evidencias que lo citan. Como en `EDGE`, la base de datos no comprueba que el fichero y el commit de `FILE_COMMIT`, ni el fichero citado por una `EVIDENCE`, pertenezcan al mismo proyecto; esa coherencia es responsabilidad de quien escribe.

#### CLAIM

Unidad de afirmación. `layer` y `type` son campos distintos a propósito: **`layer` dice de dónde salió la afirmación, `type` dice qué garantía tiene.** Fusionarlos impediría la restricción siguiente.

Dos restricciones se imponen **en la base de datos**, no solo en el código, para que un principio de diseño no se erosione con las prisas:

```sql
-- Una afirmación no puede ser un hecho si procede de la capa inferida
ALTER TABLE claim ADD CONSTRAINT fact_only_from_l1
  CHECK (type <> 'FACT' OR layer = 'L1');

-- Toda inferencia debe declarar su procedencia
ALTER TABLE claim ADD CONSTRAINT l2_requires_provenance
  CHECK (layer <> 'L2' OR provenance IS NOT NULL);
```

`provenance` registra modelo, hash del prompt, evidencias de entrada y marca temporal. `l2_requires_provenance` solo rechaza el `NULL` de SQL: un `null` JSON o cualquier otra forma de JSON pasa la restricción. La forma la valida en core `provenanceSchema` (DIS-38): `{ model, promptHash, inputSpans: [{ fileId, startLine, endLine }], createdAt }`, con el hash del prompt en SHA-256 hexadecimal, al menos un span de entrada y la marca temporal en ISO 8601 con zona; este esquema SQL no la comprueba. Los tipos de dominio (`claimSchema`) replican los dos `CHECK`, así que un `FACT` de capa `L2` ni compila ni pasa la validación. Una afirmación del modelo que la regla tipa `FACT` se guarda como `L2` `INFERENCE` y conserva su tipo en `provenance.statementType` (`FACT` o `INFERENCE`); la respuesta la sigue mostrando como `FACT` ([ADR](docs/adr/20261013-fact-statements-stored-as-l2-inference.md), DIS-39). `statementType` es obligatorio en `L2` `INFERENCE` y está prohibido en `L2` `UNKNOWN` y en `L1`; lo comprueba `claimSchema`, no la base de datos. Ningún texto de una afirmación o de una evidencia (sujeto, predicado, objeto, extracto, nombre del modelo) puede contener U+0000, que Postgres rechaza en `text` y `jsonb`: los registros lo rechazan antes de escribir, igual que la cuarentena de la salida del modelo. `created_at` y `updated_at` toman `now()` al insertar. `status = 'stale'` marca las afirmaciones cuya evidencia ha cambiado; se recalculan de forma perezosa (DIS-42): la primera pregunta respondida (`answered`) que las alcanza vuelve a inferirlas con una llamada `answer` por afirmación (como mucho 3 por pregunta, las más recientes), sobre los spans actuales del paquete que solapan su evidencia, las cuarentena, las tipa y las verifica como a una respuesta nueva, y las reescribe **en su propia fila** (mismo `id` y mismo `created_at`; objeto, tipo, procedencia, confianza y evidencia nuevos, `status = 'current'`, `updated_at` al instante de la escritura) solo si siguen `stale` y el commit leído sigue siendo el indexado ([ADR](docs/adr/20261029-stale-claims-refreshed-in-place.md)). Las que no se pueden recalcular se muestran `stale`, con un evento `stale_claim_not_refreshed` de código cerrado.

**Invalidación en la base de datos.** Cuando cambia el `content_hash` de un fichero (`IS DISTINCT FROM`: reescribir el mismo valor no cuenta; poner el primer hash sobre un `NULL` sí cuenta, y **vaciarlo a `NULL` también**, porque el contenido deja de conocerse), el trigger `file_content_hash_marks_claims_stale` pasa a `stale`, en la misma sentencia, todas las afirmaciones `current` con alguna evidencia que cite ese fichero, y les fija `updated_at = now()`. Las que ya estaban `stale` no se tocan, y el trigger nunca devuelve una afirmación a `current`: eso es trabajo del recálculo perezoso (CM-HU-09.4, DIS-42), que la primera pregunta respondida que la alcanza hace con `refreshClaim`, solo mientras la afirmación sigue `stale` y el commit leído es el indexado. `updated_at` tiene por tanto dos dueños: el trigger en el paso `current` → `stale`, y quien escribe en cualquier otra modificación. La invalidación es gruesa a propósito: cualquier cambio del fichero invalida todas sus citas, aunque el span citado no haya cambiado. Dispara igual con un `UPDATE` directo que con la rama `DO UPDATE` de un `INSERT … ON CONFLICT (project_id, path)`, el camino previsto para el reindexado. Borrar el fichero y volver a insertarlo, en cambio, no invalida nada: el borrado arrastra la evidencia (DIS-23). El trigger tampoco dispara al borrar: por eso `saveGraph`, cuando un fichero sale del snapshot, pasa antes a `stale` las afirmaciones `current` con evidencia sobre él, en la misma transacción, y solo después lo borra (DIS-23). La garantía cubre solo la evidencia que la sentencia del cambio puede ver: la ya confirmada, o la escrita antes en la misma transacción. No cubre la evidencia de otra transacción aún sin confirmar, ni la que se infirió del contenido anterior y se escribe tarde. Por eso, quien escribe evidencia bloquea la fila del proyecto (`FOR SHARE`; el guardado del grafo la bloquea `FOR UPDATE`, así que espera) y comprueba que el commit leído sigue siendo el `indexed_commit`; si no, la afirmación se guarda `stale` (DIS-39, DIS-42).

##### Cómo se calcula `confidence`

El comentario del esquema dice *«calculado, no autoinformado»*, y conviene explicar por qué y cómo. **La confianza no la produce el modelo.** Un valor pedido al LLM está mal calibrado por defecto (referencia 4) y no es defendible: parece una medida y es una opinión, con el agravante de que su forma numérica invita a confiar en ella. Aquí se calcula a partir de señales observables del grafo y del verificador:

```text
confidence = σ( w₁·evidencias_norm         # nº de evidencias que superan la verificación
              + w₂·diversidad_de_fuentes   # tipos distintos: código / test / historial / doc
              + w₃·confirmacion_cruzada    # ¿código y test concuerdan?
              + w₄·calidad_de_resolucion   # proporción de aristas 'exact' en la cadena
              + w₅·entailment              # salida del verificador de evidencias
              − w₆·contradiccion )         # existe evidencia contraria
```

σ es una sigmoide, que acota el resultado al intervalo (0, 1). Los pesos se fijan **una sola vez**, a mano, sobre las preguntas de desarrollo de los repositorios de muestra, y se publican con su valor y su motivo en `docs/CONFIDENCE.md`. No se reajustan después contra las preguntas con las que se mide.

**Dónde vive el valor (DIS-72).** Es una sola función, `packages/core/src/knowledge/confidence.ts`, aplicada a un conjunto de afirmaciones. Aplicada a cada afirmación por separado da el `confidence` que se guarda en su `CLAIM`; aplicada a todas las afirmaciones de la respuesta da `answer.confidence`, presente en toda respuesta con afirmaciones (guardada o no). Una respuesta `UNKNOWN` no lleva confianza. `ask` no la imprime todavía. Hoy dos términos valen siempre 0: `contradiccion` (`drift`, DIS-71, encuentra contradicciones pero no las guarda, así que la señal sigue en 0), y la parte de `historial` de la diversidad, porque ninguna evidencia cita aún commits; por eso la diversidad llega como mucho a 0,75. Sin ninguna señal el valor es exactamente 0,5. Los seis términos, sus definiciones exactas y los límites están en `docs/CONFIDENCE.md`, y un test comprueba que la tabla de pesos del documento y la del código coinciden.

**Lo que este número no es.** No está calibrado: no se afirma que `0.71` signifique «acierta el 71 % de las veces». Demostrar eso exigiría curva de fiabilidad y error de calibración esperado sobre un conjunto de test suficiente, que está deliberadamente fuera del alcance de este proyecto. Es un **indicador ordinal**: sirve para comparar dos respuestas del mismo sistema, no como probabilidad. La interfaz lo presenta siempre junto a las evidencias, que son lo que de verdad se puede comprobar.

La propiedad que sí se garantiza es la **reproducibilidad**: la función es pura y no depende del orden de las afirmaciones ni de las citas, así que las mismas citas con los mismos veredictos dan siempre el mismo valor. Ojo: `entailment` sale del verificador, que es una llamada al modelo; dos ejecuciones sobre el mismo grafo y la misma pregunta dan el mismo valor solo si obtienen los mismos veredictos (por ejemplo, gracias a la caché por par afirmación × cita). Los otros cinco términos solo leen metadatos del grafo.

#### EVIDENCE

Cita concreta con span exacto y `excerpt` congelado, para poder detectar después que el código cambió. El span cumple las mismas restricciones que el de `SYMBOL` (`start_line > 0`, `end_line >= start_line`). Borrar el fichero citado borra la evidencia pero **no** la afirmación, que puede quedar sin evidencias (consecuencia del borrado en cascada). La base de datos no impone nada sobre ese caso; tratar una afirmación sin evidencias como no sustentada es una nota para CM-HU-09/10, no una regla de este esquema. `verification` guarda el resultado del verificador:

| Valor | Significado |
|---|---|
| `entailed` | El fragmento sustenta la afirmación: el verificador semántico respondió `{"entails": true}` (DIS-70). Una afirmación solo se muestra `FACT` si todas sus citas son `entailed` |
| `cited` | La cita existe, pero el verificador no confirmó que sustente la afirmación: respondió `false`, su salida no era válida, no estaba disponible o se agotó el presupuesto (estos tres últimos casos dejan un evento `entailment_unverified`). `explain` escribe `entailed` o `cited` en cada evidencia que guarda |
| `broken` | La cita no resuelve — **es un fallo del sistema** y se registra como tal: `explain` no la guarda ni la muestra ([ADR 20261014](docs/adr/20261014-broken-citations-not-stored.md)) y deja un evento `evidence_broken` que `ask` escribe en stderr con nivel `error` |
| `none` | Sin verificar (filas escritas antes de DIS-68) |

#### QUERY_LOG

Sostiene la funcionalidad F5 y la Tabla 1 de [2.6](#26-tests). `baseline_tokens` es lo que hace posible mostrar el ahorro en la propia interfaz: se calcula qué habría costado enviar los ficheros completos en lugar de los spans seleccionados, y el dato viaja con la respuesta en lugar de recalcularse en el cliente. Es una estimación local, no el conteo del proveedor: `ceil(caracteres / 4)` sobre el contenido ya redactado, y cada paquete de contexto la declara como `estimator: 'chars-div-4'` (DIS-28, PH-16). La desviación frente al conteo real se midió en la Tabla 1 (DIS-81) sobre 89 ficheros de los dos repositorios de muestra con el tokenizador de `qwen2.5-coder:latest` (Ollama 0.40.13): +2,4 % en total, de -31,2 % a +43,3 % por fichero.

Desde DIS-74 `explain` escribe **una fila por llamada**: en toda respuesta, también en las `UNKNOWN` (con los contadores a 0 si no hubo llamada al modelo y `baseline_tokens` vacío si no se construyó paquete), y en todo rechazo posterior a una llamada al modelo resuelta, con el gasto hasta el error. No hay fila cuando falla antes de cualquier llamada (petición inválida, proyecto inexistente, presupuesto agotado en la llamada `answer`). Los totales (`input_tokens`, `output_tokens`, `cost_usd`) incluyen la verificación, y las columnas `verify_*` la desglosan: tokens y coste del verificador (PH-27), `verify_calls` (llamadas resueltas; un par servido desde la caché no cuenta) y `verify_latency_ms` (el tiempo de pared del chequeo semántico, que la revisión de la Entrega 1 pidió medir por consulta). Así el techo diario ve todo el gasto. La pregunta se guarda **tal cual** (decisión D3: la base de datos es local y la Tabla 1 tiene que casar cada fila con su pregunta), nunca se escribe en un log ni en un evento. Si la fila no se puede escribir, la respuesta se devuelve igualmente con un evento `query_not_logged`. Cada `db:seed` / `make up` borra en cascada las filas de los proyectos de ejemplo y, con ellas, el gasto registrado de ese día para ellos. `impact` (DIS-90) y `drift` (DIS-73) también escriben una fila por llamada: la de `impact` lleva los contadores a 0 y como `question` el texto del cambio; la de `drift`, como `question`, la clave de caché del informe (`drift:` o `drift:<docPath>`). El `cache_hit` de las filas `explain` alimenta `usage.projectCache` (DIS-69).

#### CACHE_ENTRY

Sostiene F7 y el modo demo. Desde DIS-21 el acierto es **exacto por la pregunta normalizada** (`question_normalized`: descomposición NFKD, sin tildes, en minúsculas, signos y símbolos como espacios y espacios colapsados), de modo que «¿Cómo se calcula el precio final de un pedido?» y «COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO» comparten entrada; el acierto por similitud de embedding (DIS-67: que «¿Cómo se calcula el precio total de un pedido?» sirva la entrada de la pregunta original; con `nomic-embed-text`, una pregunta con la misma estructura y otro sustantivo también puede superar el umbral) solo ocurre en modo vivo con `LLM_EMBED_MODEL` configurado, tras no acertar la clave exacta, con similitud coseno ≥ 0,85 sobre las entradas del proyecto que tienen `question_embedding`; toda respuesta en vivo cacheable guarda el vector de su clave (la búsqueda es exacta sobre las entradas del proyecto, no usa el índice HNSW). Hay **una entrada por proyecto y pregunta normalizada**, pero no la garantiza una clave única (ninguna migración la añade, tampoco la `0005`): la mantiene el almacén, que al guardar bloquea el par con un *advisory lock*, borra sus entradas y escribe la nueva; si alguien escribe duplicados por fuera, la lectura toma la más reciente. `response` guarda la respuesta sin sus eventos y se valida al leerla (si no la supera, es un fallo de caché, no un error). Solo se guardan las respuestas con afirmaciones guardadas y todas vigentes, y los `UNKNOWN` `no-evidence`. `hit_count` y `last_hit_at` registran cada acierto de la entrada; la tasa de acierto que muestran la CLI (`projects`), la API (`usage.projectCache`) y el panel de uso de la web se calcula, en cambio, sobre `query_log.cache_hit` de las consultas `explain` del proyecto (DIS-69). `invalidateCache(projectId)` borra la caché de un proyecto; la llama el reindexado de `POST /api/projects/{projectId}/index` (DIS-9), en la misma transacción que guarda el grafo nuevo. Desde DIS-26, `db:seed` guarda en ella las respuestas *golden* de `seeds/cache/*.json` para los proyectos de muestra, en la misma transacción que la semilla: en cada carga se sustituyen por entradas con ids nuevos y `hit_count` 0. Desde DIS-69 cada entrada *golden* lleva su `question_embedding` versionado, que `db:seed` guarda con ella; el vector de una respuesta en vivo solo se calcula con `LLM_EMBED_MODEL`. Desde DIS-73 `db:seed` guarda también los informes *golden* de deriva (`seeds/drift/*.json`), con la clave `drift:` o `drift:<docPath>`.

#### Índices

```sql
-- Travesía: un índice parcial por columna de extremo (cada extremo son dos FK, ver el ADR)
CREATE INDEX ON edge (source_symbol_id, kind) WHERE source_symbol_id IS NOT NULL;
CREATE INDEX ON edge (source_file_id, kind)   WHERE source_file_id IS NOT NULL;
CREATE INDEX ON edge (target_symbol_id, kind) WHERE target_symbol_id IS NOT NULL;
CREATE INDEX ON edge (target_file_id, kind)   WHERE target_file_id IS NOT NULL;

-- FK con borrado en cascada que ninguna PK o UNIQUE encabeza
CREATE INDEX ON edge (project_id);
CREATE INDEX ON symbol (file_id);
CREATE INDEX ON claim (project_id);
CREATE INDEX ON evidence (claim_id);
CREATE INDEX ON evidence (file_id);               -- también lo usa el trigger de invalidación
CREATE INDEX ON query_log (project_id);
CREATE INDEX ON cache_entry (project_id);

CREATE INDEX ON file (project_id, content_hash);
CREATE INDEX ON file_commit (commit_id);          -- co-cambio: ficheros de un commit
CREATE INDEX ON claim (project_id, status) WHERE status = 'stale';
CREATE INDEX ON file        USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON symbol      USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON cache_entry USING hnsw (question_embedding vector_cosine_ops);
```

Los índices de travesía **empiezan por el extremo, no por `project_id`**: un id de símbolo o de fichero pertenece a un único proyecto, así que anteponer `project_id` no filtra nada más, y un índice que empieza por el extremo sirve además al borrado en cascada desde `symbol` o `file`. Son parciales porque cada columna de extremo solo está rellena en las aristas que la usan. El resto de índices de claves foráneas existe para que borrar un proyecto, un fichero o una afirmación no recorra tablas enteras: PostgreSQL no indexa las claves foráneas por su cuenta. Las que ya encabezan una PK o una restricción UNIQUE (`file.project_id`, `commit.project_id`, `file_commit.file_id`) no necesitan índice propio.

Los tres índices HNSW existen desde DIS-13 (reconstruidos sobre `vector(768)` por la migración `0005`, DIS-67). Solo `cache_entry.question_embedding` se escribe: lo guardan una respuesta en vivo cacheable (con `LLM_EMBED_MODEL`, el vector de su clave) y `db:seed` con los vectores de las *golden* (DIS-69); `file.embedding` y `symbol.embedding` siguen sin escribirse, y la búsqueda por similitud de la caché es exacta sobre las entradas del proyecto, no usa el índice (ver la nota sobre los embeddings en [2.2](#22-descripción-de-componentes-principales)).

---

## 4. Especificación de la API

La plantilla permite documentar como máximo tres endpoints. El contrato recoge los tres de producto: `POST /api/projects/{projectId}/index`, que volvió en la Entrega 3 (DIS-9, incremental desde DIS-10), `POST /api/projects/{projectId}/ask`, implementado en la Entrega 2 (DIS-78), y `POST /api/projects/{projectId}/impact`, implementado en la Entrega 3 (DIS-95).

> **Alineado con el código (DIS-101, DIS-9).** La versión de la Entrega 1 publicaba `POST /api/projects/{projectId}/index` con un `jobId` que nadie podía consultar; DIS-101 lo quitó del contrato y DIS-9 lo devuelve con otra forma: **la API nunca recibe una ruta del sistema de ficheros: reindexa un proyecto creado por la CLI (`npm run cli -- index`, decisión PH-01 de DIS-51) desde su raíz guardada.** Crear proyectos sigue siendo solo de la CLI. El reindexado es **síncrono**: la petición no termina hasta que el grafo nuevo está guardado y la caché de respuestas del proyecto vaciada, y responde `202` con los contadores reales (desviación consciente de la regla de `docs/backend-standards.md` §6, que reserva `202` para trabajo asíncrono: el ticket fija `202`). Tampoco hay `GET /api/projects`: la web lee los proyectos de muestra de la constante `packages/web/src/data/sample-projects.ts`, que genera `seed:build`. La API expone además `GET /health` (estado del proceso, sin límite de peticiones) y la documentación OpenAPI generada desde los esquemas Zod en `/docs` (`/docs/json`), que quedan fuera del YAML para no pasar de los tres endpoints de la plantilla.

```yaml
openapi: 3.0.3
info:
  title: CODEMIND API
  version: 1.0.0
  description: |
    Comprensión de repositorios con evidencia verificable.
    Soporta proyectos PHP/Laravel y TypeScript.

servers:
  - url: http://localhost:3000
    description: Local

paths:
  /api/projects/{projectId}/index:
    post:
      summary: Reindexa un proyecto ya creado (DIS-9)
      description: |
        Reconstruye el grafo del proyecto desde su raíz guardada, con su lenguaje
        y su framework, y vacía su caché de respuestas en la misma transacción.
        No recibe ruta, lenguaje ni framework, y no crea proyectos (eso es de la
        CLI). Se ejecuta de forma síncrona y responde 202 con los contadores.
      parameters:
        - name: projectId
          in: path
          required: true
          schema: {type: string, format: uuid}
      requestBody:
        required: false   # un cuerpo ausente equivale a {}
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              properties:
                incremental: {type: boolean}   # por defecto true: reindexado incremental; false: completo
      responses:
        '202':
          description: Reindexado completado
          content:
            application/json:
              example:
                projectId: "7c1d2f3a-5b6e-4f80-9a1b-2c3d4e5f6a7b"
                mode: "incremental"          # "full" o "incremental"
                analyzer: "php-treesitter-laravel"
                indexedCommit: "4f028db4d51a3321031f3a24b3f36240410ed38c"
                filesQueued: 2
                filesSkipped: 29
                cacheEntriesInvalidated: 1
        '400': {description: "VALIDATION_ERROR (id mal formado, clave desconocida como rootPath o language, JSON vacío o mal formado)"}
        '403': {description: "INDEXING_DISABLED o FORBIDDEN_PATH"}
        '404': {description: "PROJECT_NOT_FOUND"}
        '429': {description: "RATE_LIMITED"}
        '500': {description: "INTERNAL"}
        '503': {description: "NOT_A_GIT_REPOSITORY o EMPTY_REPOSITORY"}
      # Implementado en DIS-9 (CM-HU-05b.2) y DIS-10 (CM-HU-05b.1). `incremental` vale `true` por defecto
      # (cambio de comportamiento respecto a DIS-9): se calcula un plan por `content_hash` y los
      # dependientes directos (`imports`, `calls`, `extends`, `implements`, un salto); `filesQueued` son
      # los ficheros que el plan marca (cambiados, nuevos o dependientes directos) y `filesSkipped` los
      # demás. Si el plan no está vacío o `HEAD` cambió, se analiza el repositorio completo y se guarda
      # el grafo entero. Si no cambió ningún fichero y `HEAD` es el `indexed_commit` guardado, no se
      # analiza ni se reescribe el grafo (solo se vacía la caché). `incremental: false` fuerza el reindexado completo (`mode: "full"`, `filesSkipped: 0`);
      # úsalo tras actualizar un analizador, porque un repositorio sin cambios conserva el grafo del
      # analizador anterior. Los mensajes son fijos y los detalles `{}`: ninguna respuesta
      # ni línea de log lleva una ruta. Un cuerpo ausente (sin `Content-Type`) es `{}`; uno declarado
      # `application/json` y vacío responde 400. En PowerShell (5.1 y 7), `Invoke-RestMethod -Method
      # Post` sin `-Body` declara `application/x-www-form-urlencoded` y responde 415; envía
      # `-ContentType 'application/json' -Body '{}'` (incremental) o `-Body '{"incremental":false}'`.

  /api/projects/{projectId}/ask:
    post:
      summary: Explica cómo funciona una parte del proyecto
      description: |
        Devuelve una explicación descompuesta en afirmaciones, cada una con su
        tipo (FACT / INFERENCE) y el resultado de la verificación de su
        evidencia. Si no hay evidencia suficiente devuelve UNKNOWN en lugar de
        generar una explicación sin fundamento. La respuesta se redacta en el
        idioma de la pregunta, español o inglés (DIS-104).
      parameters:
        - name: projectId
          in: path
          required: true
          schema: {type: string, format: uuid}
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [question]
              additionalProperties: false
              properties:
                question:    {type: string, minLength: 5, maxLength: 500}
                tokenBudget: {type: integer, default: 8000, minimum: 1000, maximum: 32000}
                useCache:    {type: boolean, default: true}   # false: no consulta la caché (sí guarda la respuesta nueva)
            example:
              question: "¿Cómo se calcula el precio final de un pedido?"
              tokenBudget: 8000
      responses:
        '200':
          description: Respuesta con evidencia verificada, o UNKNOWN con su motivo
          content:
            application/json:
              examples:
                answered:
                  value:
                    answer: "El precio final se calcula en PriceCalculator::compute()."
                    statements:
                      - text: "Se aplica el descuento del cliente antes de los impuestos."
                        type: "INFERENCE"
                        verification: "cited"
                        evidenceIds: ["ev-1", "ev-2"]
                      - text: "El método devuelve el importe redondeado a 2 decimales."
                        type: "FACT"
                        verification: "entailed"
                        evidenceIds: ["ev-1"]
                    evidence:
                      - id: "ev-1"
                        file: "app/Services/PriceCalculator.php"
                        startLine: 42
                        endLine: 58
                        excerpt: "public function compute(Order $order): Money {"
                      - id: "ev-2"
                        file: "tests/Unit/PricingTest.php"
                        startLine: 91
                        endLine: 104
                        excerpt: "$this->assertEquals(90.75, $result->amount());"
                    confidence: 0.71
                    usage:
                      inputTokens: 4812
                      outputTokens: 380
                      baselineTokens: 41200
                      baselineEstimator: "chars-div-4"
                      savingsPct: 88.3
                      costUsd: 0.014
                      latencyMs: 2100
                      cacheHit: false
                      generation: {inputTokens: 4212, outputTokens: 340, costUsd: 0.0116}
                      verification: {calls: 4, cacheHits: 1, inputTokens: 600, outputTokens: 40, costUsd: 0.0024, latencyMs: 900}
                      projectCache: {queries: 10, cacheHits: 4, hitRatePct: 40}
                unknown:
                  value:
                    answer: "UNKNOWN"
                    reason: "llm-required"
                    message: "evaluation mode (cache-only): set LLM_* to enable free-form asks"
                    statements: []
                    evidence: []
        '400': {description: "VALIDATION_ERROR (petición fuera de esquema) o INVALID_EXPLAIN_REQUEST"}
        '404': {description: "PROJECT_NOT_FOUND"}
        '429': {description: "RATE_LIMITED, o BUDGET_EXHAUSTED con details.cacheOnly: true"}
        '500': {description: "INTERNAL"}
        '503': {description: "LLM_UNAVAILABLE o SOURCE_UNAVAILABLE"}
      # Implementado en DIS-78 (CM-HU-12.2); el documento generado desde los esquemas Zod está en
      # /docs/json. `question` se cuenta en code points, no puede ser solo espacios ni contener
      # U+0000; `projectId` acepta mayúsculas y minúsculas (8-4-4-4-12 hexadecimal); `hops` u otra
      # clave responde 400. Sin `tokenBudget` se aplica el valor por defecto (8000); `useCache` se
      # reenvía al caso de uso solo si llega (DIS-21): sin él se consulta la caché de respuestas, y
      # con `false` se salta la consulta, aunque la respuesta nueva sustituye a la guardada. Con un
      # modelo de embeddings configurado, la caché acierta también por similitud (DIS-67). Una
      # respuesta servida desde la caché lleva `usage.cacheHit: true`, tokens y coste 0, y responde
      # 200 aunque el techo diario esté agotado. Los ids de evidencia son
      # públicos (`ev-1`, `ev-2`… en el orden de `evidence`) y la verificación va en cada
      # afirmación: `entailed` si el chequeo semántico confirma todas sus citas, `cited` si no. La
      # respuesta nunca lleva ids de base de datos, `provenance`, reclamaciones previas ni eventos
      # (estos van al log del servidor). Una respuesta UNKNOWN lleva `reason`, uno de seis valores
      # (DIS-39, DIS-68): no-anchor, llm-required, over-budget, invalid-model-output, no-evidence,
      # broken-evidence; `message` solo con llm-required, y sin `confidence` ni `usage`. Los
      # totales de `usage` incluyen la verificación (DIS-74). `usage.projectCache` (DIS-69) es la tasa
      # de aciertos de caché del proyecto, leída después de la llamada, así que cuenta la llamada
      # actual: `queries` son las consultas `explain` del proyecto, `cacheHits` las servidas desde
      # la caché (exactas o por similitud) y `hitRatePct` su porcentaje con un decimal como mucho,
      # `null` sin consultas. No va en el uso del caso de uso ni en la respuesta guardada, y una
      # respuesta UNKNOWN no la lleva.

  /api/projects/{projectId}/impact:
    post:
      summary: Analiza qué se vería afectado por un cambio
      description: |
        Devuelve el informe de impacto de un cambio descrito en palabras: lo
        derivado del grafo determinista (`direct`, `indirect`, `tests`, cada
        elemento con su origen `graph` y su fiabilidad `exact` o `heuristic`)
        separado de la señal histórica de co-cambio de git (`history`, origen
        `git`), la documentación relacionada (`docs`, al día o desalineada) y el
        riesgo con su justificación. No llama al modelo: coste 0. Si el cambio no
        ancla nada devuelve `unknown` en lugar de inventar un informe.
      parameters:
        - name: projectId
          in: path
          required: true
          schema: {type: string, format: uuid}
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [change]
              additionalProperties: false
              properties:
                change:  {type: string, minLength: 5, maxLength: 500}
                maxHops: {type: integer, default: 2, minimum: 1, maximum: 3}
            example:
              change: "cambiar los descuentos de DiscountService"
              maxHops: 2
      responses:
        '200':
          description: Informe de impacto respondido, o `unknown` si el cambio no ancla nada
          content:
            application/json:
              examples:
                answered:
                  value:   # salida real sobre la semilla de acme-shop (DIS-95), con `direct` e `indirect` abreviados
                    status: "answered"
                    direct:
                      - {symbol: "DiscountService", file: "app/Services/DiscountService.php", origin: "graph", resolution: "exact", hops: 0}
                      - {symbol: "PriceCalculator", file: "app/Services/PriceCalculator.php", origin: "graph", resolution: "exact", hops: 1}
                    indirect:
                      - {symbol: "OrderController", file: "app/Http/Controllers/OrderController.php", origin: "graph", resolution: "heuristic", hops: 2}
                    tests:
                      - {symbol: "DiscountServiceTest", file: "tests/Unit/DiscountServiceTest.php", origin: "graph"}
                    docs:
                      - {path: "README.md", stale: false}   # un documento desalineado lleva además `staleSince`: el sha completo
                    history:
                      - {file: "app/Services/ShippingService.php", coChangeRate: 1, prs: [24, 33, 55], origin: "git"}
                    risk:
                      level: "HIGH"
                      rationale: "10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística."
                unknown:
                  value:
                    status: "unknown"
                    reason: "no-anchor"
        '400': {description: "VALIDATION_ERROR (petición fuera de esquema) o INVALID_IMPACT_REQUEST"}
        '404': {description: "PROJECT_NOT_FOUND"}
        '429': {description: "RATE_LIMITED"}
        '500': {description: "INTERNAL"}
      # Implementado en DIS-95 (CM-HU-16b.2); el documento generado desde los esquemas Zod está en
      # /docs/json. `change` se cuenta en code points, no puede ser solo espacios ni contener U+0000;
      # `projectId` acepta mayúsculas y minúsculas (8-4-4-4-12 hexadecimal); `hops`, `projectId` en el
      # cuerpo u otra clave responde 400. Sin `maxHops` se aplica el valor por omisión del caso de uso
      # (2). Los límites son los del caso de uso `impact`. La respuesta `answered` lleva exactamente
      # `status`, `direct`, `indirect`, `tests`, `docs`, `history` y `risk`: cada entrada de `direct` e
      # `indirect` lleva `symbol`, `file`, `origin`, `resolution` y `hops`; `tests`, `symbol`, `file` y
      # `origin`; `docs`, `path`, `stale` y, solo si está desalineado, `staleSince` (el sha completo);
      # `history`, una entrada por fichero co-cambiado con `file`, `coChangeRate`, `prs` (números de PR en
      # orden ascendente, posiblemente vacío) y `origin`; `risk`, `level` (`HIGH`, `MEDIUM`, `LOW`) y
      # `rationale`. No lleva `usage` (el impacto no llama al modelo: no hay coste que medir), ni
      # `events` (van al log del servidor), ni `projectId`, ni el texto del cambio, ni ids de base de
      # datos. Un `projectId` desconocido responde 404 también con un cambio sin términos de búsqueda.

components:
  schemas:
    Error:
      type: object
      properties:
        error:
          type: object
          properties:
            code:    {type: string}
            message: {type: string}
            details: {type: object}
```

Todos los errores usan el formato `Error`. Todos los cuerpos de petición se validan por esquema antes de llegar al dominio.

La base HTTP (DIS-76) fija los códigos de error comunes a todos los endpoints. `message` es siempre el texto fijo del código: una respuesta de error nunca repite un valor recibido, el mensaje de la excepción que la causó, una URL de base de datos ni un mensaje del driver. El cuerpo de una petición tiene un máximo de 64 KiB.

| Situación | Estado | `code` | `details` |
|---|---|---|---|
| La petición no cumple el esquema de su ruta | 400 | `VALIDATION_ERROR` | `{ issues: [{ path, code, message }] }` |
| Cuerpo JSON mal formado o vacío | 400 | `VALIDATION_ERROR` | `{}` |
| Ninguna ruta coincide | 404 | `NOT_FOUND` | `{}` |
| Cuerpo de más de 64 KiB | 413 | `PAYLOAD_TOO_LARGE` | `{}` |
| Tipo de contenido sin parser | 415 | `UNSUPPORTED_MEDIA_TYPE` | `{}` |
| Cualquier otro error 4xx | su estado | `BAD_REQUEST` | `{}` |
| Límite de peticiones superado | 429 | `RATE_LIMITED` | `{ retryAfterSeconds }` (y cabecera `Retry-After`) |
| Presupuesto diario del LLM agotado | 429 | `BUDGET_EXHAUSTED` | `{ spentUsd, dailyBudgetUsd, resetsAt }` |
| Cualquier otro error | 500 | `INTERNAL` | `{}` (el error completo solo va al log del servidor) |

Una ruta puede declarar su propia tabla de errores de dominio, que se consulta antes que la global y solo para sus peticiones (DIS-78). La de `POST /api/projects/{projectId}/ask` añade:

| Situación | Estado | `code` | `message` | `details` |
|---|---|---|---|---|
| El proyecto no existe | 404 | `PROJECT_NOT_FOUND` | `project not found` | `{}` |
| El caso de uso rechaza la petición | 400 | `INVALID_EXPLAIN_REQUEST` | `invalid request` | `{ field }` |
| El modelo no está disponible | 503 | `LLM_UNAVAILABLE` | `the language model is unavailable` | `{ reason }` y, si los trae, `status`, `expected`, `received`, `systemCode` |
| El código del proyecto no se puede leer | 503 | `SOURCE_UNAVAILABLE` | `the project's source cannot be read` | `{ reason }` y, si la trae, `path` (relativa al repositorio) |
| Presupuesto diario del LLM agotado | 429 | `BUDGET_EXHAUSTED` | `the daily LLM budget is exhausted` | `{ spentUsd, dailyBudgetUsd, resetsAt, cacheOnly: true }` |

La de `POST /api/projects/{projectId}/impact` (DIS-95) usa mensajes fijos; no tiene `BUDGET_EXHAUSTED`, `LLM_UNAVAILABLE` ni `SOURCE_UNAVAILABLE` porque no llama al modelo ni lee el código:

| Situación | Estado | `code` | `message` | `details` |
|---|---|---|---|---|
| El proyecto no existe | 404 | `PROJECT_NOT_FOUND` | `project not found` | `{}` |
| El caso de uso rechaza la petición | 400 | `INVALID_IMPACT_REQUEST` | `invalid request` | `{ field }` |

La de `POST /api/projects/{projectId}/index` (DIS-9) usa mensajes fijos y `details` siempre `{}`:

| Situación | Estado | `code` | `message` |
|---|---|---|---|
| La API no tiene raíz de repositorios permitida o sal de autores (`ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT`) | 403 | `INDEXING_DISABLED` | `indexing disabled (fixtures-only mode)` |
| El proyecto no existe | 404 | `PROJECT_NOT_FOUND` | `project not found` |
| La raíz guardada del proyecto queda fuera de la raíz permitida | 403 | `FORBIDDEN_PATH` | `the project's repository is outside the allowed repositories directory` |
| El repositorio guardado ya no es un repositorio git o no tiene commits | 503 | `NOT_A_GIT_REPOSITORY` o `EMPTY_REPOSITORY` | `the project's source cannot be read` |
| Grafo inválido, fallo de la caché o del commit, cualquier otro | 500 | `INTERNAL` | `unexpected error` |

Fuera de `/ask`, `/impact` y `/index`, `PROJECT_NOT_FOUND` sigue respondiendo `500 INTERNAL`: solo es un `404` donde se recibe un `projectId`.

Si la API no puede arrancar, escribe una sola línea `{"error":{code,message,details}}` en stderr y sale con `1`: `INVALID_CONFIG` (`details.variable`: `DATABASE_URL`, `PORT`, `HOST`, `RATE_LIMIT_MAX` o `RATE_LIMIT_WINDOW_MS`, ausente o inválida), `LLM_CONFIG_INVALID` (`details.variable` y, si falta el precio de un modelo, `details.modelVariable`), `DATABASE_UNAVAILABLE` (la base de datos no acepta la conexión) o `STARTUP_FAILED` (por ejemplo, el puerto ocupado: `details.systemCode` `EADDRINUSE`). Ojo: para `DATABASE_URL` ausente la API responde `INVALID_CONFIG`, mientras que el CLI responde `MISSING_CONFIG`. La línea nunca contiene el valor de una variable.

---

## 5. Historias de Usuario

### Cómo se construyó el backlog

Las historias de la Entrega 1 eran un ejemplo. El backlog real se planificó con IA el 27-09-2026, se revisó a mano antes de importarlo y se mantuvo vivo en Linear hasta el final.

1. **Planificación.** Con el prompt de [`03-prompt-planificacion-historias-de-usuario.md`](docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md), un agente leyó las secciones 0 a 4 de este readme y los estándares, y escribió el backlog en [`03-planificacion-historias-de-usuario.md`](docs/ai-sessions/03-planificacion-historias-de-usuario.md). Cada historia padre (`CM-HU-NN`) es una historia INVEST de uno o dos días, con su *reality map* (lo que ya existe y lo que hay que crear), su versión *enhanced* (historia, criterios Dado/Cuando/Entonces, contexto técnico, *non-goals*, etiquetas y estimación) y sus sub-issues (`CM-HU-NN.k`), que son cortes de una sesión de agente. Las cuatro historias demasiado grandes se partieron ya en la planificación: analizador PHP (04a/04b), indexado (05a/05b), web de consulta (15a/15b) e impacto (16a/16b).
2. **Recorte (*poke-holes*).** El mismo documento lista 28 objeciones (PH-01…PH-28) y seis preguntas abiertas. Las decisiones sobre ellas se aplicaron con [`03-prompt-recorte-poke-holes.md`](docs/ai-sessions/03-prompt-recorte-poke-holes.md). Hubo sub-issues nuevas (04a.4, 05a.4, 09.4, 09.5 y las de revisión 13.3, 18.4, 22.3 y 22.4), una fusión (17.2 entró en 17.1), un cambio de prioridad (el indexado incremental pasó a `should`) y tres contratos retirados (`GET /api/projects`, `AuditPort` y `LLM_REQUIRED`). Tras ese paso quedaron **26 historias y 65 sub-issues**.
3. **Importación a Linear.** Con [`03-prompt-importar-backlog-linear.md`](docs/ai-sessions/03-prompt-importar-backlog-linear.md) se crearon los proyectos [CODEMIND — Entrega 2](https://linear.app/distinta-ai4devs/project/codemind-entrega-2-a5e56c1fa3b6) y [CODEMIND — Entrega 3](https://linear.app/distinta-ai4devs/project/codemind-entrega-3-91554d6f3850), los milestones M1–M9, las historias, las sub-issues, las etiquetas y las dependencias *blocked by*. El mapa `CM-HU-*` → `DIS-n` está en la §6 del archivo de planificación. Desde ese momento, Linear es la fuente viva y el archivo es el registro de lo que se planificó.

**Cambios durante el desarrollo.** El backlog no se quedó como se importó:

- **Splits.** [DIS-63](https://linear.app/distinta-ai4devs/issue/DIS-63/cm-hu-04b2-atributos-eloquent-rutas-por-string-jobs-y-eventos) (`CM-HU-04b.2`) era demasiado grande. El 03-10-2026 se partió en [DIS-97](https://linear.app/distinta-ai4devs/issue/DIS-97) (`04b.2a`, rutas por string, jobs y eventos) y [DIS-98](https://linear.app/distinta-ai4devs/issue/DIS-98) (`04b.2b`, atributos Eloquent e informe de no resueltos), que es el único tercer nivel del backlog.
- **Alcance reasignado.** Las revisiones de las golden de task-api ([DIS-33](https://linear.app/distinta-ai4devs/issue/DIS-33)), la anotación de los sitios de llamada ([DIS-80](https://linear.app/distinta-ai4devs/issue/DIS-80)) y la revisión de las respuestas de la Tabla 1 ([DIS-82](https://linear.app/distinta-ai4devs/issue/DIS-82)) estaban planificadas como trabajo de la autora. Pasaron a hacerlas paneles de agentes independientes de otro modelo, y su título en Linear lo dice.
- **Notas añadidas a historias pendientes.** Un ticket cerrado podía dejar una decisión pendiente a una historia futura. Por ejemplo, [DIS-17](https://linear.app/distinta-ai4devs/issue/DIS-17) fijó la dimensión de los embeddings en 1536 y dejó en [DIS-46](https://linear.app/distinta-ai4devs/issue/DIS-46/cm-hu-19-cache-semantica-por-similitud-de-embedding-con-metrica-de) la elección del modelo y de la migración. Esa nota acabó en la migración `0005_embedding-768`.
- **Tickets nuevos.** Se crearon 15 tickets que no salen de la planificación. Hay cinco de deuda técnica, cada uno nacido de los hallazgos diferidos de un change: [DIS-96](https://linear.app/distinta-ai4devs/issue/DIS-96), [DIS-99](https://linear.app/distinta-ai4devs/issue/DIS-99), [DIS-100](https://linear.app/distinta-ai4devs/issue/DIS-100), [DIS-105](https://linear.app/distinta-ai4devs/issue/DIS-105) y [DIS-107](https://linear.app/distinta-ai4devs/issue/DIS-107). Hay cinco hallazgos durante el desarrollo: respuestas en inglés a preguntas en español ([DIS-104](https://linear.app/distinta-ai4devs/issue/DIS-104)), dos golden de acme-shop que había que regenerar ([DIS-108](https://linear.app/distinta-ai4devs/issue/DIS-108) y [DIS-109](https://linear.app/distinta-ai4devs/issue/DIS-109)), una conexión del pool que no se liberaba ([DIS-110](https://linear.app/distinta-ai4devs/issue/DIS-110)) y tests del arnés que fallaban por carga en Windows ([DIS-111](https://linear.app/distinta-ai4devs/issue/DIS-111)). Hay cuatro de documentación y del kit: [DIS-101](https://linear.app/distinta-ai4devs/issue/DIS-101), [DIS-102](https://linear.app/distinta-ai4devs/issue/DIS-102), [DIS-103](https://linear.app/distinta-ai4devs/issue/DIS-103) y [DIS-106](https://linear.app/distinta-ai4devs/issue/DIS-106), el modo autónomo del kit. El último, [DIS-112](https://linear.app/distinta-ai4devs/issue/DIS-112), se cerró como duplicado.

**Recuento final (Linear, 04-11-2026).** El equipo `DIS` tiene 108 issues, de [DIS-5](https://linear.app/distinta-ai4devs/issue/DIS-5/cm-hu-01-esquema-postgresql-del-grafo-con-restricciones-e-indices) a DIS-112. DIS-1…DIS-4 eran issues de bienvenida de Linear, ajenas al backlog, y ya no existen.

- **26 historias de usuario**, las issues padre `[CM-HU-NN]`.
- **67 sub-issues**: las 65 importadas más DIS-97 y DIS-98.
- **15 tickets más**: 5 de deuda, 5 de hallazgos, 4 de documentación y del kit, y 1 duplicado.

Las 26 historias y las 67 sub-issues están en *Done*. De los 15 tickets restantes, 14 están en *Done* y DIS-112 en *Duplicate*. Los nueve milestones están al 100 %.

| Milestone | Proyecto | Historias | Sub-issues | Otros tickets | Estado |
|---|---|---|---|---|---|
| M1 — Esquema y almacén | Entrega 2 | 3 | 8 | — | 100 % |
| M2 — Indexado PHP y seguridad | Entrega 2 y Entrega 3 | 4 | 14 | 3 (deuda) | 100 % |
| M3 — Explain con evidencia | Entrega 2 | 6 | 14 | — | 100 % |
| M4 — Evidencia local | Entrega 2 | 3 | 7 | — | 100 % |
| M5 — Web | Entrega 2 y Entrega 3 | 3 | 5 | — | 100 % |
| M6 — Impacto | Entrega 3 | 2 | 5 | — | 100 % |
| M7 — Analizador TypeScript | Entrega 3 | 1 | 4 | — | 100 % |
| M8 — Should (reserva) | Entrega 3 | 2 | 4 | — | 100 % |
| M9 — Calidad y mediciones | Entrega 3 | 2 | 6 | — | 100 % |
| Sin milestone | Entrega 2 y Entrega 3 | — | — | 12 | 11 *Done*, 1 *Duplicate* |
| **Total** | | **26** | **67** | **15** | **108** |

M2 y M5 existen en los dos proyectos porque cada uno tiene una parte en cada entrega. M6 cuenta [DIS-42](https://linear.app/distinta-ai4devs/issue/DIS-42/cm-hu-094-recalculo-perezoso-de-afirmaciones-stale-al-recuperarlas-re) (`CM-HU-09.4`), que es una sub-issue de una historia de M3 que se movió a la Entrega 3.

A continuación van tres de las historias principales, tal como quedaron en Linear. Los criterios están recortados a los esenciales; el texto completo está en cada enlace.

### **Historia de Usuario 1**

**[CM-HU-09] Explicación con afirmaciones tipadas, procedencia y `UNKNOWN`** · [DIS-29](https://linear.app/distinta-ai4devs/issue/DIS-29/cm-hu-09-explicacion-con-afirmaciones-tipadas-procedencia-y-unknown) · M3 · `must` · L

> **Como** desarrolladora que va a modificar un módulo,
> **quiero** preguntar en lenguaje natural y recibir afirmaciones marcadas como hecho o inferencia con sus citas, o un `UNKNOWN` honesto,
> **para** entender el comportamiento real sin fiarme de una explicación plausible.

**Criterios de aceptación**

- **Dado** acme-shop sembrado y un modelo simulado, **cuando** ejecuto `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`, **entonces** la respuesta contiene `statements` con `type` y `evidenceIds`. Cada evidencia resuelve a fichero, `startLine`, `endLine` y `excerpt`. Se guardan `claim` y `evidence` con `layer = 'L2'` y `provenance`: modelo, hash del prompt, evidencias de entrada y fecha.
- **Dada** una afirmación cuya cadena de evidencia incluye una arista `heuristic`, **entonces** su tipo es `INFERENCE`, nunca `FACT`. Solo puede ser `FACT` si la sustentan aristas `exact` y spans L1.
- **Dada** una pregunta sin ancla en el grafo («¿Cómo se gestionan los reembolsos?»), **entonces** la respuesta es `UNKNOWN` con `reason`, y **no se llama al modelo**.
- **Dado** que el modelo devuelve JSON que no cumple el esquema, **entonces** la salida se descarta, se registra `schema_violation` y la respuesta pasa a `UNKNOWN` con `reason: 'invalid-model-output'`.
- **Dado** el modo evaluación y una pregunta no cacheada, **entonces** la respuesta es `UNKNOWN` con `reason: 'llm-required'`, sin llamar al modelo.
- **Dada** una afirmación `stale` (su fichero cambió desde que se generó), **entonces** nunca se muestra como `FACT`. El recálculo perezoso es la sub-issue 09.4.
- **Dado** un span con texto que parece una instrucción («ignore previous instructions…»), **entonces** va al prompt delimitado como dato, truncado y marcado, y el log registra `untrusted-content-flagged`.

**Tickets que la implementaron**

| Ticket | Contenido | PR | Change de OpenSpec |
|---|---|---|---|
| [DIS-38](https://linear.app/distinta-ai4devs/issue/DIS-38/cm-hu-091-tipos-claimevidence-reglas-hechoinferencia-y-esquema-zod-de) (09.1) | Tipos `claim`/`evidence`, regla hecho/inferencia y esquema Zod de la salida del modelo | [#36](https://github.com/DisTinta/AI4Devs-finalproject/pull/36) | [`claims-and-typing`](openspec/changes/archive/2026-10-11-claims-and-typing/) |
| [DIS-39](https://linear.app/distinta-ai4devs/issue/DIS-39/cm-hu-092-caso-de-uso-explain-prompt-politica-unknown-persistencia-de) (09.2) | Caso de uso `explain`, prompt, política `UNKNOWN` y persistencia | [#37](https://github.com/DisTinta/AI4Devs-finalproject/pull/37) | [`explain-use-case`](openspec/changes/archive/2026-10-13-explain-use-case/) |
| [DIS-40](https://linear.app/distinta-ai4devs/issue/DIS-40/cm-hu-093-comando-cli-ask-con-salida-legible-afirmaciones-tipo) (09.3) | Comando CLI `ask` | [#38](https://github.com/DisTinta/AI4Devs-finalproject/pull/38) | [`cli-ask`](openspec/changes/archive/2026-10-13-cli-ask/) |
| [DIS-41](https://linear.app/distinta-ai4devs/issue/DIS-41/cm-hu-095-sanitizacion-minima-del-contenido-no-confiable-antes-del) (09.5) | Sanitización mínima del contenido no confiable | [#39](https://github.com/DisTinta/AI4Devs-finalproject/pull/39) | [`untrusted-content-sanitization`](openspec/changes/archive/2026-10-14-untrusted-content-sanitization/) |
| [DIS-42](https://linear.app/distinta-ai4devs/issue/DIS-42/cm-hu-094-recalculo-perezoso-de-afirmaciones-stale-al-recuperarlas-re) (09.4, Entrega 3) | Recálculo perezoso de las afirmaciones `stale` | [#85](https://github.com/DisTinta/AI4Devs-finalproject/pull/85) | [`stale-claims-refresh`](openspec/changes/archive/2026-10-30-stale-claims-refresh/) |

**Estado: entregada (Done).** Cada criterio tiene su escenario en las specs y su test. Hubo dos decisiones de diseño que cambian lo que dice la historia:

- Un `FACT` del modelo se guarda como `claim` `L2` `INFERENCE` y conserva su tipo en `provenance.statementType`. Así el `CHECK` `fact_only_from_l1` mantiene su sentido ([ADR](docs/adr/20261013-fact-statements-stored-as-l2-inference.md)).
- `explain` hace una sola pasada contexto → modelo. El bucle de varias iteraciones de §2.1 quedó como *non-goal* (PH-10).

Con un modelo real ([`docs/measurements/context-savings.md`](docs/measurements/context-savings.md): `qwen2.5-coder` en Ollama, en local, con una GTX 970), las 40 preguntas de medición dieron este resultado:

- 33 respuestas y 7 `UNKNOWN`. De los `UNKNOWN`, 4 son `no-anchor`: las cuatro preguntas diseñadas para no tener respuesta, que acertaron 4 de 4. Los otros 3 son `invalid-model-output`.
- La revisión ciega ([`answer-review.md`](docs/measurements/answer-review.md)) juzgó **22 de 40 correctas**, 11 parciales y 7 incorrectas.
- El criterio de latencia de la Entrega 1 («menos de 10 s») **no se cumple** con ese hardware. Ninguna de las 33 respuestas bajó de 10 s, y la mediana fue de 162,5 s en acme-shop y 93,6 s en task-api. La historia de Linear ya no lleva ese criterio.

### **Historia de Usuario 2**

**[CM-HU-16a] Impacto determinista por grafo: directo, indirecto, tests, riesgo y CLI** · [DIS-83](https://linear.app/distinta-ai4devs/issue/DIS-83/cm-hu-16a-impacto-determinista-por-grafo-directo-indirecto-tests) · M6 · `must` · L

> **Como** desarrolladora a punto de tocar un componente,
> **quiero** saber qué símbolos dependen de él directa e indirectamente, qué tests lo cubren y un nivel de riesgo justificado,
> **para** no romper lo que no había considerado.

**Criterios de aceptación**

- **Dado** acme-shop sembrado, **cuando** ejecuto `impact` con `maxHops = 2`, **entonces**:
  - `direct` contiene `DiscountService` y `PriceCalculator` con `origin: 'graph'` y su `resolution`;
  - `indirect` contiene `OrderController`, `CheckoutController`, `RecalculateTotals` y `SendOrderConfirmation` a 2 saltos y `heuristic`;
  - `tests` contiene `DiscountServiceTest`, `PriceCalculatorTest` y `OrderPricingTest`.
- **Dado** `maxHops = 1`, **entonces** `indirect` no contiene los símbolos a 2 saltos. **Dado** `maxHops = 4`, la petición se rechaza antes de recorrer el grafo.
- **Dados** un símbolo alcanzado por `exact` a 1 salto y otro por `heuristic` a 2, **entonces** el primero va antes: el orden es por relevancia, no alfabético.
- **Dado** un informe, **entonces** `risk.level` sigue la regla fijada en el gate (PH-15):
  - **HIGH** si algún elemento directo no tiene test o solo se alcanza por cadenas `heuristic`;
  - **LOW** si todos tienen test y son `exact`;
  - **MEDIUM** en otro caso.

  `risk.rationale` cita en una frase los hechos que activan la regla, y hay un test por nivel.
- **Dado** un cambio sin ancla en el grafo, **entonces** la respuesta es `UNKNOWN` con `reason: 'no-anchor'` y sin `risk`.

**Tickets que la implementaron**

| Ticket | Contenido | PR | Change de OpenSpec |
|---|---|---|---|
| [DIS-89](https://linear.app/distinta-ai4devs/issue/DIS-89/cm-hu-16a1-caso-de-uso-impact-ancla-travesia-inversa-a-n-saltos) (16a.1) | Caso de uso `impact`: ancla, travesía inversa, `direct`/`indirect`/`tests` y relevancia ([Ticket 1](#ticket-1--backend--caso-de-uso-impact-sobre-el-grafo-determinista)) | [#90](https://github.com/DisTinta/AI4Devs-finalproject/pull/90) | [`impact-graph`](openspec/changes/archive/2026-10-30-impact-graph/) |
| [DIS-90](https://linear.app/distinta-ai4devs/issue/DIS-90/cm-hu-16a2-regla-de-riesgo-con-justificacion-cli-impact-query-log) (16a.2) | Regla de riesgo con justificación, CLI `impact` y fila en `query_log` | [#91](https://github.com/DisTinta/AI4Devs-finalproject/pull/91) y [#92](https://github.com/DisTinta/AI4Devs-finalproject/pull/92) (captura en PowerShell) | [`impact-risk-cli`](openspec/changes/archive/2026-10-30-impact-risk-cli/) |

La historia hermana [CM-HU-16b](https://linear.app/distinta-ai4devs/issue/DIS-93/cm-hu-16b-impacto-senal-historica-git-documentacion-desalineada-y-post) (DIS-93) añadió el historial `[git]`, la documentación desactualizada y `POST /impact`. [CM-HU-17](https://linear.app/distinta-ai4devs/issue/DIS-8/cm-hu-17-web-pantalla-3-informe-de-impacto-con-origen-por-linea) (DIS-8) añadió la Pantalla 3 ([Ticket 2](#ticket-2--frontend--pantalla-3-informe-de-impacto)).

**Estado: entregada (Done), con un criterio reformulado.** La salida real está en [`docs/DEMO.md`](docs/DEMO.md), paso 4. La historia pedía el texto «cambiar el cálculo de descuentos», pero ese texto no ancla `DiscountService`: el anclaje es léxico y `descuentos` no comparte prefijo con `Discount`. La decisión D7 de DIS-89 cambió el texto de la demo y de los tests a «cambiar los descuentos de DiscountService», y un test documenta el límite del texto original. Con ese texto, el informe contiene todos los elementos que pide el primer criterio y da riesgo **HIGH**, porque cuatro de los seis componentes directos no tienen test. No hay glosario ni anclaje por embeddings en el impacto: habría sido un alcance nuevo.

### **Historia de Usuario 3**

**[CM-HU-19] Caché semántica por similitud de embedding con métrica de acierto (F7)** · [DIS-46](https://linear.app/distinta-ai4devs/issue/DIS-46/cm-hu-19-cache-semantica-por-similitud-de-embedding-con-metrica-de) · M8 · `should` · M

> **Como** desarrolladora que reformula una pregunta ya respondida,
> **quiero** que el sistema reconozca la equivalencia y sirva la respuesta cacheada indicándolo,
> **para** no pagar dos veces por la misma información y ver cuánto acierta la caché.

**Criterios de aceptación**

- **Dada** una entrada cacheada para «¿Cómo se calcula el precio final de un pedido?» con su embedding, **cuando** pregunto «explícame el cálculo del precio final» en modo `live`, **entonces**:
  - la similitud coseno supera el umbral;
  - se sirve la respuesta cacheada con `cacheHit = true`;
  - `hit_count` sube;
  - no se llama a `complete()`, y a `embed()` solo una vez.
- **Dada** una pregunta sobre otro tema («¿cómo se validan los cupones?»), **entonces** la similitud queda por debajo del umbral y se responde en vivo.
- **Dados** dos proyectos con la misma pregunta cacheada, **entonces** solo se consideran las entradas del proyecto consultado.
- **Dado** el modo evaluación (sin `embed()`), **entonces** se usa el acierto por texto normalizado de CM-HU-13 y, si no lo hay, `UNKNOWN` con `reason: 'llm-required'`. Nunca falla por falta de embedding.
- **Dadas** 10 consultas con 4 aciertos, **entonces** la tasa de acierto del proyecto es 0,4 y se muestra en la CLI y en `UsagePanel`.

**Tickets que la implementaron**

| Ticket | Contenido | PR | Change de OpenSpec |
|---|---|---|---|
| [DIS-67](https://linear.app/distinta-ai4devs/issue/DIS-67/cm-hu-191-busqueda-por-similitud-en-cache-entry-umbral-integracion-en) (19.1) | Búsqueda por similitud en `cache_entry`, umbral, integración en `explain`, degradación sin embeddings y migración `0005_embedding-768` | [#105](https://github.com/DisTinta/AI4Devs-finalproject/pull/105) | [`semantic-cache`](openspec/changes/archive/2026-11-04-semantic-cache/) |
| [DIS-69](https://linear.app/distinta-ai4devs/issue/DIS-69/cm-hu-192-hit-rate-por-proyecto-exposicion-en-cli-y-usagepanel) (19.2) | Tasa de acierto por proyecto en la API, la CLI (`projects`) y `UsagePanel`, y vectores de las golden | [#108](https://github.com/DisTinta/AI4Devs-finalproject/pull/108) | [`cache-hit-rate`](openspec/changes/archive/2026-11-04-cache-hit-rate/) |

**Estado: entregada (Done), con un criterio que no se cumple tal como está escrito.**

- **Modelo de embeddings.** La historia dejaba abierta su elección. Se eligió `nomic-embed-text` (768 dimensiones, gratuito en Ollama), y la migración `0005_embedding-768` cambió las tres columnas `vector(1536)` a `vector(768)` y reconstruyó sus índices HNSW ([ADR](docs/adr/20261103-embeddings-stay-on-llm-port.md)).
- **Umbral.** `SEMANTIC_CACHE_MIN_SIMILARITY` = 0,85.
- **Calibración** con el modelo real (decisión R3 de [`design.md`](openspec/changes/archive/2026-11-04-semantic-cache/design.md)):
  - la reformulación del primer criterio mide **0,8321**, así que **no acierta**;
  - otras reformulaciones de la misma pregunta sí aciertan (0,9260 con «¿Cómo se calcula el precio total de un pedido?»);
  - ningún umbral entre 0,80 y 0,95 separa todos los pares;
  - una pregunta de envíos con la misma estructura (0,8745) se sirvió con la entrada del precio, es decir, un falso acierto.

  Las dos limitaciones quedaron registradas, y `useCache: false` salta la caché.
- **Resto de criterios.** El aislamiento por proyecto y la degradación en modo evaluación se cumplen y están demostrados con la CLI, la API y Ollama reales.
- **Tasa de acierto.** Se muestra como porcentaje, no como 0,4. La web dice «Caché del proyecto: 40 % de aciertos (4 de 10 consultas)», y la CLI `projects` dice, por ejemplo, `cache 2/3 (66.7%)`.

---

## 6. Tickets de Trabajo

Los tickets de trabajo son las sub-issues de Linear de cada historia: cortes de una sesión de agente, revisables por separado. Al importarlos, cada uno llevaba la estructura del archivo de planificación: ID provisional, padre, estimación, dependencias, definición de hecho (DoD), descripción con lo que queda fuera y la nota «candidata a `/opsx:propose`». Al empezar cada ticket, `/enrich-us` añadía a la descripción tres bloques:

- **`[reality-map]`**: lo que ya existe en el repositorio, lo que hay que crear y los ejemplos del ticket comprobados contra el código.
- **`[enhanced]`**: la historia del ticket, los criterios Dado/Cuando/Entonces, el contexto técnico, los *non-goals* y las decisiones del agente con su destino.
- **`[original]`**: el texto importado, que se conserva.

Después, cada ticket pasó por un change de OpenSpec, que queda archivado en `openspec/changes/archive/<fecha>-<change>/` con estos ficheros:

- `proposal.md`: el porqué, qué cambia y los *non-goals*;
- `design.md`: las decisiones y los *follow-ups* con destino;
- las *delta specs* en `specs/`, con escenarios Dado/Cuando/Entonces;
- `tasks.md`: el plan TDD;
- `reports/`: la auditoría de spec, la verificación de tests y estado, la prueba manual de la interfaz, `/show-spec-working`, `/verify-against-spec` y `/adversarial-review`.

Hay 76 changes archivados. El flujo está descrito en [8.2](#82-el-flujo-completo).

Los tres tickets siguientes son uno de backend, uno de frontend y uno de base de datos. Los dos primeros cierran el flujo de impacto de punta a punta, y el tercero crea los índices y la invalidación que usan las tres historias de la sección 5.

### **Ticket 1** · BACKEND — Caso de uso `impact` sobre el grafo determinista

**[CM-HU-16a.1] Caso de uso `impact`: ancla, travesía inversa a N saltos, `direct`/`indirect`/`tests`, orden por relevancia** · [DIS-89](https://linear.app/distinta-ai4devs/issue/DIS-89/cm-hu-16a1-caso-de-uso-impact-ancla-travesia-inversa-a-n-saltos) · padre [DIS-83](https://linear.app/distinta-ai4devs/issue/DIS-83/cm-hu-16a-impacto-determinista-por-grafo-directo-indirecto-tests) · M6 · `backend` · `Feature` · `must` · M (una sesión)

**Objetivo.** Dado un cambio descrito en texto, devolver qué componentes dependen de él según el grafo determinista, a qué distancia y con qué resolución, y qué tests lo cubren, ordenado por relevancia. Es puro dominio, sin LLM, SQL ni HTTP. El riesgo, la CLI y `query_log` son de DIS-90, y el HTTP es de DIS-95.

**Criterios de aceptación** (`[enhanced]` del ticket)

1. **Q2 sobre el subconjunto (unitario).** **Dado** el doble en memoria con `acmeShopGraph()`, **cuando** llamo a `impact(store, { projectId, change: 'cambiar los descuentos de DiscountService', maxHops: 2 })`, **entonces**:
   - `direct` contiene `DiscountService` (0 saltos) y `PriceCalculator` (1 salto, `exact`);
   - `indirect` contiene `CheckoutController`, `OrderController`, `RecalculateTotals` y `SendOrderConfirmation` (2 saltos, `heuristic`);
   - `tests` contiene `DiscountServiceTest`, `PriceCalculatorTest` y `OrderPricingTest`;
   - todo lleva `origin: 'graph'`;
   - ningún componente de un fichero `test` aparece en `direct` ni en `indirect`.
2. **Q2 sobre la semilla (integración).** Lo mismo con el `StorePort` de Postgres y `seeds/graph-dump.sql`, y además `indirect` no contiene `OrderObserver`, que está a 3 saltos.
3. **Límite de saltos:**
   - con `maxHops: 1`, `indirect` está vacío;
   - con `maxHops: 3` sobre la semilla, aparece `OrderObserver` a 3 saltos;
   - sin `maxHops`, se usa 2;
   - con `maxHops` 4, 0 o 1,5, se lanza `InvalidImpactRequest` con `field: 'maxHops'` **sin llamar al store**.
4. **Orden por relevancia:** `exact` antes que `heuristic` a igual distancia, y menos saltos primero. No es alfabético: con los nombres invertidos, el orden no cambia.
5. **Sin ancla o petición inválida:**
   - un cambio sin ancla, o que solo ancla tests, da `{ status: 'unknown', reason: 'no-anchor' }` sin travesía;
   - un `change` de 4 o 501 caracteres, solo con espacios o con U+0000 lanza `InvalidImpactRequest` con `field: 'change'`, sin el valor en el mensaje;
   - un proyecto desconocido propaga `ProjectNotFound`.
6. **Texto literal de Q2 (caracterización).** Con «cambiar el cálculo de descuentos», `direct` contiene `PriceCalculator` y **no** `DiscountService`. El test documenta el límite del anclaje léxico (decisión D7).

**Detalle técnico**

- **Orden del caso de uso.** `impact.ts` hace, en este orden:
  1. valida con `impactRequestSchema` (Zod estricto);
  2. llama a `anchor()` de `context/anchor.ts` sin cambiarlo y descarta los símbolos de ficheros `test`;
  3. si el ancla sale vacía, responde `unknown` con `no-anchor`;
  4. hace la travesía inversa;
  5. agrupa y ordena.
- **Travesía** (`reverse-walk.ts`). Primero, `store.neighbors(..., ['calls','imports','extends','implements'], 'in')` hasta `maxHops`. Después, una búsqueda `findSymbols` de la clase de cada componente directo, porque las aristas `tested_by` van de clase a clase. Por último, un salto `tested_by` hacia fuera.
- **Unidad del informe** (`relevance.ts`). La unidad es el componente: `OrderController::show` se informa como `OrderController`, cada componente aparece una vez con su distancia mínima, y los componentes del fichero del ancla se omiten. La clave de orden es lexicográfica y sin pesos: saltos, luego `exact` antes que `heuristic`, luego coincidencia léxica y por último el nombre.
- **Ficheros nuevos.** En [`packages/core/src/impact/`](packages/core/src/impact/): `impact.ts`, `reverse-walk.ts`, `relevance.ts`, `impact-request.ts`, `impact-report.ts` e `index.ts`. En [`packages/core/src/context/`](packages/core/src/context/): `lexical-match.ts`, que extrae la coincidencia léxica que ya usaba `rank.ts`.
- **Ficheros modificados.** `packages/core/src/context/rank.ts` y `index.ts`, `packages/core/src/index.ts`, `docs/project-context.md` y la spec principal [`openspec/specs/impact/spec.md`](openspec/specs/impact/spec.md).
- **No funcionales.** El texto de `change` nunca se registra ni se copia en un error. Todas las lecturas filtran por proyecto. El coste está acotado a las búsquedas del ancla, como mucho una búsqueda por componente directo y dos travesías de una sentencia cada una.

**Tests**

- Unitarios en [`tests/unit/impact/`](tests/unit/impact/): `impact.spec.ts`, `impact-request.spec.ts`, `relevance.spec.ts` y `components.spec.ts`, más el grafo pequeño `small-graph.ts`. Usan el doble en memoria de `StorePort`.
- Integración en [`tests/integration/impact/acme-shop.spec.ts`](tests/integration/impact/acme-shop.spec.ts), sobre la semilla cargada en Postgres dentro de la transacción del arnés.
- 22 escenarios en la spec y 22 tests. El change suma 38 tests (36 unitarios y 2 de integración), y la suite completa quedó con 2034 tests en verde.

**Definición de hecho:** tests unitarios sobre el grafo en memoria, y un test de integración sobre acme-shop que reproduce la parte de grafo de Q2. Además, lo que exige el flujo: spec sincronizada, revisiones del change y CI en verde, incluida la mutación.

**Change de OpenSpec:** [`openspec/changes/archive/2026-10-30-impact-graph/`](openspec/changes/archive/2026-10-30-impact-graph/) · **PR:** [#90](https://github.com/DisTinta/AI4Devs-finalproject/pull/90) `feat(DIS-89): impact use case over the deterministic graph`

**Estado: Done, todos los criterios cumplidos.** `/verify-against-spec` da conformidad después de dos arreglos del propio paso. `/adversarial-review` da *PASS WITH GAPS*, sin bloqueantes ni mayores, con tres menores corregidos en la misma PR:

- un componente directo con nombre en blanco hacía fallar la llamada;
- dos tests comprobaban «es un test» por la ruta en lugar del tipo de fichero;
- uno de proceso: un texto de la spec se escribió después del commit de implementación sin cerrar la ronda 3 de la auditoría, y se cerró en la misma PR.

El límite del anclaje léxico (criterio 6) se aceptó como decisión y no como defecto.

### **Ticket 2** · FRONTEND — Pantalla 3: informe de impacto

**[CM-HU-17.1] `ImpactPage` con cinco secciones, `OriginTag`, `RiskBanner`, `maxHops`, estados `UNKNOWN`/error/vacío y pasada de accesibilidad** · [DIS-14](https://linear.app/distinta-ai4devs/issue/DIS-14/cm-hu-171-impactpage-con-cinco-secciones-origintag-riskbanner-maxhops) · padre [DIS-8](https://linear.app/distinta-ai4devs/issue/DIS-8/cm-hu-17-web-pantalla-3-informe-de-impacto-con-origen-por-linea) · M5 (Entrega 3) · `frontend` · `Feature` · `must` · M (1–1½ sesiones)

**Objetivo.** Describir un cambio en la web y ver el informe de `POST /api/projects/{id}/impact` por secciones, con el origen de cada línea (`[grafo]` o `[git]`) y el nivel de riesgo con su justificación. No hay cambios en `packages/api` ni en `packages/core`: la API ya estaba cerrada con DIS-95.

**Criterios de aceptación** (`[enhanced]` del ticket)

1. **Informe respondido (Q2).** **Cuando** escribo «cambiar los descuentos de DiscountService», dejo «Saltos del grafo» en 2 y pulso «Analizar», **entonces**:
   - se envía exactamente un `POST` con `{ "change": …, "maxHops": 2 }`;
   - aparecen, en este orden, las secciones «Directo», «Indirecto», «Tests», «Documentación» e «Historial» y el bloque de riesgo;
   - cada elemento muestra símbolo, fichero, saltos, resolución («exacta» o «heurística») y la etiqueta de texto `[grafo]`, y el historial muestra «co-cambia 100 %», sus PR y `[git]`;
   - el riesgo se lee «Riesgo alto» en texto, no solo por el color, junto con su `rationale`;
   - el orden de cada lista es el de la API;
   - la región de estado anuncia «Informe de impacto recibido.».
2. **Documento desactualizado y sección vacía.**
   - Un documento `stale` dice «⚠ desactualizada desde el commit <7 caracteres>», y el ⚠ queda oculto a las tecnologías de apoyo.
   - Una sección vacía sigue visible con «Sin elementos».
   - Un historial sin PR dice «sin PR».
   - El `<select>` de saltos (1, 2 o 3) es operable por teclado, y su valor viaja en el cuerpo de la petición.
3. **`unknown` honesto.** Con `{ status: 'unknown', reason: 'no-anchor' }` no se muestra ninguna sección. Aparece «Sin ancla en el grafo», con la explicación y la sugerencia de nombrar una clase o un fichero.
4. **Errores y cambio inválido.**
   - Un cambio de menos de 5 o más de 500 caracteres, solo con espacios o con U+0000 no envía nada, marca el campo con `aria-invalid` y muestra una alerta.
   - Las respuestas `429`, `404`, `400` y `500` y la API caída muestran una alerta `role="alert"`, y no queda en pantalla ningún informe anterior.
5. **Pendiente, navegación y accesibilidad.**
   - Mientras se calcula se lee «Calculando impacto…», y un segundo envío no lanza otra petición.
   - Al salir de la página, la petición se aborta.
   - Hay enlaces entre la Pantalla 2 y la 3.
   - `npm run test:a11y` no da violaciones en ningún estado.
   - El paso 4 se reproduce en un navegador real contra `npm run up`, con capturas.

**Detalle técnico**

- **Orden de capas:** test → servicio → funciones puras → componentes → hook → página → ruta.
- **Servicio.** `impact()` y sus tipos se añaden a [`packages/web/src/services/api-client.ts`](packages/web/src/services/api-client.ts). El contrato de tipos contra el esquema Zod de la API se comprueba en `tests/unit/web/api-contract.spec.ts`.
- **Funciones puras.** [`impact-display.ts`](packages/web/src/components/impact-display.ts) valida el cambio y prepara las etiquetas.
- **Componentes nuevos.** `ChangeBox`, `ImpactSection`, `ImpactReport`, `ImpactUnknownState`, `OriginTag`, `RiskBanner` y `ProjectNav`, en [`packages/web/src/components/`](packages/web/src/components/).
- **Hook y página.** [`useImpact.ts`](packages/web/src/pages/useImpact.ts) sigue el patrón de `useAsk`: estados, `AbortController` y aborto al desmontar. [`ImpactPage.tsx`](packages/web/src/pages/ImpactPage.tsx) compone la pantalla.
- **Ruta.** `/p/:projectId/impact` en `router.tsx`, con enlace desde `AskPage`.
- **Accesibilidad y contraste.** Colores solo de los tokens existentes. El par más bajo da 4,52:1, medido en el navegador porque axe en jsdom no ve el contraste.
- **Documentación.** `readme.md` §1.3, `docs/DEMO.md` y `docs/frontend-standards.md`.

**Tests**

- RTL en [`ImpactPage.test.tsx`](packages/web/src/pages/ImpactPage.test.tsx), con un doble de `fetch` en el borde de red.
- Unitarios en `impact-display.test.ts` y `api-client.test.ts`.
- Accesibilidad en [`tests/a11y/impact-page.a11y.test.tsx`](tests/a11y/impact-page.a11y.test.tsx), más la ruta nueva en `smoke.a11y.test.tsx`.
- El alcance web da 18 ficheros y 116 tests en verde. La suite completa pasó de 1820 a 1849 tests.
- Recorrido en un navegador real con capturas en [`reports/`](openspec/changes/archive/2026-11-02-impact-page/reports/): Q2, `unknown`, `429`, API caída, foco y 320 px.

**Definición de hecho:** el recorrido del paso 4 de §1.3 se reproduce en el navegador, cada estado tiene su test RTL y `test:a11y` sale limpio. El E2E con Playwright queda fuera de este ticket: lo hace DIS-75.

**Change de OpenSpec:** [`openspec/changes/archive/2026-11-02-impact-page/`](openspec/changes/archive/2026-11-02-impact-page/). Crea la capacidad `impact-page` y trae los deltas de `web-foundation` y `ask-page`. · **PR:** [#98](https://github.com/DisTinta/AI4Devs-finalproject/pull/98) `feat(web): pantalla 3 de impacto con origen por línea y riesgo (DIS-14)`

**Estado: Done, con tres diferencias registradas frente a la historia padre.**

- **Tokens y coste (D6).** El wireframe de §1.3 pide un bloque de «tokens y coste», pero `/impact` no llama al modelo ni devuelve `usage`. La pantalla muestra «Informe determinista: sin llamada al modelo de lenguaje.» en lugar de inventar cifras.
- **Etiqueta de origen (P9).** Es solo texto, sin icono; DIS-8 pedía texto e icono.
- **Códigos de error (P10).** `INVALID_IMPACT_REQUEST`, `VALIDATION_ERROR` e `INTERNAL` muestran la alerta genérica con «Código: X.», no un mensaje traducido para cada uno.

`/verify-against-spec` no encontró nada que corregir. `/adversarial-review` da *PASS WITH GAPS*, sin bloqueantes ni mayores. Queda registrada una deuda de proceso (P15): parte de los componentes se escribió antes que sus tests, y cada test se validó después con una mutación que se vio fallar.

### **Ticket 3** · BASE DE DATOS — Índices de consulta y vectoriales e invalidación `stale`

**[CM-HU-01.3] Índices de travesía, parcial `stale`, HNSW y trigger de invalidación por `content_hash`** · [DIS-13](https://linear.app/distinta-ai4devs/issue/DIS-13/cm-hu-013-indices-de-travesia-parcial-stale-hnsw-y-trigger-de) · padre [DIS-5](https://linear.app/distinta-ai4devs/issue/DIS-5/cm-hu-01-esquema-postgresql-del-grafo-con-restricciones-e-indices) · M1 · `database` · `Feature` · `must` · una sesión

**Objetivo.** Las diez tablas existían desde DIS-11 y DIS-12, pero sin índices secundarios, sin índices vectoriales y sin invalidación. Este ticket completa el esquema de M1 con una tercera migración, `0003_indexes-stale`. La travesía del grafo y los borrados en cascada dejan de recorrer tablas enteras, y una afirmación pasa sola a `stale` cuando cambia el código que cita. DIS-10 (reindexado incremental) y DIS-23 (escrituras del `StorePort`) estaban bloqueados por él.

DIS-13 es anterior al paso `/enrich-us`, así que su ticket solo tiene el texto `[original]`. El detalle está en el change de OpenSpec.

**Criterios de aceptación** (DoD del ticket y escenarios de la delta spec `graph-schema`)

- Después de migrar, existen **exactamente** los 17 índices secundarios de la tabla de la spec (tabla, columnas, método, *opclass* y predicado), comprobados en el catálogo.
- Toda FK con `ON DELETE CASCADE` tiene un índice que empieza por ella.
- **Cambiar el `content_hash`** de un fichero deja `stale` las afirmaciones `current` que lo citan, en la misma sentencia y con `updated_at = now()`. Cuenta como cambio poner el primer hash sobre `NULL` y también borrarlo a `NULL`.
- No cambian de estado:
  - las afirmaciones que citan otros ficheros;
  - una actualización de otras columnas, o del mismo hash;
  - una afirmación que ya estaba `stale`.
- La invalidación funciona aunque:
  - cambien varios ficheros en una sola sentencia;
  - el hash llegue por un `INSERT … ON CONFLICT DO UPDATE` o lo reescriba otro trigger;
  - la sesión tenga otro `search_path` o una tabla temporal llamada `claim`.
- La migración es reversible: tras un `db:rollback` el esquema es idéntico al de `0001` + `0002`, sin índices, triggers ni funciones sobrantes. El ciclo aplicar → revertir → aplicar es reproducible.

**Detalle técnico**

- **Migración.** [`packages/adapters/store-postgres/migrations/0003_indexes-stale.up.sql`](packages/adapters/store-postgres/migrations/0003_indexes-stale.up.sql) y `.down.sql`. No crea tablas, columnas ni enums, y no edita `0001` ni `0002`.
- **Travesía.** Cuatro índices parciales sobre `edge`, uno por columna de extremo, por ejemplo `(source_symbol_id, kind) WHERE source_symbol_id IS NOT NULL`. El readme pedía `(project_id, source_id, kind)`, pero desde DIS-11 cada extremo son dos FK ([ADR](docs/adr/20260928-edge-endpoints-as-fk-pairs.md)). Un id de extremo ya pertenece a un solo proyecto, y el índice sirve también a la cascada.
- **FK en cascada.** Siete índices: `edge`, `claim`, `query_log` y `cache_entry` por `project_id`, `symbol` por `file_id`, y `evidence` por `claim_id` y por `file_id`.
- **Índices de §3.2.** `file (project_id, content_hash)`, `file_commit (commit_id)` y el parcial `claim (project_id, status) WHERE status = 'stale'`, que usa el recálculo perezoso de DIS-42.
- **HNSW.** Tres índices con `vector_cosine_ops` sobre `file.embedding`, `symbol.embedding` y `cache_entry.question_embedding`, con los parámetros por defecto. La migración `0005_embedding-768` de DIS-67 los reconstruyó para `vector(768)`.
- **Invalidación.** Una función `mark_claims_stale_on_content_change()` con `SET search_path = public, pg_temp`, y un trigger `AFTER UPDATE ON file` con la guarda `WHEN (OLD.content_hash IS DISTINCT FROM NEW.content_hash)`. El trigger nunca devuelve una afirmación a `current`: recalcularla es trabajo de CM-HU-09.4.
- **Herramienta de test.** [`tests/integration/store/schema-snapshot.ts`](tests/integration/store/schema-snapshot.ts) pasa a capturar índices, triggers y funciones. Sin eso, una sección *down* incompleta habría pasado los tests de reversibilidad.
- **Documentación.** `readme.md` §3.2 y `docs/project-context.md`.

**Tests**

- [`tests/integration/store/indexes-stale.spec.ts`](tests/integration/store/indexes-stale.spec.ts) cubre el trigger, una transacción por test.
- [`tests/integration/store/migrations.spec.ts`](tests/integration/store/migrations.spec.ts) cubre el contrato de índices leído del catálogo y el ciclo de vida con tres migraciones.
- 20 escenarios en la spec, cada uno con su test. Varias reglas se comprobaron provocando el fallo: sin la guarda `WHEN`, sin `status = 'current'`, sin un `DROP INDEX` o sin el `DROP FUNCTION` en la sección *down*, el test correspondiente falla.
- `/show-spec-working` ejecutó un guion independiente de Vitest contra Postgres real: «20 scenarios exercised, 20 match the spec, 0 do not».

**Definición de hecho:** hay un test en el que cambiar `content_hash` deja `stale` las afirmaciones que citan el fichero, los índices aparecen en el catálogo y las migraciones pasan en CI (aplicar → revertir → aplicar).

**Change de OpenSpec:** [`openspec/changes/archive/2026-09-29-schema-indexes-stale/`](openspec/changes/archive/2026-09-29-schema-indexes-stale/), con la delta de `graph-schema` · **PR:** [#7](https://github.com/DisTinta/AI4Devs-finalproject/pull/7) `feat(DIS-13): añadir índices de consulta y vectoriales e invalidación stale`

**Estado: Done.** Se cumplen la DoD y los 20 escenarios. El change pasó `/verify-against-spec` y cuatro rondas de `/adversarial-review`; cada ronda añadió escenarios, que pasaron de 14 a 20. Es anterior al `spec-auditor`, que se incorporó al flujo en la PR #35, así que no tiene informe de auditoría de spec. El objetivo de la Entrega 1 de «travesía a 2 saltos sobre 100 000 aristas en menos de 200 ms» **no se ha medido**: este change lo dejó fuera de alcance y [DIS-24](https://linear.app/distinta-ai4devs/issue/DIS-24/cm-hu-023-lecturas-simbolos-por-nombre-vecinos-a-n-saltos-recursiva), que implementa la travesía, tampoco lo midió.

---

## 7. Pull Requests

Las pull requests se abren contra la rama de cada entrega —`feature/entrega-2-CRN` en la Entrega 2 y `final-project-CRN` en la Entrega 3— y se fusionan con *merge commit*, con CI en verde y solo después del commit de `/opsx:archive` del change. A 04-11-2026 hay **106 fusionadas**: **59** en la Entrega 2 (`gh pr list --base feature/entrega-2-CRN --state merged`: de la #1 a la #60, sin la #27, cerrada sin fusionar) y **47** en la Entrega 3 (`gh pr list --base final-project-CRN --state merged`: la #61 y de la #63 a la #108). La #62 es la prueba en seco del merge autónomo, fusionada en una rama temporal (`tmp-autonomous-dry-run`) que ya no existe. Las de producto llevan su ticket `DIS-n` en el título y en la rama y, si cambian comportamiento, su change de OpenSpec archivado en `openspec/changes/archive/` con los informes de revisión en `reports/`; las del kit, la CI y la doctrina no tienen ticket (#1–#3, #28, #35, #40, #63–#67, #70, #72, #73, #76, #80, #93, #96 y #97). Las descripciones las genera `/pr-describe` ([8.2](#82-el-flujo-completo)) y están en español, salvo varias del kit y de la CI de la Entrega 3, que están en inglés (#67, #70, #71, #72, #73, #76, #93 y #101).

La Entrega 1 anunció tres candidatas: esquema y analizador PHP, el flujo `explain` completo con web mínima, y el analizador TypeScript. El trabajo se partió en PR mucho más pequeñas, así que aquí se destacan **tres PR concretas, una por área**, y una cuarta de la Entrega 3: la del analizador TypeScript, que llegó en la Entrega 3 (#74, DIS-30, y #75, DIS-31) y cumplió su promesa: la descripción de la #74 dice que `git diff --stat final-project-CRN -- packages/core` está vacío.

### PR 1 · Base de datos — [#4](https://github.com/DisTinta/AI4Devs-finalproject/pull/4) `feat(DIS-11): esquema del grafo L1 y runner de node-pg-migrate`

La primera pieza de código del grafo: sustituye los *stubs* de `db:migrate` / `db:rollback` por un runner real de `node-pg-migrate` con SQL plano (`.up.sql` / `.down.sql`) y crea `project`, `file`, `symbol` y `edge` con la integridad garantizada por PostgreSQL. Ahí nace la decisión de las aristas con dos claves foráneas por extremo y un `CHECK (num_nonnulls(...) = 1)` ([ADR](docs/adr/20260928-edge-endpoints-as-fk-pairs.md)), y la secuencia aplicar → revertir → aplicar que CI repite en cada PR. 35 tests de integración cubren los 27 escenarios de la spec `graph-schema` (change `schema-graph-l1`). La siguieron DIS-12 (#6, historial, afirmaciones, uso y caché) y DIS-13 (#7, índices, HNSW y el trigger de invalidación).

### PR 2 · Backend — [#43](https://github.com/DisTinta/AI4Devs-finalproject/pull/43) `feat(DIS-72): confianza calculada por afirmación y por respuesta, pesos publicados y salida del modelo con valla`

La confianza deja de ser un número del modelo y pasa a ser una función pura de señales del grafo y del verificador (`packages/core/src/knowledge/confidence.ts`), con los seis pesos publicados en `docs/CONFIDENCE.md` y un test que falla si el documento y el código no coinciden. En la misma PR se resolvieron dos hallazgos de la sesión con el modelo real: Ollama recortaba el prompt (`OLLAMA_CONTEXT_LENGTH=16384`) y algunos modelos envuelven el JSON en una valla Markdown (la cuarentena acepta ahora una única valla). Es el ejemplo trazado de punta a punta en [8.4](#84-ejemplo-trazado-de-punta-a-punta-dis-72).

### PR 3 · Frontend — [#53](https://github.com/DisTinta/AI4Devs-finalproject/pull/53) `feat(DIS-58): andamiaje del cliente web (Tailwind, router, cliente API tipado y gate de accesibilidad)`

El andamiaje de la web: tema de Tailwind con los colores de los wireframes y un test de contraste, rutas con React Router, un cliente tipado de la API con su modelo de errores y un test que falla si los tipos del cliente se separan de los esquemas de la API, y `test:a11y` como puerta real con axe sobre cada ruta. La hizo el workflow autónomo y la fusionó él mismo ([8.6](#86-experimento-workflow-autónomo-en-las-últimas-tareas-de-la-entrega-2)). Encima se montaron la Pantalla 1 (DIS-60, #54) y la Pantalla 2 (DIS-65, #56, y DIS-66, #57), también del workflow, y, en la Entrega 3, la Pantalla 3 de impacto (DIS-14, [#98](https://github.com/DisTinta/AI4Devs-finalproject/pull/98)).

### PR 4 · Analizador TypeScript (Entrega 3) — [#74](https://github.com/DisTinta/AI4Devs-finalproject/pull/74) `feat(analyzers): analizador TypeScript con símbolos, spans y aristas (DIS-30)`

La candidata que la Entrega 1 dejó para la Entrega 3. Añade `createTypeScriptAnalyzer()` en `packages/analyzers/typescript`: analiza los `.ts` de la entrada como un único programa del compilador sobre un host en memoria, sin biblioteca estándar ni acceso a disco, y emite símbolos (`class`, `interface`, `function`, `method`) con spans y firma, y aristas `exact` de `imports`, `extends` / `implements` y `tested_by`, con el mismo contrato `AnalyzerPort` que el analizador PHP. La descripción lleva la prueba prometida: `git diff --stat final-project-CRN -- packages/core` está vacío. Le siguió la #75 (DIS-31), con las llamadas `exact` resueltas con el `TypeChecker`. Las dos las hizo, de principio a fin, el primer bloque de ejecución autónoma con el workflow guardado ([8.7](#87-ejecuciones-autónomas-de-la-entrega-3)).

### Todas las PR de la Entrega 2

<details>
<summary>59 PR fusionadas (desplegar)</summary>

| PR | Ticket | Change de OpenSpec | Contenido |
|---|---|---|---|
| [#1](https://github.com/DisTinta/AI4Devs-finalproject/pull/1), [#2](https://github.com/DisTinta/AI4Devs-finalproject/pull/2) | — | — (harness) | Instalación del kit, OpenSpec, TypeDoc |
| [#3](https://github.com/DisTinta/AI4Devs-finalproject/pull/3) | — | — (planificación) | Backlog de producto e importación a Linear |
| [#4](https://github.com/DisTinta/AI4Devs-finalproject/pull/4), [#5](https://github.com/DisTinta/AI4Devs-finalproject/pull/5) | DIS-11 | `schema-graph-l1` | Esquema del grafo L1 y runner de migraciones |
| [#6](https://github.com/DisTinta/AI4Devs-finalproject/pull/6) | DIS-12 | `schema-history-claims` | Historial, afirmaciones, uso y caché |
| [#7](https://github.com/DisTinta/AI4Devs-finalproject/pull/7) | DIS-13 | `schema-indexes-stale` | Índices, HNSW e invalidación `stale` |
| [#8](https://github.com/DisTinta/AI4Devs-finalproject/pull/8) | DIS-22 | `test-db-isolation` | Transacción por test y factorías |
| [#9](https://github.com/DisTinta/AI4Devs-finalproject/pull/9) | DIS-23 | `store-graph-write` | Escritura transaccional del grafo |
| [#10](https://github.com/DisTinta/AI4Devs-finalproject/pull/10) | DIS-24 | `store-graph-read` | Lecturas del grafo por proyecto |
| [#11](https://github.com/DisTinta/AI4Devs-finalproject/pull/11) | DIS-35 | `git-history-extraction` | `GitPort` y autores seudonimizados |
| [#12](https://github.com/DisTinta/AI4Devs-finalproject/pull/12) | DIS-36 | `co-change-edges` | Aristas `co_changed` ponderadas |
| [#13](https://github.com/DisTinta/AI4Devs-finalproject/pull/13) | DIS-47 | `analyzer-port-and-php-structure` | `AnalyzerPort` y analizador PHP |
| [#14](https://github.com/DisTinta/AI4Devs-finalproject/pull/14) | DIS-49 | `php-declarative-edges` | Aristas declarativas de PHP |
| [#15](https://github.com/DisTinta/AI4Devs-finalproject/pull/15) | DIS-52 | `php-declared-type-calls` | Llamadas `exact` por tipo declarado |
| [#16](https://github.com/DisTinta/AI4Devs-finalproject/pull/16), [#17](https://github.com/DisTinta/AI4Devs-finalproject/pull/17) | DIS-61 | `php-laravel-heuristics-1` | Facades, bindings y `__call` |
| [#18](https://github.com/DisTinta/AI4Devs-finalproject/pull/18) | DIS-97 | `php-laravel-heuristics-2a` | Rutas por string, jobs y eventos |
| [#19](https://github.com/DisTinta/AI4Devs-finalproject/pull/19) | DIS-98 | `php-laravel-heuristics-2b` | Atributos Eloquent y no resueltos |
| [#20](https://github.com/DisTinta/AI4Devs-finalproject/pull/20) | DIS-96 | `analyzer-php-debt` | Deuda del analizador PHP |
| [#21](https://github.com/DisTinta/AI4Devs-finalproject/pull/21) | DIS-99 | `analyzer-port-edges-tsdoc` | TSDoc de las aristas |
| [#22](https://github.com/DisTinta/AI4Devs-finalproject/pull/22) | DIS-84 | `security-gateway` | Redacción de secretos y confinamiento de rutas |
| [#23](https://github.com/DisTinta/AI4Devs-finalproject/pull/23) | DIS-85 | `index-repository` | Caso de uso de indexado |
| [#24](https://github.com/DisTinta/AI4Devs-finalproject/pull/24) | DIS-86 | `cli-index-command` | Comando `index` |
| [#25](https://github.com/DisTinta/AI4Devs-finalproject/pull/25) | DIS-100 | `index-repository-debt` | Deuda del indexado |
| [#26](https://github.com/DisTinta/AI4Devs-finalproject/pull/26) | DIS-87 | `ci-secret-scan` | `gitleaks` en CI |
| [#28](https://github.com/DisTinta/AI4Devs-finalproject/pull/28) | — | — (doctrina) | Revisión previa al merge en cada `tasks.md` |
| [#29](https://github.com/DisTinta/AI4Devs-finalproject/pull/29) | DIS-91 | `seed-build` | Semilla reproducible |
| [#30](https://github.com/DisTinta/AI4Devs-finalproject/pull/30) | DIS-92 | `seed-load-and-projects` | `db:seed` y `cli projects` |
| [#31](https://github.com/DisTinta/AI4Devs-finalproject/pull/31) | DIS-17 | `llm-adapter` | `LlmPort` y adaptador compatible OpenAI |
| [#32](https://github.com/DisTinta/AI4Devs-finalproject/pull/32) | DIS-18 | `llm-evaluation-budget` | Modo evaluación y techo de gasto |
| [#33](https://github.com/DisTinta/AI4Devs-finalproject/pull/33) | DIS-27 | `context-engine-anchor-expand` | Anclaje y expansión |
| [#34](https://github.com/DisTinta/AI4Devs-finalproject/pull/34) | DIS-28 | `context-engine-rank-budget` | Ranking y presupuesto de tokens |
| [#35](https://github.com/DisTinta/AI4Devs-finalproject/pull/35) | — | — (harness) | `spec-auditor` obligatorio entre propose y apply |
| [#36](https://github.com/DisTinta/AI4Devs-finalproject/pull/36) | DIS-38 | `claims-and-typing` | Afirmaciones tipadas y cuarentena |
| [#37](https://github.com/DisTinta/AI4Devs-finalproject/pull/37) | DIS-39 | `explain-use-case` | Caso de uso `explain` |
| [#38](https://github.com/DisTinta/AI4Devs-finalproject/pull/38) | DIS-40 | `cli-ask` | Comando `ask` |
| [#39](https://github.com/DisTinta/AI4Devs-finalproject/pull/39) | DIS-41 | `untrusted-content-sanitization` | Sanitización del contenido no confiable |
| [#40](https://github.com/DisTinta/AI4Devs-finalproject/pull/40) | — | — (CI) | Stryker incremental en un job propio |
| [#41](https://github.com/DisTinta/AI4Devs-finalproject/pull/41) | DIS-68 | `evidence-verifier-syntactic` | Verificación sintáctica de citas |
| [#42](https://github.com/DisTinta/AI4Devs-finalproject/pull/42) | DIS-70 | `evidence-verifier-semantic` | Verificación semántica de citas |
| [#43](https://github.com/DisTinta/AI4Devs-finalproject/pull/43) | DIS-72 | `confidence-score` | Confianza calculada |
| [#44](https://github.com/DisTinta/AI4Devs-finalproject/pull/44) | DIS-74 | `query-usage-log` | Uso por consulta en `query_log` |
| [#45](https://github.com/DisTinta/AI4Devs-finalproject/pull/45) | DIS-76 | `api-foundation` | Base HTTP de la API |
| [#46](https://github.com/DisTinta/AI4Devs-finalproject/pull/46) | DIS-78 | `ask-endpoint` | `POST /ask` |
| [#47](https://github.com/DisTinta/AI4Devs-finalproject/pull/47) | DIS-21 | `evaluation-cache` | Caché por pregunta normalizada |
| [#48](https://github.com/DisTinta/AI4Devs-finalproject/pull/48) | DIS-26 | `golden-cache-build` | Respuestas *golden* con Ollama |
| [#49](https://github.com/DisTinta/AI4Devs-finalproject/pull/49), [#50](https://github.com/DisTinta/AI4Devs-finalproject/pull/50) | DIS-34 | flujo ligero | Revisión de las golden y firma de la autora |
| [#51](https://github.com/DisTinta/AI4Devs-finalproject/pull/51) | DIS-44 | `verify-smoke` | `npm run verify` real |
| [#52](https://github.com/DisTinta/AI4Devs-finalproject/pull/52) | DIS-45 | flujo ligero | `DEMO.md`, `DEPLOYMENT.md` y `TESTING.md` con salida real |
| [#53](https://github.com/DisTinta/AI4Devs-finalproject/pull/53) | DIS-58 | `web-foundation` | Andamiaje web |
| [#54](https://github.com/DisTinta/AI4Devs-finalproject/pull/54) | DIS-60 | `project-picker` | Pantalla 1 |
| [#56](https://github.com/DisTinta/AI4Devs-finalproject/pull/56) | DIS-65 | `ask-page` | Pantalla 2: pregunta, sugeridas, afirmaciones tipadas y evidencia |
| [#57](https://github.com/DisTinta/AI4Devs-finalproject/pull/57) | DIS-66 | `ask-page-states` | Pantalla 2: panel de uso y estados `UNKNOWN`, `429` y error |
| [#55](https://github.com/DisTinta/AI4Devs-finalproject/pull/55) | DIS-101 | flujo ligero | El readme de la Entrega 2 y el experimento del workflow |
| [#58](https://github.com/DisTinta/AI4Devs-finalproject/pull/58) | DIS-102 | `cross-shell-demo-spanish-docs` | Arranque y guion de demo iguales en PowerShell y Bash, guías en español |
| [#59](https://github.com/DisTinta/AI4Devs-finalproject/pull/59) | DIS-103 | `real-model-clean-clone` | Probar con un modelo real desde un clon limpio |
| [#60](https://github.com/DisTinta/AI4Devs-finalproject/pull/60) | DIS-101 | flujo ligero | Cierre del experimento: tanda 4, prueba manual de la autora y su conclusión |

</details>

### Todas las PR de la Entrega 3

<details>
<summary>47 PR fusionadas en <code>final-project-CRN</code>, más la #62 de la prueba en seco (desplegar)</summary>

| PR | Ticket | Change de OpenSpec | Contenido |
|---|---|---|---|
| [#61](https://github.com/DisTinta/AI4Devs-finalproject/pull/61) | DIS-106 | `autonomous-run-switch` | Modo autónomo del kit: interruptor manual, puerta de merge y paridad con Cursor |
| [#62](https://github.com/DisTinta/AI4Devs-finalproject/pull/62) | — | — (prueba en seco) | Merge autónomo de prueba, fusionado en la rama temporal `tmp-autonomous-dry-run` |
| [#63](https://github.com/DisTinta/AI4Devs-finalproject/pull/63) | — | — (kit) | Configuración propia de `gh` para la ejecución autónoma |
| [#64](https://github.com/DisTinta/AI4Devs-finalproject/pull/64) | — | — (tests) | Fotos de `seed-load` limitadas a los proyectos del seed y del test |
| [#65](https://github.com/DisTinta/AI4Devs-finalproject/pull/65) | — | — (kit) | Guía paso a paso de la ejecución autónoma |
| [#66](https://github.com/DisTinta/AI4Devs-finalproject/pull/66) | — | — (kit) | Avisos de inicio de sesión visibles en la terminal |
| [#67](https://github.com/DisTinta/AI4Devs-finalproject/pull/67) | — | — (kit) | Rondas de corrección de la auditoría en modo autónomo |
| [#68](https://github.com/DisTinta/AI4Devs-finalproject/pull/68) | DIS-104 | `answer-language` | Respuestas en el idioma de la pregunta |
| [#69](https://github.com/DisTinta/AI4Devs-finalproject/pull/69) | DIS-105 | `dis-105-npm-audit-debt` | Deuda de `npm audit`: Vitest 4.1, Vite 8, Stryker 10 y Node 22.12 |
| [#70](https://github.com/DisTinta/AI4Devs-finalproject/pull/70) | — | — (kit) | Contrato autónomo endurecido tras el piloto DIS-104/DIS-105 |
| [#71](https://github.com/DisTinta/AI4Devs-finalproject/pull/71) | DIS-104 | flujo ligero | Firma de la autora de las golden regeneradas |
| [#72](https://github.com/DisTinta/AI4Devs-finalproject/pull/72) | — | — (kit) | `scripts/dev-processes.mjs` para parar procesos huérfanos |
| [#73](https://github.com/DisTinta/AI4Devs-finalproject/pull/73) | — | — (kit) | Workflow guardado `.claude/workflows/autonomous-sdd.js` |
| [#74](https://github.com/DisTinta/AI4Devs-finalproject/pull/74) | DIS-30 | `ts-analyzer-structure` | Analizador TypeScript: símbolos, spans y aristas |
| [#75](https://github.com/DisTinta/AI4Devs-finalproject/pull/75) | DIS-31 | `ts-calls-exact` | Llamadas `exact` de TypeScript con el `TypeChecker` |
| [#76](https://github.com/DisTinta/AI4Devs-finalproject/pull/76) | — | — (kit) | El workflow espera la CI en primer plano |
| [#77](https://github.com/DisTinta/AI4Devs-finalproject/pull/77) | DIS-32 | `task-api-seed-golden` | Semilla y golden de task-api: dos proyectos de muestra |
| [#78](https://github.com/DisTinta/AI4Devs-finalproject/pull/78) | DIS-80 | `callsite-annotations` | Anotación de sitios de llamada por un panel de agentes |
| [#79](https://github.com/DisTinta/AI4Devs-finalproject/pull/79) | DIS-33 | `golden-independent-review` | Revisión independiente de las golden por un panel de agentes |
| [#80](https://github.com/DisTinta/AI4Devs-finalproject/pull/80) | — | — (docs) | Ollama vuelve a usar la GPU |
| [#81](https://github.com/DisTinta/AI4Devs-finalproject/pull/81) | DIS-107 | `ts-await-using-golden-regen` | `using` / `await using` fuera de los símbolos y golden regeneradas |
| [#82](https://github.com/DisTinta/AI4Devs-finalproject/pull/82) | DIS-9 | `index-endpoint` | `POST /api/projects/{id}/index` |
| [#83](https://github.com/DisTinta/AI4Devs-finalproject/pull/83) | DIS-111 | flujo ligero | `tests/harness` en su propio proyecto de Vitest |
| [#84](https://github.com/DisTinta/AI4Devs-finalproject/pull/84) | DIS-10 | `incremental-indexing` | Reindexado incremental por `content_hash` |
| [#85](https://github.com/DisTinta/AI4Devs-finalproject/pull/85) | DIS-42 | `stale-claims-refresh` | Recálculo perezoso de afirmaciones `stale` |
| [#86](https://github.com/DisTinta/AI4Devs-finalproject/pull/86) | DIS-110 | `pool-transaction-release` | Conexión del pool destruida tras un fallo de `BEGIN` o `ROLLBACK` |
| [#87](https://github.com/DisTinta/AI4Devs-finalproject/pull/87) | DIS-110 | `golden-review-dis-110-r2` | Segunda ronda golden y `Purpose` de `explain` |
| [#88](https://github.com/DisTinta/AI4Devs-finalproject/pull/88) | DIS-110 | `open-store-test-flake` | Carrera del test de liberación de conexiones |
| [#89](https://github.com/DisTinta/AI4Devs-finalproject/pull/89) | DIS-110 | `integration-test-races` | Carreras de la suite de integración en paralelo |
| [#90](https://github.com/DisTinta/AI4Devs-finalproject/pull/90) | DIS-89 | `impact-graph` | Caso de uso `impact` sobre el grafo determinista |
| [#91](https://github.com/DisTinta/AI4Devs-finalproject/pull/91) | DIS-90 | `impact-risk-cli` | Riesgo, fila de `query_log` y comando `impact` |
| [#92](https://github.com/DisTinta/AI4Devs-finalproject/pull/92) | DIS-90 | flujo ligero | Captura en PowerShell del paso 4 de la demo |
| [#93](https://github.com/DisTinta/AI4Devs-finalproject/pull/93) | — | — (CI) | Mutación incremental en los push a la base, pasada completa a mano |
| [#94](https://github.com/DisTinta/AI4Devs-finalproject/pull/94) | DIS-94 | `impact-history-docs` | Historial y documentación en el informe de impacto |
| [#95](https://github.com/DisTinta/AI4Devs-finalproject/pull/95) | DIS-95 | `http-impact` | `POST /impact` |
| [#96](https://github.com/DisTinta/AI4Devs-finalproject/pull/96) | — | — (kit) | Sin traspaso de PowerShell a la autora; specs principales antes del archivo |
| [#97](https://github.com/DisTinta/AI4Devs-finalproject/pull/97) | — | — (kit) | `CMD_TEST` con los proyectos `dom`, `seed-build` y `node` |
| [#98](https://github.com/DisTinta/AI4Devs-finalproject/pull/98) | DIS-14 | `impact-page` | Pantalla 3 de impacto |
| [#99](https://github.com/DisTinta/AI4Devs-finalproject/pull/99) | DIS-75 | `e2e-playwright-suite` | Suite E2E con Playwright y job `e2e` |
| [#100](https://github.com/DisTinta/AI4Devs-finalproject/pull/100) | DIS-77 | `informative-coverage` | Cobertura informativa por paquete |
| [#101](https://github.com/DisTinta/AI4Devs-finalproject/pull/101) | DIS-77 | flujo ligero | Comentarios `// Spec:` apuntando al change archivado |
| [#102](https://github.com/DisTinta/AI4Devs-finalproject/pull/102) | DIS-79 | `graph-quality-measurement` | Medición de la calidad del grafo (Tabla 2) |
| [#103](https://github.com/DisTinta/AI4Devs-finalproject/pull/103) | DIS-81 | `context-measurement` | Medición del ahorro de contexto y del verificador (Tabla 1) |
| [#104](https://github.com/DisTinta/AI4Devs-finalproject/pull/104) | DIS-82 | `answer-review` | Revisión de las respuestas de la Tabla 1 por un panel ciego |
| [#105](https://github.com/DisTinta/AI4Devs-finalproject/pull/105) | DIS-67 | `semantic-cache` | Búsqueda por similitud en la caché de respuestas |
| [#106](https://github.com/DisTinta/AI4Devs-finalproject/pull/106) | DIS-71 | `add-drift-detection` | Detección de deriva entre documentos y código |
| [#107](https://github.com/DisTinta/AI4Devs-finalproject/pull/107) | DIS-73 | `add-cli-drift` | Comando `drift` e informe golden de deriva |
| [#108](https://github.com/DisTinta/AI4Devs-finalproject/pull/108) | DIS-69 | `cache-hit-rate` | Tasa de aciertos de caché y vectores de las golden |

</details>

**La Entrega 1 se sometió desde la rama `feature/entrega-1-CRN`**, en una pull request que solo contenía los dos documentos y los wireframes. Queda anotada aquí por trazabilidad, pero no cuenta como una de las tres: no muestra nada del proceso de desarrollo. Las ramas de entrega, con las iniciales que exige la mecánica del máster, son `feature/entrega-1-CRN`, `feature/entrega-2-CRN` y `final-project-CRN`.

---

## 8. Flujo de trabajo con IA y `sdd-harness-kit`

Esta sección no la pide la plantilla. Recoge lo que pidió la revisión de la Entrega 1 —ver la IA en todas las fases del ciclo, no solo en la documentación— y cómo se ha construido CODEMIND en las Entregas 2 y 3: con qué kit, con qué flujo y con qué cifras. El registro de prompts sigue en [`prompts.md`](./prompts.md); aquí está el proceso.

### 8.1. El kit: `sdd-harness-kit`

[`DisTinta/sdd-harness-kit`](https://github.com/DisTinta/sdd-harness-kit) es un kit propio de Spec-Driven Development, público, que nace de lo aprendido en el máster y toma como punto de partida [`LIDR-academy/lidr-specboot`](https://github.com/LIDR-academy/lidr-specboot) (la procedencia está en `prompts.md` §0.2). En este repositorio instala la doctrina (`docs/base-standards.md` y los estándares por capa), 29 skills y 9 subagentes en `ai-specs/`, las referencias para Claude Code (`.claude/`) y Cursor (`.cursor/`), los hooks y, desde la Entrega 3, el workflow guardado `.claude/workflows/autonomous-sdd.js` (PR #73) con el que se lanzan las ejecuciones autónomas ([8.7](#87-ejecuciones-autónomas-de-la-entrega-3)).

**Instalación y diagnóstico.** Se instala desde el kit con `./install.sh --dest <proyecto>` (o `.\install.ps1 -Dest <proyecto>` en Windows), con `--dry-run` para ver antes qué haría. Detecta el stack del proyecto destino y copia su adaptador, que vive en `.claude/sdd-harness.env` y `docs/backend-standards.md`; para CODEMIND hubo que escribir el adaptador `fastify`. `doctor.sh` / `doctor.ps1` (o la skill `/kit-health`) diagnostica una instalación: doctrina, memoria de los copilotos, hooks y dependencias. En Windows, donde no siempre hay *symlinks*, el kit usa copias más un script de sincronización (`.claude/sync-artifacts.ps1`), y los hooks se lanzan con `invoke.cjs`, que localiza Git Bash.

**Hooks: garantías deterministas, no instrucciones.** Hay 12 cableados en `.claude/settings.json`: los 10 del periodo medido abajo, más `autonomous-merge-gate` y `log-permission-denied`, que añadió DIS-106 (ver [8.6](#86-experimento-workflow-autónomo-en-las-últimas-tareas-de-la-entrega-2)). Todos pasan por `invoke.cjs` y comparten `lib.sh`. Un hook no le pide al modelo que se porte bien: actúa sobre la herramienta, sea cual sea el razonamiento que la llamó. Los disparos se han contado con un script sobre las transcripciones de Claude Code del proyecto (132 sesiones con sus subagentes, del 28-09 al 16-10-2026, la fase con la autora en el bucle), buscando el mensaje característico de cada hook en los eventos de hook y deduplicando cada evento:

| Hook | Cuándo actúa | Qué impide | Disparos reales (28-09 → 16-10) |
|---|---|---|---|
| `protect-specs-and-tests` | Antes de `Edit` / `Write` | Modificar un test existente o reescribir un artefacto de spec sin que un humano lo confirme; editar ficheros de entorno; rutas con `..` | **370** confirmaciones al modificar un test existente y **285** al reescribir un artefacto de spec; 1 edición de un fichero de entorno denegada |
| `block-dangerous-bash` | Antes de `Bash` | `rm -rf` y otros comandos destructivos, `push --force`, `chmod 777`, operaciones contra producción, instalar una dependencia sin verificarla (*slopsquatting*), comandos destructivos del stack, escribir la configuración del kit desde la shell | **38** comandos destructivos bloqueados (por ejemplo `rm -rf packages/*/dist`; los ficheros se movieron al scratchpad), 6 instalaciones que pidieron confirmación, 11 comandos destructivos del stack que pidieron confirmación y 25 accesos de shell a la configuración del kit denegados |
| `verify-tests` | Al cerrar el turno (`Stop`) | Dar el turno por terminado con la suite en rojo | **11** cierres bloqueados; 140 avisos de «suite en verde: marca las tareas y mira si hace falta un ADR» |
| `post-edit-quality` | Después de `Edit` / `Write` | Que `packages/core` conozca HTTP o la infraestructura, y errores de análisis estático | 4 bloqueos: 2 violaciones de capa (`packages/core/src/knowledge/project.ts` conocía HTTP) y 2 del `tsc` por fichero, que se desactivó por lento en el commit `1c12e98` |
| `block-secrets` | Al enviar un prompt | Prompts con tokens, claves privadas o contraseñas | 3 prompts bloqueados antes de llegar al modelo |
| `block-secret-reads` | Antes de `Read` | Cargar `.env`, claves privadas o credenciales en el contexto | 2 lecturas bloqueadas (`.npmrc` del fixture `acme-shop` y de la raíz) |
| `session-context` | Al abrir o retomar una sesión | — (inyecta la rama, los changes abiertos y el estado del repo) | 67 inyecciones |
| `spec-audit-gate` | Antes de `Edit` / `Write` | Escribir código o tests de un change sin informe del `spec-auditor` (añadido en la Entrega 2, PR #35) | 0 |
| `validate-tasks` | Después de `Edit` / `Write` | Un `tasks.md` sin los pasos obligatorios | 0 |
| `docs-gate` | Antes de `git commit` | Commitear sin revisar qué documentación ha quedado desfasada | 0 |

Los tres últimos no dispararon nunca. Se presentan como garantías preventivas, no como bloqueos: el flujo siempre llegó al apply con el informe del auditor hecho y con un `tasks.md` válido, y la documentación se revisó antes de cada commit con `/update-docs`.

**Lecciones honestas del kit.**

- **El kit mejoró gracias a CODEMIND.** Los primeros días, `invoke.cjs` no encontraba los hooks cuando la sesión trabajaba desde una subcarpeta, y una ruta con barras de Windows fallaba. Se corrigió en el commit `457b61a` (02-10-2026), que ancla las rutas de los hooks al directorio del proyecto.
- **La coincidencia por subcadena da falsos positivos.** Hasta DIS-106, `block-dangerous-bash` miraba el texto del comando, no lo que hacía. La regla que protege la configuración del kit saltaba también con una lectura que lleva una redirección como `2>/dev/null`, y en la propia redacción de esta sección bloqueó un `grep` cuyo patrón contenía `rm -rf` y un script de recuento que contenía el texto de `push --force`. El remedio era reescribir el comando, no desactivar el hook. DIS-106 cambió el guardián para que lea los comandos como la shell: un mensaje de commit o un patrón de `grep` ya no son comandos.
- **Mantener al humano en el bucle tiene un coste visible:** 655 confirmaciones de `protect-specs-and-tests` en tres semanas. Es lo que cuesta que los tests y las specs sigan siendo la especificación firmada.
- **No todo el kit se usó.** El subagente `backend-planner` está instalado pero no aparece invocado en las transcripciones de los dos perfiles de Claude Code (28-09 → 04-11-2026), y `explorer` solo en una sesión de la ejecución autónoma (30-10-2026); tampoco aparecen los comandos `/code-review` y `/security-review` de Claude Code, que no son del kit. El `security-reviewer` tampoco se lanzó como subagente: su lista de comprobación la aplicó en línea el agente de revisión del experimento ([8.6](#86-experimento-workflow-autónomo-en-las-últimas-tareas-de-la-entrega-2)), en 3 informes `*-security-review.md` (DIS-21, DIS-26 y DIS-44) y en la sección de seguridad de las revisiones adversariales de DIS-76 y DIS-78. La privacidad se comprobó con `/privacy-ethics-check`.

**El ciclo SDD que impone.** Cada `tasks.md` lleva los pasos obligatorios de `docs/openspec-tasks-mandatory-steps.md`; el `spec-auditor` revisa la propuesta entre propose y apply, y el hook `spec-audit-gate` no deja escribir código sin su informe; en una ejecución autónoma, una auditoría `CHANGES REQUIRED` abre rondas de corrección en lugar de parar el ticket: un subagente responde las preguntas como ingeniero jefe, corrige los artefactos y un `spec-auditor` nuevo audita el change entero, hasta 5 rondas, cada una bajo `## Run <n>` en el mismo informe (PR #67, ADR [`20261026-autonomous-audit-correction-rounds`](docs/adr/20261026-autonomous-audit-correction-rounds.md), [`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md) §6); el apply va en TDD por escenario con los roles `tdd-test-writer` → `tdd-implementer` → `tdd-refactorer`; antes de archivar pasan tres revisiones; y cada hallazgo que no se corrige en el change sale con un destino A/B/C/D ([8.2](#82-el-flujo-completo)).

Es la misma idea que sostiene el producto: **no se le pide al modelo que cumpla, se monta un mecanismo que lo comprueba.** CODEMIND verifica sus citas en lugar de pedírselas bien al modelo; el kit bloquea un `rm -rf` en lugar de pedirle al agente que no lo haga.

### 8.2. El flujo completo

```mermaid
flowchart LR
    L["Linear (MCP)<br/>sub-issue + padre"] --> E["/enrich-us<br/>[original] · [reality-map] · Enhanced"]
    E --> P["/opsx:propose<br/>proposal · design · specs · tasks"]
    P --> SA["spec-auditor<br/>reports/*-spec-audit.md"]
    SA -- cambios --> U["/opsx:update"]
    U --> SA
    SA -- aprobado --> A["/opsx:apply<br/>TDD por escenario"]
    A --> PR["/pr-describe<br/>PR abierta · CI"]
    PR --> R["/show-spec-working<br/>/verify-against-spec<br/>/adversarial-review"]
    R -- hallazgo A --> F["correcciones<br/>en la misma PR"]
    F --> R
    R --> AR["/opsx:archive<br/>sync de specs"]
    AR -- flujo normal --> M["merge"]
    AR -- modo autónomo --> G["autonomous-merge-gate"]
    G --> M
    M --> D["Linear → Done"]
```

El orden es el de la revisión previa al merge de [`docs/openspec-tasks-mandatory-steps.md`](docs/openspec-tasks-mandatory-steps.md) y del contrato de [`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md) §6: la PR se abre tras el apply, las tres revisiones se hacen sobre ella y sus correcciones van a la misma PR antes del archivo. Una corrección que cambia la spec vuelve a pasar por `/opsx:update`.

| Fase | Skill, agente o hook | Evidencia en el repositorio |
|---|---|---|
| **Linear vía MCP** | Servidor MCP de Linear (`.mcp.json`) | Antes de proponer, el agente lee la sub-issue y su padre; cambia el estado (In Progress → In Review → Done) y comenta en español. Más de 2 200 llamadas al MCP de Linear en las transcripciones de los dos perfiles de Claude Code, el normal y el autónomo (28-09 → 04-11-2026) |
| **Enriquecimiento** | `/enrich-us` | La descripción de cada ticket en Linear: bloque `[original]` inmutable, `[reality-map]` (qué existe y qué hay que crear, comprobado contra el código) y Enhanced con criterios Dado/Cuando/Entonces y las decisiones de la autora (D1…Dn) |
| **Propuesta** | `/opsx:propose`, `spec-auditor`, `spec-audit-gate`, `/opsx:update` | `openspec/changes/archive/*/proposal.md`, `design.md`, `specs/`, `tasks.md`; 48 informes `*-spec-audit.md` desde que el auditor es obligatorio (PR #35), 40 de ellos con rondas de corrección (104 secciones `## Run <n>`) |
| **Implementación** | `/opsx:apply` en TDD: `tdd-test-writer` → `tdd-implementer` → `tdd-refactorer`; hooks `protect-specs-and-tests`, `post-edit-quality`, `verify-tests` | Commits `test(...)` → `feat(...)` → `refactor(...)` por escenario; cada escenario de la spec tiene un test con su mismo nombre |
| **Tres revisiones antes de archivar** | `/verify-against-spec`, `/adversarial-review`, `/show-spec-working` | 64 + 58 + 74 informes en `reports/`, más 73 de pruebas manuales de la interfaz real y 76 de verificación de tests y estado |
| **Destino de cada hallazgo** | Regla *Tracking deferred findings* de `docs/project-context.md` | **A** se corrige en el change (`/opsx:update`); **B** pasa a un ticket sucesor con comentario en Linear; **C** queda como deuda explícita; **D** se acepta para siempre. Sin destino no se archiva. El ritual de archivo revisa las notas entrantes, las salientes y deja la tabla de pendientes en el comentario de In Review |
| **Documentación** | `docs-gate`, `/update-docs`, `/adr-new`, `/pr-describe` | `docs/adr/` (15 ADR), descripciones de PR (`openspec/changes/archive/*/reports/pr-description.md`, 37 ficheros), `readme.md` y `docs/` actualizados en el mismo PR |
| **Registro de IA** | Norma *prompts.md — synchronous AI log* de `docs/project-context.md` | `prompts.md`: una sección por ticket, con el prompt literal y el ajuste humano, escrita en la misma sesión (con un hueco: DIS-111, un flujo ligero, no tiene sección en `prompts.md`; la de DIS-73, que el bloque autónomo de la deriva no dejó escrita, se añadió en los ajustes finales, §90); `docs/ai-sessions/` |
| **Calidad en CI** | Stryker, `dependency-cruiser`, TypeDoc, `gitleaks`, Playwright, cobertura de Vitest | Jobs de [2.4](#24-infraestructura-y-despliegue): mutación con umbral 80 (incremental en cada PR y en los push a la base, con la pasada completa a mano desde la PR #93), `lint:architecture`, `docs:coverage`, escaneo de secretos, E2E con Playwright (DIS-75) y cobertura informativa por paquete (DIS-77) |
| **Otras herramientas usadas de verdad** | `/privacy-ethics-check`, lista de comprobación del `security-reviewer`, `browser-automation`, Context7 MCP, Playwright MCP, paneles de agentes | Comprobación de privacidad en los pasos de verificación de cada change; 3 informes de seguridad (DIS-21, DIS-26 y DIS-44) con la lista del `security-reviewer` aplicada en línea; capturas de la web en `reports/` de DIS-58; documentación de librerías por Context7; paneles de dos revisores independientes y un resolutor en DIS-80, DIS-33 y DIS-82 |

`claude-auto-review.yml` y `claude-interactive.yml` vienen del kit, están en `.github/workflows/` y **no están activados** ([2.4](#24-infraestructura-y-despliegue)): no forman parte de este flujo.

Herramientas y modelos: **Claude Code con Opus** para implementar, revisar y orquestar subagentes; **Claude Code con Sonnet** en los subagentes de pasos mecánicos (PR, archivo, cierre); en la Entrega 3, un **perfil autónomo de Claude Code** aparte (`CLAUDE_CONFIG_DIR`, [`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md) §3) para las ejecuciones autónomas, y **paneles de agentes** en las revisiones que necesitan independencia (DIS-80, DIS-33 y DIS-82: revisor 1 `claude-opus-5-5`, revisor 2 `claude-sonnet-5-5` y un resolutor); **Playwright** para la suite E2E y las capturas de la web; **Cursor** en sesiones de criterio y de redacción; **Claude (Cowork / chat)** para planificar historias, propuestas y documentos largos (`prompts.md` §0.1).

### 8.3. IA en las seis fases del ciclo

| Fase | Qué hace la IA | Qué decide o comprueba la persona |
|---|---|---|
| Requisitos | `/enrich-us` lee la sub-issue y su padre en Linear, contrasta cada ejemplo del ticket con el código y propone criterios Dado/Cuando/Entonces | La autora responde las preguntas abiertas y fija las decisiones D1…Dn; en una ejecución autónoma las responde un subagente «ingeniero jefe», que las marca como suyas ([`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md) §2 y §6) |
| Diseño | `/opsx:propose` escribe propuesta, diseño, specs y tareas; el `spec-auditor` busca huecos, contradicciones y decisiones sin tomar; `/adr-new` registra las decisiones de arquitectura | La autora aprueba el plan y contesta las preguntas del auditor; en una ejecución autónoma lo hace el ingeniero jefe, en rondas de corrección hasta que un `spec-auditor` nuevo da `APPROVED` |
| Implementación | El agente implementa escenario a escenario, con la capa de dominio aislada (`post-edit-quality`, `dependency-cruiser`) | Revisión de cada PR |
| **Pruebas** | **`tdd-test-writer` escribe los tests en RED a partir de los escenarios de la spec y de los criterios de aceptación**, antes del código; `/show-spec-working` ejercita la interfaz real (CLI, API, navegador) y guarda la salida; Stryker mide si los tests detectan cambios; la suite E2E con Playwright recorre las tres pantallas (DIS-75) y la cobertura por paquete se publica como dato informativo (DIS-77) | `protect-specs-and-tests` pide confirmación humana para modificar un test existente: un test no se cambia para que la suite pase |
| Despliegue | El agente diseñó y mantiene los jobs de CI (`scope`, `quality`, `verify`, `e2e`, `mutation`, `secrets`) y escribió `docs/DEPLOYMENT.md` con la salida real de `make up` (DIS-45) | En el flujo normal, el merge lo firma una persona. En las ejecuciones autónomas lo hace el agente, solo si la puerta `autonomous-merge-gate` lo permite (archivo, CI en verde, base protegida); las PR que tocan `.claude/` o `.cursor/` las fusiona siempre la autora ([8.7](#87-ejecuciones-autónomas-de-la-entrega-3)) |
| Mantenimiento | `/opsx:archive` y `/opsx:sync` llevan las specs al estado vigente; cada hallazgo sale con destino A/B/C/D; `/update-docs` y `docs-gate` antes de cada commit; tickets de deuda nacidos de hallazgos (DIS-96, DIS-100 en la Entrega 2; DIS-105, DIS-107, DIS-110 y DIS-111 en la Entrega 3) | Qué se acepta como deuda (C) o como riesgo permanente (D) |

### 8.4. Ejemplo trazado de punta a punta: DIS-72

DIS-72 (CM-HU-11.1) convirtió la confianza de la respuesta en un valor calculado. Cada paso deja un artefacto:

1. **Issue en Linear:** [DIS-72](https://linear.app/distinta-ai4devs/issue/DIS-72/cm-hu-111-confidencets-con-seis-pesos-docsconfidencemd-real), sub-issue de la historia CM-HU-11, enriquecida con `/enrich-us`.
2. **Propuesta:** [`proposal.md`](openspec/changes/archive/2026-10-15-confidence-score/proposal.md), [`design.md`](openspec/changes/archive/2026-10-15-confidence-score/design.md) y las specs `confidence-score`, `claims-and-typing` y `explain`. Las decisiones D1–D4 de la autora y sus respuestas Q1–Q3 al auditor fijaron las seis señales y la fórmula sin término independiente.
3. **Auditoría:** [`2026-10-15-spec-audit.md`](openspec/changes/archive/2026-10-15-confidence-score/reports/2026-10-15-spec-audit.md). El auditor marcó como bloqueante cómo contar una cita repetida (Q1) y otras dos preguntas que solo podía decidir la autora.
4. **Apply en TDD:** 64 escenarios en las tres specs del change, cada uno con un test del mismo nombre; un test falla si los pesos de `docs/CONFIDENCE.md` y los del código difieren; Stryker 97,06 %.
5. **Sesión de pesos con el modelo real:** [`2026-10-15-9-weights-session.md`](openspec/changes/archive/2026-10-15-confidence-score/reports/2026-10-15-9-weights-session.md). Ahí salieron los dos hallazgos de la sesión: Ollama recortaba el prompt a unos 2 000 tokens (se resolvió sirviéndolo con `OLLAMA_CONTEXT_LENGTH=16384`, sin código) y el modelo envolvía el JSON en una valla. La autora pidió resolver la valla en el mismo change («no quiero dejar flecos»): `/opsx:update` añadió la decisión C9 y el grupo de tareas 8b. Con cinco respuestas reales, la autora mantuvo los pesos iniciales con los motivos que recomendó el agente.
6. **Tres revisiones:** [`verify-against-spec`](openspec/changes/archive/2026-10-15-confidence-score/reports/2026-10-15-verify-against-spec.md) (el código hace lo que piden las specs), [`adversarial-review`](openspec/changes/archive/2026-10-15-confidence-score/reports/2026-10-15-adversarial-review.md) (hallazgos menores con su destino) y [`show-spec-working`](openspec/changes/archive/2026-10-15-confidence-score/reports/2026-10-15-show-spec-working.md).
7. **PR:** [#43](https://github.com/DisTinta/AI4Devs-finalproject/pull/43), con la descripción de [`pr-description.md`](openspec/changes/archive/2026-10-15-confidence-score/reports/pr-description.md).
8. **Archivo y specs sincronizadas:** el change está en `openspec/changes/archive/2026-10-15-confidence-score/` y las specs vigentes en `openspec/specs/confidence-score/`, `claims-and-typing/` y `explain/`.
9. **Registro:** `prompts.md` §45, con los tres prompts literales de la autora, y [`docs/CONFIDENCE.md`](docs/CONFIDENCE.md) con los pesos y sus motivos.

### 8.5. Cifras de evidencia

Calculadas del repositorio el 04-11-2026, sobre `final-project-CRN` tras el merge de la #108, no estimadas:

| Cifra | Valor | Cómo se calcula |
|---|---|---|
| Changes de OpenSpec archivados | **76** | Carpetas en `openspec/changes/archive/` (`ls -d openspec/changes/archive/*/ \| wc -l`) |
| Capacidades con spec vigente | 43 | Carpetas en `openspec/specs/` |
| Informes de revisión y verificación | **567** | Ficheros en `openspec/changes/archive/*/reports/` (`find openspec/changes/archive -path '*/reports/*' -type f \| wc -l`) |
| Informes de auditoría de la spec | 48, con 104 rondas de corrección | Ficheros `*spec-audit*.md` en los `reports/` archivados, y sus secciones `## Run <n>` |
| Tests | **2 796** en 267 ficheros, todos en verde con la base de datos de pruebas; sin ella, 2 443 pasan y 301 se saltan | `npx vitest run` en local (todos los proyectos de Vitest), con `DATABASE_URL` apuntando a `codemind_test` y sin ella |
| Mutation score | **93,76 %** | Último job `mutation` de CI en `final-project-CRN` (push del merge de la #108). Desde la PR #93 ese job es incremental también en los push a la base; la última pasada completa, en local durante DIS-69, dio 92,76 % |
| ADR | 15 | `docs/adr/` sin `README.md` ni `_template.md` |
| Sesiones de IA registradas | 8 | Ficheros en `docs/ai-sessions/` |
| PR fusionadas | **106** | 59 en la Entrega 2 y 47 en la Entrega 3 (`gh pr list --base <rama de entrega> --state merged`), más la #62 de la prueba en seco, en una rama temporal |
| Commits | 1 362 | `git rev-list --count --no-merges HEAD`, sin los de merge |

### 8.6. Experimento: workflow autónomo en las últimas tareas de la Entrega 2

El 16-10-2026, a seis días de la entrega, quedaban doce tickets: DIS-76, DIS-78, DIS-21, DIS-26, DIS-34, DIS-44, DIS-45, DIS-58, DIS-60, DIS-65, DIS-66 y esta misma DIS-101. La autora preguntó si un agente podía hacerlos solo, con el flujo de [8.2](#82-el-flujo-completo), resolviendo las dudas como un ingeniero jefe y sin preguntarle. Se hicieron como **experimento con la herramienta Workflow de Claude Code**: un script recorre los tickets en serie, por orden de dependencias, y lanza un subagente en segundo plano con el contexto limpio para cada paso (`enrich` → `propose` con el `spec-auditor` → `apply` → `review` → `pr` → `archive` y merge). Los pasos de criterio corren con Opus y los mecánicos con Sonnet. El registro de la sesión que lo planteó —la pregunta de la autora, las reglas relajadas, el plan y cómo se mide el coste— está en [`docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md`](docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md).

**Las reglas que se relajaron**, solo para esta ejecución y registradas en el ADR [`20261016-autonomous-workflow-run-entrega-2`](docs/adr/20261016-autonomous-workflow-run-entrega-2.md), son cuatro principios de `docs/base-standards.md`:

| Principio | Regla normal | En el experimento |
|---|---|---|
| 2 (línea 88) | Una persona aprueba el plan si toca más de tres ficheros | Lo aprueban el `spec-auditor` y un subagente «ingeniero jefe», que escribe cada decisión, en español, en la descripción Enhanced del ticket en Linear |
| 3 (línea 90) | Los tests los escribe o supervisa una persona | Los escribe `tdd-test-writer` desde los escenarios de la spec, sin supervisión |
| 8 (línea 98) | El porqué de un PR o un ADR no lo escribe la IA | Lo escribe el agente, marcado como decisión suya |
| 9 (línea 99) | Los merges los firma una persona | Los hace el agente, solo después del commit de `/opsx:archive` y con CI en verde |

DIS-34, la revisión de las respuestas *golden*, se hizo en **modo híbrido**: el agente revisa todas y la autora firma una muestra (todos los `UNKNOWN`, las dudosas y dos o tres al azar), porque si una IA valida lo que generó otra IA la referencia de evaluación pierde independencia.

**Qué pasó con cada ticket.** Las duraciones salen de las marcas de tiempo de los registros de cada agente (primer y último evento) y se contrastan con la creación y el merge de cada PR en GitHub. Los agentes cuentan solo los pasos del ciclo; las esperas de merge y los pasos que registran un bloqueo van aparte.

| Ticket | Ejecución | Resultado | PR | Merge | Tiempo del ciclo | Agentes |
|---|---|---|---|---|---|---|
| DIS-76 | Piloto, 16-10 | Cerrado | [#45](https://github.com/DisTinta/AI4Devs-finalproject/pull/45) | La autora: el clasificador lo denegó | 3 h 33 min | 6 + 1 de bloqueo |
| DIS-78 | Tanda 1, 16-10 | Cerrado | [#46](https://github.com/DisTinta/AI4Devs-finalproject/pull/46) | El workflow | 2 h 07 min | 6 |
| DIS-21 | Tanda 1 | Cerrado | [#47](https://github.com/DisTinta/AI4Devs-finalproject/pull/47) | El workflow | 3 h 40 min | 6 |
| DIS-26 | Tanda 1 | Cerrado | [#48](https://github.com/DisTinta/AI4Devs-finalproject/pull/48) | El workflow | 8 h 21 min, con las respuestas *golden* generadas por Ollama en CPU | 6 |
| DIS-34 | Tanda 1, 17-10 | Cerrado con la firma de la autora | [#49](https://github.com/DisTinta/AI4Devs-finalproject/pull/49) (revisión del agente) y [#50](https://github.com/DisTinta/AI4Devs-finalproject/pull/50) (firmas y Q3 regenerada) | La autora: el clasificador denegó #49; #50 lo preparó la sesión principal | 24 min el paso del agente | 2 + 1 de bloqueo |
| DIS-44 | Tanda 1 | Cerrado | [#51](https://github.com/DisTinta/AI4Devs-finalproject/pull/51) | La autora: denegado | 3 h 33 min | 6 + 1 de bloqueo |
| DIS-45 | Lanzado solo, 17-10 | Cerrado | [#52](https://github.com/DisTinta/AI4Devs-finalproject/pull/52) | La autora: denegado | 1 h 47 min | 6 + 1 de bloqueo |
| DIS-58 | Lanzado solo, 17-10 → 18-10 | Cerrado | [#53](https://github.com/DisTinta/AI4Devs-finalproject/pull/53) | El workflow | 20 h 37 min, de ellas unas 10,5 h parado de noche esperando una confirmación | 6 |
| DIS-60 | Tanda 2, 18-10 | Cerrado | [#54](https://github.com/DisTinta/AI4Devs-finalproject/pull/54) | La autora, el 19-10: denegado | 1 h 36 min, más 3 h 08 min de espera | 6 + 20 de espera + 1 de bloqueo |
| DIS-101 | Tanda 2, 18-10 → 19-10 | Cerrado: este readme, de documentación | [#55](https://github.com/DisTinta/AI4Devs-finalproject/pull/55) | La autora, el 19-10: denegado | 1 h 06 min, más 3 h 06 min de espera | 6 + 20 de espera + 1 de bloqueo |
| DIS-65 | Tanda 3, 19-10 | Cerrado | [#56](https://github.com/DisTinta/AI4Devs-finalproject/pull/56) | La autora: denegado | 2 h 00 min, más 28 min de espera | 6 + 3 de espera |
| DIS-66 | Tanda 3, 19-10 | Cerrado | [#57](https://github.com/DisTinta/AI4Devs-finalproject/pull/57) | El workflow | 2 h 11 min | 6 |
| DIS-102 | Tanda 4, 19-10, fuera del plan | Cerrado | [#58](https://github.com/DisTinta/AI4Devs-finalproject/pull/58) | El workflow | 4 h 39 min | 7 |
| DIS-103 | Tanda 4, 20-10, fuera del plan | Cerrado | [#59](https://github.com/DisTinta/AI4Devs-finalproject/pull/59) | El workflow | 6 h 10 min | 6 |

DIS-45 no entró en la tanda 1: cuando el merge de DIS-44 se bloqueó, el script saltó sus dependientes para no construir sobre algo sin fusionar, y nada lo volvió a lanzar tras el merge de la autora. Por eso se lanzó aparte, igual que DIS-58, que se adelantó la noche del 17-10 con el visto bueno de la autora. DIS-65 y DIS-66 dependían de DIS-60, así que la tanda 2 los saltó; la autora los lanzó en una tanda 3 la mañana del 19-10, nada más fusionar el #54. DIS-102 y DIS-103 no estaban en el plan: salieron de dos pruebas desde cero de la autora (la lección 10) y se lanzaron con el mismo workflow.

**La intervención real de la autora** fue más que la firma de DIS-34: fusionó a mano los siete PR que el clasificador denegó (#45, #49, #51, #52, #54, #55 y #56) y el #50 de las firmas; lanzó la tanda 3 tras el merge del #54; añadió tras el piloto una regla de permiso para `gh pr merge`; aplicó en Windows Defender la exclusión de un falso positivo; y desactivó en local, para el resto de la ejecución, la confirmación de instalación de dependencias tras la parada de DIS-58. Cada una de esas intervenciones es una de las lecciones de abajo.

**Coste en tokens.** Las cifras salen de un script que suma el uso de los registros de sesión de Claude Code del proyecto por la rama `DIS-n` en la que se trabajó, ejecutado el 19-10-2026 sobre todas las ramas. La referencia manual son los tickets de código de tamaño parecido hechos con la autora en el bucle:

| Tickets | Lectura de caché | Escritura de caché | Salida |
|---|---|---|---|
| **Manuales** — DIS-68, DIS-70, DIS-72, DIS-74, DIS-28, DIS-92 | 92,7 / 108,3 / 102,7 / 180,0 / 116,1 / 143,4M — **media 123,9M** | 1,20 / 1,82 / 1,25 / 2,92 / 1,09 / 1,14M — **media 1,57M** | media 0,33M |
| **Workflow, ciclo de código completo** — DIS-76, DIS-78, DIS-21, DIS-26, DIS-44, DIS-58, DIS-65, DIS-66 | 137,2 / 83,6 / 156,4 / 125,3 / 137,1 / 139,3 / 77,0 / 81,0M — **media 117,1M** | 3,70 / 2,03 / 4,42 / 4,92 / 3,33 / 5,17 / 1,95 / 1,73M — **media 3,41M** | media 0,09M |
| Workflow, tanda 4 (medido el 20-10) — DIS-102 / DIS-103 | 163,2 / 114,9M | 4,90 / 4,71M | 0,20 / 0,16M |
| Workflow, otros — DIS-60 / DIS-101 / DIS-45 / DIS-34 | 53,8 / 81,8 / 32,0 / 6,7M | 2,10 / 2,62 / 1,83 / 0,34M | 0,02 / 0,03 / 0,01 / 0,01M |
| Sin ticket — rama `feature/entrega-2-CRN` | 263,5M | 10,52M | 1,77M |

- **Lectura de caché parecida** (0,95 veces la media manual) y **escritura de caché unas 2,2 veces mayor**: cada subagente empieza de cero y vuelve a leer los estándares, la spec y el código, mientras que una sesión manual larga reutiliza lo que ya tiene en caché.
- **Límites de la medición.** (a) La orquestación, la sesión principal y los pasos que corren en `feature/entrega-2-CRN` no se atribuyen a ningún ticket: esa rama suma 263M de lectura, que incluye también trabajo manual. (b) La salida de los subagentes del workflow sale muy por debajo de la de los tickets manuales, así que no se compara la salida. (c) La cifra de DIS-60 es baja para un ciclo completo y queda fuera de la media; se publica tal cual. Los tres tickets de la web posteriores a DIS-58 (DIS-60, DIS-65 y DIS-66) leen menos caché que los anteriores, y por eso la media del workflow baja de 129,8M a 117,1M al sumar DIS-65 y DIS-66. (d) DIS-34, DIS-45 y DIS-101 son tickets de documentación y no se comparan con los de código; la cifra de DIS-101 incluye además el trabajo de la sesión principal en su rama después de la ejecución.
- **Límite de uso del plan** (`/usage`, que el agente no puede leer: lo apuntó la autora en cada punto de control). Semana (horas peninsulares): 51 % antes del piloto → 56 % después (unos 5 puntos por DIS-76) → 64 % el 17-10 a las 09:00, con DIS-78 y DIS-21 cerrados (unos 3–3,5 puntos por ticket) → 73 % el 17-10 a las 17:35, al cerrar la tanda 1 → 74 % el 17-10 a las 20:20, tras DIS-45 (alrededor de 1 punto). El límite semanal se reinició el 18-10 a las 12:00 y después no se registró ningún punto, así que DIS-58, DIS-60, DIS-65, DIS-66 y DIS-101 no tienen cifra de `/usage`. El coste equivalente de API que muestra `/usage` (con suscripción no es un cargo) fue de 53,93 $ al terminar el piloto y de 266,18 $ acumulados al cerrar la tanda 1.

**Lecciones**, cada una comprobada en el repositorio, en GitHub, en Linear o en los diarios del workflow:

1. **La autonomía tiene un techo en el merge, y está bien que lo tenga.** El clasificador de permisos del modo automático de Claude Code denegó `gh pr merge` («Merge Without Review») en #45, #49, #51, #52, #54, #55 y #56, aunque la autora había añadido una regla de permiso tras el piloto; dejó pasar #46, #47, #48, #53 y #57. El agente no buscó rodeos: los descartó por escrito (fusión automática en GitHub, saltarse los permisos), y la autora decidió el 17-10 que el workflow esperase su merge. Coste de esa espera: en DIS-60, 20 agentes de sondeo y 3 h 08 min sin avanzar trabajo; en DIS-101, otros 20 y 3 h 06 min; en DIS-65, 3 agentes y 28 min, hasta que la autora fusionó el #56. Una persona firma lo que entra.
2. **Una protección pensada para una persona presente frena una ejecución desatendida.** `block-dangerous-bash` pide confirmación antes de instalar una dependencia, como defensa contra paquetes falsos. Un agente de DIS-58 lanzó un `npm install` de prueba a las 20:45 del 17-10 y se quedó esperando esa confirmación hasta las 07:25 del día siguiente, unas 10,5 h. La autora la desactivó en local para el resto de la ejecución y pidió a cambio una verificación automática en las instrucciones del workflow: antes de cada `npm install <paquete>`, el agente comprueba el nombre exacto, que el paquete exista desde hace más de 90 días con su repositorio conocido, que tenga al menos 10 000 descargas semanales y que no traiga scripts de instalación inesperados, y después pasa `npm audit`. La lección es sustituir el control por otro automático equivalente, no quitarlo sin más.
3. **Los resultados de los subagentes de revisión no llegaban al paso que los lanzaba.** `verify-against-spec` y `adversarial-review` corrían como subagentes y su informe se quedaba en `reports/`, pero el paso de revisión esperaba un mensaje que no llegaba, hasta que caducaba, y entonces leía la transcripción o repetía la comprobación: más tiempo y más tokens. Uno de esos mensajes lo bloqueó el hook `block-secrets` porque citaba los secretos de prueba del fixture (17-10, DIS-26). Desde la tanda 2, las revisiones corren dentro del propio paso.
4. **El entorno local también rompe el flujo.** El 17-10, una actualización de firmas de Windows Defender empezó a marcar como `Trojan:Win32/Bearfoos.A!ml` un fichero de test de 11 bytes, `b.php` con el contenido `<?php // b`, y rompió en local dos ficheros de test de git (en CI, que corre en Linux, no pasaba). `verify-tests` impidió cerrar el turno con la suite en rojo y el agente no tocó el test. La autora aplicó una exclusión acotada a las carpetas temporales del proyecto; la primera que propuso el agente cubría solo uno de los dos tests y hubo que ampliarla.
5. **Un corte de internet no rompió nada.** El 17-10, un agente de DIS-44 estuvo unos 25 minutos sin registrar actividad durante una caída de la conexión; Claude Code reintentó la petición y siguió donde estaba, sin pasos perdidos ni repetidos.
6. **Un fichero de configuración local estuvo a punto de entrar en un commit.** El agente de cierre de DIS-34 intentó commitear `.claude/settings.json`, que tenía cambios locales de la autora. El clasificador lo denegó («Self-Modification»). Desde entonces el script prohíbe preparar, commitear, revertir o restaurar nada dentro de `.claude/`, y una vigilancia en segundo plano comprobaba que ninguna rama del experimento lo llevase.
7. **La revisión híbrida de DIS-34 funcionó, y la firma se quedó en manos de la autora.** El agente revisó las tres *golden* de `acme-shop` ([`docs/golden-review/2026-10-acme-shop-golden-review.md`](docs/golden-review/2026-10-acme-shop-golden-review.md)): vio que Q4 era incorrecta (atribuía a `updated` un comportamiento que no tiene) y la regeneró con Ollama, y marcó Q3 como dudosa porque se centraba en un método que nadie llama. La autora revisó las tres, pidió regenerar Q3 y firmó las tres (`author:cristina-rodriguez`) en el #50. Cuando la autora le pidió que firmase en su nombre, el agente se negó: la firma registra una revisión humana y quedaría como un registro falso. Además, al fusionar #49 la integración de GitHub con Linear pasó DIS-34 a Done, y el agente lo devolvió a In Review hasta las firmas.
8. **Lo que el ingeniero jefe decidió solo y la autora debe revisar.** Cada decisión quedó escrita en la Enhanced del ticket y en el `design.md` del change, con su destino A/B/C/D. Las de tipo D (riesgo aceptado para siempre) son las que más pesan; por ejemplo, en DIS-76 (AR6) aceptó que el mensaje de un error `unrecognized_keys` repita el nombre de la clave no declarada que envió el cliente. Otras cosas se corrigieron por el camino: un script de sincronización de specs que duplicaba texto de escenarios al archivar DIS-21 (se rehízo y se validó), y una vigilancia que cambiaba de cuenta de `gh` cada minuto y podía romper los push (se paró y se relanzó sin cambiar de cuenta).
9. **El permiso para programarse trabajo a sí mismo también está acotado.** El agente intentó programar el arranque de la tanda 2 y el sistema de permisos lo bloqueó hasta que la autora lo pidió expresamente.
10. **Las pruebas manuales de la autora encontraron lo que no veían las automáticas.** En un clon limpio, la autora vio que en PowerShell la CLI no leía `.env` (de ahí DIS-102). Después, con Windows PowerShell 5.1, todo el modo evaluación coincidió con `DEMO.md`, pero al preguntar en vivo con Ollama salieron dos fallos: el historial Git del fixture no viaja con el clon y el adaptador del LLM cortaba a los 300 s (de ahí DIS-103). Las pruebas desde cero de los agentes solo recorrían el modo evaluación, y la respuesta desde la caché no lee el código ni llama al modelo. Una persona que prueba el producto como lo usaría otra encuentra caminos que nadie había escrito en la spec.

**Balance.** Los doce tickets del plan cerrados en cuatro días, del 16-10 al 19-10 (DIS-76, DIS-78, DIS-21, DIS-26, DIS-34, DIS-44, DIS-45, DIS-58, DIS-60, DIS-65, DIS-66 y este, DIS-101), más DIS-102 y DIS-103 el 19-10 y el 20-10, con el mismo ciclo SDD, las mismas revisiones y un coste en lectura de caché parecido al manual. El cuello de botella no fue el agente, sino los puntos donde el sistema exige a una persona —el merge, la firma de las *golden*, una confirmación de seguridad—, que son justo los que conviene conservar.

**Por qué se intentó y qué concluye la autora.** La autora se atrevió con el experimento porque ya había hecho más del 80 % de las tareas de la Entrega 2 con el flujo normal (54 de 66 tickets el 16-10) y había visto lo bien que el agente lo seguía; con el mismo flujo y normas claras, confiaba en que en modo automático lo haría igual de bien. Su conclusión: sin un harness, un contexto, un flujo, unas normas y una planificación claros y robustos, la automatización no habría dado un buen resultado, sino todo lo contrario. Sus palabras y el detalle están en [`docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md`](docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md), secciones 1 y 6.

**Lo que DIS-106 llevó al kit.** Las lecciones 1, 2, 3 y 6 pasaron a ser parte del kit, detrás de un
interruptor manual, `KIT_AUTONOMOUS_RUN` en `.claude/sdd-harness.env` (siempre `"0"` en el
repositorio): con él a `"1"` ningún hook deja una confirmación pendiente, y cada pregunta se convierte en
una comprobación automática o en una denegación con alternativa. La confirmación de instalación es ahora
la verificación de la lección 2, hecha por un hook. El merge pasa por una puerta que exige el commit de
archivo, la CI en verde y la rama base protegida en GitHub, y un perfil de Claude Code aparte lleva la
autorización del merge: en la prueba en seco del 21-10 la puerta denegó un PR sin archivo y, con él, el
clasificador dejó pasar el merge. Las revisiones tienen un modo en línea, y el agente no puede tocar
`.claude/` ni `.cursor/` en una ejecución autónoma. Los mismos hooks corren también en Cursor, y tienen
una suite de tests propia. La guía es [`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md), y la decisión,
con la doctrina que se relaja solo con el interruptor activo, el ADR
[`20261020-kit-autonomous-mode`](docs/adr/20261020-kit-autonomous-mode.md). Con ese modo se hizo casi
toda la Entrega 3, y las ejecuciones reales lo siguieron cambiando: rondas de corrección de la auditoría,
el contrato endurecido tras el piloto y el workflow guardado. Está en
[8.7](#87-ejecuciones-autónomas-de-la-entrega-3).

### 8.7. Ejecuciones autónomas de la Entrega 3

En la Entrega 3 el experimento de [8.6](#86-experimento-workflow-autónomo-en-las-últimas-tareas-de-la-entrega-2) dejó de ser un experimento: salvo DIS-106, que construyó el modo, los tickets de producto se hicieron en **ejecuciones autónomas** del modo de DIS-106, con el interruptor `KIT_AUTONOMOUS_RUN="1"`, el perfil autónomo de Claude Code y la puerta de merge ([`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md)). Cada ticket pasa por el contrato de §6 de esa guía: `/enrich-us` → `/opsx:propose` → `spec-auditor` con rondas de corrección hasta `APPROVED` → `/opsx:apply` en TDD → PR → las tres revisiones en línea → correcciones en la misma PR → `/opsx:archive` → merge a través de `autonomous-merge-gate`. En `prompts.md` (§61–§88) cada ticket con sección lleva el prompt literal que el workflow envió al paso y su «Ajuste humano»; en todos es «Ninguno: ejecución autónoma» salvo en §73, la segunda ronda golden de DIS-110.

**El piloto: DIS-104 y DIS-105 (26-10 → 27-10).** Lo lanzó un script escrito en la sesión, antes de que existiera el workflow guardado. Fusionó los dos tickets (#68 y #69), pero se paró cinco veces por cosas que el contrato no cubría (PR #70): un `git switch … && git merge` encadenado desde la base se denegó como un merge sobre la base; el paso de CI de DIS-105 dejó un monitor en segundo plano y devolvió sin veredicto; un `vitest run` huérfano bloqueó un binario y el siguiente `npm ci` falló con `EPERM`; una sesión con el directorio de trabajo dentro de la carpeta del change impidió a `/opsx:archive` moverla; y en cada ticket una revisión lanzada como fork no devolvió nada ([`docs/AUTONOMOUS-RUN.md`](docs/AUTONOMOUS-RUN.md) §6 recoge las reglas que salieron de ahí). DIS-104 regeneró las respuestas golden, y la autora las firmó después en la #71.

**Los bloques con el workflow guardado.** Desde el 27-10 cada ejecución usa el mismo script, `.claude/workflows/autonomous-sdd.js` (PR #73), en bloques de tickets acordados de antemano; un bloque empieza cuando el anterior está fusionado. Fechas de merge de GitHub (`gh pr list --base final-project-CRN --state merged`):

| Bloque | Tickets | PR | Merge | Paradas y ajustes humanos |
|---|---|---|---|---|
| 1 | DIS-30 → DIS-31 | [#74](https://github.com/DisTinta/AI4Devs-finalproject/pull/74), [#75](https://github.com/DisTinta/AI4Devs-finalproject/pull/75) | 27-10 | Ninguna parada. El paso de CI de DIS-30 esperó con `Monitor`, que termina el turno del agente, y devolvió sin veredicto: de ahí la espera de la CI en primer plano (#76) |
| 2 | DIS-32 → DIS-33, DIS-80; después DIS-107 | [#77](https://github.com/DisTinta/AI4Devs-finalproject/pull/77)–[#79](https://github.com/DisTinta/AI4Devs-finalproject/pull/79), [#81](https://github.com/DisTinta/AI4Devs-finalproject/pull/81) | 28-10 | Antes, la autora actualizó el driver de NVIDIA para que Ollama usara la GPU (#80). DIS-107 paga una deuda que dejó la revisión de DIS-32, con la instrucción de la autora de volver a pasar las golden regeneradas por el panel. El clasificador denegó los comentarios del agente en DIS-108 y DIS-109, que quedaron para la autora |
| 3 | DIS-9 → DIS-10, DIS-42 | [#82](https://github.com/DisTinta/AI4Devs-finalproject/pull/82), [#84](https://github.com/DisTinta/AI4Devs-finalproject/pull/84), [#85](https://github.com/DisTinta/AI4Devs-finalproject/pull/85) | 29-10 → 30-10 | Las comprobaciones en PowerShell quedaron para la autora (luego las hizo el agente: #96). DIS-111 (#83), los tests del harness en su propio proyecto de Vitest, salió de una decisión de la autora en DIS-9 y fue un flujo ligero |
| DIS-110 | DIS-110, en cuatro changes | [#86](https://github.com/DisTinta/AI4Devs-finalproject/pull/86)–[#89](https://github.com/DisTinta/AI4Devs-finalproject/pull/89) | 30-10 | Ticket de deuda nacido de la revisión adversarial de DIS-9. El hook de specs principales denegó al agente la edición del `## Purpose` de `explain`. La segunda ronda golden se paró: Ollama servía con contexto 4096 y todas las respuestas salían `invalid-model-output`; la autora lo reinició con `OLLAMA_CONTEXT_LENGTH=16384` y editó el `## Purpose` a mano (`prompts.md` §73). En #89 la regla de estabilidad paró el change y la PR quedó abierta para la autora (§75) |
| 4 | DIS-89 → DIS-90 | [#90](https://github.com/DisTinta/AI4Devs-finalproject/pull/90)–[#92](https://github.com/DisTinta/AI4Devs-finalproject/pull/92) | 30-10 | Ninguna parada; la #92 añade a `docs/DEMO.md` la captura en PowerShell que hizo el agente |
| — | — | [#93](https://github.com/DisTinta/AI4Devs-finalproject/pull/93) | 02-11 | El preflight falló: la pasada completa de Stryker en cada push a la base superaba el límite de 40 minutos del job y los merges de #89–#92 terminaron en `cancelled`. La mutación pasó a ser incremental también en la base, con la pasada completa a mano |
| 5 | DIS-94 → DIS-95 | [#94](https://github.com/DisTinta/AI4Devs-finalproject/pull/94), [#95](https://github.com/DisTinta/AI4Devs-finalproject/pull/95) | 02-11 | DIS-94 se paró por editar el `## Purpose` de `impact` después de `/opsx:archive`, y DIS-95 no pudo hacerlo por no tener delta de `impact`. La #96 aplicó ese `## Purpose` y cambió el orden en el kit |
| 6 | DIS-14; DIS-75 → DIS-77 | [#98](https://github.com/DisTinta/AI4Devs-finalproject/pull/98)–[#101](https://github.com/DisTinta/AI4Devs-finalproject/pull/101) | 02-11 → 03-11 | Ninguna parada; la #101 (flujo ligero) corrige tres comentarios `// Spec:` que apuntaban al change ya archivado |
| 7 | DIS-79, DIS-81 → DIS-82 | [#102](https://github.com/DisTinta/AI4Devs-finalproject/pull/102)–[#104](https://github.com/DisTinta/AI4Devs-finalproject/pull/104) | 03-11 | Ninguna parada |
| 8 | DIS-67 → DIS-69; DIS-71 → DIS-73 | [#106](https://github.com/DisTinta/AI4Devs-finalproject/pull/106), [#107](https://github.com/DisTinta/AI4Devs-finalproject/pull/107); relanzado: [#105](https://github.com/DisTinta/AI4Devs-finalproject/pull/105), [#108](https://github.com/DisTinta/AI4Devs-finalproject/pull/108) | 03-11 → 04-11 | DIS-67 se paró en la CI y DIS-69 se saltó por depender de él; DIS-71 y DIS-73 se fusionaron. Relanzado el 04-11, sin paradas (detalle abajo) |

**La parada de DIS-67, contada entera.** En la primera ejecución del bloque 8 (03-11), la PR de DIS-67 (#105) se quedó en rojo en el job `verify` con `FINGERPRINT_MISMATCH`: la migración `0005_embedding-768` es una entrada de la huella del seed, así que la huella cambió, y regenerar con `cache:build` fallaba porque Ollama volvía a correr con contexto 4096 en vez de 16384. Era una parada limpia del contrato (CI en rojo), y el workflow siguió con los tickets independientes, DIS-71 y DIS-73, y saltó DIS-69. Se resolvió en una sesión interactiva, a petición de la autora: el agente reinició Ollama con `OLLAMA_CONTEXT_LENGTH=16384` (y la dejó fijada como variable de entorno del usuario), juntó la rama con la base y comprobó que `cache:build` ya generaba las seis respuestas; pero como las filas del seed salían idénticas, solo refrescó las huellas, como en DIS-94, sin usar las respuestas regeneradas y conservando las firmas del panel de DIS-110 (`design.md` → E1 del change [`semantic-cache`](openspec/changes/archive/2026-11-04-semantic-cache/design.md)). El 04-11 se relanzó el bloque DIS-67 → DIS-69, que se fusionó sin paradas: DIS-67 con tres auditorías más en la nueva ejecución y DIS-69 con cuatro (sus informes `*-spec-audit.md`, con las secciones `## Run <n>`). Un comentario en DIS-46, la historia padre, que pedía la auditoría no lo pudo publicar el agente, porque los permisos solo le dejan escribir en el ticket en curso; lo publicó la autora.

**Lo que estas ejecuciones llevaron al kit.** Cada parada terminó en una regla nueva, no en un rodeo:

- Rondas de corrección de la auditoría (#67, ADR [`20261026-autonomous-audit-correction-rounds`](docs/adr/20261026-autonomous-audit-correction-rounds.md)): una auditoría `CHANGES REQUIRED` ya no para el ticket.
- El contrato tras el piloto (#70): un comando `git` por llamada, la CI esperada hasta el final, ningún proceso huérfano, ninguna sesión dentro de la carpeta del change y las revisiones en línea.
- `scripts/dev-processes.mjs` (#72), para listar y parar los procesos que el agente no puede buscar con PowerShell.
- El workflow guardado `autonomous-sdd.js` (#73), en lugar de un script por sesión.
- La espera de la CI en primer plano, con `gh pr checks --watch` (#76).
- Sin traspaso de PowerShell a la autora y las specs principales antes del archivo (#96).
- `CMD_TEST` con los proyectos de Vitest que el agente debe correr (#97).

**Lo que sigue siendo humano.** El interruptor `KIT_AUTONOMOUS_RUN` lo pone y lo quita la autora a mano, y en el repositorio siempre está a `"0"`. Los cambios de `.claude/` y `.cursor/` no los puede hacer ni integrar el agente en una ejecución autónoma: las PR del kit (#66, #67, #70, #72, #73, #76, #96, #97) las fusionó la autora, igual que las que no tienen change archivado, que la puerta deniega. También queda para ella lo que los permisos deniegan (comentarios en tickets que no son el del paso, procesos del sistema, el servidor de Ollama) y, en el piloto, la firma de las respuestas golden que regeneró DIS-104 (#71); desde DIS-33 las golden regeneradas las revisa un panel de agentes independiente.

---

## Referencias

Limitadas a las que sostienen decisiones concretas de arquitectura o seguridad.

1. Greshake, K. et al. (2023). *Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection*. AISec '23. https://arxiv.org/abs/2302.12173
2. Beurer-Kellner, L. et al. (2025). *Design Patterns for Securing LLM Agents against Prompt Injections*. https://arxiv.org/abs/2506.08837
3. Debenedetti, E. et al. (2025). *Defeating Prompt Injections by Design* (CaMeL). https://arxiv.org/abs/2503.18813
4. Tian, K. et al. (2023). *Just Ask for Calibration: Strategies for Eliciting Calibrated Confidence Scores from Language Models Fine-Tuned with Human Feedback*. EMNLP 2023. https://aclanthology.org/2023.emnlp-main.330/
5. OWASP GenAI Security Project. *Top 10 for LLM Applications (2025)*. https://genai.owasp.org/llm-top-10/
6. OWASP GenAI Security Project. *Top 10 for Agentic Applications* (edición 2026). https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
7. Bohner, S. A., Arnold, R. S. (1996). *Software Change Impact Analysis*. IEEE Computer Society Press.

---

El registro del uso de IA en el proyecto está en [`prompts.md`](./prompts.md).
