# 56. Pantalla 2: panel de uso, estados `UNKNOWN`, avisos de `429` y error, y pasada de accesibilidad (DIS-66)

> Sección 56 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Implementar los estados finales de la Pantalla 2 dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-66 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El change `ask-page-states` llegaba con 32 decisiones, una auditoría de la spec
aprobada en su segunda pasada y una regla explícita (D24) sobre qué líneas de tests existentes podían
cambiar y en qué orden, así que borrar los tres tests del aviso provisional, cambiar las dos aserciones
de la región de estado y ajustar las esperas del test de axe se hizo sin dejar nunca la suite en rojo
entre tareas. Los escenarios que pasaron a la primera (acierto de caché, ahorro negativo, cada motivo
sin evidencia, las alertas, la secuencia de anuncios y las paradas de tabulación) se vieron fallar
rompiendo a propósito, sin commitear, lo que vigilan. La prueba en el navegador contra la API real en
modo evaluación confirmó el recorrido del readme: Q1 es un acierto de caché («caché ✓», «$0», «ahorro
100 % vs bruto»), «¿Por qué existe legacy_ref?» da `no-anchor` y una pregunta libre da el aviso de
configuración con el mensaje de la API. La mutación dirigida (configuración temporal, sin commitear)
sobre los diez ficheros nuevos o cambiados dio 88,16 % y señaló que la comprobación de calendario de la
hora de renovación no tenía test; se fijó con uno.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente al
implementar, registradas en `design.md` (D33–D36) y en la descripción `[enhanced]` del ticket: la
insignia de ahorro decide con el valor ya redondeado, para que nunca diga «ahorro 0 %»; la hora de
renovación tiene que existir en el calendario, porque `Date.parse` convierte el 30 de febrero en el 2 de
marzo; el RED de los escaneos de axe nuevos tuvo que ser estructural, porque axe en jsdom no calcula
estilos y nunca da `color-contrast` como violación; y el escaneo del estado pendiente espera el texto
visible por su `aria-hidden`, porque la región de estado repite el mismo texto. Como el paso no podía
arrancar los subagentes de TDD, cada fase rojo → verde → refactor se hizo en línea con el mismo contrato.
