/**
 * Accessibility smoke scaffold (axe-core).
 *
 * This file is NOT a test yet — Vitest / Jest will not pick it up (no `.test.` / `.spec.`).
 * The installer never overwrites it once it exists. The kit does not edit package.json.
 *
 * Wire the CI gate (`npm run test:a11y` in `.github/workflows/frontend.yml`):
 *   1. npm i -D axe-core vitest @testing-library/react jsdom
 *      (skip packages you already have)
 *   2. Rename this file to `smoke.a11y.test.tsx`
 *   3. Add to package.json scripts:
 *        "test:a11y": "vitest run tests/a11y"
 *   4. Replace `ExampleSurface` below with a real page or component from this app.
 *
 * A green run on the kit placeholder is wiring, not coverage. Automated axe catches a
 * fraction of WCAG 2.2 AA — still do a keyboard pass on critical journeys.
 *
 * See docs/frontend-standards.md
 */
/** @vitest-environment jsdom */
import { render } from '@testing-library/react'
import axe from 'axe-core'
import { expect, it } from 'vitest'

function ExampleSurface() {
  return (
    <main>
      <h1>Kit placeholder — not your app</h1>
      <p>Replace ExampleSurface with a real page or component from this repository.</p>
    </main>
  )
}

/** Point this at a real export. Leaving the placeholder only checks that axe runs. */
const SurfaceUnderTest = ExampleSurface

it('has no axe-core violations on the chosen surface', async () => {
  if (SurfaceUnderTest === ExampleSurface) {
    console.warn(
      'WARNING: test:a11y is still scanning the kit placeholder, not your app. ' +
        'Replace ExampleSurface — see docs/frontend-standards.md',
    )
  }
  const { container } = render(<SurfaceUnderTest />)
  const results = await axe.run(container)
  expect(results.violations).toEqual([])
})
