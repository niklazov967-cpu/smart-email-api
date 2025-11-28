#!/usr/bin/env python3
"""Тест сохранения stage2_raw_data"""
import requests
import time

BASE_URL = "http://localhost:3030"

print("\n" + "="*60)
print("🧪 ТЕСТ: Stage2 сохраняет raw_data даже когда сайт не найден")
print("="*60)

# 1. Очистка
print("\n🗑️  Очистка базы...")
requests.delete(f"{BASE_URL}/api/sessions/clear-all")
time.sleep(1)

# 2. Создание темы
print("📝 Создание темы...")
response = requests.post(f"{BASE_URL}/api/topics", json={
    "main_topic": "小批量数控加工服务",
    "target_count": 2
})
session_id = response.json()['data']['session_id']
print(f"✅ Сессия: {session_id}")

# 3. Stage 1
print("\n🏢 Stage 1: Поиск компаний...")
requests.post(f"{BASE_URL}/api/sessions/{session_id}/process-stage/1", timeout=120)
time.sleep(2)

# Проверить компании без сайта
response = requests.get(f"{BASE_URL}/api/debug/companies")
companies = response.json()['companies']
without_website = [c for c in companies if not c.get('website')]

print(f"✅ Найдено {len(companies)} компаний")
print(f"   БЕЗ сайта: {len(without_website)}")

if len(without_website) == 0:
    print("\n⚠️  Нет компаний без сайта для теста. Пропускаем.")
    exit(0)

# Показать компанию без сайта
test_company = without_website[0]
print(f"\n📋 Тестовая компания: {test_company['company_name']}")
print(f"   Stage ПЕРЕД Stage 2: {test_company.get('stage')}")
print(f"   stage2_raw_data ПЕРЕД: {'ПУСТО' if not test_company.get('stage2_raw_data') else 'ЕСТЬ'}")

# 4. Stage 2
print("\n🌐 Stage 2: Поиск сайтов...")
requests.post(f"{BASE_URL}/api/sessions/{session_id}/process-stage/2", timeout=120)
time.sleep(2)

# Проверить результат
response = requests.get(f"{BASE_URL}/api/debug/companies")
companies = response.json()['companies']

# Найти ту же компанию
test_company_after = next((c for c in companies if c['company_name'] == test_company['company_name']), None)

if test_company_after:
    print(f"\n📊 Результат для: {test_company_after['company_name']}")
    print(f"   Stage ПОСЛЕ Stage 2: {test_company_after.get('stage')}")
    print(f"   Website: {test_company_after.get('website') or '❌ НЕ НАЙДЕН'}")
    print(f"   stage2_raw_data ПОСЛЕ: {'ПУСТО ❌' if not test_company_after.get('stage2_raw_data') else 'ЕСТЬ ✅'}")
    
    if test_company_after.get('stage2_raw_data'):
        raw = test_company_after['stage2_raw_data']
        print(f"\n   📄 stage2_raw_data:")
        print(f"      Source: {raw.get('source')}")
        print(f"      Result: {raw.get('result')}")
        print(f"      Timestamp: {raw.get('timestamp')}")
        print(f"      Response: {'ЕСТЬ' if raw.get('full_response') else 'НЕТ'}")
        
        print("\n✅ ТЕСТ ПРОЙДЕН: stage2_raw_data сохранен!")
    else:
        print("\n❌ ТЕСТ НЕ ПРОЙДЕН: stage2_raw_data ПУСТОЙ!")
        exit(1)
else:
    print("\n❌ Компания не найдена после Stage 2!")
    exit(1)
