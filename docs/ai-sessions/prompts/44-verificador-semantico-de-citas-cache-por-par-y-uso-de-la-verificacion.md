# 44. Verificador semántico de citas, caché por par y uso de la verificación (DIS-70)

> Sección 44 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

La sesión de apply arrancó con el comando, sin más texto: `/opsx:apply`.

**Por qué funcionó.** Con un único change activo, el comando lo eligió solo. Las decisiones D1–D8 de la
issue y las respuestas Q1–Q6 de la autora al spec-audit (design S13) fijaban la regla «`FACT` exige todas
las citas `entailed`», la caché en memoria por proceso, el fallo cerrado a `cited` y el uso solo de las
llamadas `verify`, así que el apply solo paró para elegir el modelo de la prueba en vivo. Muchos tests
nuevos pasaron nada más escribirse (la tarea 6.3 cableó de una vez veredictos, uso y eventos), y se
registraron como tests de caracterización; Stryker sobre `verify/` (94,12 % → 95,42 %) confirmó que no
eran vacíos y dejó cuatro supervivientes con sentido (la LRU al re-guardar la clave más reciente, la
lectura fallida que ocupaba hueco, el texto exacto del prompt del verificador y el fragmento sin marca de
truncado), cerrados con tests en el mismo change.

**Ajuste humano.** La autora eligió para el paso 11 un stub local compatible con OpenAI, fuera del
repositorio, en lugar de Ollama: determinista, respondía `true` a un par y `false` al otro para obtener a
la vez filas `entailed` y `cited`, y sirvió también para las rutas degradadas (salida `yes` →
`invalid-output`; HTTP 503 → `llm-unavailable` con una sola petición `verify`).
