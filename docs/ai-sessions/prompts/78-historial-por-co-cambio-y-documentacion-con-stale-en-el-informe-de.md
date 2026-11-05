# 78. Historial por co-cambio y documentación con `stale` en el informe de impacto (DIS-94)

> Sección 78 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `impact-history-docs` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `impact-history-docs` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `tasks.md` traía las tres lecturas del puerto, las dos funciones puras del núcleo y
la forma exacta de cada salida, así que el agente solo tenía que cumplirlas capa a capa (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Dos cosas no estaban en el plan: los
directorios `knowledge/` y `store-postgres/src` alimentan la huella del analizador, así que hizo falta
`npm run seed:build` y refrescar a mano `seed.analyzerFingerprint` de los dos ficheros golden (sin
`cache:build`, que necesita el modelo y el panel); y varios tests de los pasos 3 a 5 se escribieron justo
después de la implementación y no antes. Stryker enseñó siete mutantes vivos en `history.ts`,
`doc-staleness.ts` y `risk.ts`, que llevaron a cuatro tests más.
