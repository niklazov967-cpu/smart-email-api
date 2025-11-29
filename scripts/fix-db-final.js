const { Client } = require('pg');

const client = new Client({
  host: 'db.ptbefsrvvcrjrfxxtogt.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'ui3yHqoPMTUFK3GY',
  ssl: { rejectUnauthorized: false }
});

async function fixDatabase() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                   ║');
  console.log('║      🔧 FIXING api_credits_log TABLE                              ║');
  console.log('║                                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔌 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected!\n');

    // Добавить колонки
    console.log('📝 Adding missing columns...\n');
    
    const alterSQL = `
      ALTER TABLE public.api_credits_log 
      ADD COLUMN IF NOT EXISTS request_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS response_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS model_name TEXT;
    `;
    
    await client.query(alterSQL);
    
    console.log('✅ Columns added successfully!\n');

    // Проверить структуру
    console.log('📊 Checking table structure...\n');
    
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'api_credits_log' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TABLE STRUCTURE:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Column Name              | Data Type        | Default');
    console.log('─────────────────────────┼──────────────────┼────────────────');
    result.rows.forEach(row => {
      const name = row.column_name.padEnd(24);
      const type = row.data_type.padEnd(16);
      const def = (row.column_default || 'NULL').substring(0, 20);
      console.log(`${name} | ${type} | ${def}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TABLE FIXED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🎉 api_credits_log теперь будет заполняться!');
    console.log('📊 Теперь будет видно:');
    console.log('   • request_tokens (токены в запросе)');
    console.log('   • response_tokens (токены в ответе)');
    console.log('   • total_tokens (всего токенов)');
    console.log('   • model_name (какая нейросеть работает!) 🔥\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) console.error('Error code:', error.code);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixDatabase();
