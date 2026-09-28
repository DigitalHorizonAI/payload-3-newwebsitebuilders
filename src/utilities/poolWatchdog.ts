// No imports on purpose: tests/pool-watchdog.test.mjs loads this file directly with Node.

type Queryable = { query: (sql: string) => Promise<unknown> }

type FreshClient = Queryable & {
  connect: () => Promise<unknown>
  end: () => Promise<unknown>
}

type Log = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

let started = false

/**
 * Exit the process when the connection pool stops handing out connections
 * but the database still accepts a fresh one, so Railway's restart policy
 * brings the service back. A manual restart was the only fix for the pool
 * wedges on this fleet; this does the same thing without a person.
 *
 * The fresh-connection check is the restart-loop guard: when the database
 * itself is unreachable a restart cannot help, so the watchdog logs and keeps
 * waiting instead of exiting.
 *
 * Known limit: a pool saturated by genuinely slow queries for
 * failuresToExit × (intervalMs + connectionTimeoutMillis) also triggers a
 * restart. On a 4-connection pool that is an outage anyway; if it ever fires
 * on load, compare pool.waitingCount against pool.totalCount before exiting.
 */
export function startPoolWatchdog({
  pool,
  newClient,
  log,
  intervalMs = 30_000,
  failuresToExit = 3,
  exit = (code: number) => process.exit(code),
}: {
  pool: Queryable
  /** A client outside the pool, with the pool's own connection settings. */
  newClient: () => FreshClient
  log: Log
  intervalMs?: number
  failuresToExit?: number
  exit?: (code: number) => void
}): () => void {
  let failures = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const freshConnectionWorks = async (): Promise<boolean> => {
    const client = newClient()
    try {
      await client.connect()
      await client.query('select 1')
      return true
    } catch {
      return false
    } finally {
      await client.end().catch(() => {})
    }
  }

  const tick = async () => {
    try {
      await pool.query('select 1')
      failures = 0
    } catch (err) {
      failures++
      const reason = err instanceof Error ? err.message : String(err)
      if (failures >= failuresToExit) {
        if (await freshConnectionWorks()) {
          log.error(
            `[pool-watchdog] Postgres pool wedged: ${failures} consecutive probes failed (${reason}); a fresh connection succeeds. Exiting so Railway restarts the service.`,
          )
          stopped = true
          exit(1)
          return
        }
        log.warn(
          `[pool-watchdog] ${failures} consecutive probes failed (${reason}) and a fresh connection fails too: the database is unreachable, so a restart would not help. Not exiting.`,
        )
      }
    }
    if (!stopped) schedule()
  }

  const schedule = () => {
    timer = setTimeout(() => void tick(), intervalMs)
    // Never keep a process (a CLI script, a build worker) alive just to probe.
    timer.unref()
  }

  log.info(
    `[pool-watchdog] started (${intervalMs / 1000}s interval, exit after ${failuresToExit} failures)`,
  )
  schedule()

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

/** Starts the watchdog once per process; a second Payload init is a no-op. */
export function startPoolWatchdogOnce(args: Parameters<typeof startPoolWatchdog>[0]): void {
  if (started) return
  started = true
  startPoolWatchdog(args)
}
