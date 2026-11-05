# 12. Esquema del grafo L1 (DIS-11)

> Sección 12 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Propuesta OpenSpec desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`, con el MCP de Linear para leer la sub-issue: `/opsx:propose DIS-11`.

**Por qué funcionó.** OpenSpec arrancó desde la sub-issue (no desde la HU padre), y el agente leyó
DIS-11, `readme.md` §3 y el reality map de CM-HU-01 antes de escribir. Paró en las dos decisiones que
cambiaban contrato o dependencias en vez de improvisarlas.

**Ajuste humano.** La autora eligió las dos opciones que le propuso el agente: **node-pg-migrate**
con migraciones SQL (frente a un runner propio o postgrator) y **dos FK anulables por extremo +
`CHECK num_nonnulls(...) = 1`** para `edge` (frente a una columna polimórfica sin FK o un símbolo
sintético por fichero). La segunda se aparta de `readme.md` §3.1 y deja pendiente redefinir los
índices de DIS-13. Ambas quedan en `docs/adr/20260928-*.md`.

### Prompt 2 — Corrección de huecos de contrato del change

Prompt literal pegado tras revisar el change contra DIS-11 / CM-HU-01.1:

````
# Corregir change OpenSpec `schema-graph-l1` (DIS-11) — solo planificación

## Contexto

El change `openspec/changes/schema-graph-l1/` ya existe, tiene los 4 artefactos y
`openspec validate schema-graph-l1 --type change --strict` pasa. Una revisión
contra DIS-11 / CM-HU-01.1 encontró huecos de contrato. **Corrige solo los
artefactos de planificación.** No implementes código, no crees rama, no toques
migraciones reales ni CI.

Repo: raíz del monorepo Codemind (carpeta `openspec/changes/schema-graph-l1/`).
Fuentes de verdad: `readme.md` §3.1/§3.2, `docs/ai-sessions/03-planificacion-historias-de-usuario.md`
(CM-HU-01.1 / DIS-11), `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md`.

Al terminar: vuelve a validar con `openspec validate schema-graph-l1 --type change --strict`
y resume qué cambiaste en cada artefacto.

---

## Objetivo

Cerrar los huecos de contrato sin ampliar el alcance de DIS-11. Mantener:

- Herramienta: **node-pg-migrate**, migraciones en **SQL** (no DSL JS).
- Edge: dos FK anulables por extremo + `CHECK (num_nonnulls(...) = 1)`.
- Fuera de alcance: tablas de DIS-12, índices/trigger de DIS-13, arnés de DIS-22.
- Pregunta abierta del layout `.sql` (marcadores vs `.up.sql`/`.down.sql`):
  sigue resolviéndose en la tarea 1.1; no inventes una decisión ahora.

---

## Cambios obligatorios

### A) `specs/graph-schema/spec.md` — el esquema L1 debe ser verificable

1. **Columnas de §3.1 / D4 como contrato, no solo diseño.**
   Amplía los requisitos de `project`, `file` y `symbol` (y `edge` si hace falta)
   para exigir explícitamente las columnas y defaults de `design.md` D4 que
   vienen de `readme.md` §3.1:
   - `project`: `is_sample boolean NOT NULL DEFAULT false`,
     `node_count`/`edge_count integer NOT NULL DEFAULT 0`,
     `indexed_commit text NULL`, `indexed_at timestamptz NULL`,
     `created_at timestamptz NOT NULL DEFAULT now()`.
   - `file`: `loc integer NULL`, `content_hash text NULL`,
     `redacted boolean NOT NULL DEFAULT false`, `embedding vector(1536) NULL`
     (además de lo ya especificado).
   - `symbol`: `signature text NULL`, `embedding vector(1536) NULL`
     (además del span y kinds ya especificados).
   Añade **al menos un escenario** (o amplía «Migrate an empty database» /
   el ciclo apply→rollback→apply) que falle si falta alguna de esas columnas
   o sus nullability/defaults. El snapshot de identidad del esquema no basta
   solo consigo mismo: debe anclarse a esta lista.

2. **`extractor` no vacío.**
   El requisito de `edge` debe decir que `extractor` es obligatorio **y** no
   puede ser cadena vacía. Añade escenario:
   - WHEN se inserta un `edge` con `extractor = ''`
   - THEN la BD rechaza el insert.

3. **Cascada de `edge.project_id`.**
   Declara en el requisito de `edge` que `project_id` es `NOT NULL` con
   `ON DELETE CASCADE`. Añade escenario de borrado de proyecto que elimina
   sus aristas (aunque los extremos aún existan, o documenta el caso que
   elijas de forma inequívoca).

4. **Cierra requisitos sin escenario.**
   - O bien añade un escenario para «migración que falla a medias no deja
     cambios parciales», o bien elimina esa frase del requisito y deja solo
     la cobertura documental del paso 6.3 (preferible: **mantener el requisito
     y el paso 6.3**, pero **añadir un escenario** o referenciarlo como
     «garantizado por `singleTransaction`» en design + nota en el requisito
     sin fingir un WHEN/THEN de test si no habrá test). Sé coherente:
     si el requisito usa MUST/SHALL de comportamiento observable, necesita
     escenario o debe rebajarse a nota de diseño.
   - Escenario (o ampliación) de fallo sin `DATABASE_URL` también para
     `npm run db:rollback`, no solo `db:migrate`.
   - Escenario «Deleting a file deletes its edges» (hoy el requisito lo dice
     y solo hay escenario para borrar un `symbol`).

5. **No-requisito explícito: extremos de otro proyecto.**
   En el requisito de `edge` (o una nota «Out of scope / accepted risk» del
   capability), declara que la BD **NO** exige que `source_*` / `target_*`
   pertenezcan al mismo `project_id` que la arista. Eso es riesgo aceptado
   de L1; la consistencia la poseen los writers. No inventes un CHECK cruzado.

6. **`weight` 0..1.**
   Mantén el `CHECK (weight BETWEEN 0 AND 1)` cuando `weight` no es NULL.
   Confirma en el requisito que 0 y 1 son válidos. El escenario con `1.5`
   se queda.

Tras editar, actualiza el recuento mental: cada `#### Scenario:` debe mapear
a una tarea en `tasks.md` (pasos 2–6 y 7.2).

