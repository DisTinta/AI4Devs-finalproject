# 77. Riesgo, fila de `query_log` y comando `impact` (DIS-90)

> Sección 77 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `impact-risk-cli` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `impact-risk-cli` es el texto estándar de las ejecuciones autónomas, igual que en [§76](76-grafo-de-impacto-dependientes-y-tests-de-un-cambio-desde-el-grafo.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `tasks.md` traía cada escenario del spec con el nombre exacto de su test y la
capa en la que va (regla de riesgo, fila de `query_log`, semilla, comando), y el diseño fijaba la
lectura de cobertura en una sola llamada `neighbors`. El agente no tuvo que decidir la forma, solo
cumplirla (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). El agente escribió la regla de riesgo
y la lectura de cobertura de una vez, y los tests de las tareas 1.2b a 1.9 se escribieron después de ese
código, no antes: el informe del paso 8 lo dice. Stryker enseñó varios mutantes vivos en las semillas
que posee cada componente directo y llevaron a tres tests más.
