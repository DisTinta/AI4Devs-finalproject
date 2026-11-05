# 79. `POST /impact` con esquema Zod y tests `200`/`400`/`404` (DIS-95)

> Sección 79 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `http-impact` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `http-impact` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** La ruta de `/ask` era una plantilla punto por punto y el `tasks.md` fijaba el orden
de capas (esquemas, ruta mínima con `501`, ruta completa, integración sobre la semilla), así que el
agente solo tenía que cumplirlo (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Dos cosas no estaban en el plan: la
base de datos de desarrollo trae confirmados los dos proyectos de la semilla y el arnés de integración se
niega a empezar con ellos, así que las pruebas con base de datos se lanzaron contra `codemind_test`
(la URL en la línea de órdenes, sin leer `.env`); y Stryker enseñó siete mutantes vivos en los dos ficheros
nuevos (un `prs` copiado, el `?? []` de los eventos, los dos mensajes de las reglas propias y el literal
`HIGH`), que llevaron a tres tests más.
