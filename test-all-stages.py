#!/usr/bin/env python3
"""Тест всех этапов обработки"""
import requests
import time
import json

BASE_URL = "http://localhost:3030"

def log(emoji, msg, data=None):
    print(f"\n{emoji} {msg}")
    if data and isinstance(data, dict):
        print(json.dumps(data, indent=2, ensure_ascii=False))

def test_all_stages():
    print("\n" + "="*70)
    print("🧪 ПОЛНЫЙ ТЕСТ ВСЕХ ЭТАПОВ")
    print("="*70)
    
    # 1. ОЧИСТКА БАЗЫ
    log("🗑️", "Этап 0: Очистка базы данных")
    response = requests.delete(f"{BASE_URL}/api/sessions/clear-all")
    result = response.json()
    log("✅", f"База очищена: {len(result.get('cleared_tables', []))} таблиц")
    time.sleep(1)
    
    # 2. СОЗДАНИЕ ТЕМЫ
    log("📝", "Этап 0: Создание темы")
    topic_data = {
        "main_topic": "小批量数控加工服务",
        "target_count": 2
    }
    
    response = requests.post(f"{BASE_URL}/api/topics", json=topic_data)
    topic_result = response.json()
    
    if not topic_result.get('success'):
        log("❌", "Ошибка создания темы", topic_result)
        return False
    
    session_id = topic_result['data']['session_id']
    queries = topic_result['data']['queries']
    log("✅", f"Сессия: {session_id}")
    log("📋", f"Запросов: {len(queries)}")
    
    # 3. STAGE 1: Поиск компаний
    log("🏢", "═══ STAGE 1: Поиск компаний ═══")
    start_time = time.time()
    
    response = requests.post(
        f"{BASE_URL}/api/sessions/{session_id}/process-stage/1",
        json={"force": False},
        timeout=120
    )
    
    stage1 = response.json()
    elapsed = time.time() - start_time
    
    if not stage1.get('success'):
        log("❌", "Stage 1 ошибка", stage1)
        return False
    
    result1 = stage1.get('result', {})
    log("✅", f"Stage 1 завершен за {elapsed:.1f} сек")
    print(f"  📊 Компаний найдено: {result1.get('companiesFound', 0)}")
    
    time.sleep(2)
    
    # Проверка базы после Stage 1
    response = requests.get(f"{BASE_URL}/api/debug/companies")
    companies = response.json().get('companies', [])
    
    print(f"  💾 В базе: {len(companies)} компаний")
    with_website = sum(1 for c in companies if c.get('website'))
    with_email = sum(1 for c in companies if c.get('email'))
    print(f"  🌐 С сайтом: {with_website} ({with_website*100//len(companies) if companies else 0}%)")
    print(f"  📧 С email: {with_email} ({with_email*100//len(companies) if companies else 0}%)")
    
    if len(companies) == 0:
        log("❌", "ОШИБКА: Компании не сохранились!")
        return False
    
    # Показать первые 3 компании
    print("\n  Первые 3 компании:")
    for i, comp in enumerate(companies[:3], 1):
        print(f"  {i}. {comp.get('company_name')}")
        print(f"     🌐 {comp.get('website') or '❌ НЕТ'}")
        print(f"     📧 {comp.get('email') or '❌ НЕТ'}")
    
    # 4. STAGE 2: Поиск сайтов
    log("🌐", "═══ STAGE 2: Поиск сайтов ═══")
    
    # Проверим сколько компаний без сайтов
    without_website = sum(1 for c in companies if not c.get('website'))
    print(f"  📊 Компаний БЕЗ сайта: {without_website}")
    
    if without_website > 0:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/sessions/{session_id}/process-stage/2",
            json={"force": False},
            timeout=120
        )
        
        stage2 = response.json()
        elapsed = time.time() - start_time
        
        if not stage2.get('success'):
            log("❌", "Stage 2 ошибка", stage2)
            return False
        
        result2 = stage2.get('result', {})
        log("✅", f"Stage 2 завершен за {elapsed:.1f} сек")
        print(f"  📊 Обработано: {result2.get('total', 0)}")
        print(f"  ✅ Найдено сайтов: {result2.get('found', 0)}")
        print(f"  ❌ Не найдено: {result2.get('notFound', 0)}")
    else:
        log("⏭️", "Stage 2 пропущен: все сайты найдены в Stage 1")
    
    time.sleep(2)
    
    # 5. STAGE 3: Поиск email
    log("📧", "═══ STAGE 3: Поиск контактов ═══")
    
    # Обновим данные
    response = requests.get(f"{BASE_URL}/api/debug/companies")
    companies = response.json().get('companies', [])
    
    with_website = sum(1 for c in companies if c.get('website'))
    without_email = sum(1 for c in companies if c.get('website') and not c.get('email'))
    
    print(f"  📊 С сайтом: {with_website}")
    print(f"  📊 БЕЗ email: {without_email}")
    
    if without_email > 0:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/sessions/{session_id}/process-stage/3",
            json={"force": False},
            timeout=180
        )
        
        stage3 = response.json()
        elapsed = time.time() - start_time
        
        if not stage3.get('success'):
            log("❌", "Stage 3 ошибка", stage3)
            return False
        
        result3 = stage3.get('result', {})
        log("✅", f"Stage 3 завершен за {elapsed:.1f} сек")
        print(f"  📊 Обработано сайтов: {result3.get('sitesProcessed', 0)}")
        print(f"  ✅ Контактов найдено: {result3.get('contactsFound', 0)}")
    else:
        log("⏭️", "Stage 3 пропущен: все email найдены ранее")
    
    time.sleep(2)
    
    # 6. STAGE 4: AI Валидация
    log("🤖", "═══ STAGE 4: AI Валидация ═══")
    
    # Обновим данные
    response = requests.get(f"{BASE_URL}/api/debug/companies")
    companies = response.json().get('companies', [])
    
    for_validation = sum(1 for c in companies if c.get('website') or c.get('email'))
    print(f"  📊 Компаний для валидации: {for_validation}")
    
    if for_validation > 0:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/sessions/{session_id}/process-stage/4",
            json={"force": False},
            timeout=240
        )
        
        stage4 = response.json()
        elapsed = time.time() - start_time
        
        if not stage4.get('success'):
            log("❌", "Stage 4 ошибка", stage4)
            # Не возвращаем False, продолжим
            print(f"  ⚠️ Ошибка: {stage4.get('error', 'Unknown')}")
        else:
            result4 = stage4.get('result', {})
            log("✅", f"Stage 4 завершен за {elapsed:.1f} сек")
            print(f"  📊 Компаний проанализировано: {result4.get('companiesAnalyzed', 0)}")
            print(f"  ✅ Валидных: {result4.get('validatedCount', 0)}")
    else:
        log("⏭️", "Stage 4 пропущен: нет компаний для валидации")
    
    time.sleep(2)
    
    # 7. ФИНАЛЬНАЯ СТАТИСТИКА
    log("📊", "═══ ФИНАЛЬНАЯ СТАТИСТИКА ═══")
    
    response = requests.get(f"{BASE_URL}/api/debug/companies")
    companies = response.json().get('companies', [])
    
    total = len(companies)
    with_website = sum(1 for c in companies if c.get('website'))
    with_email = sum(1 for c in companies if c.get('email'))
    validated = sum(1 for c in companies if c.get('validation_score'))
    
    print(f"\n  📦 Всего компаний: {total}")
    print(f"  🌐 С сайтом: {with_website} ({with_website*100//total if total else 0}%)")
    print(f"  📧 С email: {with_email} ({with_email*100//total if total else 0}%)")
    print(f"  ✅ Валидировано: {validated} ({validated*100//total if total else 0}%)")
    
    # Показать компании с email
    companies_with_email = [c for c in companies if c.get('email')]
    if companies_with_email:
        print(f"\n  📧 Компании с email:")
        for i, comp in enumerate(companies_with_email[:5], 1):
            score = comp.get('validation_score') or 0
            print(f"  {i}. {comp.get('company_name')}")
            print(f"     📧 {comp.get('email')}")
            print(f"     🌐 {comp.get('website')}")
            if score:
                print(f"     ⭐ Score: {score}")
    
    log("✅", "ВСЕ ЭТАПЫ ЗАВЕРШЕНЫ!")
    return True

if __name__ == "__main__":
    try:
        success = test_all_stages()
        exit(0 if success else 1)
    except Exception as e:
        log("❌", f"КРИТИЧЕСКАЯ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
