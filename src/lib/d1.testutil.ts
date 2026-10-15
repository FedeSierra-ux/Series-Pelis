import type { D1, D1Stmt } from '../../functions/_auth'

// D1 de mentira para los tests: SQLite de Node (`node:sqlite`, Node 22.13+) con la misma interfaz
// mínima que usan las Pages Functions (prepare/bind/first/all/run y batch en una transacción).

interface SqliteStatement {
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
  run(...args: unknown[]): { changes: number | bigint }
}
interface SqliteDb {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
}

const conv = (args: unknown[]) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a))

export async function fakeD1(): Promise<D1 & { raw: SqliteDb }> {
  const mod = 'node:sqlite'
  const { DatabaseSync } = (await import(/* @vite-ignore */ mod)) as { DatabaseSync: new (path: string) => SqliteDb }
  const db = new DatabaseSync(':memory:')
  const stmt = (sql: string, args: unknown[] = []): D1Stmt => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (db.prepare(sql).get(...conv(args)) ?? null) as T | null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...conv(args)) as T[] }),
    run: async () => ({ results: [], meta: { changes: Number(db.prepare(sql).run(...conv(args)).changes) } }),
  })
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.run())
        db.exec('COMMIT')
        return out
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
  }
}
