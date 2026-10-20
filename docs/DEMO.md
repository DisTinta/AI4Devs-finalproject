# Guion de la demo

Los seis pasos de `readme.md` §1.3, ejecutados desde una terminal contra el proyecto de muestra
`acme-shop`, más un recorrido por la web. Cada paso da el comando exacto y, debajo, la salida de una
ejecución real pegada tal como se capturó. Donde la Entrega 2 todavía no llega a lo que describe §1.3,
el paso lo dice y muestra lo que hace hoy el sistema.

**Los comandos son los mismos en PowerShell y en Bash** (Windows, macOS o Linux): se escriben tal cual,
sin exportar variables ni definir funciones. Los comandos que lee `.env` lo cargan solos, y una
variable ya definida en la terminal gana sobre `.env`.

## Cómo se capturó

| Dato | Valor |
|---|---|
| Fecha | 2026-10-20 |
| Commit | `da94264` (rama `feature/DIS-103-real-model-clean-clone`), clonado de GitHub en una carpeta nueva para cada terminal |
| Máquina | Windows 11 Pro, Docker Desktop (Docker Engine 29.8.1, Compose v5.5.1), Git 2.45.1 |
| Terminales | PowerShell 7.6.6 y Git Bash (GNU bash 5.2.26): la guía entera salvo `Probar con un modelo real` en cada una, con salidas idénticas salvo los campos que cambian en cada ejecución |
| Node / npm | v24.11.1 / 11.19.0 (el proyecto necesita Node 20.11 o posterior; la CI usa Node 20) |
| LLM | ninguno: **modo evaluación**, todas las variables `LLM_*` vacías |
| Base de datos | una base de datos nueva y vacía (ver el paso 0) |
| `Probar con un modelo real` | 2026-10-20, rama `feature/DIS-103-real-model-clean-clone` clonada en una carpeta nueva, Git Bash: Ollama 0.40.5 **solo en CPU**, `qwen2.5-coder`, `OLLAMA_CONTEXT_LENGTH=16384`, `LLM_TIMEOUT_MS=1200000`. Duraciones medidas: CLI 8 min 28 s; API 300,9 s (pregunta repetida con la caché desactivada); web en Chromium 597,7 s (otra pregunta, «¿Qué hace ShippingService?») |

Los únicos cambios hechos a la salida pegada:

- **(a)** `npm run up` se queda en primer plano (`npm run dev`); su salida se corta tras las líneas de
  arranque, marcadas con `[… sigue en marcha; se para con Ctrl+C]`.
