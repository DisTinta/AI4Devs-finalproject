# Ejecución autónoma del ciclo SDD

Cómo se lanza un agente que recorre el ciclo SDD de un ticket sin nadie delante (enriquecer,
proponer, `spec-auditor`, aplicar en TDD, las tres revisiones, PR, archivo y merge) en Claude Code o
en Cursor, y qué hacen los hooks del kit mientras tanto. Lo introdujo DIS-106, a partir de los
bloqueos del experimento de la Entrega 2 (ADR
[`20261016-autonomous-workflow-run-entrega-2.md`](adr/20261016-autonomous-workflow-run-entrega-2.md),
`readme.md` §8.6). La decisión y la doctrina que se relaja están en el ADR
[`20261020-kit-autonomous-mode.md`](adr/20261020-kit-autonomous-mode.md).

Todos los comandos de esta guía se escriben igual en PowerShell y en Bash, salvo donde la guía da
las dos formas.

## 1. Los dos modos

El interruptor es la clave `KIT_AUTONOMOUS_RUN` de `.claude/sdd-harness.env`. Se cambia **a mano**:
ni el agente ni un comando de shell del agente pueden escribir ese fichero. En el repositorio va
siempre como `"0"`; el `"1"` es un cambio local que no se hace commit.

| Modo | Cuándo | Qué cambia |
|---|---|---|
| **Interactivo** | `KIT_AUTONOMOUS_RUN="0"` y sesión normal | Lo mismo que antes, salvo lo que está siempre activo (abajo): los hooks preguntan donde preguntaban. El agente nunca hace merge |
| **Desatendido** | `KIT_AUTONOMOUS_RUN="1"`, o un *background agent* de Cursor aunque el interruptor esté a `"0"` | Ningún hook deja una confirmación pendiente: cada pregunta se convierte en una comprobación automática que permite o deniega, o en una denegación que dice qué hacer en su lugar. Sin `jq`, los hooks deniegan en vez de desactivarse. La puerta del `spec-auditor` exige `APPROVED` antes de escribir código o tests |
| **Ejecución autónoma** | Solo `KIT_AUTONOMOUS_RUN="1"` | Todo lo del modo desatendido, más: el agente puede hacer merge a través de la puerta de merge, se relaja la doctrina de la sección 2, y se protege la configuración del kit y el propio interruptor |

Con el interruptor a `"1"`, el inicio de cada sesión lo avisa (`⚠ autonomous run: ON`).

### Qué decide cada hook en modo desatendido

- **Comandos destructivos de git** (`git reset --hard`, `git clean`): se deniegan y el mensaje propone
  `git restore -- <rutas>` o `git stash push -- <rutas>` sobre rutas explícitas.
- **Instalar dependencias:** solo npm, y con versión exacta (`paquete@1.2.3`). Se comprueba en el
  registro público que el paquete y la versión existen, que el paquete tiene al menos 90 días y la
  versión al menos 7, que tiene repositorio, al menos 10 000 descargas semanales y ningún script de
  instalación. Si algo falla, se deniega diciendo qué comprobación falló. `pnpm dlx`, `yarn dlx`,
  `bunx` y un `npx` que tendría que descargar se deniegan; `npx vitest run` (binario ya instalado)
  pasa. Otros gestores (`pip`, `composer`…) se deniegan.
- **Artefactos de OpenSpec, tests existentes, doctrina y migraciones:** en una ejecución autónoma, los
  artefactos del cambio activo se pueden reescribir antes de la primera auditoría y, después, solo si
  la última auditoría es `APPROVED`. Un test existente solo se puede cambiar si `tasks.md` lo nombra o
  si lo creó la propia rama. La doctrina del kit y las migraciones ya versionadas no se tocan.
- **Puerta de merge:** ver la sección 5.
- **Lecturas de secretos:** `.env` y similares siguen denegados, también a través de `Grep` y `Glob` (en Cursor, `Grep`), en los dos modos.
  `.env.example` y `.env.sample` se pueden leer y editar en los dos modos.
- **Líneas demasiado costosas de comprobar:** una línea con demasiados textos de intérprete o comandos
  (por ejemplo, cientos de `eval` delante de un merge) se deniega antes de que el hook agote su tiempo.
  Un hook que agota su tiempo deja pasar la llamada, así que el tope cierra esa puerta.

