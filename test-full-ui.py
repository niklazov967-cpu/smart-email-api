#!/usr/bin/env python3
"""Полный тест UI с разными сценариями"""
import requests
import time

BASE_URL = "http://localhost:3030"

print("\n" + "="*70)
print("🧪 ПОЛНЫЙ ТЕСТ UI: Разные сценарии компаний")
print("="*70)

# СЦЕНАРИЙ 1: Создать сессию и полностью обработать (Stage 1-4)
print("\n📝 СЦЕНАРИЙ 1: Полностью обработанная сессия")
print("-" * 70)

response = requests.post(f"{BASE_URL}/api/topics", json={
    "main_topic": "精密数控加工服务",
    "target_count": 1
})
session1_id = response.json()['data']['session_id']
print(f"✅ Сессия 1 создана: {session1_id[:8]}...")

# Stage 1
print("   🏢 Stage 1...")
requests.post(f"{BASE_URL}/api/sessions/{session1_id}/process-stage/1", timeout=120)
time.sleep(2)

# Stage 2
print("   🌐 Stage 2...")
requests.post(f"{BASE_URL}/api/sessions/{session1_id}/process-stage/2", timeout=120)
time.sleep(2)

# Stage 3
print("   📧 Stage 3...")
requests.post(f"{BASE_URL}/api/sessions/{session1_id}/process-stage/3", timeout=120)
time.sleep(2)

# Stage 4
print("   🤖 Stage 4...")
requests.post(f"{BASE_URL}/api/sessions/{session1_id}/process-stage/4", timeout=180)
time.sleep(2)

print("   ✅ Все этапы завершены")

# СЦЕНАРИЙ 2: Создать сессию только с Stage 1
print("\n📝 СЦЕНАРИЙ 2: Только Stage 1 (есть компании для Stage 2)")
print("-" * 70)

response = requests.post(f"{BASE_URL}/api/topics", json={
    "main_topic": "小批量CNC车铣加工",
    "target_count": 1
})
session2_id = response.json()['data']['session_id']
print(f"✅ Сессия 2 создана: {session2_id[:8]}...")

# Только Stage 1
print("   🏢 Stage 1...")
requests.post(f"{BASE_URL}/api/sessions/{session2_id}/process-stage/1", timeout=120)
time.sleep(2)

print("   ✅ Stage 1 завершен (остальные этапы не запущены)")

# ПРОВЕРКА РЕЗУЛЬТАТОВ
print("\n" + "="*70)
print("📊 ПРОВЕРКА РЕЗУЛЬТАТОВ")
print("="*70)

response = requests.get(f"{BASE_URL}/api/debug/companies")
all_companies = response.json().get('companies', [])

for session_id, name in [(session1_id, "Сессия 1 (полностью обработана)"), 
                          (session2_id, "Сессия 2 (только Stage 1)")]:
    companies = [c for c in all_companies if c.get('session_id') == session_id]
    
    by_stage = {}
    for c in companies:
        stage = c.get('stage', 'unknown')
        by_stage[stage] = by_stage.get(stage, 0) + 1
    
    needs_stage2 = [c for c in companies if c.get('stage') == 'names_found' and not c.get('website')]
    unprocessed = sum(1 for c in companies if c.get('stage') != 'completed')
    
    print(f"\n📋 {name}:")
    print(f"   ID: {session_id[:8]}...")
    print(f"   Всего компаний: {len(companies)}")
    print(f"   По статусам: {dict(by_stage)}")
    print(f"   ⏳ Ожидают Stage 2: {len(needs_stage2)}")
    print(f"   📊 Необработано: {unprocessed}")
    
    print(f"\n   💡 Что должно показаться в UI:")
    if len(needs_stage2) > 0:
        print(f"      ✅ Статистика компаний")
        print(f"      ✅ Список {len(needs_stage2)} компаний без сайтов")
        print(f"      ✅ Кнопка 'Запустить Stage 2'")
    elif unprocessed > 0 and len(needs_stage2) == 0:
        print(f"      ✅ Статистика компаний")
        print(f"      ⚠️  Сообщение: 'Все компании уже обработаны Stage 2+'")
        print(f"      ❌ Кнопка Stage 2 НЕ показывается")
    else:
        print(f"      ✅ Все обработано")

print("\n" + "="*70)
print("🌐 ОТКРОЙТЕ http://localhost:3030")
print("="*70)
print("\n1️⃣  Выберите первую сессию (полностью обработана):")
print("   - Должно быть '| 0 необраб.' или скрыто")
print("   - Должна быть статистика с обработанными")
print("   - НЕ должно быть кнопки Stage 2")
print("   - Может быть сообщение о создании новой сессии")

print("\n2️⃣  Выберите вторую сессию (только Stage 1):")
print("   - Должно быть '| X необраб.'")
print("   - Должна быть статистика")
if len(needs_stage2) > 0:
    print("   - Должен быть список компаний без сайтов")
    print("   - Должна быть кнопка 'Запустить Stage 2'")
else:
    print("   - Должно быть сообщение 'Все уже обработаны Stage 2+'")

print("\n" + "="*70 + "\n")
