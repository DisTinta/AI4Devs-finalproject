# Prompt — Importar backlog real a Linear

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama:** `feature/entrega-2-CRN`
**Fecha:** 27 de septiembre de 2026
**Contenido:** (1) la petición, (2) el prompt listo para pegar en Claude Code (con MCP Linear autenticado).

> **Prerrequisito.** Linear MCP en `.mcp.json` / `.cursor/mcp.json`, OAuth hecho (`/mcp` en Claude Code o Connect en Cursor). Team `CODEMIND` con identifier `COD` (o el que exista; no inventar). Workspace de la autora.

---

# 1. Petición

> Conecta / usa Linear MCP y lleva el backlog de
> `docs/ai-sessions/03-planificacion-historias-de-usuario.md` (post poke-holes)
> a Linear: projects, milestones, issues padre + sub-issues, labels, Backlog.
> Muestra el plan antes de crear. Actualiza el markdown con el mapa CM-HU-* → COD-*.

---

# 2. Prompt (pegar íntegro)

```
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
```

---

# 3. Intervención humana (checklist)

1. Reiniciar / recargar MCP tras editar `.mcp.json` (Claude Code: nueva sesión o `/mcp`).
2. Aceptar OAuth de Linear en el navegador cuando lo pida.
3. Confirmar el **plan** que muestre la IA antes de «OK, crea».
4. Revisar en Linear un sample (p. ej. CM-HU-01 + 01.1) tras la importación.
