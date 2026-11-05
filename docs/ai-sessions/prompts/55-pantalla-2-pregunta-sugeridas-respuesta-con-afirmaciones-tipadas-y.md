# 55. Pantalla 2: pregunta, sugeridas, respuesta con afirmaciones tipadas y evidencia expandible (DIS-65)

> Sección 55 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Implementar la Pantalla 2 dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-65 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El change `ask-page` llegaba con 30 decisiones y una auditoría de la spec aprobada
en su segunda pasada, y cada escenario ya decía qué doble de `fetch` usar, qué consulta accesible y en qué
orden comprobar, así que los tests se escribieron casi al dictado y en el orden de `tasks.md`. Los
escenarios que pasaron a la primera (el proyecto fuera de la constante, la pregunta nueva que sustituye a
la anterior, el orden de tabulación y axe) se probaron rompiendo a propósito lo que vigilan. Lo que más
aportó fue la prueba en el navegador contra la API real en modo evaluación: las tres sugeridas se
respondieron desde la caché golden y el fragmento desplegado coincidió carácter a carácter con
`seeds/cache/acme-shop.json`, pero también salieron tres defectos que ningún test de jsdom podía ver
(«Prueba:» en su propia línea, la insignia «INFERIDO» invisible sobre el recuadro de la inferencia y un
mensaje con un par de colores sin comprobar). Una mutación dirigida (configuración temporal, sin
commitear) sobre los ficheros nuevos dio 84,29 %.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente al
implementar, registradas en `design.md` (D31–D36) y en la descripción `[enhanced]` del ticket: las
sugeridas se leen solo por clave propia para que `/p/constructor` no lea `Object.prototype`; el escenario
sin tiempo límite pulsa con `fireEvent`, porque `user-event` se cuelga esperando un `setTimeout(0)` que el
reloj falso nunca dispara; el control negativo de axe tuvo que ocultar también la flecha «←», porque
quitar solo el `aria-label` deja un nombre visible que axe da por bueno; y, como el paso no podía arrancar
los subagentes de TDD, cada fase rojo → verde → refactor se hizo en línea con el mismo contrato.
