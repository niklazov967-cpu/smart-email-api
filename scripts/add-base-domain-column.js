/**
 * Migration: Add base_domain column to pending_companies
 * For TLD-based deduplication system
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addBaseDomainColumn() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     ADD base_domain COLUMN TO pending_companies               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('📊 Step 1: Adding base_domain column...\n');

    // Add base_domain column (nullable, no default)
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE pending_companies 
        ADD COLUMN IF NOT EXISTS base_domain TEXT;
        
        COMMENT ON COLUMN pending_companies.base_domain IS 
        'Domain name without TLD (e.g., wayken from wayken.cn) - for TLD-based deduplication';
      `
    });

    if (error) {
      // Try direct SQL if rpc doesn't work
      console.log('   ⚠️  RPC method failed, trying direct ALTER...\n');
      
      const { error: alterError } = await supabase
        .from('pending_companies')
        .select('base_domain')
        .limit(1);
      
      if (alterError && alterError.message.includes('column') && alterError.message.includes('does not exist')) {
        console.log('   ❌ Column does not exist and cannot be added via Supabase client');
        console.log('   ℹ️  Please run this SQL manually in Supabase Dashboard:\n');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   ALTER TABLE pending_companies ADD COLUMN base_domain TEXT;');
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.exit(1);
      } else {
        console.log('   ✅ Column already exists or was added successfully!\n');
      }
    } else {
      console.log('   ✅ Column added successfully!\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Step 2: Verifying column...\n');

    const { data: testData, error: testError } = await supabase
      .from('pending_companies')
      .select('company_id, base_domain')
      .limit(1);

    if (testError) {
      throw new Error(`Failed to verify column: ${testError.message}`);
    }

    console.log('   ✅ Column verified! Can read base_domain\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Step 3: Checking current data...\n');

    const { count: totalCount } = await supabase
      .from('pending_companies')
      .select('*', { count: 'exact', head: true });

    const { count: withBaseDomain } = await supabase
      .from('pending_companies')
      .select('*', { count: 'exact', head: true })
      .not('base_domain', 'is', null);

    const { count: withoutBaseDomain } = await supabase
      .from('pending_companies')
      .select('*', { count: 'exact', head: true })
      .is('base_domain', null);

    console.log(`   Total companies: ${totalCount}`);
    console.log(`   With base_domain: ${withBaseDomain}`);
    console.log(`   Without base_domain: ${withoutBaseDomain}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ MIGRATION COMPLETED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('   Next steps:');
    console.log('   1. Run fill-base-domains.js to populate existing records');
    console.log('   2. Stage 2/3/4 will automatically populate for new records\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

addBaseDomainColumn();

