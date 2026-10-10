import { LlmUnavailable, type LlmPort } from '@codemind/core';
import type { EvaluationLlmConfig } from './config.js';

/**
 * The language model of evaluation mode: it never calls a model and never touches `fetch`. Every
 * completion and every embedding request fails with `LlmUnavailable` reason `evaluation-mode`.
 * Callers are expected to branch on `mode` before calling; the failure is the safety net.
 *
 * @param config An evaluation configuration; a live one does not type-check.
 */
export function createEvaluationLlm(config: EvaluationLlmConfig): LlmPort {
  return {
    mode: config.mode,
    async complete() {
      throw new LlmUnavailable('evaluation-mode');
    },
    async embed() {
      throw new LlmUnavailable('evaluation-mode');
    },
  };
}
