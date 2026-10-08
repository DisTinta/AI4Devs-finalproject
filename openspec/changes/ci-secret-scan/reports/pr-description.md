chore(DIS-87): escaneo de secretos con gitleaks en CI y huellas en .gitleaksignore

## ¿Qué cambia?

- **Job `secrets` nuevo en `.github/workflows/ci.yml`.**
  - Instala gitleaks 8.30.1, el binario oficial verificado con un SHA-256 escrito en el workflow, en `$RUNNER_TEMP`.
  - Ejecuta `gitleaks dir .` (árbol) y `gitleaks git` sobre el rango del evento: `base..head` en un PR, `before..sha` en un push. Si `before` es todo ceros o no se puede alcanzar, escanea solo el árbol.
  - Los dos escaneos llevan `--redact`.
  - No tiene `needs`, ni `if`, ni `npm ci`, así que nunca se salta, tampoco en un push que solo toca documentación.
- **`.gitleaksignore` nuevo.** Recoge por huella los 9 hallazgos sintéticos del árbol y los 8 de commits del hito 2 que ya no están en el árbol.
- **Documentación.** Se actualizan `fixtures/README.md` (cómo corre el escaneo y cómo regenerar las huellas), `docs/project-context.md` (bullet de CI y el gotcha de que las huellas llevan número de línea) y `readme.md`.

