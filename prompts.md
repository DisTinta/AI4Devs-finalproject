# prompts.md — Registro de uso de IA

**Proyecto:** CODEMIND
**Autora:** Cristina Rodríguez Núñez
**Máster:** AI4Devs — Proyecto Final

> Este documento recoge el uso de IA en la creación del proyecto: las herramientas y los modelos de cada fase, el contexto que reciben, el flujo de trabajo, los **prompts más representativos** y el criterio humano que hubo detrás de cada uno.
>
> Los prompts se reproducen **literalmente**, y cada uno va con **qué ajustes humanos** hubo que hacer sobre la salida del modelo. Esa parte es deliberada: es donde se ve el criterio propio, y en varios casos es más informativa que el prompt.
>
> El registro completo, una sección por hito o ticket desde la Entrega 1, está en [`docs/ai-sessions/prompts/`](docs/ai-sessions/prompts/) y se enlaza al final.

**→ [Prompts más significativos para la entrega final](#prompts-más-significativos-para-la-entrega-final)**

---

## Índice

- [0. Flujo de trabajo con IA](#0-flujo-de-trabajo-con-ia): herramientas y modelos, el harness, contexto avanzado y conversaciones completas
- [Prompts más significativos para la entrega final](#prompts-más-significativos-para-la-entrega-final): seis prompts, uno por fase
- [8. Lecciones sobre el uso de IA en este proyecto](#8-lecciones-sobre-el-uso-de-ia-en-este-proyecto)
- [Registro completo](#registro-completo): las 89 secciones restantes, en `docs/ai-sessions/prompts/`

---

# 0. Flujo de trabajo con IA

## 0.1. Herramientas y modelos por fase

| Fase | Herramienta | Modelo | Por qué ese |
|---|---|---|---|
| Definición y crítica de la propuesta | Claude (Cowork) | Opus | Razonamiento largo sobre un documento completo; necesitaba que sostuviera 40 páginas de contexto y detectara contradicciones entre secciones |
| Investigación de referencias | Claude (Cowork) con búsqueda web | Opus | Verificación de citas reales en vez de generarlas de memoria |
| Redacción de documentación técnica | Claude (Cowork) | Opus | Documentos largos con estructura fija |
| Diseño de esquema de datos y API | Claude (Cowork) | Opus | Decisiones con consecuencias en cascada |
| Planificación de historias, propuestas y redacción larga (Entrega 2) | Claude (Cowork / chat) | Opus | El backlog en jerarquía para Linear y los prompts de cada hito, antes de abrir el repositorio |
| Implementación, tests, revisión y orquestación de subagentes (Entrega 2) | Claude Code | Opus | Todo el ciclo SDD de cada ticket: `/enrich-us`, OpenSpec, TDD, las tres revisiones y el archivo; y, en el experimento de [§57](docs/ai-sessions/prompts/57-experimento-workflow-autonomo-para-cerrar-la-entrega-2-dis-101.md), la orquestación del workflow |
| Subagentes de pasos mecánicos (Entrega 2) | Claude Code | Sonnet | PR, archivo, merge y cierre en Linear dentro del workflow: pasos fáciles de verificar y de rehacer |
| Ejecuciones autónomas por bloques de tickets (Entrega 3) | Claude Code, perfil autónomo (`CLAUDE_CONFIG_DIR`) con el workflow guardado `autonomous-sdd` | Opus en `/enrich-us`, propuesta, auditoría, revisiones y resolución de paneles; Sonnet en el apply, la CI, el archivo y el merge | El reparto lo fija el propio script (`.claude/workflows/autonomous-sdd.js`): lo que exige criterio va a Opus y lo que se comprueba con la CI y las revisiones posteriores, a Sonnet ([readme §8.7](readme.md#87-ejecuciones-autónomas-de-la-entrega-3)) |
| Paneles de revisión independiente (Entrega 3) | Claude Code, dentro del workflow | `claude-opus-5-5` y `claude-sonnet-5-5`, con un resolutor Opus | La anotación de sitios de llamada (DIS-80) y la revisión de las respuestas (DIS-33, DIS-82) necesitaban dos revisores que no se leyeran entre sí |
| Sesiones de criterio y redacción | Cursor | — | Decisiones de producto conversadas, como la del 5 de septiembre (§8, lección 6) |

En la Entrega 1 esta tabla recogía solo las fases de documentación y anunciaba para el código «Cursor con Sonnet para implementación y tests, Claude Code con Opus para revisión». No fue así: la implementación y los tests se hicieron en Claude Code con Opus, dentro del flujo del kit, y Sonnet quedó para los subagentes de pasos mecánicos. El flujo completo está en la sección 8 del readme.

**Criterio de reparto.** Opus para lo que tiene consecuencias difíciles de revertir —arquitectura, esquema de base de datos, decisiones de seguridad—; Sonnet para lo que es rápido de verificar y de rehacer —código, tests, refactors—. El coste de un error de Opus en el esquema de datos se paga durante semanas; el de Sonnet en una función se paga en cinco minutos.

## 0.2. Skills, subagentes y comandos personalizados

### El harness de trabajo

Antes de arrancar el desarrollo construí un **harness propio de Spec-Driven Development**, [sdd-harness-kit](https://github.com/DisTinta/sdd-harness-kit), para no montar el andamiaje de trabajo con IA desde cero en cada proyecto. Es un instalable que deja en el repositorio destino 27 skills y 9 subagentes como fuente canónica en `ai-specs/`, 9 hooks deterministas del ciclo de vida, estándares por capa en `docs/`, adaptadores por stack y los cuatro ficheros de memoria de copiloto apuntando a una doctrina única. Su huella en este repositorio está descrita en la sección 2.3 del readme.

**En la Entrega 2** el repositorio tiene 29 skills, 9 subagentes y **10 hooks**: los 9 de la Entrega 1, que eran ciertos entonces, más `spec-audit-gate`, que llegó con el PR #35 (commit `2de2630`) para que ningún change pase al apply sin el informe del `spec-auditor`. Qué impide cada hook y cuántas veces disparó está en la sección 8.1 del readme.

**En la Entrega 3** son **12 hooks**: DIS-106 añadió `autonomous-merge-gate`, que solo deja fusionar a un agente con el change archivado, la CI en verde y la base protegida, y `log-permission-denied`, que registra cada denegación. Llegó también el workflow guardado `.claude/workflows/autonomous-sdd.js` (PR #73), con el que se lanzaron las ejecuciones autónomas de esta entrega. Skills y subagentes siguen siendo 29 y 9.

**Procedencia.** El kit es de creación propia: nace de lo que estoy aprendiendo en el Máster AI4Devs de LIDR Academy, al que entregaré CODEMIND como proyecto final. Toma como punto de partida ideas y convenciones de [LIDR-academy/lidr-specboot](https://github.com/LIDR-academy/lidr-specboot) (MIT), el repositorio de referencia del máster: la disposición de `ai-specs/` con skills y subagentes como fuente canónica, los estándares en `docs/`, y los ficheros de memoria por copiloto —`CLAUDE.md`, `AGENTS.md`— apuntando a una doctrina única. Lo añadido por mí es el instalable con detección de stack, los 9 hooks deterministas, los adaptadores, el `doctor`, el soporte en Windows y los gates de secretos. Queda declarado en el `CREDITS.md` y el `LICENSE` del kit, que conserva el aviso de copyright de specboot.

**Lo que hubo que hacer para este proyecto.** El kit traía adaptadores para Laravel, AdonisJS y React, y CODEMIND es **Fastify sobre un monorepo hexagonal**: no había ninguno que sirviera. Escribí el adaptador `fastify`, y su guarda de arquitectura codifica la regla de dependencias de la sección 2.3 del readme — si un fichero de `packages/core` menciona `adapters/` o `analyzers/`, el hook avisa al guardar.

**Y aquí está la conexión con el producto**, que es lo que más me interesa señalar de todo este apartado. Los hooks del harness, según su propia documentación, *«actúan sobre la ruta del fichero, no sobre qué comando lo escribió»*. Es exactamente el razonamiento por el que CODEMIND verifica sus propias citas en lugar de pedirle al modelo que las aporte bien, y por el que la independencia del lenguaje es un test en CI y no un párrafo en el readme. **Tres veces la misma idea: no se le pide al modelo que cumpla, se monta un mecanismo que lo comprueba.** Que aparezca en mi herramienta de trabajo, en la arquitectura del producto y en el pipeline no es casualidad: es la única convicción técnica que sostiene el proyecto entero.

### Recursos concretos

**Usado en la Entrega 1:**

| Recurso | Tipo | Para qué |
|---|---|---|
| `critico-adversarial` | Subagente | Recibe una sección de documentación y devuelve solo objeciones, sin reformularla. Se usó sobre todas las secciones del readme |
| Adaptador `fastify` | Adaptador de stack del harness | Escrito para este proyecto: comandos, rutas de capa y guardas de arquitectura del monorepo hexagonal. Instalado en el repositorio (`.claude/sdd-harness.env`, `docs/backend-standards.md`) |

**Usado en la Entrega 2** (en el código; el detalle, con su evidencia, está en la sección 8.2 del readme):

| Recurso | Tipo | Para qué |
|---|---|---|
| `/enrich-us` | Skill | Enriquecer cada ticket de Linear con `[original]`, `[reality-map]` y Enhanced antes de proponer |
| `/opsx:propose`, `/opsx:apply`, `/opsx:update`, `/opsx:archive`, `/opsx:sync` | Comandos de OpenSpec | El ciclo de cada change, de la propuesta al archivo con las specs sincronizadas |
| `spec-auditor` | Subagente | Auditar la propuesta entre propose y apply; el hook `spec-audit-gate` exige su informe |
| `tdd-test-writer` → `tdd-implementer` → `tdd-refactorer` | Roles del apply | Test en RED desde el escenario, implementación mínima y refactor con la suite en verde |
| `/verify-against-spec`, `/adversarial-review`, `/show-spec-working` | Skills | Las tres revisiones antes de archivar |
| `/pr-describe`, `/update-docs`, `/adr-new`, `/privacy-ethics-check` | Skills | Descripción del PR en español, documentación desfasada, ADR y comprobación de privacidad |
| Linear y Context7 | Servidores MCP | Leer y actualizar los tickets; documentación de librerías |
| Workflow de Claude Code | Orquestación | El experimento de la [§57](docs/ai-sessions/prompts/57-experimento-workflow-autonomo-para-cerrar-la-entrega-2-dis-101.md) |

**Usado en la Entrega 3** (el detalle está en la sección 8.7 del readme):

| Recurso | Tipo | Para qué |
|---|---|---|
| `autonomous-sdd` | Workflow guardado de Claude Code | Llevar un bloque de tickets de Linear de `/enrich-us` al merge, con rondas de corrección del `spec-auditor` (como mucho 5) y paradas limpias cuando algo no cabe en el contrato |
| Interruptor `KIT_AUTONOMOUS_RUN` y `autonomous-merge-gate` | Configuración y hook del kit | Activar a mano el modo autónomo y dejar el merge solo cuando se cumplen sus condiciones (DIS-106) |
| Paneles de agentes | Pasos del workflow | Juicios que necesitan independencia: anotación de sitios de llamada y revisión de respuestas, con medida de acuerdo |

Lo que la Entrega 1 dejó **previsto** y no se usó, y por qué: `/revisar-arquitectura` (comando de Cursor) lo sustituyeron el hook `post-edit-quality`, que avisa al guardar, y `dependency-cruiser` en CI; el subagente `verificador-de-evidencias` no hizo falta, porque el verificador se diseñó con OpenSpec y sus escenarios; y las reglas de estilo de `.cursorrules` las cubren las reglas que el kit instala en `.cursor/rules/` y los estándares de `docs/`.

**Nota sobre `critico-adversarial`.** Fue el recurso más rentable del proyecto. Pedir «mejora este texto» produce texto más largo; pedir «dame solo las objeciones, sin reescribir nada» produce los agujeros. Casi todos los cambios de fondo en la propuesta salieron de ahí.

## 0.3. Contexto avanzado

Lo que el modelo recibe además del prompt, y por qué vía. La idea que lo ordena es la de todo el proyecto: lo que importa no se le pide al modelo que lo recuerde, se le pone delante o se comprueba con un mecanismo.

| Fuente | Qué aporta | Cómo llega al modelo |
|---|---|---|
| Ficheros de memoria (`CLAUDE.md`, `AGENTS.md`) | Una única doctrina para Claude Code y Cursor | Los dos apuntan a `docs/base-standards.md`, que el agente carga al abrir la sesión |
| `docs/base-standards.md` y los estándares por capa (`docs/backend-standards.md`, `docs/frontend-standards.md`) | Los principios del flujo (puertas humanas, TDD, el porqué escrito por una persona) y las convenciones de cada capa | Desde la memoria y desde cada skill que los cita |
| `docs/project-context.md` | Decisiones cerradas, comandos, *gotchas* medidos (por ejemplo `OLLAMA_CONTEXT_LENGTH=16384`) y la norma de este registro | Lo leen `/enrich-us`, `/opsx:propose` y los revisores antes de escribir |
| Specs de OpenSpec (`openspec/specs/`, 43 capacidades) y el change activo | El contrato vigente: cada escenario se convierte en un test con su mismo nombre | `/opsx:apply` y las tres revisiones leen el change; `/opsx:archive` sincroniza las specs |
| `[reality-map]` de `/enrich-us` | Qué existe en el código, qué hay que crear y qué ejemplos del ticket se han comprobado | Se escribe en la issue de Linear antes de proponer, para no diseñar contra un código imaginado |
| Servidores MCP (`.mcp.json`): Linear, Context7 y Playwright | Los tickets y sus comentarios, documentación de librerías al día y el navegador | Herramientas del agente durante la sesión |
| Subagentes con contexto limpio | Una tarea sin el historial de la conversación: auditor de specs, revisores, paneles y cada paso del workflow autónomo | El prompt del paso lleva solo lo que necesita: ticket, rama, change y criterio |
| Hooks del kit | Contexto determinista que no depende de la memoria del modelo | Avisos al guardar, bloqueo de secretos, puerta de la auditoría y puerta del merge |
| Memoria del perfil autónomo de Claude Code | Preferencias de la autora entre sesiones: idioma, qué no se delega, qué hace solo ella | Ficheros de memoria del perfil (`CLAUDE_CONFIG_DIR`), que el agente lee al empezar |

## 0.4. Conversaciones completas

El registro completo, una sección por hito o por ticket, está en [`docs/ai-sessions/prompts/`](docs/ai-sessions/prompts/) y se enlaza desde el [Registro completo](#registro-completo) al final de este documento. Al pasarlo a archivos se quitaron los prompts que no aportaban: los comandos sueltos (`/opsx:propose DIS-11`, `/opsx:apply`) se quedan en una línea, y el encargo estándar de cada paso del workflow autónomo se publica una vez y las demás secciones lo enlazan. Lo que acompaña a cada prompt, el «por qué funcionó» y el «ajuste humano», se conserva entero.

Las sesiones largas de planificación y revisión están en `docs/ai-sessions/`, numeradas por orden. Los prompts se reproducen **literalmente**, tal como se enviaron: cuando una decisión posterior los deja desfasados, se dice en el «ajuste humano» en lugar de reescribir el prompt.

---

# Prompts más significativos para la entrega final

Seis prompts, uno por fase del ciclo, elegidos entre los del [registro completo](#registro-completo) por lo que cambiaron en el proyecto. Cada uno lleva el prompt literal, por qué funcionó y el criterio humano que hubo detrás; el enlace bajo cada título lleva a su sección completa en el registro.

| # | Fase | Prompt | Qué cambió |
|---|---|---|---|
| 1 | Arquitectura | Elección del patrón con la extensibilidad como restricción | La independencia del lenguaje pasó de afirmación a algo comprobable con un `git diff` |
| 2 | Planificación | Backlog real con pasada *poke-holes* y puerta humana | 28 objeciones decididas una a una antes de importar nada a Linear |
| 3 | Tests | Estrategia de pruebas atada a los criterios de aceptación | Nació `npm run verify` y se reescribieron tres criterios que no se podían comprobar |
| 4 | Código | «¿Qué se necesita para que funcione?» y «no quiero dejar flecos» (DIS-72) | Un fallo de configuración de Ollama, y no del modelo, y la salida con valla resuelta en el mismo ticket |
| 5 | Flujo de trabajo | ¿Se puede hacer el resto de la entrega sin la autora? (DIS-101) | El experimento del que salió el modo autónomo de la Entrega 3 |
| 6 | Despliegue y evaluación | ¿Queda claro cómo probar el sistema completo? | La guía de evaluación paso a paso del readme, comprobada ejecutando cada comando |

## 1. Arquitectura — elección del patrón con la extensibilidad como restricción

Entrega 1, sección de arquitectura del readme ([registro completo, §2.1](docs/ai-sessions/prompts/02-arquitectura-del-sistema.md)).

```
Quiero decidir el patrón arquitectónico de CODEMIND, no que me lo confirmes.

Requisito que manda sobre los demás: el núcleo debe ser independiente del
lenguaje analizado. Va a haber dos analizadores (PHP/Laravel y TypeScript) y
quiero poder demostrar —no afirmar— que añadir el segundo no obliga a tocar
el núcleo.

Propón 2 o 3 patrones candidatos. Para cada uno:
- cómo satisface ese requisito
- qué cuesta en complejidad para un proyecto de 13 semanas
- cómo se COMPRUEBA automáticamente que la separación no se ha roto

Recomienda uno y explica qué sacrifico al elegirlo.
```

**Por qué funcionó.** La tercera viñeta. Preguntar «cómo se comprueba» convirtió una decisión estética en una decisión con mecanismo: de ahí salió el test de arquitectura en CI con `dependency-cruiser` que falla el build si alguien importa infraestructura desde `core`.

**Ajuste humano.** Escogí hexagonal, pero **rechacé la propuesta de crear un paquete de puertos separado** por lenguaje. Con dos analizadores es sobreingeniería: un solo `AnalyzerPort` basta y se ve de un vistazo. Añadí por mi cuenta el criterio de aceptación de la PR 3: *el diff no toca `packages/core`*. Eso hace la afirmación falsable con un `git diff`, que era el objetivo original del prompt. Se cumplió en la Entrega 3: las PR #74 y #75 del analizador TypeScript no tocan `packages/core`.

## 2. Planificación — backlog real con pasada *poke-holes* y puerta humana

Entrega 2, antes de escribir código ([registro completo, §11](docs/ai-sessions/prompts/11-planificacion-del-backlog-real.md)). Es un prompt largo, guardado entero en `docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md`; aquí va el extracto literal de las dos fases que cambiaron el resultado:

````
[…]

### Fase B — Poke-holes (obligatoria, pasada aparte)

Cuando el borrador del backlog esté escrito en `03-planificacion-historias-de-usuario.md`, **cambia de modo**: deja de ser autora del backlog y actúa como el crítico adversarial del proyecto (`critico-adversarial` / P2 poke-holes).

**Objetivo:** encontrar agujeros. **No** mejorar el tono. **No** reescribir historias ni tickets en esta fase.

En el chat (y como sección `## 5. Poke-holes` en el documento de planificación), entrega **solo objeciones**, numeradas, con este formato por ítem:

```markdown
### PH-NN — <título corto>
- **Apunta a:** CM-HU-XX / CM-HU-XX.Y / trazabilidad / orden / milestone
- **Tipo:** alcance faltante | alcance sobrante | criterio débil o solo feliz | borde/error ausente | contradicción con §§0–4 o project-context | dependencia / orden | INVEST / tamaño | non-goal ausente | riesgo de producto
- **Objeción:** (una o dos frases; concreta; citable)
- **Evidencia:** § del readme / decisión cerrada / path del Reality map (si aplica)
- **Pregunta para la autora:** (opcional; una sola)
```

Cubre al menos:

1. Capacidades de §§0–4 **sin** HU o con cobertura falsa.
2. Criterios que parecen Given/When/Then pero no son testeables, o faltan borde/error reales (no genéricos).
3. Sub-issues demasiado gordas, demasiado finas (checklist TDD) o que duplican OpenSpec `tasks.md`.
4. Contradicciones con decisiones cerradas (evidencia local, LLM vacío / Ollama, sin hosting).
5. Non-goals que deberían existir y no están (o must que deberían ser should).
6. Orden de ataque imposible (p. ej. UI de `/ask` antes que grafo / verify).

**Prohibido en Fase B:**

- Reescribir el Enhanced, fusionar HUs o “ya te lo dejo arreglado”.
- Añadir historias nuevas al §2 sin esperar a Cristina.
- Suavizar objeciones (“quizá convendría…”): formula el fallo.

### Fase C — Gate humano (obligatorio)

**Para aquí.** Muestra el resumen de PH-* y espera la respuesta de Cristina (aceptar / rechazar / matizar por ítem).

[…]
````

**Por qué funcionó.** La lectura obligatoria en orden (§§0–4 → project-context → standards → skill) y la prohibición explícita de usar §§5–6 como semilla obligaron a derivar el backlog del producto y no del recorte de la Entrega 1; el Reality map por historia dejó a la vista que casi todo es `to-create` y dónde están los puntos de inserción del esqueleto; separar la pasada poke-holes de la redacción evitó que el agente se corrigiera a sí mismo y suavizara las objeciones.

**Ajuste humano.** La autora decidió una por una las 28 objeciones del *poke-holes* y las 6 preguntas abiertas antes de que el agente tocara el backlog: rechazó 2 (un cuarto endpoint de listado y un puerto de auditoría), aceptó 2 en parte y 24 enteras. El backlog quedó en 26 historias y 65 sub-issues, que durante las entregas llegaron a 67 en Linear.

## 3. Tests — estrategia de pruebas atada a los criterios de aceptación

Entrega 1, sección de tests del readme ([registro completo, §2.6](docs/ai-sessions/prompts/02-arquitectura-del-sistema.md)).

```
Adjunto las 3 historias de usuario de CODEMIND con sus criterios de
aceptación, y los 3 tickets.

Diseña la estrategia de tests. Restricciones:
- cada nivel (unitario, integración, E2E) debe justificar por qué existe;
  no quiero pirámide por costumbre
- debe haber un test que compruebe la regla de arquitectura (core no importa
  infraestructura) y que falle el build si se rompe
- la evidencia de funcionamiento del proyecto NO serán capturas ni vídeo,
  así que necesito una comprobación ejecutable que alguien externo pueda
  correr para verificar que su instalación reproduce lo documentado

Para cada criterio de aceptación, indica qué nivel de test lo cubre.
Si algún criterio no es testeable como está escrito, dímelo.
```

**Por qué funcionó.** La última línea. Devolvió tres criterios de aceptación mal formulados —incluido uno mío que decía «la respuesta es útil», que no es verificable— y los reescribí antes de seguir. Es más barato arreglar un criterio que un test.

**Ajuste humano.** De aquí salió `npm run verify`, que no estaba en mi plan: una prueba de humo que consulta cada proyecto de muestra y compara con la salida esperada. Cumple doble función —test de integración en CI y verificación para quien evalúa— y es la forma en que se demuestra que el sistema funciona.

## 4. Código — el modelo que no fallaba y la valla de JSON (DIS-72)

Entrega 2, ticket de la confianza calculada ([registro completo, §45](docs/ai-sessions/prompts/45-confianza-calculada-pesos-publicados-y-salida-del-modelo-con-valla.md)). Es el ticket que el readme traza de punta a punta en su sección 8.4. Tras una primera sesión en la que todas las respuestas acabaron en `UNKNOWN`:

```
que se necesita para que funcione? que tipo de modelo?
```

**Por qué funcionó.** En lugar de proponer un modelo mayor, la pregunta llevó a leer el log de Ollama:
recortaba cada prompt a 2 050 tokens (`truncating input prompt`) y se perdía el system prompt con la
instrucción de responder en JSON. El fallo no era del modelo, y probablemente tampoco lo fue en DIS-70.
Se resolvió sirviendo Ollama con `OLLAMA_CONTEXT_LENGTH=16384`, sin código.

Y cuando apareció el segundo problema, la salida del modelo envuelta en una valla de Markdown:

```
si y voy a querer que resuelvas en esta tarea lo de las vallas de json, no quiero dejar flecos y ahora que ha salido el problema lo vas a resolver
```

**Por qué funcionó.** El hallazgo se llevó primero a los artefactos con `/opsx:update` (delta `MODIFIED`
de `claims-and-typing`, decisión C9, grupo de tareas 8b) y después al código por TDD. La cuarentena
acepta solo una valla que envuelva toda la salida, y el tamaño y el evento siguen usando el texto
crudo; se descartó `response_format` por depender del proveedor.

**Ajuste humano.** Con el prompt completo, en CPU cada pregunta tardaba más que el límite de 300 s, así
que la sesión de pesos usó un `fetch` propio en un script del scratchpad. Con 5 respuestas reales, la
autora mantuvo los pesos iniciales con los motivos recomendados («si son los motivos que aconsejas,
confío en ti»). Pidió además una tarea nueva (DIS-101) para documentar en el readme los tiempos con
modelo real y el flujo de trabajo con IA.

## 5. Flujo de trabajo — ¿se puede hacer el resto de la entrega sin la autora? (DIS-101)

Final de la Entrega 2 ([registro completo, §57](docs/ai-sessions/prompts/57-experimento-workflow-autonomo-para-cerrar-la-entrega-2-dis-101.md)).

```
¿hay alguna forma para que hicieras el resto de tareas de Linear (CODEMIND — Entrega 2)  en automático con el flujo definido? Y si te surgen preguntas o decisiones investigues como ingeniero de software jefe para ressolverlas sin tener que preguntarme? No tendrías que mostrar en esta terminal nada más que al final una lista de los tickets resueltos y un mensaje tipo tareas finalizadas.
¿como ves esta idea? es posible? ¿cómo se tendría que hacer?
```

**Por qué funcionó.** Preguntar «¿cómo se tendría que hacer?» en lugar de pedir que lo hiciera llevó a
una respuesta con los choques antes que con el plan: los principios 2, 3, 8 y 9 de
`docs/base-standards.md` (puerta humana en el plan, tests supervisados, el porqué escrito por una
persona, merges firmados) y DIS-34, definida como no delegable. Cada choque se convirtió en una
decisión explícita de la autora, y el conjunto en un ADR, en vez de quedar como una excepción
silenciosa.

Respuesta de la autora a las opciones cerradas que propuso el agente:

```
- la B, el híbrido.
- el merge lo harías tú
- Ollama lo intentas (las últimas pruebas salieron bien, revisa tu memoria)
- el porqué lo pones tú

alguna pregunta mas? entonces explícame cual sería el plan
```

**Por qué funcionó.** Opciones cerradas con su consecuencia escrita permiten decidir en cuatro líneas.
En un mensaje posterior la autora autorizó el tamaño dinámico del workflow, pidió que cada ticket
empezara con `/enrich-us`, que DIS-101 contara el experimento y que se midieran los tokens antes y
después de un piloto, para comprobar la estimación de coste en lugar de aceptarla.

**Ajuste humano.** Las decisiones son las del propio prompt: modo híbrido, el agente fusiona, intenta Ollama y escribe el porqué de cada PR marcado como texto suyo. El experimento cerró doce tickets de la Entrega 2 (readme §8.6) y se convirtió en la Entrega 3 en el modo autónomo del kit, con su interruptor manual y su puerta de merge (readme §8.7).

## 6. Despliegue y evaluación — ¿queda claro cómo probar el sistema completo?

Ajustes finales de la entrega ([registro completo, §89](docs/ai-sessions/prompts/89-ajustes-finales-de-la-entrega-readme-repositorio-privado-y-guia-de.md)).

```
mientras, voy a intentar hacer la demo en vivo, primero desde la guía del readme 1.4 instrucciones de instalación.
Aunque ¿crees que queda bien claro como deben hacer los evaluadores para probar el sistema completo? Analiza esta parte y dime primero si toda es correcta y si propondrías cambios para que quede bien claro cómo hacer el paso a paso y probar todo el sistema
```

**Por qué funcionó.** El agente ejecutó cada comando de la sección en modo evaluación y comparó la salida con el texto,
en lugar de leerlo. Encontró diez problemas: un paso del recorrido que no funciona sin modelo, un falso positivo del
informe de deriva sin avisar, la terminal que `npm run up` deja ocupada, que un proyecto propio no aparece en la web, el
`--` que PowerShell se come, y otros. De ahí salió la guía de evaluación paso a paso al principio de §1.4.

**Ajuste humano.** La autora añadió que el clon tenía que indicar la rama, porque `main` solo tiene la plantilla, y
preguntó si cada rama correspondía a una entrega. El agente respondió que no, porque al listar las ramas remotas había
filtrado las que empiezan por `feature/` y no vio `feature/entrega-1-CRN` ni `feature/entrega-2-CRN`; lo descubrió al
escribir esta sección y corrigió el párrafo de §0.5 del readme. La intuición de la autora era la correcta. También
puso en el readme la URL de la rama que pide el formulario de entrega. La demo en vivo, en un clon nuevo y siguiendo la
guía, salió sin incidencias.

---

# 8. Lecciones sobre el uso de IA en este proyecto

Lo que aprendí, incluyendo lo que salió mal. Las lecciones de los agentes autónomos, que son las de la Entrega 3, están en las secciones 8.6 y 8.7 del readme, junto a la evidencia de cada parada.

**1. El error más caro fue no dar el contexto de evaluación.** Pedí una auditoría de mi propuesta sin adjuntar el enunciado del proyecto. Recibí una crítica excelente y calibrada al objetivo equivocado, que me habría llevado a construir una tesis de investigación en lugar del MVP que se me pedía. El modelo no podía saberlo. Lo detecté al leer el documento oficial de indicaciones, y la corrección exigió reescribir la propuesta entera. **Antes de pedir una evaluación, hay que dar el criterio con el que a ti te evalúan.**

**2. Prohibir explícitamente da mejores resultados que pedir.** Los prompts más productivos de este proyecto llevan una prohibición: «no lo reescribas», «no me propongas un detector», «no incluyas criterios no verificables», «no lo distingas solo por color». La salida por defecto de un modelo tiende a lo convencional; la restricción es lo que la empuja fuera de ahí.

**3. Preguntar «cómo se comprueba» convierte opiniones en mecanismos.** La misma pregunta sobre arquitectura, formulada como «qué patrón usar», da una recomendación. Formulada como «cómo compruebo automáticamente que la separación no se ha roto», da un test en CI. La segunda es la que sirve.

**4. Los ajustes humanos se concentraron en el mismo sitio: la honestidad del sistema.** Repasando este documento, casi todas mis correcciones van en una dirección: la tasa de falsos positivos que faltaba, el enum de dos valores en lugar de la puntuación continua falsamente precisa, la respuesta `UNKNOWN`, el icono además del color. El modelo tiende a producir sistemas que parecen más seguros y más precisos de lo que son. **Corregir eso, sistemáticamente, fue mi aportación principal.**

**5. Pedir autorrevisión dentro del mismo prompt es barato y rentable.** «Después, revisa tu propio resultado y señala cuál sería más difícil de cumplir» identificó correctamente el criterio de latencia como el punto frágil, y me hizo subir una estimación antes de comprometerme con ella. Cuesta una frase.

**6. Decisión de producto (5 sep 2026) — evidencia solo local, LLM híbrido, Ollama.** En una sesión de criterio (Cursor), sin un único prompt de «genera documento», cerré dos bloqueos que la Entrega 1 había dejado abiertos: (a) **sin demo web alojada** — quien evalúa levanta con Docker/`make up`; (b) **`LLM_API_KEY` opcional** — evaluación y `npm run verify` desde caché/golden; desarrollo de pregunta libre con **Ollama** local (API compatible OpenAI), sin obligar a gastar en API cloud. Claude Pro/Max y Cursor siguen siendo herramientas de autoría, no el backend del producto. El detalle vivo está en `readme.md` (callouts «Decisión (5 sep 2026)») y en `proposal-codemind/05-propuesta-v4-evidencia-local-hibrido-ollama.md`; la propuesta 04 queda histórica en esos puntos. **Lección:** cuando el coste y la fricción del evaluador chocan con un «Camino A» cómodo en el papel, conviene recortar el Camino A antes de construir infraestructura que no se va a mantener.

**7. Retirada de `CODEMIND-ROADMAP.md` (post-harness).** Era brújula temporal pre-kit. Tras instalar `sdd-harness-kit` y migrar lo vigente a `docs/project-context.md` (fuentes de verdad, decisiones cerradas, norma síncrona de este `prompts.md`), el fichero se eliminó. Los literales de prompts y de `docs/ai-sessions/` que aún lo nombran se dejan intactos a propósito: reconstruirlos rompería la norma de no falsificar transcripciones. **Lección:** un documento «hasta que exista X» debe tener fecha de caducidad explícita y un destino de migración; si no, acaba como segunda fuente de verdad en conflicto con el harness.

**8. Decisión de producto (29 sep 2026): se conserva el índice `file (project_id, content_hash)` (DIS-13).** La tercera `/adversarial-review` señaló que la búsqueda de ficheros sin cambios va por `(project_id, path)`, que ya cubre `file_project_path_key`. Según eso, ninguna consulta definida usa hoy el índice por hash, y añade coste de escritura al indexar. Lo mantuve porque `readme.md` §3.2 lo pide: quitarlo es una decisión de producto, no algo que se resuelva en una pasada de arreglos. **Lección:** un hallazgo válido de un revisor automático no autoriza a cambiar el contrato del producto; se anota y se decide en su sitio.

**9. Tracking de gaps tras adversarial (30 sep 2026).** Tras varios PASS WITH GAPS, el riesgo era dejar Minors solo en un `design.md` archivado o en un comentario de un ticket que se cierra. Quedó norma en `docs/project-context.md` (*Tracking deferred findings*) y en el skill `adversarial-review`: cada gap diferido es A/B/C/D; sin destino no se archiva. En DIS-23 se eligió la variante ligera de C: un comentario-checklist en el propio ticket más Follow-ups en `design.md`, no una issue por Minor. **Lección:** lo que no se arregla en el change tiene que salir con dueño consultable; el board no hace falta hincharlo si el comentario y el design duplican la lista.

**10. Decisión técnica durante el apply (30 sep 2026): raíz del repositorio por ruta real (DIS-35).** Sin prompt literal: el agente paró el apply con una pregunta de opción cerrada. `checkIsRepo(IS_REPO_ROOT)` de simple-git, aprobado en el diseño y en la auditoría, rechaza la raíz de un worktree enlazado, porque comprueba que `--git-dir` sea `.git`. La spec pide aceptar cualquier directorio de nivel superior. Elegí comparar `git rev-parse --show-toplevel` con la ruta real, con un test de frontera para el worktree, y se revisó `design.md` D4.2. **Lección:** que un mecanismo esté aprobado en el diseño no demuestra que cumpla la spec; una sonda de dos líneas contra la librería real lo resolvió antes del merge.

---

# Registro completo

Una sección por hito o ticket, en el orden en que se hicieron. Las secciones 1 a 7 siguen la plantilla del máster (Entrega 1); de la 9 en adelante, cada una es un hito de la Entrega 2 o 3 o un ticket de Linear. La 0 y la 8 están arriba, en este documento.

1. [Descripción general del producto](docs/ai-sessions/prompts/01-descripcion-general-del-producto.md)
2. [Arquitectura del Sistema](docs/ai-sessions/prompts/02-arquitectura-del-sistema.md)
3. [Modelo de Datos](docs/ai-sessions/prompts/03-modelo-de-datos.md)
4. [Especificación de la API](docs/ai-sessions/prompts/04-especificacion-de-la-api.md)
5. [Historias de Usuario](docs/ai-sessions/prompts/05-historias-de-usuario.md)
6. [Tickets de Trabajo](docs/ai-sessions/prompts/06-tickets-de-trabajo.md)
7. [Pull Requests](docs/ai-sessions/prompts/07-pull-requests.md)
9. [Construcción de `fixtures`](docs/ai-sessions/prompts/09-construccion-de-fixtures.md)
10. [Esqueleto del monorepo](docs/ai-sessions/prompts/10-esqueleto-del-monorepo.md)
11. [Planificación del backlog real](docs/ai-sessions/prompts/11-planificacion-del-backlog-real.md)
12. [Esquema del grafo L1 (DIS-11)](docs/ai-sessions/prompts/12-esquema-del-grafo-l1-dis-11.md)
13. [Tablas de historial, afirmaciones, uso y caché (DIS-12)](docs/ai-sessions/prompts/13-tablas-de-historial-afirmaciones-uso-y-cache-dis-12.md)
14. [Índices, parcial `stale`, HNSW y trigger de invalidación (DIS-13)](docs/ai-sessions/prompts/14-indices-parcial-stale-hnsw-y-trigger-de-invalidacion-dis-13.md)
15. [Arnés de integración: transacción por test y factories (DIS-22)](docs/ai-sessions/prompts/15-arnes-de-integracion-transaccion-por-test-y-factories-dis-22.md)
16. [Contrato `StorePort` y escritura transaccional del grafo L1 (DIS-23)](docs/ai-sessions/prompts/16-contrato-storeport-y-escritura-transaccional-del-grafo-l1-dis-23.md)
17. [Lecturas del grafo: símbolos por nombre y vecinos a N saltos (DIS-24)](docs/ai-sessions/prompts/17-lecturas-del-grafo-simbolos-por-nombre-y-vecinos-a-n-saltos-dis-24.md)
18. [Extractor de Git con autores seudonimizados (DIS-35)](docs/ai-sessions/prompts/18-extractor-de-git-con-autores-seudonimizados-dis-35.md)
19. [Aristas `co_changed` con `weight` (DIS-36)](docs/ai-sessions/prompts/19-aristas-co-changed-con-weight-dis-36.md)
20. [Contrato `AnalyzerPort`, `file-kind` y parser PHP Tree-sitter (DIS-47)](docs/ai-sessions/prompts/20-contrato-analyzerport-file-kind-y-parser-php-tree-sitter-dis-47.md)
21. [Aristas declarativas del analizador PHP: `imports`, `extends`, `implements`, rutas, `tested_by`, `describes` (DIS-49)](docs/ai-sessions/prompts/21-aristas-declarativas-del-analizador-php-imports-extends-implements.md)
22. [Llamadas `exact` por tipo declarado en el analizador PHP (DIS-52)](docs/ai-sessions/prompts/22-llamadas-exact-por-tipo-declarado-en-el-analizador-php-dis-52.md)
23. [Facades, bindings y `__call` como llamadas `heuristic` en el analizador PHP (DIS-61)](docs/ai-sessions/prompts/23-facades-bindings-y-call-como-llamadas-heuristic-en-el-analizador-php.md)
24. [Rutas por string, jobs y eventos como llamadas `heuristic` en el analizador PHP (DIS-97)](docs/ai-sessions/prompts/24-rutas-por-string-jobs-y-eventos-como-llamadas-heuristic-en-el.md)
25. [Atributos Eloquent e informe de no resueltos en el analizador PHP (DIS-98)](docs/ai-sessions/prompts/25-atributos-eloquent-e-informe-de-no-resueltos-en-el-analizador-php-dis.md)
26. [Deuda del analizador PHP: rutas duplicadas, carga del parser y regla sin I/O (DIS-96)](docs/ai-sessions/prompts/26-deuda-del-analizador-php-rutas-duplicadas-carga-del-parser-y-regla.md)
27. [TSDoc de `AnalysisResult.edges` con las llamadas `heuristic` (DIS-99)](docs/ai-sessions/prompts/27-tsdoc-de-analysisresult-edges-con-las-llamadas-heuristic-dis-99.md)
28. [Gateway de seguridad en core: redacción de secretos y confinamiento de rutas (DIS-84)](docs/ai-sessions/prompts/28-gateway-de-seguridad-en-core-redaccion-de-secretos-y-confinamiento-de.md)
29. [Caso de uso `index-repository`: lectura en `HEAD`, redacción, framework y snapshot único (DIS-85)](docs/ai-sessions/prompts/29-caso-de-uso-index-repository-lectura-en-head-redaccion-framework-y.md)
30. [Comando CLI `index`: transacción propia, contrato de salida y errores sin rutas reales (DIS-86)](docs/ai-sessions/prompts/30-comando-cli-index-transaccion-propia-contrato-de-salida-y-errores-sin.md)
31. [Deuda de `index-repository`: lectura por lotes, límite de tamaño, rutas no UTF-8, log en streaming e higiene bidi (DIS-100)](docs/ai-sessions/prompts/31-deuda-de-index-repository-lectura-por-lotes-limite-de-tamano-rutas-no.md)
32. [Escaneo de secretos en CI con `gitleaks` (DIS-87)](docs/ai-sessions/prompts/32-escaneo-de-secretos-en-ci-con-gitleaks-dis-87.md)
33. [Semilla reproducible: `seed:build` con huella y volcado determinista (DIS-91)](docs/ai-sessions/prompts/33-semilla-reproducible-seed-build-con-huella-y-volcado-determinista-dis.md)
34. [Carga de la semilla, `cli projects` y constante de proyectos de muestra (DIS-92)](docs/ai-sessions/prompts/34-carga-de-la-semilla-cli-projects-y-constante-de-proyectos-de-muestra.md)
35. [Adaptador LLM compatible OpenAI con Ollama como entorno real (DIS-17)](docs/ai-sessions/prompts/35-adaptador-llm-compatible-openai-con-ollama-como-entorno-real-dis-17.md)
36. [Modo evaluación y techo de gasto diario sobre `query_log` (DIS-18)](docs/ai-sessions/prompts/36-modo-evaluacion-y-techo-de-gasto-diario-sobre-query-log-dis-18.md)
37. [Context Engine: anclaje léxico, expansión en ambos sentidos y doble en memoria (DIS-27)](docs/ai-sessions/prompts/37-context-engine-anclaje-lexico-expansion-en-ambos-sentidos-y-doble-en.md)
38. [Context Engine: ranking, presupuesto de tokens y paquete de contexto (DIS-28)](docs/ai-sessions/prompts/38-context-engine-ranking-presupuesto-de-tokens-y-paquete-de-contexto.md)
39. [Afirmaciones tipadas y cuarentena de la salida del modelo (DIS-38)](docs/ai-sessions/prompts/39-afirmaciones-tipadas-y-cuarentena-de-la-salida-del-modelo-dis-38.md)
40. [Caso de uso `explain`, política `UNKNOWN` y persistencia de afirmaciones (DIS-39)](docs/ai-sessions/prompts/40-caso-de-uso-explain-politica-unknown-y-persistencia-de-afirmaciones.md)
41. [Comando CLI `ask` con salida legible (DIS-40)](docs/ai-sessions/prompts/41-comando-cli-ask-con-salida-legible-dis-40.md)
42. [Sanitización mínima del contenido no confiable antes del prompt (DIS-41)](docs/ai-sessions/prompts/42-sanitizacion-minima-del-contenido-no-confiable-antes-del-prompt-dis-41.md)
43. [Verificador sintáctico de citas (DIS-68)](docs/ai-sessions/prompts/43-verificador-sintactico-de-citas-dis-68.md)
44. [Verificador semántico de citas, caché por par y uso de la verificación (DIS-70)](docs/ai-sessions/prompts/44-verificador-semantico-de-citas-cache-por-par-y-uso-de-la-verificacion.md)
45. [Confianza calculada, pesos publicados y salida del modelo con valla (DIS-72)](docs/ai-sessions/prompts/45-confianza-calculada-pesos-publicados-y-salida-del-modelo-con-valla.md)
46. [Uso por consulta en `query_log` y tope de verificación (DIS-74)](docs/ai-sessions/prompts/46-uso-por-consulta-en-query-log-y-tope-de-verificacion-dis-74.md)
47. [Base HTTP de la API: formato de error, Zod, `/docs`, límite por IP y composición (DIS-76)](docs/ai-sessions/prompts/47-base-http-de-la-api-formato-de-error-zod-docs-limite-por-ip-y.md)
48. [Endpoint `POST /ask`: esquemas, respuesta pública y errores por ruta (DIS-78)](docs/ai-sessions/prompts/48-endpoint-post-ask-esquemas-respuesta-publica-y-errores-por-ruta-dis-78.md)
49. [Caché de respuestas por pregunta normalizada en `explain` (DIS-21)](docs/ai-sessions/prompts/49-cache-de-respuestas-por-pregunta-normalizada-en-explain-dis-21.md)
50. [Respuestas *golden* de acme-shop con Ollama, huella y carga en `db:seed` (DIS-26)](docs/ai-sessions/prompts/50-respuestas-golden-de-acme-shop-con-ollama-huella-y-carga-en-db-seed.md)
51. [`npm run verify` real: huellas y comparación estructural con las golden, sin LLM, y job `verify` en CI (DIS-44)](docs/ai-sessions/prompts/51-npm-run-verify-real-huellas-y-comparacion-estructural-con-las-golden.md)
52. [Guion de demostración, despliegue y tests con salida real (DIS-45)](docs/ai-sessions/prompts/52-guion-de-demostracion-despliegue-y-tests-con-salida-real-dis-45.md)
53. [Andamiaje web: Tailwind, router, cliente tipado de la API y `test:a11y` real (DIS-58)](docs/ai-sessions/prompts/53-andamiaje-web-tailwind-router-cliente-tipado-de-la-api-y-test-a11y.md)
54. [Pantalla 1: tarjetas de proyectos de muestra, aviso de API caída y pantalla de error (DIS-60)](docs/ai-sessions/prompts/54-pantalla-1-tarjetas-de-proyectos-de-muestra-aviso-de-api-caida-y.md)
55. [Pantalla 2: pregunta, sugeridas, respuesta con afirmaciones tipadas y evidencia expandible (DIS-65)](docs/ai-sessions/prompts/55-pantalla-2-pregunta-sugeridas-respuesta-con-afirmaciones-tipadas-y.md)
56. [Pantalla 2: panel de uso, estados `UNKNOWN`, avisos de `429` y error, y pasada de accesibilidad (DIS-66)](docs/ai-sessions/prompts/56-pantalla-2-panel-de-uso-estados-unknown-avisos-de-429-y-error-y.md)
57. [Experimento: workflow autónomo para cerrar la Entrega 2 (DIS-101)](docs/ai-sessions/prompts/57-experimento-workflow-autonomo-para-cerrar-la-entrega-2-dis-101.md)
58. [Arranque y guion de demo iguales en PowerShell y Bash, y guías en español (DIS-102)](docs/ai-sessions/prompts/58-arranque-y-guion-de-demo-iguales-en-powershell-y-bash-y-guias-en.md)
59. [Probar con un modelo real desde un clon limpio (DIS-103)](docs/ai-sessions/prompts/59-probar-con-un-modelo-real-desde-un-clon-limpio-dis-103.md)
60. [Interruptor de ejecución autónoma en el kit, para Claude Code y Cursor (DIS-106)](docs/ai-sessions/prompts/60-interruptor-de-ejecucion-autonoma-en-el-kit-para-claude-code-y-cursor.md)
61. [Respuestas en el idioma de la pregunta (DIS-104)](docs/ai-sessions/prompts/61-respuestas-en-el-idioma-de-la-pregunta-dis-104.md)
62. [Deuda de `npm audit`: Vitest, Vite, Stryker y la base de Node 22 (DIS-105)](docs/ai-sessions/prompts/62-deuda-de-npm-audit-vitest-vite-stryker-y-la-base-de-node-22-dis-105.md)
63. [Analizador TypeScript: estructura, spans y aristas (DIS-30)](docs/ai-sessions/prompts/63-analizador-typescript-estructura-spans-y-aristas-dis-30.md)
64. [Analizador TypeScript: llamadas `exact` con el `TypeChecker` (DIS-31)](docs/ai-sessions/prompts/64-analizador-typescript-llamadas-exact-con-el-typechecker-dis-31.md)
65. [Semilla y golden de task-api, dos proyectos de muestra (DIS-32)](docs/ai-sessions/prompts/65-semilla-y-golden-de-task-api-dos-proyectos-de-muestra-dis-32.md)
66. [Anotación de sitios de llamada por un panel de agentes, congelada por hash (DIS-80)](docs/ai-sessions/prompts/66-anotacion-de-sitios-de-llamada-por-un-panel-de-agentes-congelada-por.md)
67. [Revisión independiente de las golden por un panel de agentes (DIS-33)](docs/ai-sessions/prompts/67-revision-independiente-de-las-golden-por-un-panel-de-agentes-dis-33.md)
68. [Corrección de `await using` en el analizador de TypeScript y nueva ronda del panel (DIS-107)](docs/ai-sessions/prompts/68-correccion-de-await-using-en-el-analizador-de-typescript-y-nueva.md)
69. [Endpoint `POST /api/projects/{id}/index`: reindexado de un proyecto existente (DIS-9)](docs/ai-sessions/prompts/69-endpoint-post-api-projects-id-index-reindexado-de-un-proyecto.md)
70. [Reindexado incremental por `content_hash` y dependientes directos (DIS-10)](docs/ai-sessions/prompts/70-reindexado-incremental-por-content-hash-y-dependientes-directos-dis-10.md)
71. [Recálculo perezoso de afirmaciones `stale` al recuperarlas (DIS-42)](docs/ai-sessions/prompts/71-recalculo-perezoso-de-afirmaciones-stale-al-recuperarlas-dis-42.md)
72. [Destruir la conexión del pool tras un fallo en el ejecutor de transacciones (DIS-110)](docs/ai-sessions/prompts/72-destruir-la-conexion-del-pool-tras-un-fallo-en-el-ejecutor-de.md)
73. [Segunda ronda golden de DIS-110: regenerar task-api Q1 (DIS-110 r2)](docs/ai-sessions/prompts/73-segunda-ronda-golden-de-dis-110-regenerar-task-api-q1-dis-110-r2.md)
74. [Quitar la carrera del test «Every connection is released after a run» (DIS-110)](docs/ai-sessions/prompts/74-quitar-la-carrera-del-test-every-connection-is-released-after-a-run.md)
75. [Quitar las carreras de la suite de integración en paralelo (DIS-110)](docs/ai-sessions/prompts/75-quitar-las-carreras-de-la-suite-de-integracion-en-paralelo-dis-110.md)
76. [Grafo de impacto: dependientes y tests de un cambio desde el grafo determinista (DIS-89)](docs/ai-sessions/prompts/76-grafo-de-impacto-dependientes-y-tests-de-un-cambio-desde-el-grafo.md)
77. [Riesgo, fila de `query_log` y comando `impact` (DIS-90)](docs/ai-sessions/prompts/77-riesgo-fila-de-query-log-y-comando-impact-dis-90.md)
78. [Historial por co-cambio y documentación con `stale` en el informe de impacto (DIS-94)](docs/ai-sessions/prompts/78-historial-por-co-cambio-y-documentacion-con-stale-en-el-informe-de.md)
79. [`POST /impact` con esquema Zod y tests `200`/`400`/`404` (DIS-95)](docs/ai-sessions/prompts/79-post-impact-con-esquema-zod-y-tests-200-400-404-dis-95.md)
80. [Pantalla 3 de impacto en la web (DIS-14)](docs/ai-sessions/prompts/80-pantalla-3-de-impacto-en-la-web-dis-14.md)
81. [Suite E2E con Playwright y job `e2e` en CI (DIS-75)](docs/ai-sessions/prompts/81-suite-e2e-con-playwright-y-job-e2e-en-ci-dis-75.md)
82. [Cobertura informativa y puerta de mutación (DIS-77)](docs/ai-sessions/prompts/82-cobertura-informativa-y-puerta-de-mutacion-dis-77.md)
83. [Medición de la calidad del grafo (DIS-79)](docs/ai-sessions/prompts/83-medicion-de-la-calidad-del-grafo-dis-79.md)
84. [Medición del ahorro de contexto y del verificador (DIS-81)](docs/ai-sessions/prompts/84-medicion-del-ahorro-de-contexto-y-del-verificador-dis-81.md)
85. [Revisión de las respuestas de la Tabla 1 por un panel de agentes (DIS-82)](docs/ai-sessions/prompts/85-revision-de-las-respuestas-de-la-tabla-1-por-un-panel-de-agentes-dis.md)
86. [Detección de deriva: afirmaciones de los docs contra el código (DIS-71)](docs/ai-sessions/prompts/86-deteccion-de-deriva-afirmaciones-de-los-docs-contra-el-codigo-dis-71.md)
87. [Búsqueda por similitud en la caché de respuestas (DIS-67)](docs/ai-sessions/prompts/87-busqueda-por-similitud-en-la-cache-de-respuestas-dis-67.md)
88. [Tasa de aciertos de caché del proyecto y vectores de las respuestas golden (DIS-69)](docs/ai-sessions/prompts/88-tasa-de-aciertos-de-cache-del-proyecto-y-vectores-de-las-respuestas.md)
89. [Ajustes finales de la entrega: readme, repositorio privado y guía de evaluación](docs/ai-sessions/prompts/89-ajustes-finales-de-la-entrega-readme-repositorio-privado-y-guia-de.md)
90. [Comando `drift` en la CLI e informe golden de deriva (DIS-73)](docs/ai-sessions/prompts/90-comando-drift-en-la-cli-e-informe-golden-de-deriva-dis-73.md)
