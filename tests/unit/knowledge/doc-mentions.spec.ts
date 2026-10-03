import { describe, expect, it } from 'vitest';
import { docMentionEdges, DOC_MENTION_EXTRACTOR } from '@codemind/core';
import type { GraphSymbol } from '@codemind/core';
import type { SourceFile } from '@codemind/core';

// Spec: openspec/changes/php-declarative-edges/specs/code-analysis/spec.md →
// "Documentation mention edges". Each `it` is one scenario, named after it.

function classSymbol(name: string, file: string, startLine = 1): GraphSymbol {
  return { kind: 'class', file, name, startLine, endLine: startLine };
}

function methodSymbol(name: string, file: string, startLine = 1): GraphSymbol {
  return { kind: 'method', file, name, startLine, endLine: startLine };
}

describe('docMentionEdges', () => {
  it('extractor is the literal "doc-mention", shared by every analyzer', () => {
    expect(DOC_MENTION_EXTRACTOR).toBe('doc-mention');
  });

  it('Prose and ambiguous names produce no describes edge', () => {
    // Arrange
    const doc: SourceFile = {
      path: 'docs/a.md',
      content: 'Order of operations: see `Order` and `Line` and `Total::sum`.',
    };
    const symbols = [
      classSymbol('Order', 'app/Order.php'),
      classSymbol('Line', 'app/A/Line.php'),
      classSymbol('Line', 'app/B/Line.php'),
      methodSymbol('Total::sum', 'app/Total.php'),
    ];

    // Act
    const edges = docMentionEdges([doc], symbols);

    // Assert
    expect(edges).toEqual([
      {
        source: { file: 'docs/a.md' },
        target: { symbol: { file: 'app/Order.php', name: 'Order', startLine: 1 } },
        kind: 'describes',
        resolution: 'heuristic',
        extractor: DOC_MENTION_EXTRACTOR,
      },
      {
        source: { file: 'docs/a.md' },
        target: { symbol: { file: 'app/Total.php', name: 'Total::sum', startLine: 1 } },
        kind: 'describes',
        resolution: 'heuristic',
        extractor: DOC_MENTION_EXTRACTOR,
      },
    ]);
  });

  // Mutation-oriented cases, not spec scenarios.
  describe('mutation boundaries', () => {
    it('ignores a non-doc file even when it names a symbol in backticks', () => {
      // Arrange
      const source: SourceFile = { path: 'app/notes.php', content: 'See `Order` below.' };
      const symbols = [classSymbol('Order', 'app/Order.php')];

      // Act
      const edges = docMentionEdges([source], symbols);

      // Assert
      expect(edges).toEqual([]);
    });

    it('an unclosed fence produces nothing after it', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: '```\nOrder\n`Order`' };
      const symbols = [classSymbol('Order', 'app/Order.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([]);
    });

    it('a backtick pair across two lines is not a span', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: 'see `Order\nand Line`' };
      const symbols = [classSymbol('Order', 'app/Order.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([]);
    });

    it('a route symbol name never matches, even an unambiguous one', () => {
      // Arrange: a synthetic identifier-shaped name isolates the kind filter from the fact that a
      // real route name ("GET /orders") already cannot tokenise as one identifier.
      const doc: SourceFile = { path: 'docs/a.md', content: 'see `Foo`' };
      const route: GraphSymbol = { kind: 'route', file: 'routes/api.php', name: 'Foo', startLine: 1, endLine: 1 };

      // Act
      const edges = docMentionEdges([doc], [route]);

      // Assert
      expect(edges).toEqual([]);
    });

    it('a name repeated in one doc gives one edge', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: 'see `Order` then `Order` again' };
      const symbols = [classSymbol('Order', 'app/Order.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Order.php', name: 'Order', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('matches only the whole identifier, never a truncated prefix', () => {
      // Arrange: `Orde` exists only to catch a resolver that drops the token's last character.
      const doc: SourceFile = { path: 'docs/a.md', content: 'see `Order`' };
      const symbols = [classSymbol('Order', 'app/Order.php'), classSymbol('Orde', 'app/Orde.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Order.php', name: 'Order', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('a one-letter class joined by :: also mentions the class alone', () => {
      // Arrange: the `::` sits at index 1, the boundary the prefix check must still catch.
      const doc: SourceFile = { path: 'docs/a.md', content: 'see `A::foo`' };
      const symbols = [classSymbol('A', 'app/A.php'), methodSymbol('A::foo', 'app/A.php', 3)];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/A.php', name: 'A::foo', startLine: 3 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/A.php', name: 'A', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('a closed fenced block is extracted exactly, and joined across its lines', () => {
      // Arrange: starting the doc with the fence also exercises the off-by-one boundary of the slice.
      const doc: SourceFile = { path: 'docs/a.md', content: '```\nFoo\nBar\n```' };
      const symbols = [classSymbol('Foo', 'app/Foo.php'), classSymbol('Bar', 'app/Bar.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Foo.php', name: 'Foo', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Bar.php', name: 'Bar', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('prose before a fenced block is never swallowed into it', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: 'See Ghost here.\n```\ncode\n```' };
      const symbols = [classSymbol('Ghost', 'app/Ghost.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([]);
    });

    it('a fenced block closes and parsing resumes for an inline span after it', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: '```\nFoo\n```\n`Bar`' };
      const symbols = [classSymbol('Foo', 'app/Foo.php'), classSymbol('Bar', 'app/Bar.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Foo.php', name: 'Foo', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Bar.php', name: 'Bar', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('a fence opener with trailing text after the backticks is still a fence line', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: '```php\nFoo\n```' };
      const symbols = [classSymbol('Foo', 'app/Foo.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Foo.php', name: 'Foo', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('a fence line is recognised after leading whitespace, not trailing whitespace', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: '  ```\nFoo\n  ```' };
      const symbols = [classSymbol('Foo', 'app/Foo.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Foo.php', name: 'Foo', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('joins separate inline spans with a boundary, never merging two identifiers', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: '`Foo`\n`Bar`' };
      const symbols = [classSymbol('Foo', 'app/Foo.php'), classSymbol('Bar', 'app/Bar.php')];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Foo.php', name: 'Foo', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Bar.php', name: 'Bar', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });

    it('Class::method text also mentions Class', () => {
      // Arrange
      const doc: SourceFile = { path: 'docs/a.md', content: 'see `Order::total`' };
      const symbols = [classSymbol('Order', 'app/Order.php'), methodSymbol('Order::total', 'app/Order.php', 5)];

      // Act
      const edges = docMentionEdges([doc], symbols);

      // Assert
      expect(edges).toEqual([
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Order.php', name: 'Order::total', startLine: 5 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
        {
          source: { file: 'docs/a.md' },
          target: { symbol: { file: 'app/Order.php', name: 'Order', startLine: 1 } },
          kind: 'describes',
          resolution: 'heuristic',
          extractor: DOC_MENTION_EXTRACTOR,
        },
      ]);
    });
  });
});
