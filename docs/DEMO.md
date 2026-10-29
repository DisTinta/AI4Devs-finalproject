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
| Salida de `npm run up` del paso 0 (DIS-105) | 2026-10-27, commit `4b1435a` (rama `feature/dis-105-npm-audit-debt`), clon nuevo de GitHub, Git Bash, Node v24.11.1 / npm 11.19.0, sin `.env` y con `POSTGRES_PORT=5433`, su `DATABASE_URL` y `PORT=3001` en el entorno del comando porque la máquina tenía otra API en el puerto 3000; el clon cambió además el proxy de `packages/web/vite.config.ts` a 3001 (solo en el clon). Los nombres de Docker llevan el prefijo `dis105-pwsh` (carpeta del clon, que se capturó en Git Bash). En el bloque del paso 0, la salida es literal salvo la ruta del clon (a), el nombre de la máquina (d) y el puerto de la API, que se deja en 3000 como en el resto de la guía. No se capturó en PowerShell 7 (el clasificador de permisos denegó el comando). El resto de la guía es de la captura de abajo |
| Fecha | 2026-10-20 |
| Commit | `da94264` (rama `feature/DIS-103-real-model-clean-clone`), clonado de GitHub en una carpeta nueva para cada terminal |
| Máquina | Windows 11 Pro, Docker Desktop (Docker Engine 29.8.1, Compose v5.5.1), Git 2.45.1 |
| Terminales | PowerShell 7.6.6 y Git Bash (GNU bash 5.2.26): la guía entera salvo `Probar con un modelo real` en cada una, con salidas idénticas salvo los campos que cambian en cada ejecución |
| Node / npm | v24.11.1 / 11.19.0 (el proyecto necesita Node 22.12 o posterior, una línea LTS; la CI usa Node 22) |
| LLM | ninguno: **modo evaluación**, todas las variables `LLM_*` vacías |
| Base de datos | una base de datos nueva y vacía (ver el paso 0) |
| Respuestas golden (pasos 1, 2 y 5; web, puntos 8 y 9) | recapturadas el 2026-10-27 en la rama `feature/dis-104-answer-language` (Git Bash, modo evaluación, base de datos local recién sembrada con `npm run db:seed`), porque DIS-104 regeneró las respuestas golden: la salida de `ask` del paso 1, los recuentos y latencias de `demo:ask` de los pasos 1 y 5 y el valor de confianza de la web. El resto de la guía es de la captura de 2026-10-20. El 2026-10-28 DIS-107 volvió a regenerar las respuestas golden (corrección del analizador de TypeScript) después de esa captura de DIS-104: la salida de `ask` de los pasos 1 y 6 se recapturó ese día en Git Bash, pero los recuentos y latencias de `demo:ask` de los pasos 1 y 5, el valor de confianza de la web y las capturas de pantalla siguen siendo los de DIS-104 y no se han vuelto a tomar |
| `Probar con un modelo real` | 2026-10-20, rama `feature/DIS-103-real-model-clean-clone` clonada en una carpeta nueva, Git Bash: Ollama 0.40.5 **solo en CPU**, `qwen2.5-coder`, `OLLAMA_CONTEXT_LENGTH=16384`, `LLM_TIMEOUT_MS=1200000`. Duraciones medidas: CLI 8 min 28 s; API 300,9 s (pregunta repetida con la caché desactivada); web en Chromium 597,7 s (otra pregunta, «¿Qué hace ShippingService?»). La salida de la CLI pegada en esa sección es de otra captura, la de DIS-104 (2026-10-26, rama `feature/dis-104-answer-language`, Git Bash, Ollama 0.40.11 solo en CPU con `OLLAMA_CONTEXT_LENGTH=16384`, `qwen2.5-coder`, `LLM_TIMEOUT_MS=1200000`, primera llamada tras `npm run db:seed`, así que no salió de la caché): 598 s, con la salida de error mezclada como en las anteriores |

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

