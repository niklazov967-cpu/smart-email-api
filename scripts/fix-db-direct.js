const { Client } = require('pg');

// Пробуем разные варианты подключения
const configs = [
  {
    name: 'Direct connection',
    config: {
      host: 'db.ptbefsrvvcrjrfxxtogt.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'ui3yHqoPMTUFK3GY',
      ssl: { rejectUnauthorized: false }
    }
  },
  {
    name: 'Pooler connection',
    config: {
      host: 'aws-0-eu-central-1.pooler.supabase.com',
      port: 6543,
      database: 'postgres',
      user: 'postgres.ptbefsrvvcrjrfxxtogt',
      password: 'ui3yHqoPMTUFK3GY',
      ssl: { rejectUnauthorized: false }
    }
  }
];

async function tryConnection(name, config) {
  const client = new Client(config);
  
  try {
    console.log(`\n🔌 Trying ${name}...`);
    await client.connect();
    console.log('✅ Connected!\n');

    // Выполнить ALTER TABLE
    console.log('📝 Adding columns...\n');
    
    await client.query(`
      ALTER TABLE public.api_credits_log 
      ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS model_name TEXT;
    `);
    
    console.log('✅ Columns added!\n');

    // Проверить
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'api_credits_log' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log('📊 Table structure:');
    result.rows.forEach(row => {
      console.log(`   • ${row.column_name} (${row.data_type})`);
    });

    console.log('\n✅ SUCCESS!\n');
    await client.end();
    return true;

  } catch (error) {
    console.log(`❌ Failed: ${error.message}\n`);
    try { await client.end(); } catch {}
    return false;
  }
}

async function fix() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      🔧 FIXING api_credits_log TABLE                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  for (const { name, config } of configs) {
    const success = await tryConnection(name, config);
    if (success) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ TABLE FIXED SUCCESSFULLY!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }
  }

  console.log('❌ All connection attempts failed\n');
  process.exit(1);
}

fix();
