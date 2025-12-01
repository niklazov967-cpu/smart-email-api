# Checkpoint v3.0.0

Создан: 01.12.2025, 20:17:50
Git Commit: fab9a96
Git Branch: main

## Статистика базы данных

- **Всего компаний:** 663
- **С email:** 645
- **Проверено AI:** 654
- **Средний score:** 61.1
- **Сессий:** 23
- **Переводов:** 0

## Таблицы

- `pending_companies`: 663 записей
- `pending_companies_ru`: 0 записей
- `search_sessions`: 23 записей
- `system_settings`: 13 записей

## Размер checkpoint

3.78 MB

## Восстановление

```bash
node scripts/restore-checkpoint.js v3.0.0
```

Это вернёт:
1. ✅ Git код к коммиту fab9a96
2. ✅ База данных к состоянию на 01.12.2025, 20:17:50
3. ✅ Все настройки и сессии
