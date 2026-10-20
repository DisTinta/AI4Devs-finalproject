/**
 * The Ctrl+C preload of the fixture history step of `npm run up` (change `real-model-clean-clone`,
 * design D3): `up` starts `node --import ./scripts/defer-ctrl-c.mjs fixtures/build-history.mjs
 * acme-shop`. While a `SIGINT` listener exists, Node does not end the process on SIGINT, so a Ctrl+C
 * during the build never kills Node before the builder's `finally` restores the fixture's tracked
 * files: the `git` children receive the Ctrl+C too, the running one fails, and the builder cleans up
 * and ends on its own. `fixtures/build-history.mjs` is not edited because it is an input of the seed's
 * fingerprint. This module registers a no-op listener and nothing else (no `exit` listener, no
 * imports); `up` reports the stop as for any step.
 *
 * Spec: `local-startup` → "One command starts the system".
 */
process.on('SIGINT', () => {
  // Deliberately empty: its presence alone keeps Node from ending the process on SIGINT.
});