### Qué más se deniega en una ejecución autónoma

- Escribir en `.claude/`, `.cursor/` o el perfil autónomo con cualquier forma de la ruta: `./` o `..`,
  barras dobles, prefijos `\\?\` o `\\localhost\C$\`, `/cygdrive/c/…`, otras mayúsculas en Windows, o
  una *junction* o un enlace simbólico que apunte dentro.
- Las formas alternativas de los comandos que escriben: `cp -t`, `cp --target-directory=`, `ln -t`,
  `install -t`, `sed --in-place`, `sed --expression=…`.
- Definir un alias de `gh` o de `git` (`gh alias set`, `git config alias.*`, `git -c alias.*=`): un
  alias podría esconder un merge a la puerta.
- Texto de un intérprete (`python -c`, `node -e`, `eval`…) que nombre `.claude/`, `.cursor/`,
  `sdd-harness.env` o el perfil.
- Cualquier comando que nombre la configuración del kit y no sea de solo lectura (`cat`, `grep`, `ls`,
  `jq`, `git diff`/`show`/`log`/`status`…) ni una herramienta del propio kit (`bash .claude/doctor.sh`,
  `node .claude/hooks/…`). Incluye `curl -o`, `tar -C`, `touch`, `chmod`, `git apply`… y también
  `sed`, porque su comando `w` escribe ficheros: para leer la configuración del kit, `cat` o `grep`.
- Un `git checkout` en un directorio que no se puede resolver (por ejemplo, tras `cd "$X"`).
- Cualquier palabra de un comando que contenga una ruta del kit, se pase como se pase: `node --eval`,
  `python3 -Ic`, `perl -E`, `awk`… También pierden la excepción de solo lectura los comandos con una
  opción que ejecuta o escribe (`rg --pre`, `git -c …`, `git diff --output`, `less -o`, `find -exec`) o
  con una variable que cambia el programa que se lanza (`GIT_PAGER`, `EDITOR`…). Los scripts del kit
  se ejecutan sin opciones: `bash .claude/doctor.sh` pasa, `bash -x .claude/doctor.sh` no.
- Escribir por la shell en `~/.claude/…` o en `.claude/worktrees/`: la memoria se escribe con la
  herramienta de edición, y una ejecución autónoma no usa worktrees.
- Rutas que el guardián no puede resolver: comodines o llaves que podrían apuntar al kit
  (`.cl?ude/`, `.{claude,x}/`), nombres cortos de Windows (`CLAUDE~1`) y **palabras con variables** en
  un comando que no es de solo lectura (`git push origin "$BRANCH"`, `export PATH="$PATH:x"`, cualquier
  comando tras `cd "$X"`). En una ejecución autónoma se escriben los valores literales.
- Una ruta de edición de más de 4 KiB, que no se puede comprobar a tiempo.

### Lo que cuesta cada llamada

Medianas en Windows (Git Bash, 7 ejecuciones), con el interruptor a `"0"`:

| Llamada | Antes de DIS-106 | Ahora |
|---|---|---|
| `Bash` (`ls`) | 1,2 s | 0,76 s |
| `Read` | 0,86 s | 0,47 s |
| `Grep` / `Glob` | sin hook | 0,50 s |
| `Edit` | 1,28 s | 1,02 s |

La fila de `Edit` suma los dos hooks de edición en una rama con un cambio activo; en una rama sin
cambio activo el coste es el mismo que antes (unos 1,3 s).

### Qué está activo siempre, también con el interruptor a `"0"`

- El guardián de shell lee comandos, no texto: un mensaje de commit o un patrón de `grep` que contiene
  `rm -rf` no es un comando.
- Un `rm` o `rmdir` **solo** (sin `&&` ni otros comandos en la línea) sobre rutas literales dentro del
  scratchpad de la sesión no recibe decisión del hook.
- La detección de instalaciones también ve flags delante del paquete (`npm i -D x`).
- Borrar o sustituir el contrato del kit (`rm .claude/sdd-harness.env`) cuenta como escribirlo, y se
  deniega.
- `KIT_SECRET_ALLOWLIST` excluye centinelas de test conocidos del escaneo de secretos del prompt.
- La comprobación de ficheros secretos también se aplica a `Grep` y `Glob`, sin distinguir mayúsculas.
  Un fichero de entorno es `.env`, `.env.<sufijo>`, `<nombre>.env` o `<nombre>.env.<sufijo>`, salvo los
  sufijos `example`/`sample` y los ficheros de código (`config.env.ts` se puede leer y editar; `.env.sh`
  y `.env.md` no cuentan como código y siguen siendo secretos). También se reconocen en rutas
  relativas y con el sufijo de flujo alternativo de Windows (`.env::$DATA`).
- En Cursor, los hooks del kit (sección 7).

## 2. La doctrina que se relaja en una ejecución autónoma

Solo con `KIT_AUTONOMOUS_RUN="1"`. Un *background agent* de Cursor con el interruptor a `"0"` no
recibe ninguna de estas excepciones. Los ficheros de doctrina no cambian; la lista vive aquí, en el
ADR y en la nota de parche local de `docs/project-context.md`.

| Regla | Normalmente | En una ejecución autónoma |
|---|---|---|
| `docs/base-standards.md` §3, regla 2 | Una persona aprueba el plan antes del código | El veredicto `APPROVED` del `spec-auditor` sustituye a esa aprobación; la puerta del `spec-auditor` lo exige antes de escribir código o tests |
| §3, regla 3 | Los tests salen de los escenarios del spec, con supervisión humana | Se escriben sin supervisión |
| §3, regla 4 | Un test no se modifica para que pase | Solo se editan tests nombrados en `tasks.md` o creados en la rama |
| §3, regla 8 | El «porqué» de PR y ADR lo escribe una persona | Lo escribe el agente y lo marca como texto suyo |
| §3, regla 9 | Los merges los firma una persona | El agente hace merge a través de la puerta de merge |
| `docs/openspec-tasks-mandatory-steps.md` §3, Pre-merge Review, punto 5 | El agente nunca hace merge | El agente hace merge después del commit de archivo, a través de la puerta |

## 3. El perfil autónomo de Claude Code

El `~/.claude/settings.json` personal puede tener reglas `ask` (`npm install*`, `rm *`, `WebFetch`…)
que obligan a confirmar incluso en auto mode, y no se pueden quitar desde otro fichero de settings.
Por eso una ejecución autónoma arranca Claude Code con `CLAUDE_CONFIG_DIR` apuntando a un **perfil
aparte**, que tiene su propio `settings.json`, su propio login, su configuración de MCP, su memoria y
sus transcripciones.

**Crear el perfil** (una vez):

1. Crea la carpeta, por ejemplo `~/.claude-autonomous`.
2. Copia en ella `ai-specs/templates/autonomous/claude-settings.json.tpl` como `settings.json` y
   sustituye `<owner>/<repo>` (por ejemplo `DisTinta/AI4Devs-finalproject`), `<base-branch>`
   (`final-project-CRN`) y `<db-name>` (`codemind`). La plantilla no tiene reglas `ask`, deniega la
   lectura de `.env` y los flags que se saltan los permisos, y autoriza en `autoMode.allow` el merge
   hacia la rama base.
3. Abre Claude Code con el perfil (siguiente apartado), haz `/login`, aprueba los servidores MCP del
   proyecto (`.mcp.json`: Linear, Context7, Playwright) y autentica Linear en `/mcp`. Sal con `/exit`.
4. Comprueba que la autorización está cargada: debe salir la línea del merge.

PowerShell:

```
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-autonomous"; claude auto-mode config | Select-String "gh pr merge"
```

Bash:

```
CLAUDE_CONFIG_DIR="$HOME/.claude-autonomous" claude auto-mode config | grep "gh pr merge"
```

**Lanzar una sesión con el perfil**, desde la carpeta del repositorio:

PowerShell (la variable queda puesta en esa terminal; ciérrala al terminar):

```
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-autonomous"; claude
```

Bash (solo para ese comando):

```
CLAUDE_CONFIG_DIR="$HOME/.claude-autonomous" claude
```

Dentro del perfil, sus propios ficheros son configuración del kit: en una ejecución autónoma el
agente no puede escribir su memoria ni sus planes (`<perfil>/projects/…`).

## 4. Antes de cada ejecución: el preflight

1. La rama base está protegida en GitHub: PR obligatorio, los cinco checks de `ci.yml` (`scope`,
   `quality`, `verify`, `mutation`, `secrets`) obligatorios, `enforce_admins` activo, sin revisiones
   obligatorias y `strict` desactivado. Es la red de seguridad del lado del servidor: aguanta aunque un
   hook no vea un comando.
2. La cuenta de `gh` activa es la que tiene acceso de administrador al repositorio (en Codemind,
   `DisTinta`): sin ella, GitHub responde «Not Found» a la consulta de la protección.
3. Pon a mano `KIT_AUTONOMOUS_RUN="1"` (y `AUTONOMOUS_MERGE_BASE`, si la base no es la de siempre).
4. Ejecuta el preflight y corrige cada `FAIL`:

```
bash .claude/doctor.sh --autonomous --config-dir ~/.claude-autonomous
```

```
pwsh .claude/doctor.ps1 -Autonomous -ConfigDir "$HOME\.claude-autonomous"
```

Sin `--config-dir`/`-ConfigDir` usa `CLAUDE_CONFIG_DIR`. Comprueba, entre otras cosas: el interruptor y
la base, el perfil sin reglas `ask` y con la autorización del merge que nombra la base, `jq`, los hooks
registrados, `gh` autenticado, que la última CI de la base terminó en verde y la protección de la base.
Si la base se protege con *rulesets* en vez de la protección clásica, exige que pidan PR y checks y
que **no tengan actores con permiso para saltárselas**; sin acceso de administrador no puede leerlos y
lo dice. La autorización del merge tiene que estar en una sola regla del perfil que nombre a la vez
`gh pr merge` y la base. Sale con código distinto de 0 si hay algún `FAIL`. Docker y las exclusiones de
Defender (también desde Git Bash) solo dan `WARN`.
Si alguna protección del kit está desactivada en local, también es `WARN`: el modo desatendido aplica
sus reglas igualmente.

### Prueba en seco del merge

Antes de la primera ejecución, o tras cambiar el perfil o la protección, conviene comprobar que el
merge funciona de punta a punta en una base desechable. Así se hizo en DIS-106 (informe
`openspec/changes/archive/…-autonomous-run-switch/reports/2026-10-21-12-manual-interface-testing.md`):

1. Con el interruptor a `"0"`, crea la base desechable `tmp-autonomous-dry-run` desde la base real y
   súbela. Crea la rama de cabeza en un worktree del scratchpad, con un commit de un fichero que no
   esté bajo `openspec/changes/archive/`, y súbela. La copia principal se queda en su rama.
2. Protege `tmp-autonomous-dry-run` como la base real.
3. Pon a mano `KIT_AUTONOMOUS_RUN="1"` y `AUTONOMOUS_MERGE_BASE="tmp-autonomous-dry-run"`, y cambia las
   dos menciones de la base en el `settings.json` del perfil.
4. Abre un PR desechable (sin `DIS-` en el título) y espera su CI. En una sesión con el perfil, desde la
   copia principal, pide solo `gh pr merge <n> --merge`: la puerta lo **deniega** («no archived OpenSpec
   change»). Añade un fichero bajo `openspec/changes/archive/` en la rama de cabeza, súbelo, espera la
   CI y repite: la puerta lo **permite**. Anota si el clasificador de auto mode también lo permite.
5. Restaura el interruptor, la base y el perfil; quita la protección de la base desechable; quita el
   worktree y borra las ramas.

Pega en esa sesión instrucciones cortas, de una línea: un texto largo pegado desde la terminal puede
llegar cortado.

## 5. La puerta de merge

En una ejecución autónoma el agente solo hace merge con `gh pr merge <n> --merge`, solo en la línea, y
el hook `autonomous-merge-gate` lo permite únicamente si:

- el PR apunta a `AUTONOMOUS_MERGE_BASE`;
- todos sus checks han terminado en `SUCCESS`, `NEUTRAL` o `SKIPPED` (un push que solo toca el archivo
  deja `quality`, `verify` y `mutation` en `SKIPPED`, y cuenta como verde);
- GitHub lo da como `MERGEABLE`;
- lleva algún fichero bajo `openspec/changes/archive/`;
- no toca nada bajo `.claude/` ni `.cursor/`, en ninguna combinación de mayúsculas, ni renombra o borra
  nada de ahí (la puerta consulta también la lista de ficheros del PR con su ruta anterior);
- la base está protegida en GitHub.

Si falla alguna condición, el motivo las nombra todas a la vez. Por eso, aunque la forma del comando
sea incorrecta, la puerta consulta GitHub antes de denegar (hasta 15 s).

Se deniegan `--squash`, `--rebase`, `--admin`, `--auto`, `--delete-branch`, varios comandos en la
misma línea, variables `GH_*` y los merges por `gh api` o dentro de texto de un intérprete. Un push
directo a la base, un `git merge` local sobre ella o cambiar su protección también se deniegan.

Un ticket sin cambio de OpenSpec (por ejemplo, solo documentación) no lo puede integrar el agente: lo
integra la autora.

Después, el clasificador de auto mode decide también. En la prueba en seco de DIS-106, la
autorización del perfil pesó más que su regla de serie «Merge Without Review». El clasificador no es
determinista; si deniega, se aplica la alternativa de la sección 6.

## 6. El contrato del workflow

Lo que el script del workflow y cada agente cumplen en una ejecución autónoma. Es el mismo contrato
que `.cursor/rules/20-openspec.mdc` (punto 9).

**Pasos por ticket**, cada uno en un subagente nuevo: `/enrich-us` → `/opsx:propose` → `spec-auditor`
→ `/opsx:apply` en TDD → PR → `/show-spec-working`, `/verify-against-spec` y `/adversarial-review` →
correcciones en el mismo PR → `/opsx:archive` → merge. **Modelos:** Opus en los pasos de juicio
(enriquecer, proponer, auditar, revisar), Sonnet en los mecánicos.

**Reglas:**

- No se pregunta nada: se decide como lead engineer y cada decisión queda en el ticket y en
  `design.md` → Follow-ups, con su destino A/B/C/D.
- `verify-against-spec` y `adversarial-review` se ejecutan en línea (su sección *Inline mode*), nunca
  como fork: un fork no deja su informe a quien lo lanzó.
- `tasks.md` nombra cada test existente que cambia una tarea; si no, la protección lo deniega.
- El código no se escribe por la shell (`cat > fichero`, `sed -i`): se usan las herramientas de
  edición, que la puerta del `spec-auditor` sí ve.
- El texto que menciona comandos (documentación, prompts, informes) también se escribe con las
  herramientas de edición, nunca en un heredoc pasado a un intérprete (`python - <<EOF`): el guardián
  de shell compara el texto de un intérprete con patrones, y una frase como «`git reset --hard`» se
  deniega como si fuera el comando.
- El agente escribe el «porqué» de PR y ADR y lo marca como texto suyo.
- Tras una instalación ya validada, `npm audit --audit-level=high`; un hallazgo nuevo alto o crítico
  detiene el ticket.
- No se toca ni se hace commit de `.claude/` ni de `.cursor/`; se preparan para commit rutas
  explícitas, nunca `git add -A` ni `git commit -a`.
- No se usan worktrees aislados: un subagente en un worktree nuevo leería el `KIT_AUTONOMOUS_RUN="0"`
  del commit, y sus hooks volverían a preguntar.
- Las esperas (CI, merges) se hacen con la herramienta `Monitor`, nunca con `sleep`.
- El merge es solo `gh pr merge <n> --merge`, a través de la puerta. Si la puerta lo deniega, se vuelve
  a leer el PR antes de reintentar: puede haber cambiado entretanto.

**Paradas limpias** (ticket a *In Review* con un comentario en español; los tickets independientes
siguen):

- una auditoría `CHANGES REQUIRED`: en una ejecución autónoma los artefactos ya auditados no se
  pueden reescribir, así que el ticket vuelve a la autora con el informe de la auditoría;
- la CI en rojo después de 2 correcciones;
- un conflicto de merge;
- el límite de uso;
- un permiso denegado sin alternativa;
- una corrección de código necesaria después de `/opsx:archive` (ya no hay cambio activo);
- **el clasificador deniega el merge:** el ticket queda en *In Review* con el comentario y se vigila
  el PR con `Monitor` hasta que la autora lo integre.

## 7. Cursor

`.cursor/hooks.json` ejecuta los mismos scripts que Claude Code, con
`node .claude/hooks/invoke.cjs --client cursor`, que adapta la entrada y la respuesta al formato de
Cursor:

| Evento de Cursor | Hooks |
|---|---|
| `sessionStart` | `session-context` |
| `beforeShellExecution` | `block-dangerous-bash`, `docs-gate`, `autonomous-merge-gate` |
| `beforeReadFile` | `block-secret-reads` |
| `preToolUse` (`Write\|Delete`) | `protect-specs-and-tests`, `spec-audit-gate` |
| `afterFileEdit` | `post-edit-quality`, `validate-tasks` |
| `beforeSubmitPrompt` | `block-secrets` |
| `stop` | `verify-tests` |

- **La excepción del `ask`:** `preToolUse` y `beforeReadFile` no aceptan `ask`. En una sesión
  interactiva, donde Claude Code preguntaría, Cursor deja pasar la edición con un aviso al usuario y al
  agente. En modo desatendido es una denegación, como en Claude Code.
- **Background agents:** siempre son desatendidos, aunque el interruptor esté a `"0"`, así que nunca
  esperan una confirmación. Pero solo hacen merge o reciben las excepciones de la sección 2 si la
  autora ha puesto el interruptor a `"1"`. Cursor solo documenta `is_background_agent` en
  `sessionStart`, que los agentes en la nube no ejecutan: un agente en la nube cuyos otros eventos no
  lo traigan solo es desatendido a través del interruptor.
- **`cursor-agent`** (la CLI): sus permisos van en `<proyecto>/.cursor/cli.json`, a partir de
  `ai-specs/templates/autonomous/cursor-cli.json.tpl` (permite `gh pr merge`, `gh pr checks`,
  `gh pr view` y los tests; deniega leer `.env` y escribir en `.claude/`, `.cursor/` y `secrets/`).
- Cursor no tiene clasificador de auto mode: en Cursor la puerta de merge y la protección de la rama
  base son los únicos controles del merge.
- Cursor no tiene evento de denegación: sus denegaciones solo quedan en la transcripción del agente.

## 8. Cerrar una ejecución

1. Pon a mano `KIT_AUTONOMOUS_RUN="0"` (y la base, si la cambiaste). Comprueba que `git status` no
   propone hacer commit de `.claude/sdd-harness.env`.
2. Repasa `.claude/autonomous-denials.log`: una línea JSON por cada denegación de la ejecución
   (fecha, herramienta, motivo, entrada con los secretos sustituidos por `[REDACTED]` y, si lo hay, el
   veredicto del clasificador). Es local y no se versiona. Cada denegación es o una protección que
   funcionó o una regla que falta en el kit.
3. Vuelve la cuenta de `gh` a la de uso normal.

## 9. Lo que no está verificado

- **Herencia del perfil en subagentes.** La documentación de Claude Code no dice si los subagentes y
  los agentes de un Workflow heredan `CLAUDE_CONFIG_DIR`. Corren en el mismo proceso, así que deberían
  leer la misma configuración, pero la prueba en seco de DIS-106 hizo el merge desde la sesión
  principal del perfil, no desde un subagente.
- **Cursor en vivo.** En DIS-106 no estaba instalado `cursor-agent`: se ejecutaron todas las líneas de
  `.cursor/hooks.json` con entradas en formato Cursor, no una sesión real. Los formatos salen de la
  documentación de Cursor.
- **El clasificador.** No es determinista: que haya permitido el merge en la prueba en seco no
  garantiza que lo permita siempre.
- **Huecos aceptados:**
  - el código que ejecuta un intérprete que no es de shell (`node -e`, `python -c`) solo se compara
    con patrones de texto: en una ejecución autónoma se deniega si nombra la configuración del kit, pero
    una ruta construida por partes no se ve;
  - un script escrito y luego ejecutado (`bash x.sh`, `source x.sh`) no se inspecciona por dentro;
  - `git apply` o `git stash pop` sin ninguna ruta del kit en la línea no se deciden;
  - una búsqueda con `Grep` sobre una carpeta entera, sin patrón de ficheros, no se puede decidir: el
    hook no sabe qué ficheros tocará;
  - la lectura de un `.env.*` por la shell (`cat .env.local`) no la para ningún hook.

  En Claude Code queda el clasificador; en los dos clientes, la protección de la rama base.
