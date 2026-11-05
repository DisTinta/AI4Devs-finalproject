# 11. Planificación del backlog real

> Sección 11 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

Tercer hito de la Entrega 2, sin código: planificar el backlog real del producto completo (Entregas 2 y 3) a partir de `readme.md` §§0–4, con jerarquía Linear (issue padre INVEST → sub-issues), nivel `/enrich-us`, pasada poke-holes adversarial y gate humano antes de importar nada a Linear.

### Prompt 1 — Planificación de historias de usuario y sub-issues (backlog real)

Prompt literal enviado a Claude Code como primer mensaje de una sesión nueva en la rama `feature/entrega-2-CRN`. Se conserva íntegro en `docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md`; el resultado está en `docs/ai-sessions/03-planificacion-historias-de-usuario.md`:

````
## Contexto

Trabajas en **CODEMIND**, proyecto final AI4Devs de Cristina Rodríguez Núñez.
Repositorio: fork `DisTinta/AI4Devs-finalproject`. Rama activa: `feature/entrega-2-CRN`.

El monorepo esqueleto y el SDD Harness Kit ya existen. **Esta sesión no implementa código ni crea issues en Linear.** Solo planifica el backlog real del producto y lo deja por escrito para que la autora lo revise.

### Trazabilidad de archivos (no confundir)

| Archivo | Rol |
|---|---|
| `docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md` | **Prompt** — solo lectura; **no lo modifiques ni lo sobrescribas** |
| `docs/ai-sessions/03-planificacion-historias-de-usuario.md` | **Resultado** — aquí escribes el backlog real (créalo o sustitúyelo si ya hubiera un borrador) |
| `prompts.md` | Registro síncrono del prompt literal |

### Cómo debe encajar el resultado con Linear (obligatorio)

Linear **no** tiene un tipo “Task” aparte. La unidad es la **issue**.

| Concepto de producto | En Linear (y en tu documento) | Notas |
|---|---|---|
| Historia de usuario INVEST (≈ 1–2 días equivalentes) | **Issue padre** | Una por historia aceptable |
| Corte de trabajo humano/agente (horas / una sesión) | **Sub-issue** (sigue siendo issue, con padre) | No un test TDD por sub-issue; no un ítem de `tasks.md` de OpenSpec |
| Resultado de entrega / fase (p. ej. Entrega 2, esquema, web) | **Project** + **Milestone** opcionales | Lo documentas como sugerencia; **no** creas Project en Linear aún |
| Iniciativa / árbol profundo | **Prohibido** | No Initiatives; no sub-sub-issues |

Reglas alineadas con la documentación de Linear y el plan del kit:

1. Si una HU no cabe en 1–2 días o falla INVEST en ≥2 criterios → marca `needs-splitting` y **parte en 2–3 issues padre nuevas** que cubran el 100 % del alcance. **No** conviertas un epic en un padre con 15 sub-issues.
2. Padres y sub-issues se enrollarán más adelante a un Project (p. ej. `CODEMIND — Entrega 2`). En el markdown, indica el **milestone sugerido** por historia.
3. Estados futuros del team (no los cambies aquí): Backlog → Todo → In Progress → (opcional In Review) → Done. Todo lo que produzcas nace conceptualmente en **Backlog**.
4. Labels sugeridas: `must` / `should` (prioridad de producto). Área (`backend` / `frontend` / `database` / `dx` / …) y tipo (`feature` / `chore` / …) en cada padre enriquecido.
5. OpenSpec **no** recibe la HU entera: más adelante recibirá **una sub-issue**. Por eso las sub-issues deben ser cortes implementables en una sesión de agente, no la HU completa.

### IDs provisionales

Hasta que exista Linear, usa IDs estables en el documento:

- Padres: `CM-HU-01`, `CM-HU-02`, …
- Sub-issues: `CM-HU-01.1`, `CM-HU-01.2`, …
- Si partes una historia: `CM-HU-02a`, `CM-HU-02b` (y anota qué alcance original cubren).

Cuando se importe a Linear, esos IDs se mapearán a `COD-xx`; no inventes claves `COD-` ahora.

