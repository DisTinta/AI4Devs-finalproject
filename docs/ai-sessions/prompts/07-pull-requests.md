# 7. Pull Requests

> Sección 7 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

En la Entrega 1 no había código, y esta sección quedó vacía a propósito. A 04-11-2026 hay **106 pull requests fusionadas**: 59 en la Entrega 2 y 47 en la Entrega 3, listadas en la sección 7 del readme con su ticket y su change de OpenSpec.

No hay un prompt de PR que merezca registrarse aparte: ninguna descripción se escribió con un prompt propio. Todas salen de la skill `/pr-describe`, que lee el change, los commits y los informes de revisión y deja sin rellenar el porqué, que en el flujo normal escribe la autora; en el experimento de la [§57](57-experimento-workflow-autonomo-para-cerrar-la-entrega-2-dis-101.md) y en las ejecuciones autónomas de la Entrega 3 lo escribió el agente, marcado como texto suyo. El texto de cada descripción se guarda en el change, en `openspec/changes/archive/*/reports/pr-description.md`, y los prompts que dieron forma a cada PR están en la sección de su ticket (§12 en adelante).
