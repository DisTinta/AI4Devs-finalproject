# 88. Tasa de aciertos de caché del proyecto y vectores de las respuestas golden (DIS-69)

> Sección 88 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `cache-hit-rate` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `cache-hit-rate` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `design.md` (S1–S14) y las siete specs, cerrados tras cuatro auditorías, fijaban la firma de
`countExplainQueries`, el orden de las comprobaciones, el redondeo de `cacheHitRate`, la forma exacta de cada línea de la
CLI y de la web y el orden de migración de los ficheros golden (primero `questionEmbedding: null`, después los vectores de
`cache:embed`), así que el agente pudo escribir cada test antes que el código y ejecutar `cache:embed` en vivo con
Ollama sin decidir nada de producto (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente).
