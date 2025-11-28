-- Удаление старой таблицы translations
-- Выполните этот скрипт ПОСЛЕ успешной миграции и тестирования

-- ВНИМАНИЕ: Этот скрипт удаляет старую таблицу translations
-- Убедитесь что:
-- 1. Таблица pending_companies_ru создана
-- 2. Миграция данных выполнена
-- 3. Система протестирована и работает корректно
-- 4. У вас есть backup БД (на всякий случай)

-- Шаг 1: Опционально создать backup таблицы translations
-- (Раскомментируйте если хотите сохранить backup)
-- CREATE TABLE translations_backup AS SELECT * FROM translations;
-- SELECT 'Backup created: translations_backup' as status;

-- Шаг 2: Посчитать записи перед удалением (для проверки)
SELECT 
    COUNT(*) as total_translations,
    COUNT(DISTINCT company_id) as unique_companies
FROM translations;

-- Шаг 3: Удалить таблицу translations
DROP TABLE IF EXISTS translations CASCADE;

-- Шаг 4: Подтверждение удаления
SELECT 'Table translations dropped successfully!' as status;

-- Шаг 5: Проверить что новая таблица работает
SELECT 
    COUNT(*) as total_companies_with_translations,
    SUM(CASE WHEN translation_status = 'completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN translation_status = 'partial' THEN 1 ELSE 0 END) as partial,
    SUM(CASE WHEN translation_status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN translation_status = 'failed' THEN 1 ELSE 0 END) as failed
FROM pending_companies_ru;

