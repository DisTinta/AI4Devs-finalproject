---
name: explain
description: Use when the user asks how something works, why the code is like this, or asks to understand a module, an error or a decision. Explains before touching anything.
author: sdd-harness-kit
version: 1.0.0
argument-hint: [what to explain]
context: fork
agent: Explore
allowed-tools: Read Grep Glob Bash(git log *) Bash(git blame *)
---

## Instructions

Explain: $ARGUMENTS

If the topic is not clear from the arguments, **ask**. Do not invent a topic.

**Never jump to fixes.** This skill produces understanding, not changes. If the explanation reveals a
bug, say so at the end and stop; the human decides whether to open work for it.

Answer in these four sections, in this order:

### 1. What it does
The observable behaviour, in plain language. What goes in, what comes out, what changes in the world.

### 2. How it does it
The path through the code, with real paths and line numbers. Follow the actual call chain: do not
reconstruct it from the names.

### 3. Why it is like this
Look for the reason before guessing at it: check the decision records, the change history, the commit
that introduced it. If you find the reason, cite it. **If you do not, say that you do not know** rather
than inventing a plausible rationale — a confident wrong reason is worse than an admitted gap, because
the next person will build on it.

### 4. What to watch out for
The non-obvious parts: implicit coupling, assumptions that hold only today, edge cases that are handled
somewhere far from where you would look.

Cite a path and line for every factual claim. Without a citation it is a guess, and it should be
labelled as one.
