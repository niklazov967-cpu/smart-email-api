#!/usr/bin/env python3
"""Полный тест API с РЕАЛЬНОЙ очисткой базы"""
import requests
import time
import json

BASE_URL = "http://localhost:3030"

def log(emoji, msg, data=None):
    print(f"\n{emoji} {msg}")
    if data:
        print(json.dumps(data, indent=2, ensure_ascii=False))

def test_full_flow():
    print("\n" + "="*60)
    print("🧪 ПОЛНЫЙ ТЕСТ С ОЧИСТКОЙ БАЗЫ")
    print("="*60)
    
    # 1. ОЧИСТКА БАЗЫ
    log("🗑️", "Шаг 1: Очистка базы данных")
    response = requests.delete(f"{BASE_URL}/api/sessions/clear-all")
    result = response.json()
    log("✅", f"База очищена: {len(result.get('cleared_tables', []))} таблиц")
    
    time.sleep(1)
    
    # Проверка что база пуста
    response = requests.get(f"{BASE_URL}/api/debug/companies")
    companies = response.json().get('companies', [])
    log("📊", f"Компаний в базе ПОСЛЕ очистки: {len(companies)}")
    
    if len(companies) > 0:
        log("❌", "ОШИБКА: База не очищена!")
        return False
    
    # 2. СОЗДАНИЕ ТЕМЫ И ЗАПРОСОВ
    log("📝", "Шаг 2: Создание темы")
    topic_data = {
        "main_topic": "TEST: CNC обработка металлов малыми партиями",
        "target_count": 2  # ТОЛЬКО 2 запроса для быстроты
    }
    
    response = requests.post(f"{BASE_URL}/api/topics", json=topic_data)
    topic_result = response.json()
    
    if not topic_result.get('success'):
        log("❌", "Ошибка создания темы", topic_result)
        return False
    
    # ИСПРАВЛЕНО: data.session_id вместо data.topic_id
    session_id = topic_result.get('data', {}).get('session_id')
    queries = topic_result.get('data', {}).get('queries', [])
    log("✅", f"Тема создана: {session_id}")
    log("📋", f"Запросов сгенерировано: {len(queries)}")
    
    for i, q in enumerate(queries, 1):
        print(f"  {i}. {q.get('query_cn')} → {q.get('query_ru')}")
    
    # 4. STAGE 1: Поиск компаний
    log("🏢", "Шаг 3: Stage 1 - Поиск компаний (это займет ~30-60 сек)")
    start_time = time.time()
    
    response = requests.post(
        f"{BASE_URL}/api/sessions/{session_id}/process-stage/1",
        json={"force": False},
        timeout=120
    )
    
    elapsed = time.time() - start_time
    stage1 = response.json()
    
    if not stage1.get('success'):
        log("❌", "Stage 1 ошибка", stage1)
        return False
    
    result = stage1.get('result', {})
    log("✅", f"Stage 1 завершен за {elapsed:.1f} сек")
    log("📊", f"Компаний найдено: {result.get('companiesFound', 0)}")
    
    # Проверка базы после Stage 1
    time.sleep(2)
    response = requests.get(f"{BASE_URL}/api/debug/companies")
    companies = response.json().get('companies', [])
    
    log("📊", f"Компаний сохранено в базу: {len(companies)}")
    
    if len(companies) == 0:
        log("❌", "ОШИБКА: Компании не сохранились в базу!")
        return False
    
    # Показать первые 5 компаний
    print("\n  Первые 5 компаний:")
    for i, comp in enumerate(companies[:5], 1):
        website = comp.get('website') or '❌ НЕТ'
        email = comp.get('email') or '❌ НЕТ'
        print(f"  {i}. {comp.get('company_name')}")
        print(f"     🌐 {website}")
        print(f"     📧 {email}")
    
    # Статистика
    with_website = sum(1 for c in companies if c.get('website'))
    with_email = sum(1 for c in companies if c.get('email'))
    
    print(f"\n  📊 Статистика:")
    print(f"     Всего: {len(companies)}")
    print(f"     С сайтом: {with_website} ({with_website*100//len(companies)}%)")
    print(f"     С email: {with_email} ({with_email*100//len(companies)}%)")
    
    log("✅", "ТЕСТ ПРОЙДЕН: База очищается и Stage 1 работает!")
    return True

if __name__ == "__main__":
    try:
        success = test_full_flow()
        exit(0 if success else 1)
    except Exception as e:
        log("❌", f"ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
