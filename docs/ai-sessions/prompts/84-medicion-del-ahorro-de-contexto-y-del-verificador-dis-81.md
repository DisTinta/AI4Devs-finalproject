# 84. Medición del ahorro de contexto y del verificador (DIS-81)

> Sección 84 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `context-measurement` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `context-measurement` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `design.md` y la spec, cerrados tras cinco rondas de auditoría, fijaban el orden de las
comprobaciones, las formas del JSON y de los ficheros en bruto y los formatos de cada cifra, así que el agente pudo
escribir el script y los tests sin preguntar nada y lanzar la medición real una sola vez (texto del agente). La
ejecución viva de 40 preguntas con `qwen2.5-coder:latest` en una GTX 970 tardó unos 90 minutos y no se reanudó.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Dos cosas no siguieron el plan al pie de la
letra: el script se escribió antes que su suite de tests y la ejecución en rojo se obtuvo retirando el módulo de
forma temporal; y el clasificador del modo automático denegó cerrar la aplicación de bandeja de Ollama de la máquina,
así que la medición usó un `ollama serve` propio en otro puerto con `OLLAMA_CONTEXT_LENGTH=16384`.
