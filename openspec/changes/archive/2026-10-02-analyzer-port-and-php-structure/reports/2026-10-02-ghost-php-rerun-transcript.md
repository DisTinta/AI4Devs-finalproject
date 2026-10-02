# Transcript — re-run "The analyzer reads only the content it receives"

- Date: 2026-10-02
- Why: the original #4 entry in `2026-10-02-show-spec-working.md` only showed determinism across two
  in-memory runs of the real `fixtures/acme-shop` files, which already exist on disk. That does not
  demonstrate the spec's actual claim — that the analyzer never touches disk itself, only the
  `content` string handed to it. This re-run isolates that claim with a path that does not exist on
  disk.

## Script

```ts
import { createPhpAnalyzer } from '@codemind/analyzer-php';
import * as fs from 'node:fs';

async function main() {
  const path = 'app/Ghost.php';
  console.log('exists on disk before analyze:', fs.existsSync(path));

  const analyzer = createPhpAnalyzer();
  const result = await analyzer.analyze({
    files: [{ path, content: '<?php class Ghost {}' }],
  });

  console.log('exists on disk after analyze:', fs.existsSync(path));
  console.log(JSON.stringify(result, null, 1));
}

main();
```

Run as:

```
NODE_PATH="$(pwd)/node_modules" npx tsx <scratchpad>/demo-ghost.ts
```

## Output (verbatim)

```
exists on disk before analyze: false
exists on disk after analyze: false
{
 "files": [
  {
   "path": "app/Ghost.php",
   "kind": "source",
   "loc": 1
  }
 ],
 "symbols": [
  {
   "file": "app/Ghost.php",
   "name": "Ghost",
   "kind": "class",
   "signature": "class Ghost",
   "startLine": 1,
   "endLine": 1
  }
 ],
 "edges": [],
 "diagnostics": []
}
```

`app/Ghost.php` did not exist on disk before or after the call (confirmed separately: `app/` is not a
directory at the repo root). The analyzer produced `files`, a `class Ghost` symbol and `loc: 1` purely
from the `content` string — proof the analyzer reads only the content it receives, not the filesystem.

The scratch script was deleted after this transcript was written (same convention as the main
show-spec-working report).
