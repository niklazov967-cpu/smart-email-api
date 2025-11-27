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
      session_queries: [],
      api_credits_log: [],
      validation_log: [],          // Новая таблица
      processing_progress: []       // Новая таблица
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
          // Для session_id
          if (text.includes('session_id')) {
            const filtered = data.filter(row => row.session_id === params[0]);
            return { rows: filtered };
          }
          // Для progress_id
          if (text.includes('progress_id')) {
            const filtered = data.filter(row => row.progress_id === params[0]);
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
        
        // Извлечь колонки из INSERT INTO table (col1, col2, ...)
        const columnsMatch = text.match(/INSERT INTO\s+\w+\s*\((.*?)\)/i);
        // Извлечь VALUES (...) часть
        const valuesMatch = text.match(/VALUES\s*\((.*?)\)/is);
        
        if (columnsMatch && valuesMatch) {
          const columns = columnsMatch[1].split(',').map(c => c.trim());
          const values = valuesMatch[1].split(',').map(v => v.trim());
          
          // Сопоставить каждую колонку с её значением
          columns.forEach((col, idx) => {
            const value = values[idx];
            
            // Пропустить если значение отсутствует
            if (!value) {
              return;
            }
            
            // Обработать значение: $1, 'string', NOW(), число
            if (value.startsWith('$')) {
              // Параметр $1, $2 и т.д.
              const paramIndex = parseInt(value.substring(1)) - 1;
              newRow[col] = params[paramIndex];
            } else if (value.startsWith("'") && value.endsWith("'")) {
              // Строковый литерал
              newRow[col] = value.substring(1, value.length - 1);
            } else if (value.toUpperCase() === 'NOW()') {
              // Функция NOW()
              newRow[col] = new Date();
            } else if (!isNaN(value)) {
              // Число
              newRow[col] = parseFloat(value);
            } else {
              // Другое (NULL, TRUE, FALSE и т.д.)
              newRow[col] = value;
            }
          });
        }
        
        // Добавить автоинкремент ID для processing_progress
        if (tableName === 'processing_progress' && !newRow.progress_id) {
          newRow.progress_id = this.data[tableName] ? this.data[tableName].length + 1 : 1;
        }
        
        // Добавить created_at/updated_at если нет
        if (!newRow.created_at) {
          newRow.created_at = new Date();
        }
        if (!newRow.updated_at) {
          newRow.updated_at = new Date();
        }
        
        if (!this.data[tableName]) {
          this.data[tableName] = [];
        }
        
        this.data[tableName].push(newRow);
        
        // Поддержка RETURNING
        return { rows: [newRow] };
      }
    }
    
    // UPDATE
    if (text.trim().toUpperCase().startsWith('UPDATE')) {
      const tableMatch = text.match(/UPDATE\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        
        if (!this.data[tableName]) {
          return { rows: [] };
        }
        
        // Извлечь SET параметры
        const setMatch = text.match(/SET\s+(.*?)\s+WHERE/is);
        const setFields = {};
        if (setMatch) {
          const setPart = setMatch[1];
          // Простой парсинг SET field = $1, field2 = $2
          const fieldMatches = setPart.matchAll(/(\w+)\s*=\s*\$(\d+)/g);
          for (const match of fieldMatches) {
            const fieldName = match[1];
            const paramIndex = parseInt(match[2]) - 1;
            setFields[fieldName] = params[paramIndex];
          }
        }
        
        // Найти строки для обновления по WHERE
        if (text.includes('WHERE') && params.length > 0) {
          let updated = 0;
          
          if (text.includes('progress_id')) {
            const progressId = params[params.length - 1];
            this.data[tableName].forEach(row => {
              if (row.progress_id === progressId) {
                Object.assign(row, setFields);
                row.updated_at = new Date();
                updated++;
              }
            });
          } else if (text.includes('session_id')) {
            const sessionId = params[params.length - 1];
            this.data[tableName].forEach(row => {
              if (row.session_id === sessionId) {
                Object.assign(row, setFields);
                row.updated_at = new Date();
                updated++;
              }
            });
          } else {
            // Обновляем все строки (fallback)
            this.data[tableName].forEach(row => {
              Object.assign(row, setFields);
              row.updated_at = new Date();
              updated++;
            });
          }
          
          return { rowCount: updated, rows: [] };
        }
        
        return { rows: [] };
      }
    }
    
    // SELECT
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      const tableMatch = text.match(/FROM\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        
        if (!this.data[tableName]) {
          return { rows: [] };
        }
        
        let results = [...this.data[tableName]];
        
        // WHERE обработка
        if (text.includes('WHERE') && params.length > 0) {
          // Извлечь условия WHERE
          const whereMatch = text.match(/WHERE\s+(.*?)(?:\s+ORDER|\s+LIMIT|\s+OFFSET|$)/is);
          
          if (whereMatch) {
            const whereClause = whereMatch[1].trim();
            
            // DEBUG
            const isProgressQuery = tableName === 'processing_progress';
            if (isProgressQuery) {
              console.log('🔍 MockDatabase WHERE debug:', {
                table: tableName,
                whereClause,
                params,
                totalRows: results.length
              });
            }
            
            results = results.filter(row => {
              // Парсинг простых условий: field = $1 AND field2 = $2
              const conditions = whereClause.split(/\s+AND\s+/i);
              
              const matches = conditions.every(condition => {
                const match = condition.match(/(\w+)\s*=\s*\$(\d+)/);
                if (match) {
                  const fieldName = match[1];
                  const paramIndex = parseInt(match[2]) - 1;
                  const expectedValue = params[paramIndex];
                  
                  const result = row[fieldName] === expectedValue;
                  
                  if (isProgressQuery) {
                    console.log(`  Checking ${fieldName}: ${row[fieldName]} === ${expectedValue} => ${result}`);
                  }
                  
                  return result;
                }
                
                // Проверка на status = 'completed' (строковый литерал)
                const literalMatch = condition.match(/(\w+)\s*=\s*'([^']+)'/);
                if (literalMatch) {
                  const fieldName = literalMatch[1];
                  const expectedValue = literalMatch[2];
                  const result = row[fieldName] === expectedValue;
                  
                  if (isProgressQuery) {
                    console.log(`  Checking ${fieldName}: ${row[fieldName]} === '${expectedValue}' => ${result}`);
                  }
                  
                  return result;
                }
                
                return true;
              });
              
              if (isProgressQuery && matches) {
                console.log(`  ✅ Row matched:`, { stage_name: row.stage_name, status: row.status });
              }
              
              return matches;
            });
            
            if (isProgressQuery) {
              console.log(`🔍 Filter result: ${results.length} rows`);
            }
          }
        }
        
        // ORDER BY
        if (text.includes('ORDER BY')) {
          const orderMatch = text.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)?/i);
          if (orderMatch) {
            const orderField = orderMatch[1];
            const orderDir = orderMatch[2]?.toUpperCase() || 'ASC';
            
            results.sort((a, b) => {
              const aVal = a[orderField];
              const bVal = b[orderField];
              
              if (aVal === bVal) return 0;
              if (aVal === null || aVal === undefined) return 1;
              if (bVal === null || bVal === undefined) return -1;
              
              const comparison = aVal > bVal ? 1 : -1;
              return orderDir === 'DESC' ? -comparison : comparison;
            });
          }
        }
        
        // LIMIT
        if (text.includes('LIMIT')) {
          const limitMatch = text.match(/LIMIT\s+(\d+)/i);
          if (limitMatch) {
            const limit = parseInt(limitMatch[1]);
            results = results.slice(0, limit);
          }
        }
        
        // OFFSET
        if (text.includes('OFFSET')) {
          const offsetMatch = text.match(/OFFSET\s+(\d+)/i);
          if (offsetMatch) {
            const offset = parseInt(offsetMatch[1]);
            results = results.slice(offset);
          }
        }
        
        // COUNT(*)
        if (text.includes('COUNT(*)')) {
          return { rows: [{ count: results.length }] };
        }
        
        return { rows: results };
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

