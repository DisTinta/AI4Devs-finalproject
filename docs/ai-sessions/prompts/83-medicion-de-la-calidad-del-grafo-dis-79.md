# 83. Medición de la calidad del grafo (DIS-79)

> Sección 83 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `graph-quality-measurement` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `graph-quality-measurement` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `design.md` fijaba el orden de la ejecución, la forma del JSON, los formatos de las cifras y
los casos de entrada de cada regla de emparejamiento, y la auditoría había cerrado los huecos, así que el agente
escribió cada test en rojo con datos sintéticos y lo completó (texto del agente). Las cifras publicadas
(24/31 y 26/26) coincidieron con las del prototipo de la propuesta.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Dos cosas no siguieron el plan al pie de la
letra: los tests de congelación de la tarea 1.3 se escribieron junto con su implementación, sin una ejecución en
rojo propia, y la comprobación byte a byte de PowerShell usó el SHA-256 del JSON porque el fichero aún no estaba
versionado.
