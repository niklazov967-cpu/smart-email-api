const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ptbefsrvvcrjrfxxtogt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YmVmc3J2dmNyanJmeHh0b2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjIyMzIsImV4cCI6MjA3OTc5ODIzMn0.dGFxCU1q0uzc6HrZCUOJY3tp9_QHlFmUmqe2jtzVviA'
);

async function checkUniqueness() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          ПРОВЕРКА УНИКАЛЬНОСТИ В pending_companies             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Получаем все записи
  const { data: allRecords, error } = await supabase
    .from('pending_companies')
    .select('company_name, website, email, normalized_domain, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Ошибка:', error);
    return;
  }

  console.log(`📊 Всего записей в БД: ${allRecords.length}\n`);

  // Проверка дубликатов по normalized_domain
  const domainMap = {};
  const domainDuplicates = [];
  
  allRecords.forEach(record => {
    if (record.normalized_domain) {
      if (!domainMap[record.normalized_domain]) {
        domainMap[record.normalized_domain] = [];
      }
      domainMap[record.normalized_domain].push(record);
    }
  });

  Object.entries(domainMap).forEach(([domain, records]) => {
    if (records.length > 1) {
      domainDuplicates.push({ domain, records });
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1️⃣  ПРОВЕРКА ПО normalized_domain');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (domainDuplicates.length === 0) {
    console.log('✅ Дубликатов по normalized_domain НЕ НАЙДЕНО\n');
  } else {
    console.log(`❌ Найдено дубликатов: ${domainDuplicates.length}\n`);
    domainDuplicates.slice(0, 5).forEach(({ domain, records }) => {
      console.log(`   🔴 ${domain} (${records.length} записей):`);
      records.forEach(r => {
        console.log(`      - ${r.company_name} | ${r.website || 'no website'} | ${r.email || 'no email'}`);
      });
      console.log('');
    });
  }

  // Проверка дубликатов по company_name
  const nameMap = {};
  const nameDuplicates = [];
  
  allRecords.forEach(record => {
    if (record.company_name) {
      if (!nameMap[record.company_name]) {
        nameMap[record.company_name] = [];
      }
      nameMap[record.company_name].push(record);
    }
  });

  Object.entries(nameMap).forEach(([name, records]) => {
    if (records.length > 1) {
      nameDuplicates.push({ name, records });
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2️⃣  ПРОВЕРКА ПО company_name');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (nameDuplicates.length === 0) {
    console.log('✅ Дубликатов по company_name НЕ НАЙДЕНО\n');
  } else {
    console.log(`⚠️  Найдено дубликатов: ${nameDuplicates.length}\n`);
    nameDuplicates.slice(0, 5).forEach(({ name, records }) => {
      console.log(`   🟡 ${name} (${records.length} записей):`);
      records.forEach(r => {
        console.log(`      - domain: ${r.normalized_domain || 'none'} | website: ${r.website || 'none'} | email: ${r.email || 'none'}`);
      });
      console.log('');
    });
  }

  // Проверка дубликатов по комбинации (company_name + normalized_domain)
  const compositeMap = {};
  const compositeDuplicates = [];
  
  allRecords.forEach(record => {
    const key = `${record.company_name || 'null'}___${record.normalized_domain || 'null'}`;
    if (!compositeMap[key]) {
      compositeMap[key] = [];
    }
    compositeMap[key].push(record);
  });

  Object.entries(compositeMap).forEach(([key, records]) => {
    if (records.length > 1) {
      compositeDuplicates.push({ key, records });
    }
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3️⃣  ПРОВЕРКА ПО (company_name + normalized_domain)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (compositeDuplicates.length === 0) {
    console.log('✅ Дубликатов по композитному ключу НЕ НАЙДЕНО\n');
  } else {
    console.log(`❌ Найдено дубликатов: ${compositeDuplicates.length}\n`);
    compositeDuplicates.slice(0, 5).forEach(({ key, records }) => {
      const [name, domain] = key.split('___');
      console.log(`   🔴 ${name} + ${domain} (${records.length} записей):`);
      records.forEach(r => {
        console.log(`      - created: ${r.created_at}`);
      });
      console.log('');
    });
  }

  // Статистика по последним добавленным
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ПОСЛЕДНИЕ 10 ДОБАВЛЕННЫХ ЗАПИСЕЙ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  allRecords.slice(0, 10).forEach((r, i) => {
    console.log(`${i + 1}. ${r.company_name}`);
    console.log(`   domain: ${r.normalized_domain || 'none'}`);
    console.log(`   website: ${r.website || 'none'}`);
    console.log(`   created: ${r.created_at}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ ПРОВЕРКА ЗАВЕРШЕНА');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkUniqueness().catch(console.error);

