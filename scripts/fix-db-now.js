const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:ui3yHqoPMTUFK3GY@db.ptbefsrvvcrjrfxxtogt.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function fixDatabase() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                   ║');
  console.log('║      🔧 FIXING api_credits_log TABLE                              ║');
  console.log('║                                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL\n');

    // Добавить колонки
    console.log('📝 Adding missing columns...\n');
    
    await client.query(`
      ALTER TABLE public.api_credits_log 
      ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS model_name TEXT;
    `);
    
    console.log('✅ Columns added successfully!\n');

    // Проверить структуру
    console.log('📊 Checking table structure...\n');
    
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'api_credits_log' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log('Column Name              | Data Type        | Default');
    console.log('─────────────────────────┼──────────────────┼────────────────');
    result.rows.forEach(row => {
      const name = row.column_name.padEnd(24);
      const type = row.data_type.padEnd(16);
      const def = (row.column_default || '').substring(0, 20);
      console.log(`${name} | ${type} | ${def}`);
    });

    console.log('\n✅ Table fixed successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixDatabase();