## Lectura obligatoria (en este orden)

Lee **antes** de redactar nada. Trabaja solo a partir de estas fuentes; no inventes producto.

1. `readme.md` **§0** — Ficha del proyecto  
2. `readme.md` **§1** — Descripción general del producto (objetivo, características, UX/wireframes, instalación, no-goals del producto)  
3. `readme.md` **§2** — Arquitectura del sistema (hexagonal, componentes, infra, seguridad, tests/métricas)  
4. `readme.md` **§3** — Modelo de datos (entidades, restricciones, índices)  
5. `readme.md` **§4** — Especificación de la API  
6. `docs/project-context.md` — decisiones cerradas (evidencia local, LLM híbrido/Ollama, comandos, gotchas)  
7. `docs/backend-standards.md` y `docs/frontend-standards.md` — convenciones de capas / UI para el Reality map  
8. Skill `.cursor/skills/enrich-us/SKILL.md` — formato y filtro INVEST (síguela al pie de la letra para cada padre)

### Qué no usar como semilla

- `readme.md` **§5 Historias de usuario** y **§6 Tickets de trabajo**: son el **recorte de ejemplo** de la Entrega 1. **Prohibido** copiarlas, renumerarlas o “ampliarlas”. Puedes mirarlas solo para comprobar que tu backlog **cubre** el producto que ya se prometió en §§0–4; si algo de §§5–6 contradice §§0–4 o las decisiones cerradas, manda §§0–4 + `project-context`.
- `proposal-codemind/01`–`04`: histórico. La enmienda `05` solo si hace falta matizar evidencia/LLM; **no** para ampliar alcance.
- No reabras las decisiones cerradas del 5 sep 2026 (evidencia solo local; LLM híbrido + Ollama; “despliegue” = Compose + CI + `verify`).

## Objetivo

### Fase A — Redacción del backlog (enrich-us)

Partiendo **de cero** desde §§0–4 (y el contexto técnico anterior), elabora el **backlog real del producto completo** (Entrega 2 y Entrega 3: flujo principal operativo + funcionalidades completas, tests, reproducibilidad).

Para cada historia padre:

1. Reality map (Exists / To create / Ticket examples checked) **antes** de Enhanced — el repo está a medio construir: sé honesta; mucho será `to-create`, pero los puntos de inserción del esqueleto (paquetes, puertos, stubs) deben listarse en **Exists** cuando existan.
2. Enhanced al nivel `/enrich-us`:
   - User story (`Como … quiero … para …` en español, coherente con el readme)
   - Acceptance criteria Given/When/Then (3–5: feliz, borde, error; traducibles a test)
   - Technical context (solo paths del Reality map)
   - Non-goals (≥2)
   - Labels and estimate (t-shirt + una frase de racional)
3. Filtro INVEST; si falla → `needs-splitting` + descomposición 2–3 padres.
4. Debajo de cada padre aceptable (o de cada trozo tras split): **sub-issues** = cortes de trabajo de horas/sesión, con título, descripción breve, dependencias y DoD observable. **No** desgloses “escribir el test X / implementar Y / refactor” como tres sub-issues salvo que sean entregables distintos revisables por un humano.

Ordena el backlog con dependencias explícitas (qué bloquea qué). Sugiere milestones de Project para Linear futuro (p. ej. Harness ya hecho / Schema+index / Explain+verify / Impact / Web / Evidencia Entrega 3).

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

Solo tras su recorte explícito:

1. Aplica **únicamente** lo aceptado al §2–§4 del documento de planificación.
2. En cada PH aplicado, anota bajo la objeción: `**Decisión:** aceptada → cambio en CM-HU-…` o `**Decisión:** rechazada — <motivo breve de la autora>`.
3. Actualiza el estado del documento a `borrador post poke-holes · pendiente importación Linear` (sigue sin Linear).
4. Actualiza `**Ajuste humano.**` en `prompts.md` con qué se aceptó/rechazó.

Si Cristina pide aplazar el poke-holes a otra sesión: deja el §5 con las objeciones, no toques el backlog, y cierra diciendo que el gate queda pendiente.

