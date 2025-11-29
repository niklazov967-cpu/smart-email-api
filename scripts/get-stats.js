/**
 * Database Statistics Script
 * Quick stats from Supabase using existing credentials
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getStats() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  📊 ПОЛНАЯ СТАТИСТИКА ВСЕХ ЭТАПОВ                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // 1. Total companies
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣ ОБЩЕЕ КОЛИЧЕСТВО КОМПАНИЙ:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { count: totalCount, error: e1 } = await supabase
    .from('pending_companies')
    .select('*', { count: 'exact', head: true });
  
  if (e1) console.error('Error:', e1.message);
  else console.log(`Total Companies: ${totalCount}\n`);

  // 2. Status breakdown
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣ СТАТУСЫ ПО ЭТАПАМ:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { data: statusData, error: e2 } = await supabase
    .from('pending_companies')
    .select('current_stage, stage2_status, stage3_status');
  
  if (e2) {
    console.error('Error:', e2.message);
  } else {
    const grouped = {};
    statusData.forEach(row => {
      const key = `Stage ${row.current_stage} | S2: ${row.stage2_status || 'null'} | S3: ${row.stage3_status || 'null'}`;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    
    Object.entries(grouped)
      .sort()
      .forEach(([key, count]) => console.log(`${key}: ${count}`));
    console.log('');
  }

  // 3. Websites
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣ КОМПАНИИ С САЙТАМИ:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { data: websiteData, error: e3 } = await supabase
    .from('pending_companies')
    .select('website');
  
  if (e3) {
    console.error('Error:', e3.message);
  } else {
    const withWebsite = websiteData.filter(r => r.website).length;
    const noWebsite = websiteData.length - withWebsite;
    console.log(`Total: ${websiteData.length}`);
    console.log(`With Website: ${withWebsite} (${(withWebsite/websiteData.length*100).toFixed(1)}%)`);
    console.log(`No Website: ${noWebsite} (${(noWebsite/websiteData.length*100).toFixed(1)}%)\n`);
  }

  // 4. Emails
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('4️⃣ КОМПАНИИ С EMAIL:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const { data: emailData, error: e4 } = await supabase
    .from('pending_companies')
    .select('email');
  
  if (e4) {
    console.error('Error:', e4.message);
  } else {
    const withEmail = emailData.filter(r => r.email).length;
    const noEmail = emailData.length - withEmail;
    console.log(`Total: ${emailData.length}`);
    console.log(`With Email: ${withEmail} (${(withEmail/emailData.length*100).toFixed(1)}%)`);
    console.log(`No Email: ${noEmail} (${(noEmail/emailData.length*100).toFixed(1)}%)\n`);
  }

  // 5. Top companies with email
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('5️⃣ ТОП-20 КОМПАНИЙ С EMAIL (финальный результат):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const { data: topCompanies, error: e5 } = await supabase
    .from('pending_companies')
    .select('company_name, website, email, current_stage, stage2_status, stage3_status')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (e5) {
    console.error('Error:', e5.message);
  } else {
    topCompanies.forEach((c, i) => {
      console.log(`${i + 1}. ${c.company_name}`);
      console.log(`   Website: ${c.website || 'N/A'}`);
      console.log(`   Email: ${c.email}`);
      console.log(`   Stage: ${c.current_stage} | S2: ${c.stage2_status} | S3: ${c.stage3_status}`);
      console.log('');
    });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

getStats().catch(console.error);

