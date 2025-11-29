#!/usr/bin/env python3
"""Тест пошаговой обработки с новой статистикой"""
import requests
import time

BASE_URL = "http://localhost:3030"

print("\n" + "="*70)
print("🧪 ТЕСТ: Пошаговая обработка с детальной статистикой")
print("="*70)

# 1. Создать тестовую сессию
print("\n📝 Шаг 1: Создание тестовой сессии...")
response = requests.post(f"{BASE_URL}/api/topics", json={
    "main_topic": "小批量精密数控加工服务",
    "target_count": 2
})
session_data = response.json()
session_id = session_data['data']['session_id']
print(f"✅ Сессия создана: {session_id[:8]}...")
print(f"   Тема: {session_data['data']['main_topic']}")
time.sleep(1)

# 2. Проверить что сессия появилась
print("\n📋 Шаг 2: Проверка API /api/sessions...")
response = requests.get(f"{BASE_URL}/api/sessions?limit=10")
sessions = response.json()['data']
print(f"✅ Сессий в API: {len(sessions)}")

# 3. Симулировать загрузку статистики (как в UI)
print("\n📊 Шаг 3: Загрузка статистики (как в step-by-step.html)...")
response = requests.get(f"{BASE_URL}/api/debug/companies")
companies_data = response.json()
all_companies = companies_data.get('companies', [])

for session in sessions:
    sid = session['session_id']
    session_companies = [c for c in all_companies if c.get('session_id') == sid]
    unprocessed = sum(1 for c in session_companies if not c.get('stage') or c.get('stage') != 'completed')
    
    print(f"\n   Сессия: {session.get('topic_description')}")
    print(f"   ID: {sid[:8]}...")
    print(f"   Компаний: {len(session_companies)}")
    print(f"   Необработано: {unprocessed}")
    
    # Что должно показаться в выпадающем списке
    display_text = f"{session.get('topic_description')} ({session.get('created_at')[:10]})"
    if len(session_companies) > 0:
        display_text += f" | {unprocessed} необраб."
    print(f"   📋 В списке: {display_text}")

# 4. Запустить Stage 1
print("\n🏢 Шаг 4: Stage 1 - Поиск компаний...")
response = requests.post(
    f"{BASE_URL}/api/sessions/{session_id}/process-stage/1",
    json={"force": False},
    timeout=120
)
stage1 = response.json()
print(f"✅ Stage 1 завершен")
print(f"   Результат: {stage1.get('result', {})}")
time.sleep(2)

# 5. Проверить компании после Stage 1
print("\n📊 Шаг 5: Проверка компаний после Stage 1...")
response = requests.get(f"{BASE_URL}/api/debug/companies")
all_companies = response.json().get('companies', [])
session_companies = [c for c in all_companies if c.get('session_id') == session_id]

print(f"   Всего компаний: {len(session_companies)}")

# По статусам
by_stage = {}
for c in session_companies:
    stage = c.get('stage', 'unknown')
    by_stage[stage] = by_stage.get(stage, 0) + 1

print(f"   По статусам: {dict(by_stage)}")

# Подсчитать необработанные
unprocessed = sum(1 for c in session_companies if c.get('stage') != 'completed')
processed = len(session_companies) - unprocessed

print(f"\n   📊 Статистика для UI:")
print(f"      Всего: {len(session_companies)}")
print(f"      Необработано: {unprocessed}")
print(f"      Обработано: {processed}")

# 6. Показать первые 3 компании
print(f"\n   📋 Первые 3 компании:")
for i, c in enumerate(session_companies[:3], 1):
    print(f"      {i}. {c.get('company_name')}")
    print(f"         Stage: {c.get('stage')}")
    print(f"         Website: {c.get('website') or '❌ НЕТ'}")
    print(f"         Email: {c.get('email') or '❌ НЕТ'}")

# 7. Определить сообщение для UI
print(f"\n💡 Шаг 6: Сообщение в UI step-by-step.html:")
if len(session_companies) > 0 and unprocessed == 0:
    print(f"   ✅ 'Все компании обработаны!'")
    print(f"   'Все {len(session_companies)} компаний прошли все этапы обработки.'")
elif unprocessed > 0:
    print(f"   ⏳ '{unprocessed} компаний требуют обработки.'")
    print(f"   'Используйте пошаговую обработку для их обработки.'")
else:
    print(f"   ℹ️  'Нет компаний для отображения'")

print("\n" + "="*70)
print("🌐 ОТКРОЙТЕ: http://localhost:3030/step-by-step.html")
print("="*70)
print(f"\n1️⃣  В выпадающем списке должно быть:")
print(f"   '{session_data['data']['main_topic']} (...) | {unprocessed} необраб.'")
print(f"\n2️⃣  При выборе сессии должно показаться:")
print(f"   📊 Всего: {len(session_companies)}")
print(f"   📊 Необработано: {unprocessed}")
print(f"   📊 Обработано: {processed}")
print(f"\n3️⃣  Сообщение о готовности:")
if unprocessed > 0:
    print(f"   ⏳ '{unprocessed} компаний требуют обработки'")
else:
    print(f"   ✅ 'Все компании обработаны!'")
print(f"\n4️⃣  Кнопка 'Начать пошаговую обработку' должна быть АКТИВНА")
print("="*70 + "\n")
