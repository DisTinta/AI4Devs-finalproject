# 70. Reindexado incremental por `content_hash` y dependientes directos (DIS-10)

> Sección 70 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El encargo del paso `apply` del workflow para el change `incremental-indexing` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `tasks.md` fijaba el orden de capas (plan puro, lectura del estado del índice en el puerto y el adaptador, división del `buildSnapshot` bajo su red de seguridad, caso de uso, API, integración sobre Postgres) y el nombre de cada test existente que cambia; los escenarios del spec salieron como tests con su mismo nombre, y la mutación sobre los seis ficheros tocados dejó solo mutantes equivalentes.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Quedan para la autora la comprobación en PowerShell (P8) y la deuda de D1, D5 y D8.
