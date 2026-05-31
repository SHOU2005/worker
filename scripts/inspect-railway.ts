import { Client } from 'pg'

const URL: string = process.argv[2] || process.env.RAILWAY_DB_URL || ''
if (!URL) { console.error('Usage: ts-node scripts/inspect-railway.ts <connection-url>'); process.exit(1) }

async function main() {
  // Strip any sslmode from URL — pg's strict SSL can't talk to Railway's proxy cert.
  const cleanUrl = URL.replace(/[?&]sslmode=[^&]+/, '').replace(/[?&]$/, '')
  const useSsl = process.env.NO_SSL !== '1'
  const c = new Client({
    connectionString: cleanUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  })
  console.log(`Connecting (ssl=${useSsl})…`)
  await c.connect()
  console.log('Connected ✓\n')

  // 1. List all tables
  const tables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `)
  console.log(`=== Tables (${tables.rows.length}) ===`)
  tables.rows.forEach(r => console.log(`  - ${r.table_name}`))
  console.log()

  // 2. Has Prisma been used?
  const hasPrisma = tables.rows.some(r => r.table_name === '_prisma_migrations')
  if (hasPrisma) {
    const mig = await c.query(`
      SELECT migration_name, finished_at, applied_steps_count
      FROM _prisma_migrations
      ORDER BY started_at
    `)
    console.log('=== Applied Prisma migrations ===')
    mig.rows.forEach(r => console.log(`  - ${r.migration_name} ${r.finished_at ? '✓' : '⚠ unfinished'}`))
    console.log()
  } else {
    console.log('=== Prisma migrations: NONE (no _prisma_migrations table)\n')
  }

  // 3. Row counts on tables we care about (the Switch core)
  const switchTables = ['User', 'WorkerProfile', 'EmployerProfile', 'CaptainProfile', 'OpsProfile',
                        'Shift', 'Booking', 'Payment', 'Rating', 'Notification', 'OtpLog',
                        'Commission', 'CaptainTask', 'CaptainAttendance', 'BroadcastLog',
                        'AadhaarAccessLog', 'DataDeletionRequest']
  console.log('=== Row counts on Switch tables ===')
  for (const t of switchTables) {
    const exists = tables.rows.some(r => r.table_name === t)
    if (!exists) {
      console.log(`  ${t.padEnd(24)} — NOT IN DB`)
      continue
    }
    try {
      const r = await c.query(`SELECT COUNT(*)::int AS n FROM "${t}"`)
      console.log(`  ${t.padEnd(24)} ${r.rows[0].n} rows`)
    } catch (err) {
      console.log(`  ${t.padEnd(24)} ERROR: ${(err as Error).message}`)
    }
  }
  console.log()

  // 4. List unexpected tables (not in our schema)
  const expected = new Set([
    ...switchTables,
    '_prisma_migrations',
    'Availability',
  ])
  const unexpected = tables.rows.filter(r => !expected.has(r.table_name))
  if (unexpected.length) {
    console.log('=== Tables present that are NOT in our current schema ===')
    unexpected.forEach(r => console.log(`  - ${r.table_name}`))
    console.log()
  }

  // 5. User-table column shape (most important — JWT/auth depends on it)
  if (tables.rows.some(r => r.table_name === 'User')) {
    const cols = await c.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='User'
      ORDER BY ordinal_position
    `)
    console.log('=== User columns ===')
    cols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(22)} ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`))
    console.log()
  }

  // 6. WorkerProfile column shape (Aadhaar fields are the riskiest)
  if (tables.rows.some(r => r.table_name === 'WorkerProfile')) {
    const cols = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='WorkerProfile'
      ORDER BY ordinal_position
    `)
    console.log('=== WorkerProfile columns ===')
    cols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(28)} ${r.data_type}`))
    console.log()
  }

  // 7. Booking column shape
  if (tables.rows.some(r => r.table_name === 'Booking')) {
    const cols = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Booking'
      ORDER BY ordinal_position
    `)
    console.log('=== Booking columns ===')
    cols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(22)} ${r.data_type}`))
    console.log()
  }

  await c.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
