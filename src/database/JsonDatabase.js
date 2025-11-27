const fs = require('fs').promises;
const path = require('path');

/**
 * JsonDatabase - Простая база данных на JSON файлах
 * Сохраняет ВСЕ данные на диск
 */
class JsonDatabase {
  constructor(dataDir = './data') {
    this.dataDir = path.resolve(dataDir);
    this.data = {
      sessions: [],
      queries: [],
      companies: [],
      processing_progress: []
    };
    this.initialized = false;
  }

  async initialize() {
    // Создать папку если нет
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('✅ JSON Database directory created:', this.dataDir);
    } catch (error) {
      console.log('Directory exists or error:', error.message);
    }

    // Загрузить данные из файлов
    await this.loadAll();
    this.initialized = true;
    console.log('✅ JSON Database initialized');
  }

  async loadAll() {
    const tables = ['sessions', 'queries', 'companies', 'processing_progress'];
    
    for (const table of tables) {
      try {
        const filePath = path.join(this.dataDir, `${table}.json`);
        const content = await fs.readFile(filePath, 'utf8');
        this.data[table] = JSON.parse(content);
        console.log(`📂 Loaded ${table}: ${this.data[table].length} records`);
      } catch (error) {
        // Файл не существует - создать пустой
        this.data[table] = [];
        await this.save(table);
        console.log(`📝 Created empty ${table}.json`);
      }
    }
  }

  async save(table) {
    const filePath = path.join(this.dataDir, `${table}.json`);
    await fs.writeFile(filePath, JSON.stringify(this.data[table], null, 2));
  }

  // Эмуляция SQL query
  async query(text, params = []) {
    if (!this.initialized) {
      await this.initialize();
    }

    // SELECT
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      const tableMatch = text.match(/FROM\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        let data = this.data[tableName] || [];

        // WHERE session_id = $1
        if (text.includes('session_id') && params.length > 0) {
          data = data.filter(row => row.session_id === params[0]);
        }

        // COUNT
        if (text.includes('COUNT(*)')) {
          return { rows: [{ count: data.length }] };
        }

        return { rows: data };
      }
      return { rows: [] };
    }

    // INSERT
    if (text.trim().toUpperCase().startsWith('INSERT')) {
      const tableMatch = text.match(/INSERT INTO\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        
        // Определить таблицу
        let table = tableName;
        if (tableName === 'search_sessions') table = 'sessions';
        if (tableName === 'session_queries') table = 'queries';
        if (tableName === 'pending_companies' || tableName === 'found_companies') table = 'companies';

        const columnsMatch = text.match(/INSERT INTO\s+\w+\s*\((.*?)\)/i);
        const valuesMatch = text.match(/VALUES\s*\((.*?)\)/is);

        if (columnsMatch && valuesMatch) {
          const columns = columnsMatch[1].split(',').map(c => c.trim());
          const values = valuesMatch[1].split(',').map(v => v.trim());

          const newRow = {};
          columns.forEach((col, idx) => {
            const value = values[idx];
            
            if (!value) return;
            
            if (value.startsWith('$')) {
              const paramIndex = parseInt(value.substring(1)) - 1;
              newRow[col] = params[paramIndex];
            } else if (value.startsWith("'") && value.endsWith("'")) {
              newRow[col] = value.substring(1, value.length - 1);
            } else if (value.toUpperCase() === 'NOW()') {
              newRow[col] = new Date().toISOString();
            } else if (!isNaN(value)) {
              newRow[col] = parseFloat(value);
            } else {
              newRow[col] = value;
            }
          });

          // ID автоинкремент
          if (table === 'processing_progress' && !newRow.progress_id) {
            newRow.progress_id = (this.data[table] && this.data[table].length) ? this.data[table].length + 1 : 1;
          }
          if (!newRow.created_at) {
            newRow.created_at = new Date().toISOString();
          }

          // Создать таблицу если не существует
          if (!this.data[table]) {
            this.data[table] = [];
          }

          this.data[table].push(newRow);
          await this.save(table);

          return { rows: [newRow] };
        }
      }
    }

    // UPDATE
    if (text.trim().toUpperCase().startsWith('UPDATE')) {
      const tableMatch = text.match(/UPDATE\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        let table = tableName;
        if (tableName === 'search_sessions') table = 'sessions';

        const setMatch = text.match(/SET\s+(.*?)\s+WHERE/is);
        const setFields = {};
        
        if (setMatch) {
          const setPart = setMatch[1];
          const fieldMatches = setPart.matchAll(/(\w+)\s*=\s*\$(\d+)/g);
          for (const match of fieldMatches) {
            const fieldName = match[1];
            const paramIndex = parseInt(match[2]) - 1;
            setFields[fieldName] = params[paramIndex];
          }
        }

        if (text.includes('session_id') && params.length > 0) {
          const sessionId = params[params.length - 1];
          this.data[table].forEach(row => {
            if (row.session_id === sessionId) {
              Object.assign(row, setFields);
              row.updated_at = new Date().toISOString();
            }
          });
          await this.save(table);
        }

        return { rows: [] };
      }
    }

    // BEGIN, COMMIT, ROLLBACK
    if (text.match(/BEGIN|COMMIT|ROLLBACK/i)) {
      return { rows: [] };
    }

    return { rows: [] };
  }

  // Прямой доступ к данным
  async getSessions() {
    return this.data.sessions;
  }

  async getSession(sessionId) {
    return this.data.sessions.find(s => s.session_id === sessionId);
  }

  async getQueriesForSession(sessionId) {
    return this.data.queries.filter(q => q.session_id === sessionId);
  }

  async getCompaniesForSession(sessionId) {
    return this.data.companies.filter(c => c.session_id === sessionId);
  }

  async getProgress(sessionId) {
    return this.data.processing_progress.filter(p => p.session_id === sessionId);
  }

  // Эмуляция connect/release
  async connect() {
    return this;
  }

  release() {}

  async end() {}

  on(event, callback) {
    if (event === 'connect') {
      setTimeout(() => callback(), 100);
    }
  }
}

module.exports = JsonDatabase;