## Fuera de alcance — prohibido en esta sesión

- **No** crear, editar ni cerrar issues en Linear (ni por MCP ni a mano).
- **No** implementar código, migraciones, OpenSpec changes, ni tocar `packages/**` salvo lectura.
- **No** modificar `docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md`.
- **No** reescribir el contenido de `readme.md` §§5–6 (solo la nota previa a §5, ver entregables).
- **No** volcar ítems de un futuro `tasks.md` de OpenSpec como sub-issues.
- **No** usar Initiatives ni anidar más de un nivel (padre → sub-issue).
- **No** inventar endpoints, tablas o pantallas que no estén en §§0–4 / estándares; si el producto implica algo implícito, márcalo como **hipótesis** y pregunta, o exclúyelo en non-goals.
- **No** incorporar al backlog objeciones del poke-holes **sin** OK explícito de la autora.
- **No** push ni PR.

## Entregables concretos

### 1. Nota aclarativa en `readme.md` (único cambio permitido ahí)

Inserta **justo antes** del encabezado `## 5. Historias de Usuario` (sin modificar el texto de §§5–6) este bloque, o uno equivalente si la autora ya dejó una nota similar (no dupliques):

```markdown
> **Nota — backlog de ejemplo vs backlog vivo.**
>
> Las secciones [5. Historias de usuario](#5-historias-de-usuario) y [6. Tickets de trabajo](#6-tickets-de-trabajo) pertenecen al **estado inicial** exigido por la Entrega 1 (documentación con un recorte acotado de historias y tickets). Se conservan en este `readme` como **referencia histórica**; **no** son la cola de trabajo vigente.
>
> El backlog real del producto —historias INVEST y sus cortes de trabajo en jerarquía *issue padre / sub-issues*, preparada para Linear— se elabora y queda registrado en [`docs/ai-sessions/03-planificacion-historias-de-usuario.md`](docs/ai-sessions/03-planificacion-historias-de-usuario.md) en el momento de su creación. El prompt que generó ese registro está en [`docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md`](docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md). Cuando ese backlog exista en Linear, Linear será la fuente viva; el archivo de planificación conserva el snapshot previo a la importación.
```

### 2. Documento de planificación (resultado)

Crea o sobrescribe **solo** `docs/ai-sessions/03-planificacion-historias-de-usuario.md` con el registro del backlog. Estructura obligatoria:

```markdown
# Backlog real — CODEMIND (pre-Linear)

**Estado:** borrador pre poke-holes | post poke-holes (según fase) · **No importado a Linear**
**Fecha de elaboración:** <ISO date>
**Fuentes:** readme.md §§0–4 · docs/project-context.md · standards · enrich-us · poke-holes
**Prompt de origen:** docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md
**Nota:** readme §§5–6 = ejemplo Entrega 1. Este archivo = backlog real.

## 0. Resumen ejecutivo
- Alcance cubierto (mapa breve producto → HUs)
- Decisiones de split (`needs-splitting`)
- Orden sugerido de ataque + dependencias
- Milestones sugeridos para el Project Linear futuro
- Preguntas abiertas para la autora (si las hay)

## 1. Leyenda Linear
(breve: padre = HU INVEST; sub-issue = corte de sesión; IDs provisionales CM-HU-*)

## 2. Historias (issues padre)

### CM-HU-XX — <título>
**Milestone sugerido:** …
**Prioridad:** must|should
**Estado conceptual:** Backlog
**INVEST:** ok | needs-splitting (detalle)

#### Original
(síntesis de la necesidad extraída de §§0–4; no cites §5 como fuente)

#### Reality map
##### Exists
- …
##### To create
- … (to-create)
##### Ticket examples checked
- … (si no hay ejemplos de ticket, escribe “n/a — elaboración desde producto”)

#### Enhanced
1. User story
2. Acceptance criteria (Given/When/Then)
3. Technical context
4. Non-goals
5. Labels and estimate

> These acceptance criteria are a first draft generated by AI. Review them against
> the real system before accepting them: the model does not know the legacy
> integration that breaks on Mondays, nor the business rule that only one person
> remembers.

#### Sub-issues
| ID | Título | Estimación (sesión) | Depende de | DoD en una frase |
|---|---|---|---|---|
| CM-HU-XX.1 | … | … | … | … |

Para cada sub-issue, bajo la tabla o en subapartados:
- Descripción (qué se entrega)
- Fuera de alcance del corte
- Notas para OpenSpec futuro (una línea: “esta sub-issue es candidata a /opsx:propose”)

## 3. Vista tablero (opcional pero útil)
Tabla única: ID padre · título · must/should · milestone · nº sub-issues · bloqueada por

## 4. Trazabilidad §§0–4
Matriz: capacidad / endpoint / entidad / pantalla del readme → CM-HU-* que la cubre.
Nada importante de §§0–4 debe quedar huérfano sin justificación explícita (non-goal o “Entrega N/A”).

## 5. Poke-holes
Lista PH-NN (solo objeciones). Tras el gate: cada ítem con **Decisión:** aceptada/rechazada.
No borrar las objeciones rechazadas: quedan como registro.
```

