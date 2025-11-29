-- ═══════════════════════════════════════════════════════════════
-- ПОЛНАЯ ОЧИСТКА БАЗЫ ДАННЫХ
-- ═══════════════════════════════════════════════════════════════
-- ВНИМАНИЕ: Это удалит ВСЕ данные!
-- ═══════════════════════════════════════════════════════════════

-- 1. Очистка компаний
TRUNCATE TABLE pending_companies CASCADE;
TRUNCATE TABLE pending_companies_ru CASCADE;

-- 2. Очистка сессий и запросов
TRUNCATE TABLE search_sessions CASCADE;
TRUNCATE TABLE session_queries CASCADE;

-- 3. Очистка кэша и логов API
TRUNCATE TABLE perplexity_cache CASCADE;
TRUNCATE TABLE sonar_api_calls CASCADE;

-- 4. Проверка что все очищено
SELECT 'pending_companies' as table_name, COUNT(*) as records FROM pending_companies
UNION ALL
SELECT 'pending_companies_ru', COUNT(*) FROM pending_companies_ru
UNION ALL
SELECT 'search_sessions', COUNT(*) FROM search_sessions
UNION ALL
SELECT 'session_queries', COUNT(*) FROM session_queries
UNION ALL
SELECT 'perplexity_cache', COUNT(*) FROM perplexity_cache
UNION ALL
SELECT 'sonar_api_calls', COUNT(*) FROM sonar_api_calls;

-- ═══════════════════════════════════════════════════════════════
-- ✅ База данных очищена! Готова к новому тестированию.
-- ═══════════════════════════════════════════════════════════════