### B) `design.md` — alinear con la spec corregida

1. Si mueves columnas/`extractor`/cascada a la spec, deja D4 como detalle de
   implementación (nombres de constraints, orden DROP, etc.), no como único
   sitio donde viven.
2. En **Risks**, mantén el riesgo de extremos cross-project y añade una línea
   de acción: **DIS-13** debe adaptar índices
   `EDGE(project_id, source_id, kind)` / `target_id` a las cuatro columnas
   nuevas; este change no implementa esos índices.
3. En **D5**, documenta cómo evitar flaky tests entre
   `migrations.spec.ts` y `graph-schema-constraints.spec.ts` cuando Vitest
   corre en paralelo sobre la misma `DATABASE_URL`:
   - valores únicos por test (nombres/paths/ids), **o**
   - esquema/DB dedicado por fichero,
   - y que cada test de restricciones siga en `BEGIN`/`ROLLBACK`.
   No construyas el arnés de DIS-22; solo la mitigación mínima.
4. Aclara `GUARD_DANGEROUS_CMD`: el hook mira el **texto del comando de shell**,
   no el SQL dentro de ficheros ni las queries del cliente `pg`. Un `DROP` en
   la migración o vía `pg` no lo dispara; un `psql -c "DROP DATABASE …"` sí.
   Si el hook bloquea un paso legítimo, el agente para y avisa (sin workarounds).

### C) `tasks.md` — mapear escenarios nuevos y mitigaciones

1. Actualiza pasos 2–6 (TDD) para incluir los escenarios nuevos/ampliados:
   columnas L1 ancladas, `extractor = ''`, cascade de `edge` al borrar
   `project`, delete file → edges, `DATABASE_URL` missing en rollback, y lo
   que hayas decidido sobre partial failure.
2. En el paso de constraints / lifecycle, añade subtarea explícita de
   **unicidad de datos de prueba** (o equivalente) para evitar colisiones
   entre ficheros de test en paralelo.