Idioma del documento: **español** (como el readme), salvo paths, identificadores técnicos y la nota final obligatoria de enrich-us (puedes dejarla en inglés tal cual la skill).

### 3. Registro en `prompts.md`

En la misma sesión, añade una sección numerada nueva (siguiente libre tras las existentes, p. ej. `# 11. Planificación backlog real`) con `### Prompt 1 — …`, el prompt **literal** en bloque de código, y `**Ajuste humano.**`:

- Tras Fase A: `pendiente poke-holes y recorte humano`.
- Tras Fase C: qué PH se aceptaron/rechazaron (resumen).

Norma de `docs/project-context.md` § prompts.md.

## Forma de trabajo

1. **Fase A — Redacción.** Lee las fuentes. Si falta una decisión de producto que bloquee el split, **pregunta** y no inventes. Esboza la lista corta de padres si el volumen es grande. Aplica enrich-us historia a historia. Escribe nota en `readme`, el borrador en `03-planificacion-historias-de-usuario.md` (estado `borrador pre poke-holes`) y la entrada en `prompts.md`. **No toques** el archivo del prompt.
2. **Fase B — Poke-holes.** Sin reescribir el backlog: añade `## 5. Poke-holes` y pega el mismo listado en el chat. Para aquí.
3. **Fase C — Solo tras OK de Cristina.** Incorpora lo aceptado; anota decisiones en §5; actualiza estado y `**Ajuste humano.**`
4. No crees commits salvo que la autora lo pida explícitamente.

## Criterios de aceptación

- Cobertura del producto completo derivada de §§0–4, no clon de §§5–6.
- Cada padre tiene Reality map + Enhanced + INVEST; splits documentados.
- Jerarquía exacta padre → sub-issues; sin Initiatives ni tercer nivel.
- Sub-issues = cortes de sesión, no checklist TDD/OpenSpec.
- Existe pasada poke-holes (§5 con PH-*); ningún cambio post-objeción sin gate humano.
- `readme.md` tiene la nota antes de §5; §§5–6 intactas.
- Existe `docs/ai-sessions/03-planificacion-historias-de-usuario.md` con el backlog.
- `docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md` intacto.
- Cero escrituras a Linear; cero código de producto.
- Decisiones evidencia/LLM del 5 sep 2026 respetadas.
- `prompts.md` actualizado con el literal y el ajuste humano al cerrar Fase C (o nota de gate pendiente).

## Al cerrar

Tras Fase B: resume nº de padres, sub-issues, splits y nº de PH; **para y pide el recorte** (aceptar/rechazar por PH). No importes a Linear.

Tras Fase C (o si el gate se aplaza): recuerda que Linear sigue bloqueado hasta que ella dé el OK al documento. Por defecto: no commit, no push, no MCP Linear.
````

