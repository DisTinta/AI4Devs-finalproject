/**
 * `longFetch` lives in `@codemind/adapter-llm` (change `real-model-clean-clone`, design D4): the
 * OpenAI-compatible client sends with it by default. Re-exported here so `cache:build` and its tests
 * keep the same function.
 */
export { longFetch } from '@codemind/adapter-llm';
