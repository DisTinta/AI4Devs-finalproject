/**
 * Loaded with `node --watch --import` by the API's `dev` script (DIS-45): registers tsx with
 * `tsconfig.run.json`, so the watched API runs from the workspace sources (DIS-76 design U6).
 * `node --watch` replaces `tsx watch`, which reads its stdin and hands the same pipe to the API it
 * starts: under `concurrently` (`npm run dev`, `make up`) that pipe stays open, and on Windows the API
 * then never started.
 */
import { register } from 'tsx/esm/api';

register({ tsconfig: './tsconfig.run.json' });
