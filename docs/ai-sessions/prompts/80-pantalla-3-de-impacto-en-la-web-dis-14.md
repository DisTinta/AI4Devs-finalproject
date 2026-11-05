# 80. Pantalla 3 de impacto en la web (DIS-14)

> Sección 80 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `impact-page` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `impact-page` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** La Pantalla 2 era una plantilla punto por punto (hook con `AbortController`, región
`role="status"`, alerta por envío inválido, barra del proyecto) y el `design.md` fijaba textos, colores y
orden de capas, así que el agente solo componía y escribía los estados (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Cosas que no siguieron el plan al pie de
la letra: `impact()` se añadió a `api-client.ts` con una redirección de shell y no con la herramienta de
edición (el contenido es el previsto); el hook, los componentes y la página se escribieron antes que los
tests de los grupos 4 a 8, y por eso esos tests se comprobaron después con mutaciones locales (clave del
contador de envíos inválidos, `key` de la ruta, aborto al desmontar, límite de tiempo, `dangerouslySetInnerHTML`,
región de estado, `tabIndex`), cada una vista fallar y revertida.
