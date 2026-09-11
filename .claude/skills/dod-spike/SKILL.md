---
name: dod-spike
description: Use when asked for the definition of done of a spike, a technical investigation, a proof of concept or a time-boxed exploration.
author: sdd-harness-kit
version: 1.0.0
allowed-tools: Read Glob
---

Generate the definition of done for a **spike**. Output a markdown checklist.

## Definition of Done — Spike
- [ ] The time box was respected, or the spike was stopped explicitly when it ran out
- [ ] Output documented: findings, trade-offs, recommendation
- [ ] An ADR exists if the investigation closes an architectural decision
- [ ] An explicit next step: continue / pivot / cancel
- [ ] The spike code is discarded or clearly marked as throwaway. It is not merged as it stands
- [ ] Actual time recorded, to calibrate future spikes

Do not apply TDD to a spike: if the code goes in the bin in three days, so do its tests. The deliverable
of a spike is a decision, not software.
