export const port = Number(process.env.PORT ?? '3000')
export const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

export const postgresPort = Number(process.env.E2E_POSTGRES_PORT ?? '54343')
export const postgresDb = process.env.E2E_POSTGRES_DB ?? 'payload_e2e'
export const postgresUser = process.env.E2E_POSTGRES_USER ?? 'postgres'
export const postgresPassword = process.env.E2E_POSTGRES_PASSWORD ?? 'postgres'

export const databaseURL =
  process.env.DATABASE_URI ??
  `postgres://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${postgresDb}`

export const payloadSecret = process.env.PAYLOAD_SECRET ?? 'playwright-secret'
