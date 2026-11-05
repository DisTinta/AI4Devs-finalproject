# 74. Quitar la carrera del test «Every connection is released after a run» (DIS-110)

> Sección 74 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Encargo del cambio `open-store-test-flake` en la ejecución autónoma

Extracto literal del encargo que recibió el subagente:

```
Goal: remove the flakiness of the existing test `Every connection is released after a run` in `tests/integration/store/open-store.spec.ts` (~line 229). It asserts `expect(await projectCount()).toBe(before)` on the global project count, which fails when other test files create/delete projects in parallel; the test itself creates no project. Fix: remove `const before = await projectCount();` and that assertion from this test only (keep the close-time and `sessionsLeft` assertions). If `projectCount` becomes unused, remove the helper only if nothing else uses it. This is finding A7 of `openspec/changes/archive/2026-10-30-pool-transaction-release/` (destination C, the author), now fixed under DIS-110 scope. No production code changes. Do not create Linear tickets.
```

**Por qué funcionó.** El encargo nombraba el test, las dos líneas y lo que había que conservar, y
pedía comprobar antes si el escenario de `graph-store` mencionaba el recuento: no lo menciona, así que
el cambio va sin delta (`skip_specs: true`).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). El `spec-auditor` necesitó cinco
ejecuciones: las ejecuciones de estabilidad fallaron de forma intermitente en tests de otros ficheros
(F3), y el criterio de aceptación de esas ejecuciones se amplió después de verlas (design X2), con la
prueba de cada fichero ejecutado solo.
