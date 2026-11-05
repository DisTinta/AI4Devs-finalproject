# 72. Destruir la conexión del pool tras un fallo en el ejecutor de transacciones (DIS-110)

> Sección 72 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El encargo del paso `apply` del workflow para el change `pool-transaction-release` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `tasks.md` separaba la comprobación contra el código viejo (tarea 1.3) del código final y nombraba el único test existente que cambia; los escenarios del delta tienen un test con su mismo nombre y Stryker sobre `transaction.ts` terminó sin supervivientes.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). La edición del `## Purpose` de `explain` (tarea 3) la denegó el hook de specs principales; queda para la autora.
