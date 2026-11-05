# 58. Arranque y guion de demo iguales en PowerShell y Bash, y guías en español (DIS-102)

> Sección 58 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Lanzar el ticket con el workflow

La autora abrió DIS-102 el 2026-10-19 con dos decisiones (las cuatro guías de evaluación en español;
cada paso que ejecute quien evalúa, igual en PowerShell y en Bash) y lo lanzó con: `con el workflow, para el stack de prueba y lánzalo`.

### Prompt 2 — Implementar el change dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-102 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El change ya fijaba la gramática de `.env`, el orden de `npm run up` y los
mensajes de cada fallo como escenarios con nombre, así que cada script de `scripts/` salió test a test
con dobles inyectados (un runner de pasos en lugar de Docker, un servidor `node:http` local en lugar de
la API) y sin tocar el `.env` de nadie: la suite corre con `CODEMIND_SKIP_DOTENV=1`. La prueba desde
cero, un clon nuevo de GitHub por terminal con su propio proyecto de Compose, dio la misma salida en
PowerShell 7.6.6 y en Git Bash, y esa salida es la que se pegó en `docs/DEMO.md`.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente
durante la implementación, registradas en `design.md` (A24–A26) y en la descripción `[enhanced]` del
ticket: el preload se pasa a tsx como un solo token, `--import=./scripts/load-env.mjs`, porque con
espacio tsx 4.23.13 reenviaba a Node el `--tsconfig` siguiente (`bad option: --tsconfig`); el guion no
promete las líneas `npm error … code 130` al parar con Ctrl+C, porque npm 11.19.0 no las imprimió; y
los clones de prueba usan `core.longpaths`, porque la ruta del directorio temporal del agente superaba
el límite de Windows (la carpeta habitual de quien evalúa no lo supera). Como el paso no podía arrancar los subagentes de
TDD, cada fase rojo → verde → refactor se hizo en línea con el mismo contrato.
