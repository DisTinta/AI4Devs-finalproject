# Prompt — Planificación de historias de usuario y tickets (backlog real)

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama:** `feature/entrega-2-CRN`
**Fecha:** 27 de septiembre de 2026
**Contenido:** (1) la petición, (2) el prompt listo para pegar en una sesión nueva.

> **Trazabilidad.** Este archivo es solo el **prompt** (se conserva). El resultado de la sesión se escribe en [`03-planificacion-historias-de-usuario.md`](03-planificacion-historias-de-usuario.md). El literal también se registra en `prompts.md`.
>
> **Flujo en dos pasadas + gate humano:** (A) redactar backlog con enrich-us → (B) poke-holes (solo objeciones, sin reescribir) → Cristina recorta → (C) aplicar solo lo aceptado al documento.

---

# 1. Petición

> Necesito un prompt para crear las historias de usuario reales y los tickets de
> trabajo del producto completo, sin el tope de la Entrega 1.
>
> Fuentes: `readme.md` §§0–4 (ficha, producto, arquitectura, modelo de datos, API).
> §§5–6 del readme son ejemplo histórico: no semilla. Jerarquía = Linear
> (issue padre INVEST + sub-issues). Nivel = `/enrich-us`. Después, pasada
> **poke-holes** (solo objeciones, sin reescribir) y gate humano antes de
> incorporar. Entregable = markdown en
> `docs/ai-sessions/03-planificacion-historias-de-usuario.md` para revisión
> **antes** de tocar Linear. Añadir nota aclarativa en el readme justo antes de §5;
> no reescribir §§5–6.

---

# 2. Prompt (pegar íntegro)

> Pegar como primer mensaje de una sesión nueva abierta en la raíz del repositorio,
> con la rama `feature/entrega-2-CRN` activa.
> Todo lo que sigue es el prompt.

---

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
