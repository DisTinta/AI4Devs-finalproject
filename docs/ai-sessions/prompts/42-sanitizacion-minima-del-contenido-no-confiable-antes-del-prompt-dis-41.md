# 42. Sanitización mínima del contenido no confiable antes del prompt (DIS-41)

> Sección 42 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

La sesión de apply arrancó con el comando, sin más texto: `/opsx:apply`.

**Por qué funcionó.** La issue enriquecida (P1–P7) y el design (D1–D9) cerraban el formato de los
marcadores, la regla del corte, las cuatro expresiones regulares y el orden de los eventos, así que
el apply solo paró para lo que el paso 9 reserva a la autora. La pasada de mutación encontró huecos
reales (U+FFFF, el segundo hueco del patrón en español, las líneas del system prompt que ningún test
fijaba), y se cerraron con tests en el mismo change.

**Ajuste humano.** La autora eligió `llama3.2` en CPU para la ejecución live y cargar acme-shop con
`db:seed` y dejarlo cargado al final. Esta vez el modelo devolvió JSON válido: la respuesta se tipó y
guardó, con el evento `untrusted_content_flagged` (línea 7, sin `pwned`) y el
`untrusted_content_truncated` (312 → 150) en stderr.