**Por qué funcionó.** La lectura obligatoria en orden (§§0–4 → project-context → standards → skill) y la prohibición explícita de usar §§5–6 como semilla obligaron a derivar el backlog del producto y no del recorte de la Entrega 1; el Reality map por historia dejó a la vista que casi todo es `to-create` y dónde están los puntos de inserción del esqueleto; separar la pasada poke-holes de la redacción evitó que el agente se corrigiera a sí mismo y suavizara las objeciones.

**Ajuste humano.** Gate humano (Fase C) aplicado el 27 de septiembre de 2026 sobre las 28 objeciones del poke-holes y las 6 preguntas abiertas. La autora decidió antes de que el agente tocara el backlog; el agente aplicó **solo** lo decidido y anotó cada `**Decisión:**` en §5 del documento de planificación.

| Resultado | PH | Efecto principal en el backlog |
|---|---|---|
| **Rechazadas** (2) | PH-01, PH-09 | Sin cuarto endpoint `GET /api/projects` (la Pantalla 1 lee una constante de proyectos de muestra generada desde la semilla). Sin `AuditPort`: se mantienen los cuatro puertos de §2.1 y la auditoría es log estructurado del transporte/CLI |
| **Aceptadas parciales** (2) | PH-02, PH-20 | Entrega 2 con `1 project loaded` (`task-api` sigue en E3, desfase explícito en el backlog y en la nota del DEMO, sin reescribir el readme). `POST /index` = must; indexado incremental (05b.1) = should |
| **Aceptadas** (24) | PH-03…08, 10…19, 21…28 | Ranking must = léxico + grafo (embeddings → should/F7); similitud de caché solo con LLM configurado; paso 5 de la demo con la misma pregunta; `stale` con aviso en E2 y recálculo perezoso como 09.4 (E3); invalidación de `cache_entry` al reindexar; sin código `LLM_REQUIRED` (→ `200` + `UNKNOWN` + `reason`); una sola pasada Context Engine → modelo; sal `AUTHOR_HASH_SALT` fuera de git y hashes precalculados en semilla; huella de semilla/golden comprobada por `verify`; sanitización mínima como 09.5; presupuesto diario = suma de `query_log.cost_usd`; regla de riesgo HIGH/LOW/MEDIUM fijada; `baselineTokens` declarado como estimación; trabajo humano separado (13.3, 18.4, 22.3, 22.4); 17.2 fusionada en 17.1; non-goal «no ejecutar nada del repo analizado»; mutación como gate duro y cobertura informativa; excepción «fixtures = entrada del analizador»; job `verify` separado en CI; detección de `framework` por manifiesto + `--framework`; `gitleaks` en CI como 05a.4; preguntas sugeridas como constante en la web; desglose de tokens de verificación; spike 04a.4 del contrato `AnalyzerPort` con TS |

Preguntas §0: (1) endpoint de listado **rechazado**; (2) botón «indexar mi repo» **non-goal**; (3) Tree-sitter **sin PHP en el PATH**; (4) reglas propias en proceso + `gitleaks` en CI; (5) estado del job **non-goal**; (6) `404` **aceptado** como extensión mínima del contrato.

Totales tras el gate: 26 issues padre · 65 sub-issues (58 − 1 fusionada + 8 nuevas). Estado del documento: `borrador post poke-holes · pendiente importación Linear`. Cuatro puntos del readme quedan para una pasada `/update-docs` posterior (§1.4 PHP/`1 project loaded`, §2.1 una pasada, §2.4 similitud, §2.6 cobertura). Sin Linear, sin código, sin commit.

### Prompt 2 — Importación del backlog real a Linear

Prompt literal ejecutado en Claude Code con el MCP de Linear autenticado (OAuth vía `/mcp`), rama `feature/backlog-planning`. Se conserva íntegro en `docs/ai-sessions/03-prompt-importar-backlog-linear.md`; el mapa resultante está en `docs/ai-sessions/03-planificacion-historias-de-usuario.md` §6:

````
## Contexto

Trabajas en CODEMIND (fork DisTinta/AI4Devs-finalproject), rama `feature/entrega-2-CRN`.

Fuente única del backlog (ya revisado por la autora, gate poke-holes aplicado):

