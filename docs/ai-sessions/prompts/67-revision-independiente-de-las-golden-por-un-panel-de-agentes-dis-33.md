# 67. Revisión independiente de las golden por un panel de agentes (DIS-33)

> Sección 67 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Terminar el apply tras el panel, dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-33. Branch: feature/dis-33-golden-independent-review. Change: openspec/changes/golden-independent-review. Step: apply-finish.
Run /opsx:apply on change golden-independent-review: every task in TDD, marking tasks.md as you go. The tasks up to and including the Panel group are done (the panel outputs are committed): do the tasks after it, without changing any panel output. Record in design.md → Follow-ups (agent's text) that panelist 2 ran in a resumed run because the first run was started with one panel model by mistake.
```

**Por qué funcionó.** El criterio, el formato de salida y las listas de fuentes estaban fijados en el grupo Panel antes de que juzgase nadie, así que los validadores se escribieron contra reglas ya cerradas y aceptaron los tres ficheros del panel sin tocarlos. Los veredictos derivados de los juicios hicieron comprobable la concordancia.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). El panel (Opus y Sonnet) coincidió en los 7 veredictos; dos golden de acme-shop (Q1 y Q4) salieron `incorrect`, quedan sin firmar y pasan a los tickets sucesores DIS-108 y DIS-109. El panelista 2 se lanzó en una ejecución reanudada porque la primera se había iniciado con un solo modelo de panel por error.
