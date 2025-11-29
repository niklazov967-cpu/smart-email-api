#!/usr/bin/env python3
"""Тест нового UI выбора сессии"""
import requests
import time
import json

BASE_URL = "http://localhost:3030"

print("\n" + "="*70)
print("🧪 ТЕСТ: Новый UI блока выбора сессии")
print("="*70)

# 1. Создать тестовую сессию
print("\n📝 Шаг 1: Создание тестовой сессии...")
response = requests.post(f"{BASE_URL}/api/topics", json={
    "main_topic": "TEST: Токарная обработка малыми партиями",
    "target_count": 2
})
session_data = response.json()
session_id = session_data['data']['session_id']
print(f"✅ Сессия создана: {session_id[:8]}...")

# 2. Запустить Stage 1
print("\n🏢 Шаг 2: Stage 1 - Поиск компаний...")
response = requests.post(
    f"{BASE_URL}/api/sessions/{session_id}/process-stage/1",
    json={"force": False},
    timeout=120
)
stage1 = response.json()
print(f"✅ Stage 1 завершен")
print(f"   Компаний найдено: {stage1.get('result', {}).get('companiesFound', 0)}")
time.sleep(2)

# 3. Проверить компании в базе
print("\n📊 Шаг 3: Проверка компаний в базе...")
response = requests.get(f"{BASE_URL}/api/debug/companies")
companies = response.json().get('companies', [])
session_companies = [c for c in companies if c.get('session_id') == session_id]

print(f"   Всего компаний в сессии: {len(session_companies)}")

# Подсчитать по stage
by_stage = {}
for c in session_companies:
    stage = c.get('stage', 'unknown')
    by_stage[stage] = by_stage.get(stage, 0) + 1

print(f"   По статусам:")
for stage, count in sorted(by_stage.items()):
    print(f"      {stage}: {count}")

# Компании ожидающие Stage 2
needs_stage2 = [c for c in session_companies if c.get('stage') == 'names_found' and not c.get('website')]
print(f"\n   ⏳ Ожидают Stage 2: {len(needs_stage2)}")

if needs_stage2:
    print(f"\n   Первые 3 компании без сайтов:")
    for i, c in enumerate(needs_stage2[:3], 1):
        print(f"      {i}. {c.get('company_name')}")
        print(f"         Website: {c.get('website') or '❌ НЕТ'}")
        print(f"         Stage: {c.get('stage')}")

# 4. Проверить что вернет API сессий
print(f"\n📋 Шаг 4: Проверка API /api/sessions...")
response = requests.get(f"{BASE_URL}/api/sessions?limit=10")
sessions_data = response.json()
print(f"   Сессий в API: {len(sessions_data.get('data', []))}")

# 5. ТЕСТ: Симулировать загрузку статистики (как это делает UI)
print(f"\n🎯 Шаг 5: Симуляция загрузки статистики UI...")
session_obj = None
for s in sessions_data.get('data', []):
    if s['session_id'] == session_id:
        session_obj = s
        break

if session_obj:
    # Подсчитать статистику
    unprocessed = sum(1 for c in session_companies if not c.get('stage') or c.get('stage') != 'completed')
    processed = len(session_companies) - unprocessed
    
    print(f"   ✅ Сессия найдена: {session_obj.get('search_query')}")
    print(f"   📊 Статистика:")
    print(f"      Всего: {len(session_companies)}")
    print(f"      Необработано: {unprocessed}")
    print(f"      Обработано: {processed}")
    print(f"      Ожидают Stage 2: {len(needs_stage2)}")
    
    # Проверить логику показа кнопки Stage 2
    has_companies_for_stage2 = len(needs_stage2) > 0
    print(f"\n   🔘 Кнопка Stage 2 должна быть:")
    if has_companies_for_stage2:
        print(f"      ✅ ПОКАЗАНА ({len(needs_stage2)} компаний ждут Stage 2)")
    else:
        print(f"      ❌ СКРЫТА (нет компаний в stage='names_found')")

print("\n" + "="*70)
print("📌 ИТОГИ ТЕСТА:")
print("="*70)
print(f"✅ Сессия создана: {session_id[:8]}...")
print(f"✅ Компаний найдено: {len(session_companies)}")
print(f"✅ Ожидают Stage 2: {len(needs_stage2)}")
print(f"\n🌐 Откройте http://localhost:3030")
print(f"   Выберите сессию и проверьте:")
print(f"   1. Видно ли '| {unprocessed} необраб.' в списке")
print(f"   2. Показывается ли статистика")
print(f"   3. Виден ли список компаний")
print(f"   4. Есть ли кнопка 'Запустить Stage 2'")
print("="*70 + "\n")
