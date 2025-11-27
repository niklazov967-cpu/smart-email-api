const MockDatabase = require('./MockDatabase');
const SupabaseClient = require('./SupabaseClient');

/**
 * HybridDatabase - Гибридный подход
 * - MockDatabase для быстрого доступа (in-memory)
 * - Supabase для постоянного хранения (cloud)
 * - Автоматическая синхронизация
 */
class HybridDatabase {
  constructor() {
    this.mock = new MockDatabase();
    this.supabase = new SupabaseClient();
    this.syncEnabled = true;
    this.syncQueue = [];
    this.isSyncing = false;
  }

  async initialize() {
    console.log('🔧 Initializing Hybrid Database...');
    
    // Попытка подключения к Supabase
    try {
      await this.supabase.initialize();
      console.log('✅ Supabase connected - sync enabled');
      
      // Загрузить данные из Supabase в MockDatabase
      await this.loadFromSupabase();
    } catch (error) {
      console.warn('⚠️  Supabase connection failed - running in offline mode');
      console.warn('   Error:', error.message);
      this.syncEnabled = false;
    }
    
    console.log('✅ Hybrid Database initialized');
  }

  async loadFromSupabase() {
    if (!this.syncEnabled) return;

    try {
      console.log('📥 Loading data from Supabase...');
      
      const tables = [
        'search_sessions',
        'session_queries',
        'pending_companies',
        'found_companies',
        'processing_progress'
      ];

      for (const table of tables) {
        try {
          const data = await this.supabase.directSelect(table);
          if (data && data.length > 0) {
            this.mock.data[table] = data;
            console.log(`   ✅ Loaded ${data.length} records from ${table}`);
          }
        } catch (error) {
          console.warn(`   ⚠️  Failed to load ${table}:`, error.message);
        }
      }
      
      console.log('✅ Data loaded from Supabase');
    } catch (error) {
      console.error('❌ Failed to load from Supabase:', error.message);
    }
  }

  /**
   * Основной query метод - работает с MockDatabase + fallback на Supabase
   */
  async query(text, params = []) {
    const operation = text.trim().toUpperCase();
    
    // Для SELECT - проверяем MockDatabase, если пусто - читаем из Supabase
    if (operation.startsWith('SELECT')) {
      const mockResult = await this.mock.query(text, params);
      
      // Если MockDatabase пуст и Supabase доступен - читаем из Supabase
      if ((!mockResult.rows || mockResult.rows.length === 0) && this.syncEnabled) {
        try {
          const supabaseResult = await this.supabase.query(text, params);
          return supabaseResult;
        } catch (error) {
          console.warn('⚠️  Supabase SELECT failed, using MockDatabase:', error.message);
          return mockResult;
        }
      }
      
      return mockResult;
    }
    
    // Для INSERT/UPDATE/DELETE - выполняем в MockDatabase
    const result = await this.mock.query(text, params);
    
    // Синхронизировать с Supabase в фоне (не ждем)
    if (this.syncEnabled) {
      this.queueSync(text, params, result);
    }
    
    return result;
  }

  /**
   * Добавить операцию в очередь синхронизации
   */
  queueSync(text, params, result) {
    const operation = text.trim().toUpperCase();
    
    // Синхронизируем только INSERT, UPDATE, DELETE
    if (operation.startsWith('INSERT') || 
        operation.startsWith('UPDATE') || 
        operation.startsWith('DELETE')) {
      
      this.syncQueue.push({ text, params, result, timestamp: Date.now() });
      
      // Запустить синхронизацию если не запущена
      if (!this.isSyncing) {
        this.processSyncQueue();
      }
    }
  }

