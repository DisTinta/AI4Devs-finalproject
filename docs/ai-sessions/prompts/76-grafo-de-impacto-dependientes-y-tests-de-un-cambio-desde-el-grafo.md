# 76. Grafo de impacto: dependientes y tests de un cambio desde el grafo determinista (DIS-89)

> Sección 76 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `impact-graph` en la ejecución autónoma

Extracto literal del encargo que recibió el subagente:

```
Run /opsx:apply on change impact-graph: every task in TDD (failing test first, then implementation, in the layer order), marking tasks.md as you go, with the mandatory verification steps. Run the tests, lint and typecheck. Commit, push and open the PR to final-project-CRN with /pr-describe (write the "why" yourself and mark it as agent-written).
```

**Por qué funcionó.** El `tasks.md` ya traía los escenarios del spec numerados y el orden por capas
(petición, ancla, recorrido inverso, componentes, relevancia, semilla), así que el agente solo tenía que
convertir cada escenario en un test con su nombre y dejar que la implementación saliera de ellos (texto
del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Los tests de grafos pequeños se
escribieron después de la primera versión del recorrido y no antes, y el informe del paso 8 lo dice;
los mutantes que sobrevivieron a Stryker llevaron a tres tests más.
