# 48. Endpoint `POST /ask`: esquemas, respuesta pública y errores por ruta (DIS-78)

> Sección 48 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-78 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El diseño ya fijaba las unidades (esquemas, `toPublicAnswer`, tabla de errores
por ruta, eventos al log, caché por app), así que los RED con sentido fueron pocos y claros (sin
ruta, ids internos en el cuerpo, `500` sin la tabla de la ruta, eventos sin escribir) y el resto de
escenarios quedaron como tests de caracterización, anotados en el informe del paso 9. Dos hallazgos
salieron de las puertas y no de los tests: `npm run docs:coverage` marcó 20 propiedades sin
documentar porque `z.enum` añade un mapa por valor al tipo exportado, y se cambió a
`z.literal(<conjunto de core>)`, como ya hace `claim.ts`; y Stryker incremental reutilizó resultados
«sobrevivientes» de los mutantes estáticos del esquema aunque los tests nuevos ya los mataban, así
que una pasada forzada solo sobre `packages/api` dejó el paquete en 97,70 %.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en los informes del change: la tríada TDD la hizo el propio agente del paso, porque en
esta ejecución no había herramienta de subagentes; en la prueba manual, `SIGINT` no se pudo enviar
desde la shell en Windows y el servidor se paró con `taskkill /F` (sin sesiones `codemind-api`
abiertas después), y el `503` del modelo inalcanzable llegó sin `systemCode` porque el `fetch` de
Node en Windows no da código para ese fallo, lo que la spec admite («cuando el error lo trae»).
