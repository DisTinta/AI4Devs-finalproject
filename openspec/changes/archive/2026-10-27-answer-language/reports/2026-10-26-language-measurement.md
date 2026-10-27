# Language measurement: current prompt against new prompt (DIS-104, design D5)

- Date: 2026-10-26
- Change: `answer-language`
- Text written by the agent in an autonomous run (no author present).

## Setup

- Machine: Windows 11, AMD Ryzen 7 2700X (16 threads), 32 GiB RAM, Git Bash.
- Ollama `0.40.11`, model `qwen2.5-coder:latest` (7.6B, Q4_K_M), pure CPU, context 16384.
- Deviation from the task text (recorded; the design is unchanged): the author's Ollama on
  `localhost:11434` cannot load the model on this machine (`CUDA error: the provided PTX was compiled with
  an unsupported toolchain`, HTTP 500: the first attempt ended in `LLM_UNAVAILABLE` after 33.8 s). The
  measurement uses a second Ollama instance started for it, as the project guide says
  (`docs/project-context.md`, DIS-72 gotcha): `OLLAMA_HOST=127.0.0.1:11435 CUDA_VISIBLE_DEVICES=-1
  GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu OLLAMA_CONTEXT_LENGTH=16384 ollama serve`
  (its log shows `library=cpu`), and the API and the CLI pointed at it with
  `LLM_BASE_URL=http://127.0.0.1:11435/v1`. The author's server was not restarted; the second instance was
  stopped afterwards.
- API: `npm -w packages/api run dev` (the API alone: `npm run dev` also starts the web), with
  `LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=qwen2.5-coder LLM_API_KEY= LLM_TIMEOUT_MS=1200000` in the
  command's environment; `.env` neither read nor edited.
- Database: the author's local `codemind`, reseeded before the runs (`npm run db:seed`, `npm run verify`
  exit 0; see the step 6 report).
- Request, per question: `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`, body
  `{"question": "...", "useCache": false}` read from a UTF-8 file (`curl --data-binary @file`), one call at a
  time, timed with `curl -w time_total`.
- Before = the base code of the branch (current prompt, the four source files of the change stashed with
  `git stash push` and restored with `git stash pop`); after = the implemented branch. The prompt hash of
  the stored claims proves which prompt each run sent: the three "after" API calls and the CLI capture of
  task 7.1 share the discount prompt hash `0972c27f…`; the "before" calls have other hashes
  (`7503d7ea…`, `e68f7147…`, `64e54ef0…`).

## Runs discarded (and why), so nobody reuses them

- **Run A** (three calls, 4096-token context): the server was forced onto the CPU through the author's
  Ollama with its default context, the prompt was cut, and every answer was `invalid-model-output`
  (outputs of 1047, 3564 and 3025 bytes that are not JSON; 146 s, 275 s, 247 s).
- **Run B** (six calls, before and after, 4 min to 9 min each): the Spanish questions went through `curl
  --data` with a Git Bash code page and reached the API as `U+FFFD` + `Qu` + `U+FFFD` + ` hace ...`
  (`query_log.question` showed it), so they were not Spanish questions: the rule decides nothing on them
  and the prompt was always the generic one. Found when the "after" run showed no language event for
  English answers. Nothing of it is used.

## Results (run C: valid questions, UTF-8 bodies)

| Question | Prompt | Duration | `usage.verification.calls` | `answer` by the agent's reading | Statements by the agent's reading | Rule on `answer` | Rule on statements |
|---|---|---|---|---|---|---|---|
| `¿Qué hace DiscountService?` | before | 513.9 s | 6 | Spanish | Spanish (4 of 4) | `es` | `es` x4 |
| `¿Qué hace DiscountService?` | after | 217.8 s | 6 | Spanish | Spanish (5 of 5) | `es` | `es` x5 |
| `¿Qué hace ShippingService?` | before | 403.8 s | 2 | none (a code expression: `shipping_cost = carrier_gateway.flatRateFor(country) if ...`) | English (2 of 2) | no decision | `en`, no decision |
| `¿Qué hace ShippingService?` | after | 466.8 s | 4 | Spanish | Spanish (3 of 3) | `es` | `es` x3 |
| `¿Qué hace TaxService?` | before | 426.4 s | 4 | Spanish | Spanish (3 of 3) | `es` | `es` x3 |
| `¿Qué hace TaxService?` | after | 458.6 s | 5 | Spanish | Spanish (5 of 5) | `es` | `es` x5 |

Events: in the "before" runs the API log shows only `entailment_unverified` events (`invalid-output`; 1, 0 and
2 of them). The event of this change depends only on the answer text, and the rule gives `es` on the three
"after" answers, so none could be emitted; the log of that server was not captured in a file (its output
went to a watcher's log that was overwritten), which is why the "after" events are inferred and not read.

Labels (design D5): `DiscountService`: Spanish, Spanish = **not reproduced**; `ShippingService`: English
(the statements; the answer is code), Spanish = **prompt**; `TaxService`: Spanish, Spanish = **not
reproduced**.

**Aggregate: not reproduced** (two of three pairs). Three pairs are a small sample and no rate is claimed.
No pair is a regression. The durations differ by the model's output length and the number of `verify` calls
(2 to 9 per answer), not by the prompt: the system message of the Spanish prompt is 2 lines longer.

## The CLI capture (task 7.1), and what it adds

`npm run cli -- ask acme-shop "¿Qué hace DiscountService?"` right after the reseed (a cache miss, a live
call: 598 s, 6 statements) returned an answer of mixed language: the `answer` paragraph in English
(`DiscountService calculatea discounts for orders considering loyalty tiers, ...`) and the six statements in
Spanish, with the `answer_language_mismatch` line in the JSON lines of stderr after the two
`entailment_unverified` lines. This is the event working on a real model, and it also shows the Spanish
prompt does not make a 7B model always answer in Spanish: with the same question and the same prompt hash as
the API's "after" call (an answer wholly in Spanish), the model answered mixed. This capture has no "before"
twin, so it is not one of the three pairs. The full output is in `docs/DEMO.md`.

The ticket's original observation (answer and statements in English for a Spanish question, DIS-103) was
not seen with the current prompt in the three valid "before" calls (it was in the mangled calls of run B, which
do not count). So the case for the prompt change is weak on this sample, and the event, which makes the
residual cases visible, is the part with live evidence.