Comprueba que Docker está en marcha, que Node es la versión 22.12 o posterior (una línea LTS, 22 o 24) y que Git está instalado:

```shell
docker info
node -v
git --version
```

`docker info` debe terminar sin error (si dice que no puede conectar con el daemon, arranca Docker
Desktop); `node -v` debe mostrar `v22.12.0` o posterior.

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
npm warn deprecated whatwg-encoding@3.1.1: Use @exodus/bytes instead for a more spec-conformant and faster implementation
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 583 packages, and audited 593 packages in 1m

159 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   tree-sitter-php@0.24.2 (install: node-gyp-build)
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

2 projects loaded
  acme-shop  php/laravel  174 nodes · 170 edges
  task-api  typescript/fastify  102 nodes · 100 edges
[up] node fixtures/build-history.mjs acme-shop
acme-shop: 32 commits, 3 authors -> <repo>\fixtures\acme-shop\.git
[up] node fixtures/build-history.mjs task-api
task-api: 28 commits, 3 authors -> <repo>\fixtures\task-api\.git
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
[1]   VITE v8.3.4  ready in 1098 ms
[1] 
[1]   ➜  Local:   http://localhost:5173/
[1]   ➜  Network: use --host to expose
[0] {"level":30,"time":1792487313238,"pid":30948,"hostname":"<host>","msg":"Server listening at http://127.0.0.1:3000"}
[… sigue en marcha; se para con Ctrl+C]
```

`npm run up` escribe una línea `[up] <comando>` antes de cada paso: arranca PostgreSQL y espera a que
acepte conexiones, instala las dependencias, migra la base de datos, carga la semilla, construye el
historial de Git de `acme-shop` y de `task-api` (`fixtures/<nombre>/.git`, unos 11 s cada uno; solo lo
leen las respuestas en vivo, ver [Probar con un modelo real](#probar-con-un-modelo-real)) y arranca la API
(`http://127.0.0.1:3000`) y la web (`http://localhost:5173/`). Se queda en primer plano: el resto de la
demo va en una **segunda terminal**, abierta en la misma carpeta.

> La semilla carga **dos** proyectos de muestra, `2 projects loaded`: `acme-shop` (PHP/Laravel) y
> `task-api` (TypeScript/Fastify). `readme.md` §1.4 cita un extracto de esta salida.

Terminal 2. `npm run cli` lee `DATABASE_URL` de `.env`, así que basta con:

```shell
npm run cli -- projects
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts projects

acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z sample
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

El precio final de un pedido se calcula considerando el subtotal, los descuentos aplicados, impuestos, y gastos de envío.

statements:
1. [FACT] El precio final se calcula en la clase `PriceCalculator::compute()`. (E4)
   evidence: app/Services/PriceCalculator.php:16-44
2. [FACT] El subtotal se obtiene desde el pedido, y a partir de él se calculan el descuento y los impuestos. (E4)
   evidence: app/Services/PriceCalculator.php:16-44
3. [FACT] Los descuentos se calculan utilizando el servicio `DiscountService::discount()`. (E4, E5)
   evidence: app/Services/PriceCalculator.php:16-44, app/Services/DiscountService.php:21-66
4. [INFERENCE] Los impuestos se calculan sobre el subtotal descontado utilizando el servicio `TaxService::taxFor()`. (E4, E7)
   evidence: app/Services/PriceCalculator.php:16-44, app/Services/TaxService.php:18-28
5. [INFERENCE] Los gastos de envío se calculan utilizando el servicio `ShippingService::shippingFor()`. (E4, E6)
   evidence: app/Services/PriceCalculator.php:16-44, app/Services/ShippingService.php:16-35
6. [FACT] El precio final se obtiene sumando el subtotal descontado, los impuestos y los gastos de envío. (E4)
   evidence: app/Services/PriceCalculator.php:16-44

evidence:
app/Services/PriceCalculator.php:16-44
    class PriceCalculator
    {
        public function __construct(
            private readonly DiscountService $discounts,
            private readonly TaxService $taxes,
    … (+24 lines)
app/Services/DiscountService.php:21-66
    class DiscountService
    {
        private const LOYALTY_SILVER_PERCENT = 5.0;
        private const LOYALTY_GOLD_PERCENT = 10.0;

    … (+41 lines)
app/Services/TaxService.php:18-28
    class TaxService
    {
        public function taxFor(Order $order, Money $base): Money
        {
            $rates = config('shop.tax_rates', []);
    … (+6 lines)
app/Services/ShippingService.php:16-35
    class ShippingService
    {
        public function __construct(private readonly CarrierGateway $carrier)
        {
        }
    … (+15 lines)
```

