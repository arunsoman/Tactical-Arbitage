import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function databaseUrl(): string | undefined {
  if (!process.env.VERCEL) return process.env.DATABASE_URL

  // Vercel functions have a read-only application bundle and a writable /tmp.
  // Copy the bundled demo database on cold start so the interactive demo can
  // perform writes. This is intentionally ephemeral, not production storage.
  const runtimeDb = '/tmp/tactical-arbitrage-custom.db'
  if (!existsSync(runtimeDb)) {
    copyFileSync(join(process.cwd(), 'db', 'custom.db'), runtimeDb)
  }
  return `file:${runtimeDb}`
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: databaseUrl(),
  log: ['query'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
