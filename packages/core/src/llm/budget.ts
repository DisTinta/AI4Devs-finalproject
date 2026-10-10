import type { LlmPort } from '../ports/LlmPort.js';
import type { StorePort } from '../ports/StorePort.js';
import { BudgetExhausted } from './errors.js';

/** What {@link withDailyBudget} needs. */
export interface DailyBudgetOptions {
  /** Where the spend of the day is read from: the sum of `query_log.cost_usd` (PH-14). */
  store: Pick<StorePort, 'sumCostSince'>;
  /** The daily spend ceiling in USD. */
  dailyBudgetUsd: number;
  /** The clock; read on every call. Defaults to the system clock. */
  now?: () => Date;
}

/** 00:00:00.000 UTC of the day of `instant`. */
export function startOfUtcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/** 00:00:00.000 UTC of the day after the day of `instant`: when a daily ceiling resets. */
export function startOfNextUtcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate() + 1));
}

/**
 * Wraps a live model with a daily spend ceiling. Before every completion and every embedding request
 * it reads the spend since the start of the current UTC day from the store (never from memory, so a
 * restart cannot reset it) and, when that spend is greater than or equal to `dailyBudgetUsd`, fails
 * with {@link BudgetExhausted} without calling `llm`. Otherwise the request, its result and its
 * failure pass through unchanged. The wrapped model keeps the mode of `llm`.
 *
 * Check-then-call is not atomic: calls in flight can overshoot the ceiling; the next call is blocked.
 * A failure of the store is not caught: it rejects the request, and the model is not called.
 *
 * @throws RangeError when `dailyBudgetUsd` is not a positive finite number.
 *
 * `createLlm` does not apply it. The composition root does:
 * `cfg.mode === 'live' && cfg.dailyBudgetUsd !== undefined ? withDailyBudget(createLlm(cfg), { store,
 * dailyBudgetUsd: cfg.dailyBudgetUsd }) : createLlm(cfg)`.
 */
export function withDailyBudget(llm: LlmPort, options: DailyBudgetOptions): LlmPort {
  const { store, dailyBudgetUsd, now = () => new Date() } = options;
  // A NaN or infinite ceiling would never trip and a non-positive one would always trip.
  if (!(dailyBudgetUsd > 0 && Number.isFinite(dailyBudgetUsd))) {
    throw new RangeError(`dailyBudgetUsd must be a positive finite number (got ${dailyBudgetUsd})`);
  }

  async function ensureBudgetLeft(): Promise<void> {
    const instant = now();
    const spentUsd = await store.sumCostSince(startOfUtcDay(instant));
    if (spentUsd >= dailyBudgetUsd) throw new BudgetExhausted(spentUsd, dailyBudgetUsd, startOfNextUtcDay(instant));
  }

  return {
    mode: llm.mode,
    async complete(request) {
      await ensureBudgetLeft();
      return llm.complete(request);
    },
    async embed(texts) {
      await ensureBudgetLeft();
      return llm.embed(texts);
    },
  };
}
