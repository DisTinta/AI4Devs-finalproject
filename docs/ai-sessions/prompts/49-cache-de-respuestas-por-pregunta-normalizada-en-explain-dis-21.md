# 49. Caché de respuestas por pregunta normalizada en `explain` (DIS-21)

> Sección 49 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-21 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El diseño (C1–C11) ya fijaba el módulo `core/cache`, los cuatro métodos del
puerto, el SQL sin migración (bloqueo *advisory* + borrado + inserción) y qué aserciones existentes
cambiaban (C8), así que los RED con sentido fueron claros (módulo inexistente, métodos inexistentes,
`useCache` rechazado como `request`, la búsqueda y el acierto en `explain`, el reenvío en `/ask`) y
el resto de escenarios quedaron como tests de caracterización, anotados en el informe del paso 11.
Para que esos tests no fueran vacíos se saboteó a mano cada pieza (el bloqueo, el orden de los
duplicados, el registro del acierto, la regla de cacheabilidad) y en todos los casos fallaban. La
primera pasada de Stryker dejó `cache-entry.ts` en 56,90 %, porque su escenario corre contra
Postgres, fuera de Stryker; con tests unitarios de las cuatro comprobaciones y de los límites del
esquema guardado, la pasada forzada sobre los ficheros nuevos quedó en 95,29 %.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en los informes del change: la tríada TDD la hizo el propio agente del paso (sin
herramienta de subagentes en esta ejecución); en la prueba manual, `curl` desde Git Bash enviaba la
pregunta con tildes en una codificación que no era UTF-8 (se guardaba U+FFFD) y fallaba la caché, así
que las peticiones se repitieron desde ficheros UTF-8 con `--data-binary`; y tres mutantes estáticos
del esquema guardado que Stryker da por supervivientes se aplicaron a mano y rompen la carga del
módulo, así que se registran como artefacto del *runner*, no como hueco de los tests.
