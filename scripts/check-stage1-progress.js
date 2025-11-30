#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('🔍 Checking stage1_progress table...\n');
  
  try {
    const { data, error } = await supabase
      .from('stage1_progress')
      .select('*')
      .limit(5);
    
    if (error) {
      console.error('❌ Table does not exist or error:', error.message);
      console.log('\n⚠️  Please create the table manually in Supabase SQL Editor!');
      console.log('   SQL: database/create-stage1-progress-table.sql\n');
      return;
    }
    
    console.log('✅ Table exists!');
    console.log(`   Rows: ${data.length}`);
    
    if (data.length > 0) {
      console.log('\n📊 Recent progress:');
      data.forEach(row => {
        console.log(`   Session: ${row.session_id}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Progress: ${row.processed_queries}/${row.total_queries}`);
        console.log(`   Remaining: ${row.remaining_queries}`);
        console.log(`   Updated: ${row.updated_at}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

check();