  /**
   * Обработать очередь синхронизации
   */
  async processSyncQueue() {
    if (this.isSyncing || this.syncQueue.length === 0) return;
    
    this.isSyncing = true;
    console.log(`🔄 Processing ${this.syncQueue.length} sync operations...`);
    
    while (this.syncQueue.length > 0) {
      const item = this.syncQueue.shift();
      
      try {
        console.log(`  📤 Syncing: ${item.text.substring(0, 80)}...`);
        await this.supabase.query(item.text, item.params);
        console.log(`  ✅ Synced successfully`);
      } catch (error) {
        console.error(`  ❌ Supabase sync failed: ${error.message}`);
        // Не добавляем обратно в очередь, чтобы не зациклиться
      }
      
      // Небольшая задержка между операциями
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isSyncing = false;
    console.log('✅ Sync queue processed');
  }

  /**
   * Принудительная синхронизация (ждем завершения)
   */
  async forceSync() {
    if (!this.syncEnabled) {
      console.log('⚠️  Sync disabled - skipping');
      return;
    }

    console.log(`📤 Force syncing ${this.syncQueue.length} operations...`);
    await this.processSyncQueue();
    console.log('✅ Sync completed');
  }

  /**
   * Прямые методы для явной синхронизации
   */
  async syncSession(sessionId) {
    if (!this.syncEnabled) return;

    try {
      const session = this.mock.data.search_sessions?.find(s => s.session_id === sessionId);
      if (session) {
        // Попытка UPDATE, если не существует - INSERT
        const existing = await this.supabase.directSelect('search_sessions', { session_id: sessionId });
        
        if (existing && existing.length > 0) {
          await this.supabase.directUpdate('search_sessions', { session_id: sessionId }, session);
        } else {
          await this.supabase.directInsert('search_sessions', session);
        }
        
        console.log(`✅ Synced session ${sessionId}`);
      }
    } catch (error) {
      console.error('⚠️  Failed to sync session:', error.message);
    }
  }

  async syncCompanies(sessionId) {
    if (!this.syncEnabled) return;

    try {
      const companies = this.mock.data.pending_companies?.filter(c => c.session_id === sessionId) || [];
      
      for (const company of companies) {
        try {
          const existing = await this.supabase.directSelect('pending_companies', { 
            session_id: sessionId, 
            company_name: company.company_name 
          });
          
          if (existing && existing.length > 0) {
            await this.supabase.directUpdate(
              'pending_companies',
              { company_id: existing[0].company_id },
              company
            );
          } else {
            await this.supabase.directInsert('pending_companies', company);
          }
        } catch (error) {
          console.warn(`   ⚠️  Failed to sync company ${company.company_name}:`, error.message);
        }
      }
      
      console.log(`✅ Synced ${companies.length} companies for session ${sessionId}`);
    } catch (error) {
      console.error('⚠️  Failed to sync companies:', error.message);
    }
  }

  // Для совместимости с pg pool
  async connect() {
    return this;
  }

  release() {}

  async end() {
    await this.forceSync();
  }

  on(event, callback) {
    if (event === 'connect') {
      setTimeout(() => callback(), 100);
    }
  }

  // Прямой доступ к данным MockDatabase
  get data() {
    return this.mock.data;
  }

  // Для совместимости с SupabaseClient
  async directSelect(table, filters = {}) {
    // Пробуем прочитать из MockDatabase
    let rows = this.mock.data[table] || [];
    
    // Применяем фильтры
    if (Object.keys(filters).length > 0) {
      rows = rows.filter(row => {
        return Object.entries(filters).every(([key, value]) => row[key] === value);
      });
    }
    
    // Если данных нет в MockDatabase и Supabase доступен - читаем из Supabase
    if (rows.length === 0 && this.syncEnabled) {
      try {
        return await this.supabase.directSelect(table, filters);
      } catch (error) {
        console.warn(`⚠️  Supabase directSelect failed for ${table}:`, error.message);
      }
    }
    
    return rows;
  }

  async directInsert(table, data) {
    if (this.syncEnabled) {
      return await this.supabase.directInsert(table, data);
    }
    throw new Error('Supabase not available for directInsert');
  }

  async directUpdate(table, filters, data) {
    if (this.syncEnabled) {
      return await this.supabase.directUpdate(table, filters, data);
    }
    throw new Error('Supabase not available for directUpdate');
  }
}

module.exports = HybridDatabase;

