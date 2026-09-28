// Drives the pool watchdog against a real pg Pool and a real local Postgres.
// Run: WATCHDOG_TEST_DATABASE_URI=postgres://... pnpm test:watchdog
import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'

import { startPoolWatchdog } from '../src/utilities/poolWatchdog.ts'

const databaseURI = process.env.WATCHDOG_TEST_DATABASE_URI
// Fail rather than skip: a skipped test reads as a pass.
assert.ok(databaseURI, 'WATCHDOG_TEST_DATABASE_URI must point at a throwaway local Postgres')

const intervalMs = 50
const connectionTimeoutMillis = 300
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function spies() {
  const lines = { info: [], warn: [], error: [] }
  const exits = []
  return {
    lines,
    exits,
    log: {
      info: (m) => lines.info.push(m),
      warn: (m) => lines.warn.push(m),
      error: (m) => lines.error.push(m),
    },
    exit: (code) => exits.push(code),
  }
}

// Long enough for failuresToExit probes, each waiting out the acquire timeout.
const waitForProbes = (n) => sleep(n * (intervalMs + connectionTimeoutMillis) + 1500)

test('a wedged pool (every connection held forever) makes the watchdog exit 1', async () => {
  const pool = new pg.Pool({ connectionString: databaseURI, max: 1, connectionTimeoutMillis })
  const newClient = () => new pg.Client(pool.options)
  const held = await pool.connect() // the only slot, never released: the wedge
  const s = spies()

  const stop = startPoolWatchdog({ pool, newClient, log: s.log, exit: s.exit, intervalMs })
  await waitForProbes(3)
  stop()
  // Before asserting: a held client left open keeps the test process alive.
  held.release()
  await pool.end()

  assert.deepEqual(s.exits, [1])
  assert.equal(s.lines.error.length, 1)
  assert.match(s.lines.error[0], /pool wedged: 3 consecutive probes failed \(timeout exceeded when trying to connect\)/)
})

test('one timeout followed by recovery does not exit', async () => {
  const pool = new pg.Pool({ connectionString: databaseURI, max: 1, connectionTimeoutMillis })
  const newClient = () => new pg.Client(pool.options)
  const held = await pool.connect()
  const s = spies()
  // Record each probe's outcome, so the test proves a timeout really happened.
  const probes = []
  const recorded = {
    query: (sql) =>
      pool.query(sql).then(
        (r) => (probes.push('ok'), r),
        (e) => {
          probes.push('fail')
          throw e
        },
      ),
  }

  const stop = startPoolWatchdog({ pool: recorded, newClient, log: s.log, exit: s.exit, intervalMs })
  await sleep(intervalMs + connectionTimeoutMillis + 100) // first probe times out
  held.release()
  await waitForProbes(4)
  stop()
  await pool.end()

  assert.equal(probes[0], 'fail')
  assert.ok(probes.includes('ok'))
  assert.deepEqual(s.exits, [])
  assert.deepEqual(s.lines.error, [])
  assert.deepEqual(s.lines.warn, [])
})

test('an unreachable database does not exit, so there is no restart loop', async () => {
  // Nothing listens on port 1: the pool and the fresh connection both fail.
  const pool = new pg.Pool({
    connectionString: 'postgres://postgres:postgres@127.0.0.1:1/none',
    max: 1,
    connectionTimeoutMillis,
  })
  const newClient = () => new pg.Client(pool.options)
  const s = spies()

  const stop = startPoolWatchdog({ pool, newClient, log: s.log, exit: s.exit, intervalMs })
  await waitForProbes(4)
  stop()
  await pool.end()

  assert.deepEqual(s.exits, [])
  assert.deepEqual(s.lines.error, [])
  assert.ok(s.lines.warn.length >= 1)
  assert.match(s.lines.warn[0], /database is unreachable.*Not exiting/)
})
