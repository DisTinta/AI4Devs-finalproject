# End-to-End Testing Report

- Date: 2026-11-04
- Change: cache-hit-rate
- Step: 14. Frontend: End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

Text of the agent (autonomous run, DIS-69). The API (evaluation mode, `RATE_LIMIT_MAX=1000`) and the web
client ran locally against the scratch database `codemind_dis69`, re-seeded with `npm run db:seed`
right before (0 `query_log` rows, 6 golden vectors). A scratch Playwright 1.64.1 script drove Google
Chrome (system install, `channel: 'chrome'`) on Screen 2 of acme-shop.

## Commands executed

- `npm run db:seed` (scratch `DATABASE_URL`), then the API (`npm -w packages/api run dev`) and the web
  (`npm -w packages/web run dev -- --host 127.0.0.1 --port 5173 --strictPort`).
- Scratch driver, phase 1 (API up), then `node scripts/dev-processes.mjs stop`, the web alone, scratch driver,
  phase 2 (API stopped), `node scripts/dev-processes.mjs stop`.

## Scenarios and values observed

| Step | Action | Region «Uso» (last line) | `query_log` after |
|---|---|---|---|
| 1 | press «¿Cómo se calcula el precio final de un pedido?» | «Caché del proyecto: 100 % de aciertos (1 de 1 consulta)» | 1 explain, 1 hit |
| 2 | press it again | «Caché del proyecto: 100 % de aciertos (2 de 2 consultas)» | 2, 2 hits |
| 3 | send «¿Cómo se gestionan los reembolsos de un pedido?» (no anchor) | no usage panel (0 regions «Uso»), state «Sin respuesta verificada» | 3, 2 hits; the row has `cache_hit` false |
| 4 | press the price question again | «Caché del proyecto: 75 % de aciertos (3 de 4 consultas)» | 4, 3 hits |
| 5 | send «¿Qué hace PriceCalculator con los impuestos?» | configuration notice «Hace falta un modelo de lenguaje» | 5, 3 hits |
| 6 | API stopped, press «¿Cómo se validan los cupones?» | alert «No se ha podido obtener la respuesta. La API de CODEMIND no responde.» | unchanged |

14.4: the figures shown equal `SELECT count(*), count(*) FILTER (WHERE cache_hit) FROM query_log WHERE
project_id = '<acme-shop>' AND capability = 'explain'`, which gave `4|3` before step 5 (checked in the
step 4 row) and `5|3` at the end.

## UI evidence

At 320 px the page has no horizontal overflow (`scrollWidth` 320 of 320; the usage region 254 of 254) and
the project cache line wraps without clipping.

- `./2026-11-04-usage-strip-desktop.png` — the usage strip with the new line under the baseline line, muted
- `./2026-11-04-usage-strip-320.png` — the same at 320 px, wrapping without clipping
- `./2026-11-04-unknown-state-desktop.png` and `./2026-11-04-unknown-state-320.png` — the `UNKNOWN` state
- `./2026-11-04-configuration-notice-desktop.png` — the configuration notice
- `./2026-11-04-alert-api-stopped-desktop.png` and `./2026-11-04-alert-api-stopped-320.png` — the alert with the API stopped

## Restoration

Servers stopped with `node scripts/dev-processes.mjs stop` (no repository process left). The shared
database `codemind` was never touched (2 projects, 7 cache entries, 0 with a vector, 0 `query_log` rows).
As in step 13, the scratch databases are not dropped: the kit's destructive-command hook denies
`DROP DATABASE` and an autonomous run cannot confirm it (`design.md` → Follow-ups).

## Outcome
- Status: PASS
- Blocking issues: none
