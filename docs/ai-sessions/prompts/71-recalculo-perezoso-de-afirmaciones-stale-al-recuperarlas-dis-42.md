# 71. Recálculo perezoso de afirmaciones `stale` al recuperarlas (DIS-42)

> Sección 71 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el cambio dentro del workflow autónomo

El encargo del paso `apply` del workflow para el change `stale-claims-refresh` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `tasks.md` ya traía el orden de capas (evento, puerto y doble en memoria, adaptador Postgres, prompt de recálculo, orquestación en `explain`, integración sobre acme-shop) y el nombre de cada test existente que cambia; los escenarios de los tres deltas tienen un test con su mismo nombre y el informe del paso 9 recoge la puntuación de Stryker con los supervivientes que se mataron.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Tres `it` de `tests/unit/explain/explain.spec.ts` comparaban `calls` con `toEqual` sobre sus claves exactas y ganaron `refreshClaim: 0` al añadirse esa clave al doble; se anotó en la lista de la tarea 8.1 antes de editarlos. El grupo `Panel` (10c y 10d) no se ejecutó dentro de este paso: el ticket se lanzó sin la opción `panel` del workflow, así que quedan para el panel de agentes independientes y para la autora (ver el informe del paso 9).
