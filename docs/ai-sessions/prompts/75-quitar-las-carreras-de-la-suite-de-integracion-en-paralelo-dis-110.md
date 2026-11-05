# 75. Quitar las carreras de la suite de integración en paralelo (DIS-110)

> Sección 75 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Encargo del cambio `integration-test-races` en la ejecución autónoma

Extracto literal del encargo que recibió el subagente:

```
Goal: remove the remaining intermittent integration-test failures.
- F1: in `tests/integration/store/open-store.spec.ts`, three tests still compare the GLOBAL project count via `projectCount()` (e.g. "Work that resolves is committed", failed at line ~179 when the whole integration suite ran in parallel). They create projects, so scope the assertion to their own projects (count by their unique name / ids with the existing helpers `uniqueName`, `projectIds`, `deleteProjects`), keeping what each test proves. Remove `projectCount()` if it becomes unused.
- F2: fix the comment at ~line 105 of that file so it matches the tests.
- F3: investigate and fix the root cause of two intermittents seen when `tests/integration/store` ran: `claims-refresh.spec.ts` hitting the 10 s timeout, and `graph-read.spec.ts` "Listing with no project returns an empty list". Find the real cause (shared DB state across parallel files, global queries, lock contention with other files, slow setup, etc.) — do not just raise timeouts unless the evidence shows the work is legitimately slow, and say so. Fix in the tests (or test support) only; if a production bug turns out to be the cause, stop and report before touching production code. Add any race you can't remove to docs/TESTING.md → Carreras conocidas with cause and mitigation.
```

**Por qué funcionó.** Pedía reproducir antes de cambiar nada y fijar la regla de estabilidad antes de
las ejecuciones. La reproducción con un muestreo de `pg_blocking_pids()` y una base de datos vacía de
control separó tres causas (lecturas globales, escrituras sin acotar con interbloqueos, y una semilla
confirmada en la base de datos local de tests), en vez de subir tiempos de espera.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). La regla de estabilidad paró el
cambio: tras dos ciclos de corrección, una ejecución completa acumuló una cola de bloqueos detrás de
los `CREATE TRIGGER` de otros tests, fuera del alcance (design S1). El PR quedó abierto sin merge
para la autora, aunque ella había pedido el merge durante la ejecución.
