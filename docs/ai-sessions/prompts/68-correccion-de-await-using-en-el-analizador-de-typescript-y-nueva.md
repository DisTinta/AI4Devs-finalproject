# 68. Corrección de `await using` en el analizador de TypeScript y nueva ronda del panel (DIS-107)

> Sección 68 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Terminar el apply tras el panel, dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-107. Branch: feature/dis-107-ts-await-using-golden-regen. Change: openspec/changes/ts-await-using-golden-regen. Step: apply-finish.
Instructions for this ticket from the author: El arreglo del analizador TS cambia su huella: regenera las golden de task-api con Ollama y las respuestas regeneradas pasan de nuevo por el panel independiente (como DIS-33) antes de firmarse.
Run /opsx:apply on change ts-await-using-golden-regen: every task in TDD, marking tasks.md as you go. The tasks up to and including the Panel group are done (the panel outputs are committed): do the tasks after it, without changing any panel output. Commit, push and open the PR to final-project-CRN with /pr-describe.
```

**Por qué funcionó.** El criterio del panel se copió literal de DIS-33 y se fijó, con las listas de fuentes y el formato, antes de que existiera la entrada del panel; los validadores ya retargeteados a la ronda de DIS-107 aceptaron los tres ficheros del panel sin tocarlos, y el informe se completó contra reglas ya cerradas.

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). La corrección es una condición de `symbols.ts`; el panel coincidió en seis de siete veredictos y el resolutor decidió el séptimo (acme-shop Q3, `partial`); ninguna golden salió `incorrect`, así que no hay pendientes. El clasificador denegó los comentarios del agente en DIS-108 y DIS-109, y quedan para la autora.
