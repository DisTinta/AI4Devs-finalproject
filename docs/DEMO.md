# Demo walkthrough

The six steps of `readme.md` §1.3, run from a terminal against the sample project `acme-shop`. Every
step gives the exact command and, under it, the output of a real run pasted as captured. Where
Entrega 2 does not reach what §1.3 describes yet, the step says so and shows what the system does
today instead.

## How this was captured

| Item | Value |
|---|---|
| Date | 2026-10-17 |
| Commit | `b9026be` (branch `feature/DIS-45-demo-deployment-testing-docs`) |
| Machine | Windows 11 Pro, Git Bash, Docker Desktop, Git 2.45.1 |
| Node / npm | v24.11.1 / 11.19.0 (the project needs Node 20.11 or later; CI runs Node 20) |
| LLM | none: **evaluation mode**, every `LLM_*` variable empty |
| Database | a new, empty database (see step 0) |

The only edits made to the pasted output:

- **(a)** `make up` keeps running in the foreground (`npm run dev`); its output stops after the
  start-up lines, marked `[… still running; stopped with Ctrl+C]`.
- **(b)** an absolute path of the checkout would be replaced with `<repo>` (none appeared).
- **(c)** terminal colour codes are removed.
- **(d)** the machine name in the API's start-up log line is replaced with `<host>`.

**Fields that change on every run**, to ignore when comparing: `npm install`'s package count, time
and audit lines; the `(node:<pid>)` prefix and Vite's `ready in … ms`; `time` and `pid` in the API's
log line; and `latencyMs` in the API answers. The project id is fixed by the seed.

**Shell.** The commands are Bash (Git Bash or WSL on Windows, as the `Makefile`). In PowerShell, run
the `npm run …` commands directly; the `ask_api` helper of step 1 is Bash only.

**Why the API is called with `node` and not `curl`.** `curl` from Git Bash on Windows sent the
question with its accents mangled, so the API saw a different question and answered `UNKNOWN
(llm-required)`. Node is already a requirement and sends it intact on every system.

## Step 0 — Start the system

Terminal 1, from the root of the clone:

```bash
cp .env.example .env
make up
```

```text
docker compose up -d
 Container codemind-postgres-1 Running 
npm install

up to date, audited 562 packages in 5s

158 packages are looking for funding
  run `npm fund` for details

18 vulnerabilities (5 low, 6 moderate, 4 high, 3 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   tree-sitter-php@0.24.2 (install: node-gyp rebuild)
npm warn install-scripts   esbuild@0.21.5 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
npm run db:migrate

> codemind@0.0.1 db:migrate
> tsx packages/adapters/store-postgres/src/migrate.ts up

> Migrating files:
> - 0001_graph-l1
> - 0002_history-claims
> - 0003_indexes-stale
> - 0004_query-log-verification
### MIGRATION 0001_graph-l1 (UP) ###
### MIGRATION 0002_history-claims (UP) ###
### MIGRATION 0003_indexes-stale (UP) ###
### MIGRATION 0004_query-log-verification (UP) ###
npm run db:seed

> codemind@0.0.1 db:seed
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts

1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
npm run dev

> codemind@0.0.1 dev
> concurrently --kill-others-on-fail "npm -w packages/api run dev" "npm -w packages/web run dev"

(node:39088) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated. Please use Object.assign() instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
[0] 
[0] > @codemind/api@0.0.1 dev
[0] > node --watch --import ./dev-register.mjs src/server.ts
[0] 
[1] 
[1] > @codemind/web@0.0.1 dev
[1] > vite
[1] 
[1] 
[1]   VITE v5.4.21  ready in 967 ms
[1] 
[1]   ➜  Local:   http://localhost:5173/
[1]   ➜  Network: use --host to expose
[0] {"level":30,"time":1792253837152,"pid":3380,"hostname":"<host>","msg":"Server listening at http://127.0.0.1:3000"}
[… still running; stopped with Ctrl+C]
```

> **Entrega 2.** The seed loads **one** project, `1 project loaded`. The block «Salida esperada al
> terminar» in `readme.md` §1.4 (`2 projects loaded` and the `✓` lines) is illustrative: no command
> prints it, and `task-api` joins the seed with CM-HU-18 (PH-02).

> **How the capture differs from a first run.** The container was already running, so Compose
> printed `Running` (a first run prints that it creates and starts it), and `npm install` found
> everything installed. To leave the author's database untouched, the capture ran `make up` on a new
> database of the same container, `codemind_demo`, passing on the command line the values of
> `.env.example` (every `LLM_*` empty) with that database in `DATABASE_URL`.

Terminal 2. `npm` scripts do not read `.env`, so export the database first (the URL of
`.env.example`; the capture used `codemind_demo`):

```bash
export DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind
npm run cli -- projects
```

```text

> codemind@0.0.1 cli
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts projects

acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
```

## Step 1 — Ask how the final price is computed

The CLI prints the answer, each typed statement with its evidence `path:start-end`, and the cited
excerpts (at most five lines each):

```bash
npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

```text

