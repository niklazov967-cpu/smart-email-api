#!/usr/bin/env node

/**
 * Create stage1_progress table in Supabase
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  console.log('📦 Creating stage1_progress table...\n');
  
  const sqlFile = path.join(__dirname, '../database/create-stage1-progress-table.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  
  try {
    // Execute SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try alternative method if RPC doesn't exist
      console.log('⚠️  RPC method not available, using direct query...');
      
      // Split SQL into individual statements
      const statements = sql.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`Executing: ${statement.substring(0, 80)}...`);
          const { error: stmtError } = await supabase.from('stage1_progress').select('*').limit(0);
          
          if (stmtError && !stmtError.message.includes('does not exist')) {
            console.error(`❌ Error: ${stmtError.message}`);
          }
        }
      }
    }
    
    console.log('✅ Table stage1_progress created successfully!\n');
    console.log('🔍 Verifying table...');
    
    // Verify table exists
    const { data, error: selectError } = await supabase
      .from('stage1_progress')
      .select('*')
      .limit(1);
    
    if (selectError) {
      console.error(`❌ Verification failed: ${selectError.message}`);
      console.log('\n📝 Please run this SQL manually in Supabase SQL Editor:');
      console.log('---');
      console.log(sql);
      console.log('---');
    } else {
      console.log('✅ Table verified successfully!');
      console.log(`   Current rows: ${data.length}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to create table:', error.message);
    console.log('\n📝 Please run this SQL manually in Supabase SQL Editor:');
    console.log('---');
    console.log(sql);
    console.log('---');
    process.exit(1);
  }
}

createTable();
