# 82. Cobertura informativa y puerta de mutación (DIS-77)

> Sección 82 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `informative-coverage` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `informative-coverage` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `design.md` fijaba el bloque `coverage`, el script de resumen con sus casos de
entrada y los pasos de CI, y la auditoría había cerrado los huecos, así que el agente solo tenía que escribir
cada test en rojo y completarlo (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Una cosa no siguió el plan: el `--exclude`
de la línea de comandos solo llega a la configuración raíz y no a las listas `exclude` de cada proyecto, así
que los cuatro specs con presupuesto de tiempo seguían ejecutándose con cobertura; `vitest.config.ts` los
excluye además cuando `--coverage` está en `process.argv`, con un test que lo comprueba (design D7, A9).