> codemind@0.0.1 cli
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask acme-shop ¿Cómo se calcula el precio final de un pedido?

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

The CLI does not print token usage; the API does. Define a helper in terminal 2 that posts a
question to `POST /api/projects/{projectId}/ask` and prints the HTTP status, how many statements and
evidence items came back, and the `usage` block, or the error body when the status is not 2xx (the
id is the one `projects` printed):

```bash
ask_api() {
  node -e '
    const [project, question] = process.argv.slice(1);
    fetch(`http://127.0.0.1:3000/api/projects/${project}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }).then(async (response) => {
      const body = await response.json();
      console.log(`HTTP ${response.status}`);
      const summary = response.ok ? { statements: body.statements.length, evidence: body.evidence.length, usage: body.usage } : body;
      console.log(JSON.stringify(summary, null, 2));
    });
  ' "$@"
}
ACME=a794456d-6d1b-5b55-a360-13fec83dc7bc
ask_api "$ACME" "¿Cómo se calcula el precio final de un pedido?"
```

```text
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
    "latencyMs": 55,
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

> **Entrega 2.** In evaluation mode every answered question comes from the golden answers that
> `db:seed` loaded, so this first call is already a cache hit: `cacheHit: true`, `costUsd: 0`,
> `inputTokens: 0`. `savingsPct: 100` is the saving of an answer served from the cache against the
> stored baseline of raw context (`baselineTokens`, estimated as characters / 4). The savings of a
> live generation are measured in Entrega 3 (`readme.md` §2.6).

## Step 2 — Open an evidence

Every statement above cites `app/Services/PriceCalculator.php:16-44`. The citation is relative to
the root of the sample project, `fixtures/acme-shop`; those lines of the file are:

```bash
sed -n '16,44p' fixtures/acme-shop/app/Services/PriceCalculator.php
```

```text
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

They are the lines of the excerpt that the CLI printed (the first five) and the API returned (all
of them).

> **Entrega 2.** The web has no screens yet: the expandable evidence of Screen 2 arrives with DIS-65.
> Until then the citation is checked against the file, as here.

## Step 3 — Ask something the repository cannot answer

Refunds are not implemented in `acme-shop`:

```bash
npm run cli -- ask acme-shop "¿Cómo se gestionan los reembolsos de un pedido?"; echo "exit: $?"
```

```text

> codemind@0.0.1 cli
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask acme-shop ¿Cómo se gestionan los reembolsos de un pedido?

UNKNOWN (no-anchor)
exit: 0
```

`UNKNOWN (no-anchor)`: no symbol of the graph anchors the question, so the system says it does not
know instead of inventing an answer. It decides before any model or cache is consulted, and exits
`0` because `UNKNOWN` is an answer.

## Step 4 — Ask for the impact of changing the discounts

```bash
npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"; echo "exit: $?"
```

```text

> codemind@0.0.1 cli
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts impact acme-shop cambiar el cálculo de descuentos

not implemented — pending Ticket 1/2
exit: 0
```

> **Entrega 2.** `impact` is still a stub. The impact analysis, which separates the deterministic
> graph from the historical signal, is CM-HU-16, planned for Entrega 3.

## Step 5 — Repeat step 1

The same question of step 1, literally:

```bash
ask_api "$ACME" "¿Cómo se calcula el precio final de un pedido?"
```

```text
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
    "latencyMs": 27,
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

A variant that changes only case, accents and punctuation. It is **not** a rephrasing: it has the
same normalised key, so it is the same cache entry (DIS-21):

```bash
ask_api "$ACME" "como se calcula el precio final de un pedido"
```

```text
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
    "latencyMs": 34,
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

> **Entrega 2.** `readme.md` §1.3 asks to *rephrase* the question and get a cache hit by similarity.
> That is CM-HU-19 (PH-05); today a cache hit needs the same normalised question, as above. And since
> step 1 was already served from the cache (evaluation mode), what this step shows is that the
> repeated question resolves to the same entry, with `cacheHit: true` and `costUsd: 0`. The cache
> miss of a first question is only visible in live mode, with `LLM_*` set, which this capture does
> not use.

## Step 6 — Switch to `task-api` and repeat step 1

```bash
npm run cli -- ask task-api "¿Cómo se calcula el precio final de un pedido?"; echo "exit: $?"
```

```text

> codemind@0.0.1 cli
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask task-api ¿Cómo se calcula el precio final de un pedido?

{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
exit: 1
```

> **Entrega 2.** `task-api`, the TypeScript sample, is not in the seed yet (`projects` in step 0
> listed only `acme-shop`), so the CLI answers `PROJECT_NOT_FOUND` on stderr and exits `1`. It
> joins the seed with CM-HU-18 (PH-02).

## Check the installation

`npm run verify` asks every golden question of the seed and compares the structure of each answer
with the stored one, without calling a model (`docs/DEPLOYMENT.md` explains its failures):

```bash
npm run verify; echo "exit: $?"
```

```text

> codemind@0.0.1 verify
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts

✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
exit: 0
```

To stop, press Ctrl+C in terminal 1, then `make down` stops the container (the data stays in the
`pgdata` volume).