`docs/ai-sessions/03-planificacion-historias-de-usuario.md`

Estado del documento: `borrador post poke-holes · pendiente importación Linear`.

También lee (solo para convenciones, no para inventar alcance):

- `docs/project-context.md` (tras importar, actualizar la línea de Linear / ticket id)
- Leyenda Linear del propio §1 del archivo de planificación

MCP: usa el servidor **Linear** (lectura+escritura). Si no está autenticado, para y pide a la autora completar OAuth (`/mcp` o Connect). No uses API keys en ficheros del repo.

## Objetivo

Materializar en Linear la jerarquía del backlog:

| Markdown | Linear |
|---|---|
| Milestone M1–M9 / Entrega 2–3 | Project(s) + Milestone(s) |
| CM-HU-XX (issue padre) | Issue padre en **Backlog**, enrollada al Project |
| CM-HU-XX.k (sub-issue) | Sub-issue del padre (también issue) |
| must / should + área + tipo | Labels |
| IDs CM-HU-* | Comentario o descripción con id provisional; Linear asigna `COD-n` |

## Cómo encaja Linear (obligatorio — no improvisar)

1. Unidad = **issue**. No hay tipo Task aparte. Sub-issue = issue con padre.
2. **Sin Initiatives.** Sin tercer nivel (no sub-sub-issues).
3. Padres y sub-issues **enrollados a Project** (no usar parent/sub como sustituto del roadmap).
4. Estado inicial de todo: **Backlog** (no Todo todavía).
5. OpenSpec más adelante recibe **una sub-issue** (`COD-xx`), no la HU entera.
6. Si el team aún no existe: créalo o usa el existente. Identifier preferido: **`COD`** (cumple `[A-Z][A-Z0-9]+-[0-9]+`). Si el team ya tiene otra key, úsala y documenta.
7. Activar / respetar workflow default; opcional In Review; parent auto-close si el team lo permite (no bloquees la importación si no puedes cambiar settings).

## Plan de creación (orden)

### Paso 0 — Inventario (solo lectura)

1. `list_teams` / equivalente: anota team id y key.
2. `list_projects`: ¿existe ya algo CODEMIND?
3. `list_issues` filtrado por project/team: ¿hay HU de ejemplo de Entrega 1? **No las borres** sin preguntar; no las uses como fuente. El backlog real es el markdown.
4. Labels existentes: must, should, backend, frontend, database, cli, security, dx, docs, feature, chore, test.

### Paso 1 — Mostrar plan y ESPERAR OK

Antes de crear **nada**, muestra a la autora:

- Team que usarás (nombre + key)
- Project(s) a crear o reutilizar:
  - Preferido: `CODEMIND — Entrega 2` y `CODEMIND — Entrega 3` **o** un solo project `CODEMIND` con milestones M1–M9 etiquetados por entrega (elige una opción y justifícala en una línea; por defecto: **dos projects** alineados al §0 del markdown)
- Lista de milestones (M1–M9; M0 = hecho, no crear trabajo bajo M0 salvo que quieras un milestone cerrado vacío — mejor omitir M0)
- Nº de issues padre y sub-issues a crear (debe coincidir con totales del markdown tras el gate: ~26 padres · ~65 sub-issues; verifica contando el archivo)
- Convención de título: `[CM-HU-01] Esquema PostgreSQL…` / sub: `[CM-HU-01.1] Runner de migraciones…`
- Qué va en la descripción del padre: bloque Enhanced (user story, AC, non-goals, labels/estimate) + enlace/path al markdown + id provisional. Reality map puede ir resumido o en comentario para no hinchar.
- Qué va en la sub-issue: descripción + DoD + depende de + nota «candidata a /opsx:propose»
- Relaciones: si Linear permite blocking/related, usa las dependencias del tablero §3; si no, documéntalas en la descripción

**Para aquí hasta que Cristina diga explícitamente «OK, crea».**

### Paso 2 — Crear (solo tras OK)