- **(b)** la ruta absoluta del clon se sustituye por `<repo>`; el separador que la sigue es el del
  sistema (`\` en Windows, en las dos terminales; `/` en Linux y macOS).
- **(c)** se quitan los códigos de color de la terminal.
- **(d)** el nombre de la máquina en la línea de arranque de la API se sustituye por `<host>`.

Lo que no sale de la ejecución literal de la guía: no se creó `.env` (quien capturó la guía no podía
escribir ficheros `.env`); `POSTGRES_PORT` y su `DATABASE_URL`, con un puerto libre distinto en cada
clon, y en `Probar con un modelo real` las variables `LLM_*`, se dieron en el entorno de cada comando.
Una variable ya definida gana sobre `.env`, y sin `.env` las variables `LLM_*` quedan sin definir,
como vacías las deja `.env.example` (modo evaluación); todas las salidas coincidieron con las de la
captura anterior, hecha con `.env`. La salida de `docker compose` con el puerto ocupado de `Antes de empezar` es de la captura
anterior de la guía (2026-10-19), cuando la captura siguió esa rama. La parada con Ctrl+C no se
capturó: `Parar el sistema` la describe en el texto. El par de Ollama de `Probar con un modelo real` se ejecutó
una vez en PowerShell y otra en Git Bash con las variables que obligan a esta máquina a usar solo la
CPU (su GPU no funciona con Ollama). `npm` muestra en su línea `> node
scripts/demo-ask.mjs …` el id del proyecto como `***` (oculta lo que parece un token); el id llega
entero a la API.

**Campos que cambian en cada ejecución**, que hay que ignorar al comparar: el número de paquetes, el
tiempo y las líneas de auditoría de `npm install`; el prefijo `(node:<pid>)` y el `ready in … ms` de
Vite; `time` y `pid` en la línea de log de la API; `latencyMs` en las respuestas de la API; y el
prefijo de los nombres de Docker (`dis103-bash-postgres-1`, `dis103-pwsh_pgdata`…), que es el nombre de la
carpeta del clon (`ai4devs-finalproject` con el `git clone` de `readme.md` §1.4). El id del proyecto lo
fija la semilla.

## Antes de empezar

Comprueba que Docker está en marcha, que Node es la versión 20.11 o posterior y que Git está instalado:

```shell
docker info
node -v
git --version
```

`docker info` debe terminar sin error (si dice que no puede conectar con el daemon, arranca Docker
Desktop); `node -v` debe mostrar `v20.11.0` o posterior.

Desde la raíz de un clon del repositorio (`readme.md` §1.4), copia la configuración de ejemplo, que
deja todas las variables `LLM_*` vacías (modo evaluación, sin cuenta ni API key):

```shell
cp .env.example .env
```

**Si el puerto 5432 ya está ocupado.** El contenedor de PostgreSQL publica el puerto `POSTGRES_PORT`
de `.env` (`5432` por defecto). Si otro contenedor ya lo usa, el paso 0 se para en su primer paso y
`docker compose` dice `port is already allocated`; si lo usa otro programa, dice
`Ports are not available`. Con un PostgreSQL local ya escuchando en 5432, el arranque puede llegar más
lejos y fallar en `npm run db:migrate` con `password authentication failed for user "codemind"`. En
cualquiera de los tres casos, abre `.env` con un editor de texto (no con una redirección de la
terminal) y cambia a un puerto libre las dos líneas, con el mismo número. Así terminó el primer
`npm run up` de la captura, con el 5432 ocupado por otro contenedor:

```text
[up] docker compose up -d --wait
…
 Container e2e-bash-postgres-1 Starting 
Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint e2e-bash-postgres-1 (…): Bind for 0.0.0.0:5432 failed: port is already allocated
[up] "docker compose up -d --wait" failed with exit code 1
```

Las dos líneas de `.env`, con `5433` como ejemplo de puerto libre:

```text
POSTGRES_PORT=5433
DATABASE_URL=postgresql://codemind:codemind@localhost:5433/codemind
```

Después vuelve a ejecutar el paso 0.

## Paso 0 — Arrancar el sistema

Terminal 1, desde la raíz del clon:

```shell
npm run up
```

```text
> codemind@0.0.1 up
> node scripts/up.mjs

[up] docker compose up -d --wait
 Network dis103-bash_default Creating 
 Volume dis103-bash_pgdata Creating 
 Network dis103-bash_default Creating 
 Volume dis103-bash_pgdata Creating 
 Volume dis103-bash_pgdata Created 
 Volume dis103-bash_pgdata Created 
 Network dis103-bash_default Created 
 Network dis103-bash_default Created 
 Container dis103-bash-postgres-1 Creating 
 Container dis103-bash-postgres-1 Created 
 Container dis103-bash-postgres-1 Starting 
 Container dis103-bash-postgres-1 Started 
 Container dis103-bash-postgres-1 Waiting 
 Container dis103-bash-postgres-1 Healthy 
[up] npm install
npm warn deprecated @babel/plugin-proposal-explicit-resource-management@7.27.4: This proposal has been merged to the ECMAScript standard and thus this plugin is no longer maintained. Please use @babel/plugin-transform-explicit-resource-management instead.
npm warn deprecated whatwg-encoding@3.1.1: Use @exodus/bytes instead for a more spec-conformant and faster implementation
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 609 packages, and audited 619 packages in 1m

168 packages are looking for funding
  run `npm fund` for details

18 vulnerabilities (5 low, 6 moderate, 4 high, 3 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   tree-sitter-php@0.24.2 (install: node-gyp-build)
npm warn install-scripts   esbuild@0.21.5 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
[up] npm run db:migrate

> codemind@0.0.1 db:migrate
> tsx --import=./scripts/load-env.mjs packages/adapters/store-postgres/src/migrate.ts up

> Migrating files:
> - 0001_graph-l1
> - 0002_history-claims
> - 0003_indexes-stale
> - 0004_query-log-verification
### MIGRATION 0001_graph-l1 (UP) ###
### MIGRATION 0002_history-claims (UP) ###
### MIGRATION 0003_indexes-stale (UP) ###
### MIGRATION 0004_query-log-verification (UP) ###
[up] npm run db:seed

> codemind@0.0.1 db:seed
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts

1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
[up] node fixtures/build-history.mjs acme-shop
acme-shop: 32 commits, 3 authors -> <repo>\fixtures\acme-shop\.git
[up] npm run dev

> codemind@0.0.1 dev
> concurrently --kill-others-on-fail "npm -w packages/api run dev" "npm -w packages/web run dev"

(node:37328) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
[0] 
[0] > @codemind/api@0.0.1 dev
[0] > node --watch --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts
[0] 
[1] 
[1] > @codemind/web@0.0.1 dev
[1] > vite
[1] 
[1] 
[1]   VITE v5.4.21  ready in 1332 ms
[1] 
[1]   ➜  Local:   http://localhost:5173/
[1]   ➜  Network: use --host to expose
[0] {"level":30,"time":1792487313238,"pid":30948,"hostname":"<host>","msg":"Server listening at http://127.0.0.1:3000"}
[… sigue en marcha; se para con Ctrl+C]
```

`npm run up` escribe una línea `[up] <comando>` antes de cada paso: arranca PostgreSQL y espera a que
acepte conexiones, instala las dependencias, migra la base de datos, carga la semilla, construye el
historial de Git de `acme-shop` (`fixtures/acme-shop/.git`, unos 11 s; solo lo leen las respuestas en
vivo, ver [Probar con un modelo real](#probar-con-un-modelo-real)) y arranca la API
(`http://127.0.0.1:3000`) y la web (`http://localhost:5173/`). Se queda en primer plano: el resto de la
demo va en una **segunda terminal**, abierta en la misma carpeta.

> **Entrega 2.** La semilla carga **un** proyecto, `1 project loaded`; `task-api` entra en la semilla
> con CM-HU-18 (PH-02). `readme.md` §1.4 cita un extracto de esta salida.

Terminal 2. `npm run cli` lee `DATABASE_URL` de `.env`, así que basta con:

```shell
npm run cli -- projects
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts projects

acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
```

## Paso 1 — Preguntar cómo se calcula el precio final

La CLI imprime la respuesta, cada afirmación tipada con su evidencia `ruta:inicio-fin`, y los
fragmentos citados (cinco líneas como máximo cada uno):

```shell
npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask acme-shop ¿Cómo se calcula el precio final de un pedido?

El precio final de un pedido se calcula mediante el método `compute()` en la clase `PriceCalculator`. Este método toma en cuenta el subtotal, realiza descuentos, agrega impuestos y envío, y devuelve el total final. El descuento y la tax se aplican en ese orden específico.

statements:
1. [FACT] El método `compute()` en la clase `PriceCalculator` es el encargado de calcular el precio final de un pedido.
   evidence: app/Services/PriceCalculator.php:16-44
2. [FACT] Primero se aplica el descuento al subtotal.
   evidence: app/Services/PriceCalculator.php:16-44
3. [INFERENCE] Luego se calcula el impuesto sobre el valor descontado.
   evidence: app/Services/PriceCalculator.php:16-44
4. [INFERENCE] Finalmente se suman el impuesto y el envío al valor descontado para obtener el precio final.
   evidence: app/Services/PriceCalculator.php:16-44

evidence:
app/Services/PriceCalculator.php:16-44
    class PriceCalculator
    {
        public function __construct(
            private readonly DiscountService $discounts,
            private readonly TaxService $taxes,
    … (+24 lines)
```

La CLI no imprime el uso de tokens; la API sí. `npm run demo:ask` envía la pregunta a
`POST /api/projects/{projectId}/ask` (el id es el que imprimió `projects`) y muestra el estado HTTP,
cuántas afirmaciones y evidencias volvieron y el bloque `usage`, o el cuerpo del error cuando el estado
no es 2xx. Termina con código `0` para un estado 2xx y `1` para cualquier otro:

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"
```

```text

> codemind@0.0.1 demo:ask
> node scripts/demo-ask.mjs *** ¿Cómo se calcula el precio final de un pedido?

HTTP 200
{
  "statements": 4,
  "evidence": 4,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 7123,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 66,
    "cacheHit": true,
    "generation": {
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0
    },
    "verification": {
      "calls": 0,
      "cacheHits": 0,
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0,
      "latencyMs": 0
    }
  }
}
```

> **Entrega 2.** En modo evaluación cada pregunta contestada sale de las respuestas golden que cargó
> `db:seed`, así que esta primera llamada ya es un acierto de caché: `cacheHit: true`, `costUsd: 0`,
> `inputTokens: 0`. `savingsPct: 100` es el ahorro de una respuesta servida desde la caché frente a la
> línea base guardada de contexto en bruto (`baselineTokens`, estimada como caracteres / 4). El ahorro
> de una generación en vivo se mide en la Entrega 3 (`readme.md` §2.6).

## Paso 2 — Abrir una evidencia

Todas las afirmaciones de arriba citan `app/Services/PriceCalculator.php:16-44`. La cita es relativa a
la raíz del proyecto de muestra, `fixtures/acme-shop`; `npm run demo:excerpt` imprime esas líneas del
fichero:

```shell
npm run demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44
```

```text

> codemind@0.0.1 demo:excerpt
> node scripts/demo-excerpt.mjs acme-shop app/Services/PriceCalculator.php:16-44

class PriceCalculator
{
    public function __construct(
        private readonly DiscountService $discounts,
        private readonly TaxService $taxes,
        private readonly ShippingService $shipping,
    ) {
    }

    public function compute(Order $order): Money
    {
        $subtotal = $order->subtotal;                       // magic accessor
        $discount = $this->discounts->discountFor($order, $subtotal);
        $taxable = $subtotal->subtract($discount);

        $tax = $this->taxes->taxFor($order, $taxable);
        $shipping = $this->shipping->shippingFor($order, $taxable);

        return $taxable->add($tax)->add($shipping);
    }

    /** Returns the discounted amount before tax and shipping. */
    public function taxableBase(Order $order): Money
    {
        $subtotal = $order->subtotal;

        return $subtotal->subtract($this->discounts->discountFor($order, $subtotal));
    }
}
```

Son las líneas del fragmento que imprimió la CLI (las cinco primeras) y que devolvió la API (todas).
`demo:excerpt` solo lee ficheros de `fixtures/<proyecto>`: una ruta que sale de él se rechaza.

## Paso 3 — Preguntar algo que el repositorio no puede responder

Los reembolsos no están implementados en `acme-shop`:

```shell
npm run cli -- ask acme-shop "¿Cómo se gestionan los reembolsos de un pedido?"
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask acme-shop ¿Cómo se gestionan los reembolsos de un pedido?

UNKNOWN (no-anchor)
```

`UNKNOWN (no-anchor)`: ningún símbolo del grafo ancla la pregunta, así que el sistema dice que no lo
sabe en lugar de inventar una respuesta. Lo decide antes de consultar ningún modelo ni la caché, y
termina con código `0` porque `UNKNOWN` es una respuesta.

## Paso 4 — Preguntar por el impacto de cambiar los descuentos

```shell
npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts impact acme-shop cambiar el cálculo de descuentos

not implemented — pending Ticket 1/2
```

Termina con código `0`.

> **Entrega 2.** `impact` todavía es un stub. El análisis de impacto, que separa el grafo determinista
> de la señal histórica, es CM-HU-16, previsto para la Entrega 3.

## Paso 5 — Repetir el paso 1

La misma pregunta del paso 1, literalmente:

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"
```

```text

> codemind@0.0.1 demo:ask
> node scripts/demo-ask.mjs *** ¿Cómo se calcula el precio final de un pedido?

HTTP 200
{
  "statements": 4,
  "evidence": 4,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 7123,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 26,
    "cacheHit": true,
    "generation": {
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0
    },
    "verification": {
      "calls": 0,
      "cacheHits": 0,
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0,
      "latencyMs": 0
    }
  }
}
```

Una variante que solo cambia mayúsculas, tildes y puntuación. **No** es una reformulación: tiene la
misma clave normalizada, así que es la misma entrada de la caché (DIS-21):

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "como se calcula el precio final de un pedido"
```

```text

> codemind@0.0.1 demo:ask
> node scripts/demo-ask.mjs *** como se calcula el precio final de un pedido

HTTP 200
{
  "statements": 4,
  "evidence": 4,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 7123,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 26,
    "cacheHit": true,
    "generation": {
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0
    },
    "verification": {
      "calls": 0,
      "cacheHits": 0,
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0,
      "latencyMs": 0
    }
  }
}
```

> **Entrega 2.** `readme.md` §1.3 pide *reformular* la pregunta y obtener un acierto de caché por
> similitud. Eso es CM-HU-19 (PH-05); hoy un acierto de caché necesita la misma pregunta normalizada,
> como arriba. Y como el paso 1 ya se sirvió desde la caché (modo evaluación), lo que muestra este paso
> es que la pregunta repetida resuelve a la misma entrada, con `cacheHit: true` y `costUsd: 0`. El
> fallo de caché de una primera pregunta solo se ve en modo vivo, con `LLM_*` definidas, que esta
> captura no usa.

## Paso 6 — Cambiar a `task-api` y repetir el paso 1

```shell
npm run cli -- ask task-api "¿Cómo se calcula el precio final de un pedido?"
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask task-api ¿Cómo se calcula el precio final de un pedido?