Es una respuesta *golden*, generada por un modelo de 7B: las afirmaciones `INFERENCE` son las que el
sistema no pudo comprobar del todo, y el sistema no las oculta: las marca como inferencia. Esta
salida se recapturó el 2026-10-28 en Git Bash con la golden que sirve hoy la semilla para esta
pregunta (acme-shop `Q1`, regenerada en DIS-107; las marcas como «(E4)» son texto del modelo). La
revisó en DIS-107 un panel de agentes independientes (su informe es
`docs/golden-review/2026-10-golden-review-dis-107.md`) y la juzgó `correct`: el método se llama
`discountFor`, no `discount`, un desliz de nombre que el criterio no cuenta como error. Quedó firmada
con las dos firmas del panel y no hay ningún pendiente. La ronda anterior (DIS-33) había juzgado
`incorrect` la golden de DIS-32; DIS-108 queda resuelto por la ronda de DIS-107 y lo cierra la autora.
El 2026-10-29, DIS-9 y después DIS-10 volvieron a regenerar las golden (nueva huella de la semilla),
así que el texto de esta salida es el de la golden de DIS-107 y no se ha vuelto a capturar. La golden
actual de acme-shop `Q1` la revisó la ronda DIS-10 (`docs/golden-review/2026-10-golden-review-dis-10.md`)
y de nuevo la ronda DIS-10 r2 (`docs/golden-review/2026-10-golden-review-dis-10-r2.md`), la ronda
actual, que la juzgó `partial` y la firmó con las dos firmas del panel.

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
  "statements": 7,
  "evidence": 9,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 7123,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 52,
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

Cinco de las siete afirmaciones de arriba citan `app/Services/PriceCalculator.php:16-44`. La cita es relativa a
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
  "statements": 7,
  "evidence": 9,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 7123,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 28,
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
  "statements": 7,
  "evidence": 9,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "baselineTokens": 7123,
    "baselineEstimator": "chars-div-4",
    "savingsPct": 100,
    "costUsd": 0,
    "latencyMs": 28,
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

`task-api`, la muestra en TypeScript, está en la semilla con tres preguntas golden: Q1
«¿Cómo valida taskRoutes las peticiones entrantes?», Q2 «¿Qué hace buildPage con los resultados
paginados?» y Q3 «¿Qué transiciones de estado son válidas?». Las dos primeras nombran un símbolo del
grafo (`taskRoutes`, `buildPage`) porque toda pregunta golden tiene que anclar un símbolo de su
proyecto. En modo evaluación se responden desde la caché:

```shell
npm run cli -- ask task-api "¿Qué hace buildPage con los resultados paginados?"
```

```text

> codemind@0.0.1 cli
> tsx --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask task-api ¿Qué hace buildPage con los resultados paginados?

Los resultados paginados son procesados por la función buildPage, que toma los elementos, el total, la página actual y el tamaño de la página como argumentos, y devuelve un objeto de página con la información correspondiente.

statements:
1. [INFERENCE] buildPage toma como argumento los elementos, el total, la página actual y el tamaño de la página.
   evidence: src/domain/pagination.ts:13-21

evidence:
src/domain/pagination.ts:13-21
    export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
      return {
        items,
        total,
        page,
    … (+4 lines)
```

