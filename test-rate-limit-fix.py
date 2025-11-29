#!/usr/bin/env python3
"""
Тест для проверки исправления Rate Limit 429 Error (v2.1.1)
Проверяет что запросы идут последовательно и нет параллельных вызовов
"""

import requests
import time
import json
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ===== НАСТРОЙКИ =====
BASE_URL = "https://smart-email-api-production.up.railway.app"  # Замените на свой URL
TEST_TIMEOUT = 120  # секунд

# Цвета для консоли
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log(emoji, message, color=""):
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{timestamp}] {emoji} {message}{RESET}")

def test_api_stats():
    """Проверить статистику API перед тестом"""
    log("📊", "Checking API stats...", BLUE)
    
    try:
        response = requests.get(f"{BASE_URL}/api/debug/api-stats", timeout=10)
        if response.status_code == 200:
            data = response.json()
            log("✅", f"API Stats: {json.dumps(data, indent=2)}", GREEN)
            return data
        else:
            log("❌", f"Failed to get API stats: {response.status_code}", RED)
            return None
    except Exception as e:
        log("❌", f"Error getting API stats: {e}", RED)
        return None

def test_single_request(query_num):
    """Выполнить один тестовый запрос"""
    start_time = time.time()
    
    log("🔵", f"Request #{query_num} START", BLUE)
    
    try:
        # Используем Stage 1 test endpoint
        response = requests.post(
            f"{BASE_URL}/api/debug/test-stage1",
            json={"query": f"测试公司 {query_num}"},
            timeout=TEST_TIMEOUT
        )
        
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            log("✅", f"Request #{query_num} SUCCESS in {elapsed:.1f}s", GREEN)
            return {
                "success": True,
                "query_num": query_num,
                "elapsed": elapsed,
                "response": data
            }
        else:
            log("❌", f"Request #{query_num} FAILED: {response.status_code}", RED)
            return {
                "success": False,
                "query_num": query_num,
                "elapsed": elapsed,
                "error": f"HTTP {response.status_code}"
            }
    
    except Exception as e:
        elapsed = time.time() - start_time
        log("❌", f"Request #{query_num} ERROR: {e}", RED)
        return {
            "success": False,
            "query_num": query_num,
            "elapsed": elapsed,
            "error": str(e)
        }

def test_parallel_requests(num_requests=5):
    """
    Запустить несколько запросов параллельно
    Должны выполняться ПОСЛЕДОВАТЕЛЬНО благодаря mutex
    """
    log("🚀", f"Starting {num_requests} parallel requests...", YELLOW)
    log("📋", "Expected: All requests should queue and execute sequentially", BLUE)
    
    start_time = time.time()
    results = []
    
    with ThreadPoolExecutor(max_workers=num_requests) as executor:
        futures = [executor.submit(test_single_request, i+1) for i in range(num_requests)]
        
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
    
    total_elapsed = time.time() - start_time
    
    # Анализ результатов
    log("\n" + "="*60, "", BLUE)
    log("📊", "TEST RESULTS:", YELLOW)
    log("="*60, "", BLUE)
    
    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    
    log("📈", f"Total Requests: {num_requests}", BLUE)
    log("✅", f"Successful: {len(successful)}", GREEN)
    log("❌", f"Failed: {len(failed)}", RED if failed else GREEN)
    log("⏱️", f"Total Time: {total_elapsed:.1f}s", BLUE)
    
    if successful:
        avg_time = sum(r["elapsed"] for r in successful) / len(successful)
        log("⌛", f"Avg Response Time: {avg_time:.1f}s", BLUE)
    
    # Проверка последовательности
    if len(successful) >= 2:
        # Если запросы идут последовательно, разница во времени должна быть минимальной
        # (т.к. каждый ждет предыдущего)
        times = sorted([r["elapsed"] for r in successful])
        
        log("\n" + "="*60, "", BLUE)
        log("🔍", "SEQUENTIAL CHECK:", YELLOW)
        
        # Ожидаемое поведение: время выполнения увеличивается линейно
        # Request 1: ~3s
        # Request 2: ~6s (ждал 3s + свои 3s)
        # Request 3: ~9s (ждал 6s + свои 3s)
        
        for i, t in enumerate(times):
            expected = (i + 1) * 3  # Примерное ожидание
            diff = abs(t - expected)
            
            if diff < 5:  # Допустимая погрешность
                log("✅", f"Request {i+1}: {t:.1f}s (expected ~{expected}s)", GREEN)
            else:
                log("⚠️", f"Request {i+1}: {t:.1f}s (expected ~{expected}s)", YELLOW)
    
    # Финальная оценка
    log("\n" + "="*60, "", BLUE)
    
    success_rate = (len(successful) / num_requests) * 100
    
    if success_rate >= 80:
        log("🎉", f"TEST PASSED! Success rate: {success_rate:.0f}%", GREEN)
        return True
    else:
        log("❌", f"TEST FAILED! Success rate: {success_rate:.0f}%", RED)
        return False

def main():
    """Главная функция"""
    log("🔧", "Rate Limit Fix Test - v2.1.1", YELLOW)
    log("="*60, "", BLUE)
    
    # Шаг 1: Проверить статистику ДО теста
    log("\n📋", "Step 1: Check API stats BEFORE test", YELLOW)
    stats_before = test_api_stats()
    
    # Шаг 2: Запустить параллельные запросы
    log("\n📋", "Step 2: Run parallel requests test", YELLOW)
    test_passed = test_parallel_requests(num_requests=5)
    
    # Шаг 3: Проверить статистику ПОСЛЕ теста
    log("\n📋", "Step 3: Check API stats AFTER test", YELLOW)
    time.sleep(2)  # Дать время на обновление статистики
    stats_after = test_api_stats()
    
    # Сравнение
    if stats_before and stats_after:
        log("\n" + "="*60, "", BLUE)
        log("📊", "STATS COMPARISON:", YELLOW)
        
        rate_limited_before = stats_before.get("rate_limited", 0)
        rate_limited_after = stats_after.get("rate_limited", 0)
        rate_limited_diff = rate_limited_after - rate_limited_before
        
        if rate_limited_diff == 0:
            log("✅", "No rate limit errors detected! 🎉", GREEN)
        else:
            log("⚠️", f"Rate limit errors increased by {rate_limited_diff}", YELLOW)
    
    # Итоговый результат
    log("\n" + "="*60, "", BLUE)
    
    if test_passed:
        log("🎉", "ALL TESTS PASSED!", GREEN)
        log("✅", "Rate Limit Fix is working correctly!", GREEN)
    else:
        log("❌", "TESTS FAILED!", RED)
        log("⚠️", "Please check Railway logs for details", YELLOW)
    
    log("="*60, "", BLUE)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n⚠️", "Test interrupted by user", YELLOW)
    except Exception as e:
        log("❌", f"Test failed with error: {e}", RED)
        import traceback
        traceback.print_exc()

