# 46. Uso por consulta en `query_log` y tope de verificación (DIS-74)

> Sección 46 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

Prompt literal: `/opsx:apply query-usage-log`.

**Por qué funcionó.** El change llegaba con el spec-audit aprobado (run 4) y las decisiones D1–D11 de la
autora cerradas en el ticket y en la propuesta, así que el apply recorrió las secciones 0–15 por TDD sin
reabrir ninguna decisión de producto. El diseño (U5) ya fijaba el medidor como decorador del modelo, lo
que permitió escribir la fila también en los rechazos sin tocar las firmas de la verificación. Muchos
escenarios de `explain` pasaron nada más escribirse porque el cableado de 7.4 ya los cubría; se
registraron como tests de caracterización y Stryker (100 % en `usage.ts`, `usage-meter.ts` y
`query-log.ts`; solo mutantes equivalentes en `explain.ts` y `semantic.ts`) confirmó que no eran vacíos.

**Ajuste humano.** Dos tests de rollback llegaban a su precondición con un número fijo de `db:rollback`
que la migración `0004` dejaba corto; la autora eligió prepararlos con `migrateUpTo` en lugar de añadir
otro rollback (aserciones intactas). Para la prueba manual eligió `qwen2.5-coder` para responder y
verificar. En CPU el `ask` del CLI agotó el tope de 300 s del adaptador sin dejar fila, como manda la
spec, y la fila real se obtuvo con la misma composición en un script del scratchpad: 4 llamadas de
verificación, el 32 % de la latencia, y un ahorro de −22,7 % que queda como dato para la Tabla 1.