Ticket: [DIS-87](https://linear.app/distinta-ai4devs/issue/DIS-87/cm-hu-05a4-paso-gitleaks-en-ciyml-gitleaksignore-con-las-huellas-de) (sub-issue de DIS-64, CM-HU-05a).

## ¿Por qué?

<!-- Transcrito de DIS-87 ([enhanced] §1 y decisión D4, decididas por la autora el 2026-10-08); se ha ajustado la redacción, no el contenido. -->

Como autora de Codemind, quiero que cada PR y cada push a `main` pasen un escaneo de secretos con `gitleaks` en un job propio que nunca se salte, con las huellas sintéticas ya conocidas ignoradas explícitamente, para que ningún secreto real (tampoco uno pegado en un `.md`) entre en el repositorio sin que CI se ponga en rojo.

El escaneo no va dentro de `quality`. DIS-86 hizo que `quality` se salte en pushes docs-only (`openspec/`, `docs/`, `*.md`), y un secreto pegado en un `.md` es justo el caso que hay que pillar.

## ¿Cómo probarlo?

1. Instala gitleaks 8.30.1 y comprueba la versión con `gitleaks version` (→ `8.30.1`).
2. `gitleaks dir . --redact --no-banner` → «no leaks found».
3. `gitleaks git . --redact --no-banner --log-opts="origin/main..HEAD"` → «no leaks found» (C6; 292 commits en local).
4. Aparta `.gitleaksignore` (`mv .gitleaksignore /tmp/`), ejecuta `gitleaks dir . --redact --no-banner` → «leaks found: 13», y devuélvelo a su sitio (`mv /tmp/.gitleaksignore .`). Así se ve que el fichero es lo que los filtra; `--gitleaks-ignore-path` no sirve para esto, porque gitleaks sigue leyendo el `.gitleaksignore` de la raíz.
5. CI de este PR: el job `secrets` sale en verde. El log muestra `8.30.1`, la línea `OK` de `sha256sum` y «no leaks found» en los dos pasos, y no ejecuta `npm ci`. `quality` también sale en verde (C1; enlace en Trazabilidad).
6. `npx vitest run` con `DATABASE_URL` → 48 ficheros y 682 tests en verde. Este PR no toca código ni tests.
7. `npm run lint`, `npm run typecheck`, `npm run lint:architecture` y `npm run docs:coverage` → sin errores. Los avisos que salen ya estaban antes.

## Decisiones / compromisos

- **Qué se escanea** (D1, decisión de la autora): el árbol y además el rango de commits del evento.
  - Las huellas `path:rule:line` también filtran en modo git.
  - Los hallazgos de commits del hito 2 llevan su huella `commit:path:rule:line`. Esos SHA son estables porque la historia nunca se reescribe.
- **Huellas en lugar de allowlist por ruta** (D2, decisión de la autora). Una allowlist silenciaría una clave real futura en los specs. Reescribir el contenido habría tocado specs archivados.
- **Binario fijado por SHA-256 en lugar de `gitleaks-action`** (D3, decisión de la autora).
- **Job propio, sin `needs: scope`** (D4, decisión de la autora).
- **Disposición del job** (D5).
  - El paso de rango se ejecuta antes del escaneo del árbol.
  - El escaneo `git` corre aunque falle el del árbol (`!cancelled()`), así un mismo run informa de los dos.
  - Ningún `${{ … }}` aparece dentro de un `run:`: los valores llegan por `env:`.
  - El binario va en `$RUNNER_TEMP` para que `dir .` no se escanee a sí mismo.
- **Las huellas llevan número de línea.** Editar por encima de una línea ignorada pone CI en rojo, y es intencionado: alguien vuelve a revisar el hallazgo. La regeneración está en `fixtures/README.md` (C5(a)).
- **C5(b) por simulación local.** Un push a `main` con `before` todo ceros no se puede reproducir sin tocar `main`. La shell simulada es el `run:` del paso `range` extraído con un parser YAML de `ci.yml` (`sha256` `74399cfd…5ecc`).

## Checklist post-merge (autora, cuenta DisTinta)

- [ ] Añadir `secrets` como check obligatorio en `main` y en `feature/entrega-2-CRN` si tienen protección, o dejar anotado «sin regla de protección». Consulta del 2026-10-08: **las dos ramas responden «Branch not protected» y el repositorio tiene 0 rulesets → sin regla de protección**.
- [ ] Al confirmar esta checklist, pasar DIS-87 a Done. Mientras tanto se queda en In Review; si la integración Linear–GitHub lo mueve a Done al hacer merge, el agente lo devuelve a In Review.

## Trazabilidad

El cambio no tiene spec delta (`skip_specs: true`: chore de CI, como indica el `[original]` de DIS-87). Los criterios de aceptación del ticket se corresponden con estas evidencias:

| Criterio de DIS-87 | Evidencia |
|---|---|
| C1 — Árbol actual en verde | [Run 37760219359](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760219359): [`secrets`](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760219359/job/113254533400) en verde (`8.30.1`, `sha256sum` OK, «no leaks found» en `dir` y en `git`, sin `npm`); `quality` en verde |
| C2 — Secreto nuevo fuera de `fixtures/` → rojo | PR desechable #27, commit 1 `b517885`: [run 37760684063](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760684063/job/113256055294). `secrets` en rojo; los dos pasos nombran `packages/secret-probe.ts:1` y `generic-api-key`, con el valor `REDACTED` |
| C3 — Secreto solo en Markdown, push docs-only → rojo | #27, commit 3 `c64074d`: [run 37761215621](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761215621/job/113257802929). `scope` da `code=false` y `quality` se salta; falla el paso «Scan working tree» con `docs/secret-probe.md:3` y `generic-api-key`. El commit 2 dejó `quality` en verde ([run 37760985833](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760985833)) |
| C4 — Secreto añadido y borrado en el mismo PR → rojo | #27, commit 4 `68bda5e`: [run 37761381963](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761381963/job/113258344810). «Scan working tree» da «no leaks found»; «Scan commits» falla y nombra `b517885` y `c64074d`. #27 se cerró sin merge y se borró la rama; los commits siguen en `refs/pull/27/head` |
| C5(a) — Huella desplazada | `openspec/changes/ci-secret-scan/reports/2026-10-08-5-test-and-state-verification.md` → «C5(a)» (detalle de C2–C4 en `…/2026-10-08-7-end-to-end-testing.md`) |
| C5(b) — Push sin `before` utilizable | Mismo informe → «C5(b)» (simulación local del paso, 4 casos) |
| C6 — El rango del hito sale en verde | Mismo informe → «C6» |

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
