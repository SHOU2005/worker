/**
 * One-shot backup using `pg` library (no pg_dump binary needed).
 * Dumps every table's rows to JSON files inside ./backups/<timestamp>/.
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/manual-backup.ts
 *
 * NOT a real Postgres dump — schema isn't included. Use this as a safety blanket
 * until the GitHub Actions workflow is wired up.
 */
import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'

async function main() {
  const url = process.env.DIRECT_URL
  if (!url) { console.error('DIRECT_URL not set in .env'); process.exit(1) }

  const c = new Client({ connectionString: url })
  await c.connect()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(__dirname, '..', 'backups', stamp)
  fs.mkdirSync(outDir, { recursive: true })

  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `)

  let totalRows = 0
  for (const { table_name } of tables.rows) {
    const r = await c.query(`SELECT * FROM "${table_name}"`)
    fs.writeFileSync(
      path.join(outDir, `${table_name}.json`),
      JSON.stringify(r.rows, null, 2),
    )
    totalRows += r.rows.length
    console.log(`  ${table_name.padEnd(28)} ${r.rows.length} rows`)
  }
  await c.end()

  console.log(`\n✓ Backup written to ${outDir}`)
  console.log(`  ${tables.rows.length} tables, ${totalRows} total rows`)
}

main().catch(e => { console.error(e); process.exit(1) })