1. Labels que falten.
2. Project(s) + milestones.
3. Issues padre en Backlog, una por CM-HU-* del §2, con project + milestone sugerido + labels must/should + área/tipo.
4. Sub-issues bajo cada padre (tabla Sub-issues + viñetas de descripción del markdown).
5. No dupliques: si un padre ya existe con el mismo `[CM-HU-XX]` en el título, actualiza en lugar de crear otro.

### Paso 3 — Mapa y cierre documental

1. Escribe/actualiza en `docs/ai-sessions/03-planificacion-historias-de-usuario.md`:
   - Estado: `importado a Linear · fuente viva = Linear`
   - Nueva sección (p. ej. `## 6. Mapa Linear`) tabla: `CM-HU-*` → `COD-n` → URL si la tienes → parent/sub
2. Actualiza `docs/project-context.md` § Branch and ticket conventions: Linear configurado, team key, que el id de ticket es `COD-n`, OpenSpec se alimenta de la **sub-issue**.
3. `prompts.md`: sección nueva o bajo §11 con Prompt de importación **literal** + `**Ajuste humano.**`
4. Opcional breve: comentar en el Project la ruta del markdown de origen.

## Contenido a NO crear

- No importes §§5–6 del `readme` (ejemplo Entrega 1).
- No crees Initiatives.
- No vuelques cada AC Given/When/Then como sub-issue separada.
- No crees issues por ítems de un futuro `tasks.md` OpenSpec.
- No implementes código.
- No hagas push.

## Forma de trabajo

1. Autentica / verifica Linear MCP (listar teams).
2. Lee el markdown completo (al menos §0, §1, §2 tablas de sub-issues, §3 vista tablero).
3. Plan en el chat → espera «OK, crea».
4. Crea en lotes (p. ej. por milestone) e informa progreso.
5. Entrega el mapa CM-HU → COD y actualiza docs.

## Criterios de aceptación

- Plan mostrado y aprobado antes de crear.
- 26 padres (± si el markdown cambió; manda el archivo) + sus sub-issues en Linear, Backlog, con padre correcto.
- Projects/milestones alineados al §0.
- Labels must/should presentes.
- Mapa en el markdown + project-context actualizado.
- Cero Issues inventadas fuera del markdown.
- `prompts.md` con literal.

## Al cerrar

Resume: team key, projects, nº issues creadas, primeras COD de ejemplo, y recuerda que OpenSpec arranca desde **una sub-issue** en Todo, no desde la HU padre.
````

**Por qué funcionó.** El inventario de solo lectura y la parada obligatoria «OK, crea» sacaron a la luz, antes de escribir nada, que el team ya existía y estaba vacío. La key real no se conoció hasta crear el primer objeto. El backlog se parseó del markdown a JSON con un script, en vez de transcribirlo a mano: así los totales (26 padres · 65 sub-issues) se comprobaron contra §3 antes de crear y las descripciones llegaron a Linear literales.

**Ajuste humano.** La autora aprobó el plan tal como se presentó («OK, crea»), sin cambiar la key del team. Por eso el identificador real es **`DIS`** y no el `COD` preferido por el prompt; queda documentado en `project-context.md` y en §6 del backlog. Decisiones que el agente tomó dentro del plan aprobado:
- Dos projects (Entrega 2 / Entrega 3) con M2 y M5 duplicados en ambos, porque 05b y 17 son de Entrega 3.
- CM-HU-09.4 va a Entrega 3 · M6, aunque su padre sea de Entrega 2.
- La estimación L/M va en la descripción, no en el campo `estimate`, porque la escala del team era desconocida.
- No se usó el campo `priority` de Linear: must/should van solo como labels.
- Se reutilizó la label existente `Feature`.
- El ciclo 22.2 ↔ 22.4 del markdown quedó como `22.4 blocked by 22.2` (Linear admite una sola relación por par; la *related* inversa no se guardó). Total: 163 relaciones *blocked by*.
- La creación se repartió en 4 subagentes en paralelo, por eso los números `DIS-n` quedaron intercalados y no consecutivos.
- Linear normaliza el Markdown al guardar (viñetas `-` → `*`, escapado de `_`/`~`, negrita alrededor de código); el contenido no cambia.
