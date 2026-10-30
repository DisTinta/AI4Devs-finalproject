import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { runInTransaction } from '../../../packages/adapters/store-postgres/src/transaction';

// Spec: openspec/changes/pool-transaction-release/specs/graph-store/spec.md → "Running work in one
// transaction on a pooled store" (DIS-110 design D1-D5). A real Postgres cannot be made to fail its
// BEGIN or ROLLBACK on demand, so the runner is driven over a stub pool whose client records what it is
// sent and how it is released (template: postgres-cache-write-errors.spec.ts).

type Behaviour = Partial<Record<'BEGIN' | 'COMMIT' | 'ROLLBACK', Error>>;

/** A stub client: each statement succeeds unless `behaviour` names an error for it. */
function stubClient(behaviour: Behaviour = {}) {
  const query = vi.fn(async (sql: string) => {
    const failure = behaviour[sql as keyof Behaviour];
    if (failure) throw failure;
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

/** A stub pool that hands out `client`. */
function stubPool(client: ReturnType<typeof stubClient>): Pool {
  return { connect: async () => client } as unknown as Pool;
}

/** The statements sent to `client`, in order. */
function sent(client: ReturnType<typeof stubClient>): string[] {
  return client.query.mock.calls.map(([sql]) => sql);
}

/** The rejection of `run`, or `undefined` when it resolves. */
async function rejectionOf(run: Promise<unknown>): Promise<unknown> {
  return run.then(
    () => undefined,
    (rejection: unknown) => rejection,
  );
}

const COMMIT_TEXT = 'commit failed: password=s3cret host=db.internal';

describe('graph-store: the transaction runner over a pool', () => {
  it('A transaction that ends cleanly returns its connection to the pool', async () => {
    // Arrange
    const first = stubClient();
    const second = stubClient();
    const failure = new Error('work failed');

    // Act
    const resolved = await runInTransaction(stubPool(first), async () => 42);
    const rejected = await rejectionOf(
      runInTransaction(stubPool(second), async () => {
        throw failure;
      }),
    );

    // Assert
    expect(resolved).toBe(42);
    expect(sent(first)).toEqual(['BEGIN', 'COMMIT']);
    expect(rejected).toBe(failure);
    expect(sent(second)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(first.release).toHaveBeenCalledWith(undefined);
    expect(second.release).toHaveBeenCalledTimes(1);
    expect(second.release).toHaveBeenCalledWith(undefined);
  });

  it('The work receives a store bound to the borrowed connection', async () => {
    // Arrange
    const client = stubClient();

    // Act
    await runInTransaction(stubPool(client), (store) => store.listProjects());

    // Assert
    expect(sent(client)[0]).toBe('BEGIN');
    expect(sent(client).length).toBeGreaterThan(2);
    expect(sent(client).at(-1)).toBe('COMMIT');
  });

  it('A failed begin destroys the connection', async () => {
    // Arrange
    const begin = new Error('begin failed');
    const client = stubClient({ BEGIN: begin });
    const work = vi.fn(async () => 'never');

    // Act
    const rejected = await rejectionOf(runInTransaction(stubPool(client), work));

    // Assert
    expect(rejected).toBe(begin);
    expect(work).not.toHaveBeenCalled();
    expect(sent(client)).not.toContain('COMMIT');
    expect(sent(client)).not.toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(begin);
  });

  it("A failed rollback keeps the work's error and destroys the connection", async () => {
    // Arrange
    const rollback = new Error('rollback failed');
    const failure = new Error('work failed');
    const client = stubClient({ ROLLBACK: rollback });

    // Act
    const rejected = await rejectionOf(
      runInTransaction(stubPool(client), async () => {
        throw failure;
      }),
    );

    // Assert
    expect(rejected).toBe(failure);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(rollback);
  });

  it('A failed commit rejects with a fixed message whatever its rollback does', async () => {
    // Arrange
    const rollback = new Error('rollback failed: text of R');
    const clean = stubClient({ COMMIT: new Error(COMMIT_TEXT) });
    const broken = stubClient({ COMMIT: new Error(COMMIT_TEXT), ROLLBACK: rollback });

    // Act
    const first = await rejectionOf(runInTransaction(stubPool(clean), async () => 'done'));
    const second = await rejectionOf(runInTransaction(stubPool(broken), async () => 'done'));

    // Assert
    for (const error of [first, second]) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('the transaction could not be committed');
      expect((error as Error).cause).toBeUndefined();
      const serialised =
        JSON.stringify((error as Error).message) +
        JSON.stringify((error as Error).stack) +
        JSON.stringify(Object.getOwnPropertyNames(error).map((key) => (error as unknown as Record<string, unknown>)[key]));
      for (const forbidden of ['s3cret', 'db.internal', COMMIT_TEXT, 'text of R', 'rollback failed']) {
        expect(serialised).not.toContain(forbidden);
      }
    }
    expect(clean.release).toHaveBeenCalledTimes(1);
    expect(clean.release).toHaveBeenCalledWith(undefined);
    expect(broken.release).toHaveBeenCalledTimes(1);
    expect(broken.release).toHaveBeenCalledWith(rollback);
  });

  it('A run leaves no error listener on its connection', async () => {
    // Arrange
    const clean = stubClient();
    const failedBegin = stubClient({ BEGIN: new Error('begin failed') });

    // Act
    await runInTransaction(stubPool(clean), async () => 'done');
    await rejectionOf(runInTransaction(stubPool(failedBegin), async () => 'never'));

    // Assert
    for (const client of [clean, failedBegin]) {
      expect(client.on).toHaveBeenCalledTimes(1);
      expect(client.on.mock.calls[0]![0]).toBe('error');
      const added = client.on.mock.calls[0]![1];
      expect(client.removeListener).toHaveBeenCalledTimes(1);
      expect(client.removeListener).toHaveBeenCalledWith('error', added);
      expect(client.removeListener.mock.invocationCallOrder[0]!).toBeLessThan(client.release.mock.invocationCallOrder[0]!);
    }
  });
});
