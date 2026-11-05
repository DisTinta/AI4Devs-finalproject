# 69. Endpoint `POST /api/projects/{id}/index`: reindexado de un proyecto existente (DIS-9)

> Sección 69 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El encargo del paso `apply` del workflow para el change `index-endpoint` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `tasks.md` ya traía el orden de capas (extraer la tubería compartida bajo la red de seguridad existente, caso de uso, ejecutor de transacción del almacén, esquemas y ruta, composición, integración sobre la semilla) y el nombre de cada test existente que cambia, así que la protección de tests existentes no denegó nada y cada escenario del spec tiene un test con su mismo nombre.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Quedan para la autora la comprobación en PowerShell (E13) y la nueva revisión independiente de las respuestas golden regeneradas (E16).
