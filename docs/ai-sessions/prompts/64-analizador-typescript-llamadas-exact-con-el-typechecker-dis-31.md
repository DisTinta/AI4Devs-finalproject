# 64. Analizador TypeScript: llamadas `exact` con el `TypeChecker` (DIS-31)

> Sección 64 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El encargo del paso `apply` del workflow para el change `ts-calls-exact` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** Tres auditorías de la spec ya habían fijado la lista exacta de las 37 aristas de
task-api y cada forma de llamada (sobrecargas, firmas abstractas, receptores unión, callee tipado por
`typeof`), así que los 13 escenarios se convirtieron en 13 tests con el mismo nombre; 9 fallaron por la
razón correcta y la implementación (`calls.ts`, con el mapa nodo → símbolo compartido con `edges.ts`) los
puso en verde a la primera.

**Ajuste humano.** Ninguno: ejecución autónoma. Decisiones del agente (`design.md` → Follow-ups): los
escenarios que esperan «ninguna arista» pasan ya en la fase roja y solo los positivos fallan; el tiempo de análisis
de task-api se midió quitando temporalmente la línea que añade las llamadas.
