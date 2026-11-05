# 36. Modo evaluación y techo de gasto diario sobre `query_log` (DIS-18)

> Sección 36 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change y desbloquear la base de datos

Texto literal enviado: `/opsx:apply llm-evaluation-budget`. Con las tareas unitarias hechas, el modelo
se paró porque el daemon de Docker no respondía y los tests de integración se saltaban sin
`DATABASE_URL`. Preguntó si exportar solo `DATABASE_URL` desde `.env` sin mostrar su valor, y la
autora respondió: `1. Docker ya está arriba / 2 y 3 hazlo tú`.

**Por qué funcionó.** La parada evitó dar por buena una línea base con 124 tests saltados: los cuatro
escenarios de `graph-store` y «The ceiling survives a restart» solo se pueden ver fallar contra
Postgres real. Cada test que nació verde, porque su tarea GREEN anterior ya lo cubría, se comprobó con
una mutación temporal del código (por ejemplo `in` en lugar de `Object.hasOwn`, o anular el filtro de
fecha de `SUM_COST_SINCE`) que lo hizo fallar, y se restauró.

**Ajuste humano.** Las reglas `deny` siguen impidiendo leer `.env` y `.env.example`. El modelo no las
esquivó: cargó `.env` en una subshell y exportó solo `DATABASE_URL`, sin imprimirla, y dejó la
reescritura del comentario de `DAILY_BUDGET_USD` en `.env.example` (tarea 9.1) para la autora.
