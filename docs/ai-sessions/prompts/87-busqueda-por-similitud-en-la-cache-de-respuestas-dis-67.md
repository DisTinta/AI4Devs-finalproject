# 87. Búsqueda por similitud en la caché de respuestas (DIS-67)

> Sección 87 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `semantic-cache` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `semantic-cache` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `design.md` y las cinco specs, cerrados tras tres auditorías, fijaban la firma del puerto, el
orden de las comprobaciones, el evento cerrado y los vectores de frontera (el 0,85 exacto del doble en memoria), así
que el agente pudo escribir primero cada test y después el código sin preguntar nada (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Dos desviaciones menores del plan: los escenarios de
`explain` de la capacidad nueva viven en un fichero propio (`explain-similarity.spec.ts`) y no en `explain-cache.spec.ts`,
y el doble en memoria compara con el mínimo que recibe y no con la constante, porque el mínimo es un parámetro de la
llamada; `reachesThreshold` queda como la declaración única de la regla inclusiva y la usa su propio test.
