# 13. Tablas de historial, afirmaciones, uso y caché (DIS-12)

> Sección 13 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Propuesta OpenSpec desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`, con el MCP de Linear para leer la
sub-issue y el aviso que DIS-11 dejó en ella: `/opsx:propose DIS-12`.

**Por qué funcionó.** El agente leyó DIS-12 y su comentario (probar que `db:rollback` revierte solo
la última migración), `readme.md` §3 y el change archivado de DIS-11 antes de escribir, y vio que los
tests de ciclo de vida de DIS-11 se rompen en cuanto existe `0002`. Paró en las tres decisiones que
§3.1 no fija.

**Ajuste humano.** La autora eligió las tres opciones recomendadas: `on delete cascade` en todas las
FK nuevas (frente al readme literal o un esquema mixto), solo el `CHECK` de span en `evidence` (sin
no-negativos) y ninguna clave única en `cache_entry` (la decide CM-HU-13).

### Prompt 2 — Corrección del change antes del apply

Texto literal enviado tras revisar los artefactos:

````
Lee y edita únicamente bajo `openspec/changes/schema-history-claims/`:
- proposal.md
- design.md
- specs/graph-schema/spec.md
- tasks.md
## Correcciones obligatorias
### C1 — Cobertura FK file_commit.file_id (blocking)
En `specs/graph-schema/spec.md`, requisito "File-commit table", añade un escenario entre
"File-commit pointing to a missing commit is rejected" y "Deleting a file deletes its file-commit rows":
#### Scenario: File-commit pointing to a missing file is rejected
- **WHEN** a `file_commit` row is inserted whose `file_id` does not exist in `file`
- **THEN** the database rejects the insert
En `tasks.md` paso 1.2, añade ese escenario a la lista RED.
Actualiza el conteo de escenarios del paso 6.2 (deja de ser 32; suma los nuevos).
### C2 — Nombre engañoso del escenario de rollback doble
En el delta MODIFIED de "Roll back the latest migration", renombra
"Roll back the L1 graph migration" a algo que refleje dos rollbacks, p. ej.
"Roll back both migrations leaves an empty schema".
Ajusta `tasks.md` / `design.md` D4 si citan el título antiguo.
### C3 — Nombre engañoso vs enum UNKNOWN
Renombra "Unknown claim type is rejected" → "Invalid claim type is rejected"
(o "Claim type outside the enum is rejected"). El WHEN con `type = 'GUESS'` se mantiene.
Actualiza `tasks.md` 2.1.
### C4 — Riesgo `'null'::jsonb` en non-goals
En `proposal.md` → Non-goals, añade una viñeta explícita:
`l2_requires_provenance` rejects SQL NULL only; a JSON null (`'null'::jsonb`) or any JSON
shape is accepted here; CM-HU-09 validates provenance with Zod before insert.
Mantén el riesgo en `design.md` Risks (ya está); no lo borres.
### C5 — Corregir la regla de nullabilidad de `*_at` (auditoría)
Tu supuesto “§3.1 da default → NOT NULL” es correcto para `status`, `cache_hit`, `hit_count`.
NO lo es para `claim.created_at` / `updated_at`, `query_log.created_at`, `cache_entry.created_at`:
§3.1 no las marca not null ni con default. El contrato NOT NULL DEFAULT now() es decisión de
autora por precedente L1 (`project.created_at` en DIS-11).
Haz esto:
1. En `specs/graph-schema/spec.md`, sustituye la frase
   "A column is nullable unless §3.1 marks it `not null` or gives it a default"
   por una regla en dos partes:
   - §3.1 `not null` / default explícito → NOT NULL (y el default si lo hay);
   - columnas de auditoría `*_at` sin marca en §3.1 → NOT NULL DEFAULT now(),
     same convention as L1 `project.created_at` (author decision).
2. En `proposal.md` → What Changes / Decisions taken by the author, deja esa decisión de `*_at`
   explícita (junto a cascades / evidence span / no unique en cache_entry).
3. Mantén el non-goal de que `claim.updated_at` no se autoactualiza (sin trigger); writers set it.
## Fuera de alcance de este afinado (NO hagas)
- No añadas escenario de confidence < 0 solo por simetría: L1 solo probó weight = 1.5.
- No cambies el SQL literal de `fact_only_from_l1` / `l2_requires_provenance` del readme.
- No implementes migraciones ni toques código fuera del change.
- No edites `openspec/specs/graph-schema/spec.md` (main); solo el delta del change.
## Al terminar
1. Resume en 5–8 viñetas qué cambiaste y en qué archivo.
2. Confirma que el DoD de DIS-12 sigue cubierto (FACT+L2 y L2 sin provenance, con nombre de constraint).
3. Lista residual risks aceptados (JSON null, cascades evidence.file_id, sin unique cache_entry).
4. No marques tasks como hechas; esto es solo planning.
````

**Ajuste humano.** El prompt entero es el ajuste: una FK sin escenario (`file_commit.file_id`), dos
títulos engañosos y un supuesto de nulabilidad que el agente había atribuido a §3.1 cuando era una
decisión de la autora. C2 no pudo aplicarse tal cual: `openspec validate` rechaza que un bloque
MODIFIED renombre o elimine un escenario ya archivado. La autora eligió conservar
"Roll back the L1 graph migration" con su texto de DIS-11 y añadir el escenario nuevo (34 en total).

### Prompt 3 — Carrera entre los dos ficheros que migran la BD compartida

Respuesta literal de la autora cuando el agente paró el apply en la tarea 5.5 (un `beforeAll` fallaba
en cada ejecución paralela con `Another migration is already running. Advisory lock mode is set to
'fail'.`) y propuso cuatro opciones: `1`.

**Ajuste humano.** La autora eligió un helper de reintento solo en los tests
(`migrateSharedDatabase()` en `support.ts`) frente a cambiar `db:migrate` a `advisoryLockMode:
'wait'`, a un `globalSetup` de Vitest o a fusionar los ficheros. El diseño (D4) daba por hecho que el
lock de node-pg-migrate espera; en la versión 9 falla por defecto. Se corrigió D4 antes del código, y
la nota «untested» de `project-context.md` pasó a describir el comportamiento verificado.
