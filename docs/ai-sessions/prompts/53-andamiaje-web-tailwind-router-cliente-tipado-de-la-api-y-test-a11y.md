# 53. Andamiaje web: Tailwind, router, cliente tipado de la API y `test:a11y` real (DIS-58)

> Sección 53 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Implementar el andamiaje dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-58 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El change `web-foundation` llegaba con 28 decisiones ya auditadas en cuatro
pasadas del `spec-auditor`, entre ellas dos sondas previas que evitaron los dos atascos típicos de este
montaje: `?raw` devuelve vacío en Vitest (el test de tema lee `index.css` con `node:fs`) y React
Router no navega en jsdom porque construye un `Request` de Node con la señal de jsdom (el fichero de
setup la descarta). Cada escenario de la spec tuvo su test con el mismo nombre, y los que pasaron a la
primera se probaron rompiendo a propósito lo que vigilan: un fichero sonda con `text-stripe`, un campo
renombrado en el cliente para el test de contrato de tipos, una importación de la API para la regla
`web-no-backend`, el `main` quitado para la puerta de axe y el `cleanup()` comentado para el test de
fugas entre tests.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
registradas en `design.md` (D29–D31) y en la descripción `[enhanced]` del ticket: Tailwind generaba en
el bundle las utilidades `text-stripe` que el test de tema contiene a propósito, así que `index.css`
excluye los tests de su escaneo; la cabecera, el contenedor y el `main` se extrajeron a `PageFrame`
para las tres pantallas; y como el agente no podía leer las credenciales locales de la base de datos,
la prueba manual levantó la API real con los dobles de sus tests unitarios, lo que demuestra el proxy y
el caso de API caída pero no la respuesta `UNKNOWN` de acme-shop sembrada.
