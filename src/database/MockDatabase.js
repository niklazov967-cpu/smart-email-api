/**
 * Mock Database - для тестирования без PostgreSQL
 * Эмулирует базовые операции PostgreSQL с хранением в памяти
 */
class MockDatabase {
  constructor() {
    this.data = {
      settings: [],
      settings_history: [],
      search_sessions: [],
      pending_companies: [],
      processed_websites: [],
      company_records: [],
      unique_emails: [],
      perplexity_cache: [],
      sonar_api_calls: [],
      processing_logs: [],
      session_queries: [],        // Новая таблица для запросов
      api_credits_log: []         // Новая таблица для кредитов
    };
    
    this.connected = true;
  }

  /**
   * Эмуляция query
   */
  async query(text, params = []) {
    // Простой парсинг SQL для SELECT
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      // Извлечь имя таблицы
      const tableMatch = text.match(/FROM\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const data = this.data[tableName] || [];
        
        // Простая фильтрация по WHERE (очень упрощенно)
        if (text.includes('WHERE') && params.length > 0) {
          // Для кеша проверяем prompt_hash
          if (text.includes('prompt_hash')) {
                const filtered = data.filter(row => row.prompt_hash === params[0]);
            return { rows: filtered };
          }
          // Для настроек проверяем category и key
          if (text.includes('category') && text.includes('setting_key')) {
            const filtered = data.filter(row => 
              row.category === params[params.length - 2] && 
              row.setting_key === params[params.length - 1]
            );
            return { rows: filtered };
          }
        }
        
        // Для COUNT
        if (text.includes('COUNT(*)')) {
          return { rows: [{ count: data.length }] };
        }
        
        return { rows: data };
      }
      
      // Базовый SELECT без FROM (например, SELECT 1)
      return { rows: [{ '?column?': 1 }] };
    }
    
    // INSERT
    if (text.trim().toUpperCase().startsWith('INSERT')) {
      const tableMatch = text.match(/INSERT INTO\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        
        // Создать объект из параметров (упрощенно)
        const newRow = {};
        const columnsMatch = text.match(/\((.*?)\)/);
        if (columnsMatch) {
          const columns = columnsMatch[1].split(',').map(c => c.trim());
          columns.forEach((col, idx) => {
            newRow[col] = params[idx];
          });
        }
        
        if (!this.data[tableName]) {
          this.data[tableName] = [];
        }
        
        this.data[tableName].push(newRow);
        return { rows: [newRow] };
      }
    }
    
    // UPDATE
    if (text.trim().toUpperCase().startsWith('UPDATE')) {
      const tableMatch = text.match(/UPDATE\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        // Упрощенная логика - обновляем первую найденную строку
        if (this.data[tableName] && this.data[tableName].length > 0) {
          // Обновляем все строки (для простоты)
          this.data[tableName].forEach(row => {
            row.updated_at = new Date();
          });
        }
        return { rows: [] };
      }
    }
    
    // BEGIN, COMMIT, ROLLBACK
    if (text.match(/BEGIN|COMMIT|ROLLBACK/i)) {
      return { rows: [] };
    }
    
    // CREATE TABLE и другие DDL
    if (text.match(/CREATE|ALTER|DROP/i)) {
      return { rows: [] };
    }
    
    return { rows: [] };
  }

  /**
   * Эмуляция connect
   */
  async connect() {
    return this;
  }

  /**
   * Эмуляция release
   */
  release() {
    // Ничего не делаем
  }

  /**
   * Эмуляция end
   */
  async end() {
    this.connected = false;
  }

  /**
   * Эмуляция on
   */
  on(event, callback) {
    if (event === 'connect') {
      setTimeout(() => callback(), 100);
    }
  }
}

module.exports = MockDatabase;

