const { createClient } = require('@supabase/supabase-js');

/**
 * SupabaseClient - Обертка для работы с Supabase
 * Эмулирует интерфейс PostgreSQL pool для совместимости
 */
class SupabaseClient {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  async initialize() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.initialized = true;
    
    console.log('✅ Supabase client initialized:', supabaseUrl);
  }

  /**
   * Эмуляция query() для совместимости с PostgreSQL pool
   */
  async query(text, params = []) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Определить тип операции
    const operation = text.trim().toUpperCase();

    try {
      // SELECT
      if (operation.startsWith('SELECT')) {
        return await this._handleSelect(text, params);
      }

      // INSERT
      if (operation.startsWith('INSERT')) {
        return await this._handleInsert(text, params);
      }

      // UPDATE
      if (operation.startsWith('UPDATE')) {
        return await this._handleUpdate(text, params);
      }

      // DELETE
      if (operation.startsWith('DELETE')) {
        return await this._handleDelete(text, params);
      }

      // BEGIN, COMMIT, ROLLBACK (игнорируем, Supabase автоматически)
      if (operation.match(/BEGIN|COMMIT|ROLLBACK/)) {
        return { rows: [] };
      }

      console.warn('Unsupported query operation:', operation.substring(0, 50));
      return { rows: [] };

    } catch (error) {
      console.error('Supabase query error:', error.message);
      throw error;
    }
  }

  async _handleSelect(text, params) {
    // Извлечь имя таблицы
    const tableMatch = text.match(/FROM\s+(\w+)/i);
    if (!tableMatch) {
      throw new Error('Cannot parse table name from SELECT');
    }

    const tableName = tableMatch[1];
    let query = this.supabase.from(tableName).select('*');

    // WHERE session_id = $1
    if (text.includes('WHERE') && text.includes('session_id') && params.length > 0) {
      query = query.eq('session_id', params[0]);
    }

    // WHERE progress_id = $1
    if (text.includes('WHERE') && text.includes('progress_id') && params.length > 0) {
      query = query.eq('progress_id', params[0]);
    }

    // ORDER BY
    if (text.includes('ORDER BY')) {
      const orderMatch = text.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)?/i);
      if (orderMatch) {
        const column = orderMatch[1];
        const direction = orderMatch[2]?.toUpperCase() === 'DESC';
        query = query.order(column, { ascending: !direction });
      }
    }

    // LIMIT
    if (text.includes('LIMIT')) {
      const limitMatch = text.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        query = query.limit(parseInt(limitMatch[1]));
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Supabase SELECT error: ${error.message}`);
    }

    // COUNT(*)
    if (text.includes('COUNT(*)')) {
      return { rows: [{ count: data?.length || 0 }] };
    }

    return { rows: data || [] };
  }

  async _handleInsert(text, params) {
    // Извлечь имя таблицы
    const tableMatch = text.match(/INSERT INTO\s+(\w+)/i);
    if (!tableMatch) {
      throw new Error('Cannot parse table name from INSERT');
    }

    const tableName = tableMatch[1];

    // Извлечь колонки
    const columnsMatch = text.match(/INSERT INTO\s+\w+\s*\((.*?)\)/i);
    const valuesMatch = text.match(/VALUES\s*\((.*?)\)/is);

    if (!columnsMatch || !valuesMatch) {
      throw new Error('Cannot parse INSERT statement');
    }

    const columns = columnsMatch[1].split(',').map(c => c.trim());
    const values = valuesMatch[1].split(',').map(v => v.trim());

    const row = {};
    columns.forEach((col, idx) => {
      const value = values[idx];

      if (!value) return;

      if (value.startsWith('$')) {
        const paramIndex = parseInt(value.substring(1)) - 1;
        row[col] = params[paramIndex];
      } else if (value.startsWith("'") && value.endsWith("'")) {
        row[col] = value.substring(1, value.length - 1);
      } else if (value.toUpperCase() === 'NOW()') {
        row[col] = new Date().toISOString();
      } else if (!isNaN(value)) {
        row[col] = parseFloat(value);
      } else {
        row[col] = value;
      }
    });

    // Добавить created_at если нет
    if (!row.created_at) {
      row.created_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from(tableName)
      .insert([row])
      .select();

    if (error) {
      throw new Error(`Supabase INSERT error: ${error.message}`);
    }

    return { rows: data || [row] };
  }

  async _handleUpdate(text, params) {
    // Извлечь имя таблицы
    const tableMatch = text.match(/UPDATE\s+(\w+)/i);
    if (!tableMatch) {
      throw new Error('Cannot parse table name from UPDATE');
    }

    const tableName = tableMatch[1];

    // Извлечь SET fields
    const setMatch = text.match(/SET\s+(.*?)\s+WHERE/is);
    if (!setMatch) {
      throw new Error('Cannot parse SET clause from UPDATE');
    }

    const updates = {};
    const setPart = setMatch[1];
    
    // Парсинг SET field = $N
    const fieldMatches = setPart.matchAll(/(\w+)\s*=\s*\$(\d+)/g);
    for (const match of fieldMatches) {
      const fieldName = match[1];
      const paramIndex = parseInt(match[2]) - 1;
      updates[fieldName] = params[paramIndex];
    }

    updates.updated_at = new Date().toISOString();

    // WHERE session_id = $N (последний параметр)
    let query = this.supabase.from(tableName).update(updates);

    if (text.includes('WHERE session_id')) {
      const sessionId = params[params.length - 1];
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query.select();

    if (error) {
      throw new Error(`Supabase UPDATE error: ${error.message}`);
    }

    return { rows: data || [] };
  }

  async _handleDelete(text, params) {
    const tableMatch = text.match(/DELETE FROM\s+(\w+)/i);
    if (!tableMatch) {
      throw new Error('Cannot parse table name from DELETE');
    }

    const tableName = tableMatch[1];
    let query = this.supabase.from(tableName).delete();

    if (text.includes('WHERE') && params.length > 0) {
      // Простое WHERE с одним условием
      const whereMatch = text.match(/WHERE\s+(\w+)\s*=\s*\$1/i);
      if (whereMatch) {
        query = query.eq(whereMatch[1], params[0]);
      }
    }

    const { data, error } = await query.select();

    if (error) {
      throw new Error(`Supabase DELETE error: ${error.message}`);
    }

    return { rows: data || [] };
  }

  // Для совместимости с pg pool
  async connect() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this;
  }

  release() {
    // Не нужно для Supabase
  }

  async end() {
    // Не нужно для Supabase
  }

  on(event, callback) {
    if (event === 'connect' && this.initialized) {
      setTimeout(() => callback(), 100);
    }
  }

  // Прямые методы Supabase для удобства
  table(name) {
    return this.supabase.from(name);
  }

  async directSelect(table, filters = {}) {
    let query = this.supabase.from(table).select('*');
    
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return data || [];
  }

  async directInsert(table, row) {
    const { data, error } = await this.supabase
      .from(table)
      .insert([row])
      .select();

    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    return data?.[0];
  }

  async directUpdate(table, filters, updates) {
    let query = this.supabase.from(table).update(updates);

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query.select();

    if (error) {
      throw new Error(`Supabase update error: ${error.message}`);
    }

    return data || [];
  }
}

module.exports = SupabaseClient;

