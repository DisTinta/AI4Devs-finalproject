# feat(DIS-38): afirmaciones tipadas y cuarentena de la salida del modelo

## ¿Qué cambia?

Primera pieza de CM-HU-09 (CM-HU-09.1), solo funciones puras de core sin puertos ni I/O:
- **Registros `claim`/`evidence`.** Esquemas Zod que replican los `CHECK` de `0002_history-claims`: un `FACT` de capa `L2` ni compila ni pasa la validación, `L2` exige `provenance`, `confidence` está en [0, 1] y `provenanceSchema` fija la forma de la procedencia.
- **Regla hecho/inferencia.** `typeStatement` decide a partir del `origin` de cada span citado.
- **Cuarentena de la salida del modelo.** `parseModelOutput` comprueba tamaño, JSON, un esquema estricto con límites exportados, ids repetidos e ids desconocidos. Si algo falla, descarta la salida entera con un evento `schema_violation` que no lleva nada de su contenido.

`zod` pasa a ser dependencia de `@codemind/core`, con la misma versión que ya usa `adapters/llm`.

## ¿Por qué?

Ticket: [DIS-38](https://linear.app/distinta-ai4devs/issue/DIS-38/cm-hu-091-tipos-claimevidence-reglas-hechoinferencia-y-esquema-zod-de)
(padre DIS-29, CM-HU-09). Decisiones del refinamiento aceptadas por la autora (2026-10-11), transcritas del ticket:

1. **DIS-38 no decide cómo se persiste un statement `FACT`.** Los tipos de dominio replican los `CHECK` de `0002_history-claims` (`fact_only_from_l1`, `l2_requires_provenance`, `claim_confidence_range`): `Claim{ type: 'FACT', layer: 'L2' }` y `Claim{ layer: 'L2' }` sin `provenance` no son representables, y `confidence` fuera de [0, 1] no se puede construir. El tipo del statement (`FACT`/`INFERENCE`/`UNKNOWN`) que devuelve `typing-rules` es **independiente de** `layer`. Sin ADR en este cambio. La pregunta de la persistencia pasa a DIS-39.
2. **El modelo no decide el tipo.** El esquema no tiene campo `type` y es estricto (`z.strictObject()` en todos los niveles; en Zod 4 `z.object()` descarta las claves desconocidas sin avisar): si llega `type` o cualquier otra clave extra, se rechaza **toda** la salida, se descarta y se audita como `schema_violation`.
3. **Límites provisionales**, como constantes exportadas en `packages/core/src/explain/limits.ts`:
   - `MAX_MODEL_OUTPUT_BYTES = 65_536`: bytes UTF-8 del texto bruto, comprobados antes de `JSON.parse`.
   - `MAX_ANSWER_CHARS = 2_000` y `MAX_STATEMENT_CHARS = 500`, ambos en code points de Unicode (un emoji cuenta 1).
   - `MAX_STATEMENTS = 20`.
   - `MAX_EVIDENCE_IDS_PER_STATEMENT = 10`.

   Cada uno tiene en el código una línea que explica por qué tiene ese valor.
4. **Id de evidencia desconocido:** se descarta **toda** la salida (`unknown_evidence_id`).
5. **`evidenceIds` vacío y duplicados:** `empty_evidence` y `duplicate_evidence_id`, **sin deduplicar**; deduplicar sería reinterpretar la salida del modelo.
6. **Auditoría de una salida descartada:** subcódigo, tamaño, SHA-256 y, de cada issue, solo `path` y `code`; **nunca** el contenido, el `message`, las `keys` ni los valores. Core devuelve el evento y el transporte lo escribe en el log (DIS-39).

Durante el apply, la autora decidió medir las longitudes en **code points**. El diseño suponía que Zod contaba unidades UTF-16, pero Zod 4.6.5 cuenta code points (`node_modules/zod/v4/core/checks.js:273`). Queda registrado en D6, en Follow-ups y en un comentario de DIS-38.

**Pregunta abierta trasladada a DIS-39:** ¿cómo se persiste un statement tipado `FACT` dado `fact_only_from_l1`? Alternativas: guardarlo como `L2` `INFERENCE` conservando el tipo de respuesta en `provenance`, o una regla explícita de promoción a `L1`. Riesgo de la segunda: elegir `layer` para pasar el `CHECK` lo deja sin sentido.

## ¿Cómo probarlo?

1. `docker compose up -d` y `npm ci`.
2. `npx vitest run tests/unit/knowledge/claim.spec.ts tests/unit/explain`: 28 tests en verde.
3. Exporta `DATABASE_URL` (en local, `postgres://codemind:codemind@localhost:5432/codemind`), ejecuta `npm run db:migrate` y después `npx vitest run`: 81 ficheros y 1046 tests, ninguno saltado.
4. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`. `docs:coverage` no da avisos; los 3 avisos `no-orphans` de dependency-cruiser ya existían.
5. `npx stryker run --mutate "packages/core/src/explain/**/*.ts,packages/core/src/knowledge/claim.ts,packages/core/src/knowledge/evidence.ts"` da **95,68 %**. Los 6 supervivientes (3 equivalentes de codificación y 3 estáticos que rompen la carga del módulo) están explicados en [`reports/2026-10-11-9-test-and-state-verification.md`](./2026-10-11-9-test-and-state-verification.md).
6. Semilla: `git show 7f05017 -- seeds/graph-dump.sql` solo cambia la línea `analyzer-fingerprint`, porque `knowledge/` forma parte de la huella (design D9).
7. Prueba manual con un script que importa `@codemind/core`: [`reports/2026-10-11-10-manual-interface-testing.md`](./2026-10-11-10-manual-interface-testing.md). Cubre el camino feliz, un descarte por cada uno de los 7 subcódigos, sin fugas de contenido, y que `L2 FACT` se rechaza.

## Decisiones / compromisos

Las decisiones técnicas están en `openspec/changes/claims-and-typing/design.md`:
- **D1:** registros como esquemas Zod con tipos inferidos; `z.strictObject()` en todos los niveles. Los conjuntos cerrados usan `z.literal([...])` y no `z.enum`, porque TypeDoc daba 13 avisos en `docs:coverage`.
- **D2:** Zod en core.
- **D3:** las comprobaciones de la cuarentena van en un orden fijo y cada fallo da un único subcódigo; las de ids, después del esquema.
- **D4 y D5:** el evento solo lleva metadatos y queda fuera de `AuditEvent`.
- **D6:** los límites, medidos en code points.
- **D7:** la regla usa el `origin` tal como lo da el Context Engine. Un span que sustituye a otros hereda el mejor `origin`, así que un span `exact` puede contener líneas alcanzadas de forma heurística; afinarlo es trabajo del Context Engine.
- **D8:** sin ADR.
- **D9:** se regenera la semilla.

`spec-auditor` (3 Major y 4 Minor) y una segunda revisión se aplicaron antes del apply; están en Follow-ups.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| An inferred fact is not representable | `tests/unit/knowledge/claim.spec.ts:45` |
| An inferred claim without provenance is rejected | `tests/unit/knowledge/claim.spec.ts:59` |
| Confidence outside its range is rejected | `tests/unit/knowledge/claim.spec.ts:74` |
| The provenance shape is validated | `tests/unit/knowledge/claim.spec.ts:85` |
| The evidence span mirrors the database checks | `tests/unit/knowledge/claim.spec.ts:102` |
| The closed sets equal the database enums | `tests/unit/knowledge/claim.spec.ts:120` |
| A chain of anchor and exact evidence is a fact | `tests/unit/explain/typing-rules.spec.ts:10` |
| Any heuristic evidence makes an inference | `tests/unit/explain/typing-rules.spec.ts:18` |
| A conforming output is accepted | `tests/unit/explain/statement-schema.spec.ts:50` |
| An extra field discards the whole output | `tests/unit/explain/statement-schema.spec.ts:68` |
| An unknown evidence id discards the whole output | `tests/unit/explain/statement-schema.spec.ts:84` |
| A statement without evidence discards the whole output | `tests/unit/explain/statement-schema.spec.ts:96` |
| A repeated evidence id discards the whole output | `tests/unit/explain/statement-schema.spec.ts:105` |
| Malformed JSON discards the output | `tests/unit/explain/statement-schema.spec.ts:114` |
| The output size limit accepts its bound and rejects one byte more | `tests/unit/explain/statement-schema.spec.ts:123` |
| The answer length limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:140` |
| The statement count limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:155` |
| The statement length limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:170` |
| The citations limit accepts its bound and rejects one more | `tests/unit/explain/statement-schema.spec.ts:185` |
| The event identifies the output without carrying it | `tests/unit/explain/statement-schema.spec.ts:252` |
| Checking an output writes nothing to the console | `tests/unit/explain/statement-schema.spec.ts:276` |

## Origen

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