Una pregunta sobre algo que `task-api` no tiene, como la autenticación, no ancla ningún símbolo y
responde `UNKNOWN (no-anchor)` sin llamar a ningún modelo:

```shell
npm run cli -- ask task-api "¿Cómo se autentican los usuarios?"
```

```text
UNKNOWN (no-anchor)
```

Una pregunta libre en vivo sobre `task-api` necesita su historial de Git: `npm run up` lo construye
(ver [El historial de `acme-shop` y de `task-api`](#el-historial-de-acme-shop-y-de-task-api)).

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
✓ task-api Q1 ¿Cómo valida taskRoutes las peticiones entrantes?
✓ task-api Q2 ¿Qué hace buildPage con los resultados paginados?
✓ task-api Q3 ¿Qué transiciones de estado son válidas?
acme-shop: 3/3 golden answers match
task-api: 3/3 golden answers match
```

## Recorrido por la web

Con `npm run up` en marcha, abre `http://localhost:5173/` en el navegador. Las dos pantallas siguen los
wireframes de `readme.md` §1.3 (`images/pantalla-1-seleccion.svg`, `images/pantalla-2-consulta.svg`).

**Pantalla 1 — Selección de proyecto** (`/`):

1. Arriba, la cabecera «CODEMIND» con «Comprensión de repositorios con evidencia verificable»; debajo,
   el título «Elige un proyecto para explorar» y «Repositorios precargados · sin registro · sin
   instalación».
2. Dos tarjetas, `acme-shop` («PHP / Laravel») y `task-api` («TypeScript / Fastify»), cada una con sus
   cuatro recuentos (ficheros, símbolos, aristas y commits del grafo de la semilla), la insignia
   «✓ indexado» y, en cuanto la API contesta a su comprobación de salud, la insignia «listo»
   (mientras tanto, «comprobando…»).
3. El enlace «Explorar proyecto →» de cada tarjeta abre la pantalla 2 de ese proyecto, con sus tres
   preguntas sugeridas (las golden de ese proyecto).
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
9. Debajo, el panel de uso: «Confianza» con su valor (0.71 con las respuestas golden de DIS-104; DIS-107 las regeneró el 2026-10-28 y esta cifra no se ha vuelto a capturar), los tokens («0 tokens»), el
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

12. En `http://localhost:5173/` las dos tarjetas siguen visibles, sin «listo», y entre el subtítulo
    y las tarjetas aparece la alerta «La API de CODEMIND no está disponible. Puedes ver los proyectos, pero
    no preguntar hasta que vuelva. Arráncala con npm run up y pulsa Reintentar.» con el botón
    «Reintentar». Pulsarlo vuelve a comprobar la API una sola vez; si sigue parada, la alerta se queda.
    Para la web con Ctrl+C.

**Diferencias con los wireframes**, por los datos de la semilla: hay dos tarjetas, `acme-shop` y
`task-api`, los recuentos son los del grafo de la semilla y no los ilustrativos
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

### El historial de `acme-shop` y de `task-api`

Una respuesta en vivo lee el código de un proyecto de muestra desde su propio historial de Git
(`fixtures/acme-shop/.git`, `fixtures/task-api/.git`), que no viaja con el clon (está en `.gitignore`).
`npm run up` construye los dos en cada arranque: son las líneas
`[up] node fixtures/build-history.mjs acme-shop` y `[up] node fixtures/build-history.mjs task-api` del
paso 0. Si arrancas el sistema sin `npm run up`, constrúyelos una vez desde la raíz del clon:

```shell
node fixtures/build-history.mjs acme-shop
node fixtures/build-history.mjs task-api
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

DiscountService calculatea discounts for orders considering loyalty tiers, number of items, and coupon codes, ensuring the total discount does not exceed 30%.

statements:
1. [FACT] DiscountService tiene métodos para calcular descuentos basándose en los tiers de lealtad del cliente, el número de ítems del pedido y códigos de cupón (E4).
   evidence: app/Services/DiscountService.php:21-66
2. [INFERENCE] Los descuentos se calculan sumando porcentajes de descuento de lealtad, coupon validator y bono de volumen si se cumple el umbral de 5 ítems (E4).
   evidence: app/Services/DiscountService.php:21-66, app/Services/CouponValidator.php:14-39
3. [FACT] Se aplica un límite máximo del 30% en el descuento total (E4).
   evidence: app/Services/DiscountService.php:21-66
4. [INFERENCE] Se emite un evento 'DiscountApplied' cuando se aplica un descuento mayor a cero (E4).
   evidence: app/Services/DiscountService.php:21-66, app/Events/DiscountApplied.php:15-24
5. [INFERENCE] El precio final del pedido se calcula restando el descuento a la base del pedido (subtotal) y luego aplicando IVA (E8).
   evidence: app/Services/PriceCalculator.php:16-44
6. [FACT] Los descuentos se aplican antes de calcular el IVA (E3).
   evidence: tests/Unit/PriceCalculatorTest.php:29-56

evidence:
app/Services/DiscountService.php:21-66
    class DiscountService
    {
        private const LOYALTY_SILVER_PERCENT = 5.0;
        private const LOYALTY_GOLD_PERCENT = 10.0;

    … (+41 lines)
app/Services/CouponValidator.php:14-39
    class CouponValidator
    {
        public function percentFor(?string $code): float
        {
            if ($code === null || $code === '') {
    … (+21 lines)
app/Events/DiscountApplied.php:15-24
    class DiscountApplied
    {
        use Dispatchable;

        public function __construct(
    … (+5 lines)
app/Services/PriceCalculator.php:16-44
    class PriceCalculator
    {
        public function __construct(
            private readonly DiscountService $discounts,
            private readonly TaxService $taxes,
    … (+24 lines)
tests/Unit/PriceCalculatorTest.php:29-56
        public function test_discount_is_applied_before_tax(): void
        {
            $subtotal = Money::fromCents(10000);   // €100.00
            $discount = Money::fromCents(1000);    // €10.00
            $discountedBase = Money::fromCents(9000);
    … (+23 lines)
{"level":"info","type":"entailment_unverified","statementIndex":1,"evidenceId":"E4","path":"app/Services/DiscountService.php","startLine":21,"endLine":66,"reason":"invalid-output"}
{"level":"info","type":"entailment_unverified","statementIndex":3,"evidenceId":"E4","path":"app/Services/DiscountService.php","startLine":21,"endLine":66,"reason":"invalid-output"}
{"level":"info","type":"answer_language_mismatch","expected":"es"}
```

La pregunta está en español y el prompt pide la respuesta en español, pero el modelo de 7B a veces
contesta en inglés, o mezcla los dos idiomas, como en esta captura (el párrafo de `answer` en inglés y
las afirmaciones en español). Cuando la respuesta del modelo a una pregunta en español está en inglés,
la última línea JSON (`answer_language_mismatch`) lo avisa en el registro; la respuesta se devuelve tal
cual y el aviso no sale en la respuesta pública de la API ni en la web.

En la captura (Ollama en CPU) tardó 598 s (casi 10 minutos). La respuesta generada en vivo cambia de una
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
(`"cacheHit": true`, 0 tokens). Esta salida es de la captura anterior (DIS-103, 2026-10-20), cuya
respuesta por la CLI tenía dos afirmaciones; con la respuesta de arriba, los recuentos son los suyos. Una pregunta nueva por la API va al modelo y, como por la CLI, tarda
minutos: en la captura, la misma pregunta con la caché desactivada tardó 300,9 s por la API
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
- Anthropic no ofrece un modelo de embeddings propio
  (`https://platform.claude.com/docs/en/build-with-claude/embeddings`, consultada el 2026-10-20);
  `ask` no los necesita.

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
