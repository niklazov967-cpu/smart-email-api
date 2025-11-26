// Test script - проверка базовых компонентов
const MockDatabase = require('./src/database/MockDatabase');
const SettingsManager = require('./src/services/SettingsManager');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

async function test() {
  console.log('🧪 Testing components...\n');
  
  try {
    // Test 1: MockDatabase
    console.log('1. Testing MockDatabase...');
    const db = new MockDatabase();
    const result = await db.query('SELECT 1');
    console.log('✅ MockDatabase works:', result.rows);
    
    // Test 2: SettingsManager
    console.log('\n2. Testing SettingsManager...');
    const settingsManager = new SettingsManager(db, logger);
    
    // Добавим тестовую настройку
    await db.query(
      `INSERT INTO settings (category, setting_key, setting_value, setting_type, default_value, description, validation_rules, is_editable, require_restart)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['test', 'test_key', 'test_value', 'string', 'test_value', 'Test setting', '{}', true, false]
    );
    
    const settings = await settingsManager.getAllSettings();
    console.log('✅ Settings loaded:', Object.keys(settings));
    
    console.log('\n✨ All tests passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();