{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
```

> **Entrega 2.** `task-api`, la muestra en TypeScript, todavía no está en la semilla (`projects` en el
> paso 0 solo listó `acme-shop`), así que la CLI responde `PROJECT_NOT_FOUND` en stderr y termina con
> código `1`. Entra en la semilla con CM-HU-18 (PH-02).

## Comprobar la instalación

`npm run verify` hace cada pregunta golden de la semilla y compara la estructura de cada respuesta con
la guardada, sin llamar a ningún modelo (`docs/DEPLOYMENT.md` →
[Verificar una instalación](DEPLOYMENT.md#verificar-una-instalación) explica sus fallos). Termina con
código `0`:

```shell
npm run verify
```

```text

> codemind@0.0.1 verify
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts

✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
```

## Recorrido por la web

Con `npm run up` en marcha, abre `http://localhost:5173/` en el navegador. Las dos pantallas siguen los
wireframes de `readme.md` §1.3 (`images/pantalla-1-seleccion.svg`, `images/pantalla-2-consulta.svg`).

**Pantalla 1 — Selección de proyecto** (`/`):

1. Arriba, la cabecera «CODEMIND» con «Comprensión de repositorios con evidencia verificable»; debajo,
   el título «Elige un proyecto para explorar» y «Repositorios precargados · sin registro · sin
   instalación».
2. La tarjeta de acme-shop: «PHP / Laravel» y sus cuatro recuentos (ficheros, símbolos, aristas y
   commits del grafo de la semilla), la insignia «✓ indexado» y, en cuanto la API contesta a su
   comprobación de salud, la insignia «listo» (mientras tanto, «comprobando…»).
3. El enlace «Explorar proyecto →» abre la pantalla 2 de ese proyecto.
4. Debajo de la tarjeta, «+ Indexar mi propio repositorio» es una indicación, no un botón: muestra el
   comando de la CLI (`npm run cli -- index <carpeta> --name <nombre> --language php`) y sus
   requisitos.

**Pantalla 2 — Consulta con evidencia verificada** (`/p/<id del proyecto>`):

5. Arriba, la barra del proyecto: «←» (vuelve a la pantalla 1), «acme-shop» y «PHP / Laravel · 170
   aristas»; debajo, el campo de la pregunta con el botón «→».
6. «Prueba:» y las tres preguntas sugeridas, que son las preguntas golden de la semilla: «¿Cómo se
   calcula el precio final de un pedido?», «¿Cómo se validan los cupones?» y «¿Qué hace OrderObserver
   al crear un pedido?». Pulsar una la envía; en modo evaluación las tres se responden desde la caché.
7. «Respuesta»: el texto de la respuesta y sus afirmaciones numeradas, cada una con la insignia de su
   tipo, «HECHO» o «INFERIDO», la de su verificación, «verificado» o «sin verificar», y la cita que la
   respalda («Evidencia: ev-1»). Las inferidas se destacan con fondo amarillo.
8. «Evidencia»: una entrada por cita, «ev-1 · app/Services/PriceCalculator.php:16-44». Al pulsarla (o
   con Intro o Espacio) se despliega el mismo fragmento que imprimió `npm run demo:excerpt` en el
   paso 2; al pulsarla otra vez se pliega.
9. Debajo, el panel de uso: «Confianza» con su valor (0.78 en la captura), los tokens («0 tokens»), el
   coste («$0»), la latencia en milisegundos, «ahorro 100 % vs bruto», «caché ✓» y la línea base («7 123
   tokens sin selección de contexto → 0 con CODEMIND»). En modo evaluación todas las preguntas sugeridas son aciertos de caché.
10. Una pregunta libre escrita en el campo, como «¿Qué hace ShippingService con los pedidos
    internacionales?», muestra en modo evaluación el aviso «Hace falta un modelo de lenguaje», que
    explica que la API solo responde las preguntas que tiene en caché y que para preguntas libres hay
    que configurar las variables `LLM_*`; añade que las preguntas sugeridas siguen respondiendo desde la
    caché.
11. Una pregunta que no nombra nada del código, como la del paso 3 («¿Cómo se gestionan los reembolsos
    de un pedido?»), muestra «Sin respuesta verificada», la frase que explica el motivo y «Motivo:
    no-anchor»: CODEMIND prefiere no inventar una respuesta.

**La API no disponible.** Para ver este estado, para el sistema (ver
[Parar el sistema](#parar-el-sistema)) y arranca solo la web:

```shell
npm -w packages/web run dev
```

12. En `http://localhost:5173/` la tarjeta de acme-shop sigue visible, sin «listo», y entre el subtítulo
    y la tarjeta aparece la alerta «La API de CODEMIND no está disponible. Puedes ver los proyectos, pero
    no preguntar hasta que vuelva. Arráncala con npm run up y pulsa Reintentar.» con el botón
    «Reintentar». Pulsarlo vuelve a comprobar la API una sola vez; si sigue parada, la alerta se queda.
    Para la web con Ctrl+C.

**Diferencias con los wireframes**, por los datos de la Entrega 2: hay una sola tarjeta (`task-api`
entra en la semilla con CM-HU-18), los recuentos son los del grafo de la semilla y no los ilustrativos
del wireframe, la pantalla 2 no tiene el botón «⟳» ni evidencias de PR (el historial de Git como
evidencia llega en la Entrega 3), las preguntas sugeridas son las golden y no las del wireframe, y el
indexado de un repositorio propio es una indicación del comando de la CLI en lugar de un botón. Los
valores del panel de uso son los de una respuesta servida desde la caché (0 tokens, «$0»), no los del
wireframe, que ilustra una generación en vivo.

## Probar con un modelo real

Hasta aquí todo funciona en modo evaluación, sin ningún modelo: las preguntas golden salen de la caché
y cualquier otra responde `UNKNOWN (llm-required)`. Para hacer preguntas libres hace falta un endpoint
compatible con OpenAI, configurado en `.env`. Hay tres caminos: Ollama en la propia máquina (el único
probado de principio a fin), una API alojada compatible con OpenAI y Claude por el endpoint compatible
con OpenAI de Anthropic (estos dos, **no verificados**).

### El historial de `acme-shop`

Una respuesta en vivo lee el código de `fixtures/acme-shop` desde su propio historial de Git
(`fixtures/acme-shop/.git`), que no viaja con el clon (está en `.gitignore`). `npm run up` lo construye
en cada arranque: es la línea `[up] node fixtures/build-history.mjs acme-shop` del paso 0. Si arrancas
el sistema sin `npm run up`, constrúyelo una vez desde la raíz del clon:

```shell
node fixtures/build-history.mjs acme-shop
```

Sin él, una pregunta en vivo termina con `SOURCE_UNAVAILABLE` (`not-a-repository`). Siempre genera el
mismo historial (su `HEAD` es el commit que indexó la semilla) y no cambia nada del modo evaluación.

### Ollama, con GPU o en CPU

Ollama (`https://ollama.com`) usa la GPU si la encuentra y, si no, la CPU. En una **tercera terminal**,
arranca el servidor con un contexto de 16 384 tokens: el prompt de `explain` ocupa entre 5 000 y 7 000
tokens, y con el contexto por defecto Ollama lo recorta y toda respuesta sale
`UNKNOWN (invalid-model-output)`. Es el único comando de la guía que cambia según la terminal. En
PowerShell:

```powershell
$env:OLLAMA_CONTEXT_LENGTH='16384'; ollama serve
```

En Bash:

```bash
OLLAMA_CONTEXT_LENGTH=16384 ollama serve
```

Si Ollama ya está en marcha como aplicación de escritorio (Windows y macOS) o como servicio del sistema
(el servicio de systemd que crea el instalador en Linux), ya ocupa el puerto 11434 y este
`ollama serve` no arranca: cierra la aplicación (o para el servicio) antes, o da
`OLLAMA_CONTEXT_LENGTH=16384` a esa aplicación o servicio como explica la documentación de Ollama
(`https://docs.ollama.com/faq#how-do-i-configure-ollama-server`). Las dos variantes se comprobaron
solo en Windows, cada una en su terminal (PowerShell 7 y Git Bash).

Con el servidor en marcha, descarga el modelo desde otra terminal:

```shell
ollama pull qwen2.5-coder
```

Abre `.env` con un editor de texto y deja así estas líneas (`LLM_API_KEY` vacía: Ollama no pide clave):

```text
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=
LLM_MODEL=qwen2.5-coder
LLM_TIMEOUT_MS=1200000
```

`LLM_TIMEOUT_MS=1200000` (20 minutos) es para la **CPU**, donde una pregunta tarda entre 3,5 y 9
minutos (la tabla de tiempos de `readme.md` → «Probar con un modelo real»); admite hasta `3600000` (una
hora). Con GPU puedes dejar `LLM_TIMEOUT_MS` vacía (120 000 ms por defecto). Usa `qwen2.5-coder`:
`llama3.2` no produce el JSON estricto que exige la respuesta y responde `invalid-model-output`.

**Después de editar `.env`, reinicia el sistema**: en la terminal 1, pulsa Ctrl+C y vuelve a lanzar
`npm run up`. La API lee `.env` solo al arrancar, así que hasta entonces sigue en modo evaluación;
`npm run cli`, en cambio, lee `.env` en cada ejecución.

Una pregunta que no está en la caché, por la CLI (terminal 2):

```shell
npm run cli -- ask acme-shop "¿Qué hace DiscountService?"
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask acme-shop ¿Qué hace DiscountService?

DiscountService calculates discounts for orders based on loyalty tier, coupon, and volume. It applies these discounts to the subtotal before calculating taxes and shipping.

statements:
1. [INFERENCE] DiscountService is tested for volume bonuses in `tests/Unit/DiscountServiceTest.php`.
   evidence: tests/Unit/DiscountServiceTest.php:22-82
2. [FACT] The discount logic is detailed in `app/Services/DiscountService.php`.
   evidence: app/Services/DiscountService.php:21-66

evidence:
tests/Unit/DiscountServiceTest.php:22-82
    class DiscountServiceTest extends TestCase
    {
        protected function tearDown(): void
        {
            Mockery::close();
    … (+56 lines)
app/Services/DiscountService.php:21-66
    class DiscountService
    {
        private const LOYALTY_SILVER_PERCENT = 5.0;
        private const LOYALTY_GOLD_PERCENT = 10.0;

    … (+41 lines)
{"level":"info","type":"entailment_unverified","statementIndex":0,"evidenceId":"E1","path":"tests/Unit/DiscountServiceTest.php","startLine":22,"endLine":82,"reason":"invalid-output"}
```

En la captura (Ollama en CPU) tardó 8 min 28 s. La respuesta generada en vivo cambia de una
ejecución a otra: el texto, las afirmaciones y sus evidencias no tienen por qué coincidir con estas.
Una afirmación que el modelo no pudo comprobar aparece como `INFERENCE` y deja un evento
`entailment_unverified` en stderr. La respuesta queda guardada en la caché de la base de datos.

Y la misma pregunta por la API:

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Qué hace DiscountService?"
```

```text

> codemind@0.0.1 demo:ask
> node scripts/demo-ask.mjs *** ¿Qué hace DiscountService?

HTTP 200
{
  "statements": 2,
  "evidence": 2,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 6749,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 54,
    "cacheHit": true,
    "generation": {
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0
    },
    "verification": {
      "calls": 0,
      "cacheHits": 0,
      "inputTokens": 0,
      "outputTokens": 0,
      "costUsd": 0,
      "latencyMs": 0
    }
  }
}
```

Como la CLI acaba de guardar esa respuesta, la API la sirve desde la caché al instante
(`"cacheHit": true`, 0 tokens). Una pregunta nueva por la API va al modelo y tarda lo mismo que por la
CLI: en la captura, la misma pregunta con la caché desactivada tardó 300,9 s por la API
(`"cacheHit": false`, 6 591 tokens de generación y 9 llamadas de verificación).

En la web, con el sistema reiniciado, escribe una pregunta libre en el campo de la pantalla 2 (por
ejemplo «¿Qué hace ShippingService?») y espera: ni la web ni la API ponen un límite de tiempo propio.
En la captura, con Ollama en CPU, la respuesta llegó en Chromium a los 597,7 s (casi 10 minutos), con
sus afirmaciones «HECHO» e «INFERIDO», sus evidencias y el panel de uso («sin caché»). La espera de
más de 300 s solo se ha comprobado en Chromium.

### Una API alojada compatible con OpenAI (no verificado)

**No verificado**: no se ha probado con una clave real. Cualquier proveedor con un endpoint
`chat/completions` compatible con OpenAI sirve en principio. En `.env`, con un editor de texto:

- `LLM_BASE_URL`: la URL base que documente el proveedor, sin `?` ni `#` (el cliente le añade
  `/chat/completions`); por ejemplo, `https://api.openai.com/v1` para OpenAI.
- `LLM_API_KEY`: tu clave del proveedor. No la pegues en ningún otro sitio: el sistema nunca la muestra
  en sus mensajes.
- `LLM_MODEL`: el identificador de modelo que dé el proveedor.
- `DAILY_BUDGET_USD`: **vacía**. La tabla de precios del sistema solo tiene los modelos locales de
  Ollama (a 0 USD); con un techo diario, un modelo sin precio deja la configuración inválida. El gasto
  se controla en la consola del proveedor.

Una API alojada responde en segundos, así que `LLM_TIMEOUT_MS` puede quedarse vacía. Después, reinicia
`npm run up` y pregunta como en el apartado de Ollama.

### Claude, por el endpoint compatible con OpenAI de Anthropic (no verificado)

**No verificado: no se ha probado con una clave real.** Anthropic ofrece una capa compatible con OpenAI
(`https://platform.claude.com/docs/en/api/openai-sdk`; los identificadores de modelo, en
`https://platform.claude.com/docs/en/about-claude/models/overview`; las dos páginas consultadas el
2026-10-20). En `.env`, con un editor de texto:

- `LLM_BASE_URL=https://api.anthropic.com/v1`
- `LLM_API_KEY`: tu clave de la consola de Claude.
- `LLM_MODEL`: un identificador de la lista de modelos de Anthropic (por ejemplo, `claude-sonnet-5-5`
  o `claude-haiku-5-5`).
- `DAILY_BUDGET_USD`: **vacía**, por el mismo motivo que con una API alojada.

Lo que dice la documentación de Anthropic y conviene saber antes:

- Anthropic presenta esta capa para probar y comparar modelos, no como una solución para producción.
- El cliente envía la clave como `Authorization: Bearer …`, que la capa admite. Con una clave que da
  acceso a varios *workspaces*, Anthropic pide además la cabecera `anthropic-workspace-id` en cada
  petición, que el cliente no envía: usa una clave de un solo *workspace*.
- El cliente envía solo el modelo y los mensajes: ni `response_format` (la capa lo ignora) ni
  `temperature` ni `top_p` (que dan error en los modelos recientes). Los mensajes `system` se elevan al
  campo `system` de Anthropic, y la respuesta trae `usage.prompt_tokens` y `usage.completion_tokens`.
- El cliente no envía `max_tokens`; no se ha comprobado cómo lo trata la capa cuando falta.
- La capa no tiene embeddings; `ask` no los necesita.

Después, reinicia `npm run up` y pregunta como en el apartado de Ollama.

## Parar el sistema

En la terminal 1, pulsa Ctrl+C. `npm run up` termina entonces con la línea `[up] stopped (Ctrl+C)` y
el código de salida `130` (el de una interrupción); según la versión de npm, npm puede añadir después
sus propias líneas de error con `code 130`. Es el final esperado, no un fallo. Después, en cualquier
terminal:

```shell
npm run down
```

```text

> codemind@0.0.1 down
> docker compose down

 Container dis103-pwsh-postgres-1 Stopping 
 Container dis103-pwsh-postgres-1 Stopped 
 Container dis103-pwsh-postgres-1 Removing 
 Container dis103-pwsh-postgres-1 Removed 
 Network dis103-pwsh_default Removing 
 Network dis103-pwsh_default Removed 
```

`npm run down` para y elimina el contenedor; los datos se conservan en el volumen `pgdata`, así que el
siguiente `npm run up` no vuelve a crear la base de datos desde cero.