3. En documentación (paso 11), añade subtarea: dejar **comentario en Linear
   DIS-13** (o nota en el PR) recordando que los índices de travesía deben
   redefinirse sobre `source_symbol_id`/`source_file_id`/
   `target_symbol_id`/`target_file_id`, no sobre `source_id`/`target_id`.
4. Mantén todos los pasos obligatorios del kit (0, 7–11), rutas de informes
   y TDD. No renumeres a lo loco: inserta subtareas donde encajen.
5. Checklist mental de `docs/openspec-tasks-mandatory-steps.md` §4: cada
   escenario del delta tiene al menos una tarea.

### D) `proposal.md` — solo si hace falta

- Si el apartado de impacto/non-goals no menciona ya la desviación de edge
  ni el riesgo cross-project, añade una frase. No reescribas el why.
- Sigue diciendo que privacy no se toca y que DIS-12/13/22 quedan fuera.

---

## No hacer

- No implementar `migrate.ts`, migraciones SQL, ni cambiar `package.json`.
- No editar `openspec/specs/` main (solo el delta del change).
- No “arreglar” DIS-12/13 aquí.
- No decidir el layout final Up/Down de node-pg-migrate (sigue en 1.1).
- No debilitar el alcance: cuatro tablas L1 + runner + test de ciclo.

---

## Criterio de hecho de esta corrección

- [ ] `openspec validate schema-graph-l1 --type change --strict` → valid
- [ ] Spec exige columnas L1 de §3.1/D4 con escenario o aserción anclada
- [ ] Spec exige `extractor <> ''` con escenario
- [ ] Spec exige cascade `edge.project_id` y delete-file→edges; rollback sin `DATABASE_URL`
- [ ] Spec declara explícitamente el no-requisito cross-project
- [ ] `tasks.md` mapea todos los `#### Scenario:` y mitiga flaky paralelo
- [ ] `design.md` D5 + Risks alineados; nota DIS-13 en tasks/docs
- [ ] Resumen final en español: archivos tocados + escenarios añadidos/cambiados
````

**Por qué funcionó.** La revisión humana convirtió el diseño (D4) en contrato: sin la tabla de
columnas en la spec, el test de identidad apply→rollback→apply habría pasado con dos esquemas
igualmente incompletos. Delimitar «solo planificación» y lo que no debía decidirse (layout SQL)
evitó que el agente adelantara implementación.

**Ajuste humano.** El prompt entero es el ajuste: de 20 a 27 escenarios, el requisito de «fallo a
medias» rebajado a nota sin un WHEN/THEN fingido, el no-requisito cross-project explícito y la
mitigación mínima del paralelismo de Vitest. En el apply se comprobó que el ancla funciona: romper el
default de `file.redacted` hace fallar el test del contrato.

### Prompt 3 — Hook de análisis estático que bloqueaba los tests

Respuesta literal de la autora cuando el agente paró el apply porque el post-edit
(`CMD_STATIC_FILE="npx tsc --noEmit"` sobre un fichero suelto) fallaba en todo test que importa
`vitest`:

````
Opción 2: vaciar CMD_STATIC_FILE en .claude/sdd-harness.env
(CMD_STATIC_FILE="").

No uses la opción 1: los flags propuestos no espejan tsconfig.base.json
(Node16, no nodenext) y duplicar la config en CLI es frágil.

Documenta el gotcha en docs/project-context.md: el post-edit no tipa
fichero a fichero; el gate es npm run typecheck. Commit aparte
chore (no mezclar con el commit de schema/migraciones de DIS-11).

Sigue con el apply. Un arreglo fino del hook/tsconfig de tests queda
fuera de este change (chore posterior).
````

**Ajuste humano.** La autora **rechazó** la opción que recomendaba el agente: sus flags usaban
`nodenext` y no reproducían `tsconfig.base.json` (Node16), y duplicar la configuración en la línea
de comandos es frágil. El único gate de tipos queda en el typecheck real (`npm run typecheck`,
también en CI), en un commit `chore(DIS-11)` aparte.
