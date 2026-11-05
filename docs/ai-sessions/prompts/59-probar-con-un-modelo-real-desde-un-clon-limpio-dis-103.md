# 59. Probar con un modelo real desde un clon limpio (DIS-103)

> Sección 59 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Lanzar el ticket tras la prueba manual

La autora siguió `docs/DEMO.md` en un clon limpio con Windows PowerShell 5.1, comprobó que todo
coincidía con la guía y después probó una pregunta libre con Ollama, que chocó con el historial del
fixture ausente y con el tope de 300 s. Abrió DIS-103 con esta nota (bloque `[original]` del ticket):

```
Este paso deberás incluirlo en las instrucciones para la demo por si lo quieren probar con el LLM ¿no? podría darse el caso que lo usen con Ollama sin mi problema de la cpu o incluso que tengan key de Claude o similar para hacer sus pruebas
```

y lanzó el workflow con:

```
todo coincide, la alerta sale igual
```

### Prompt 2 — Implementar el change dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-103 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El change separaba lo comprobable en la suite (el rango de `LLM_TIMEOUT_MS`, el
transporte por defecto contra un servidor `node:http` local con el `fetch` global espiado, los seis
pasos de `up` con un doble del ejecutor, el precargado de Ctrl+C) de las comprobaciones grabadas que
solo se pueden hacer en vivo. Para estas, un servidor de prueba que responde a los 310 s demostró de
forma determinista que ni el cliente, ni la API, ni el proxy de Vite, ni Chromium cortan a los 300 s, y
Ollama en CPU lo confirmó con un modelo real: 8 min 28 s por la CLI, 300,9 s por la API y 597,7 s en la
Pantalla 2.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
durante la implementación, registradas en los informes del change: las reglas de permisos de esta
ejecución impiden al agente leer o escribir ficheros `.env`, así que las pruebas en clones limpios
dieron `POSTGRES_PORT`, `DATABASE_URL` y las `LLM_*` en el entorno de cada comando (una variable ya
definida gana sobre `.env`), y `docs/DEMO.md` → «Cómo se capturó» lo dice; la comprobación de
`.env.example` queda como una línea para la autora en el PR; y, como la CLI guarda la respuesta en la
caché, la prueba en vivo por la API repitió la pregunta con `useCache: false` y la de la web usó otra
pregunta libre. Como el paso no podía arrancar los subagentes de TDD, cada fase rojo → verde →
refactor se hizo en línea con el mismo contrato.
