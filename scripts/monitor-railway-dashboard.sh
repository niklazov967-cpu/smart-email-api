#!/bin/bash

# Real-time monitoring dashboard for Railway logs v2.20.1
# Tracks: Stage 2/3/4, BONUS finds, Retry logic, Errors

echo "╔════════════════════════════════════════════════════════╗"
echo "║   🎯 RAILWAY MONITORING DASHBOARD v2.20.1              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Counters
WEBSITES_FOUND=0
EMAILS_FOUND=0
BONUS_WEBSITES=0
BONUS_EMAILS=0
RETRY_STAGE3=0
NOTHING_FOUND=0
ERRORS=0

echo "⏰ Старт мониторинга: $(date '+%H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

while true; do
    clear
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║   🎯 RAILWAY MONITORING DASHBOARD v2.20.1              ║"
    echo "║   $(date '+%Y-%m-%d %H:%M:%S')                                  ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    
    # Fetch recent logs
    LOGS=$(railway logs --tail 100 2>&1)
    
    # Count findings
    WEBSITES_FOUND=$(echo "$LOGS" | grep -c "Website found\|foundWebsite.*true" || echo "0")
    EMAILS_FOUND=$(echo "$LOGS" | grep -c "Email found\|foundEmail.*true" || echo "0")
    BONUS_WEBSITES=$(echo "$LOGS" | grep -c "🎁 BONUS: Website found" || echo "0")
    BONUS_EMAILS=$(echo "$LOGS" | grep -c "🎁 BONUS: Email found" || echo "0")
    RETRY_STAGE3=$(echo "$LOGS" | grep -c "will retry Stage 3\|🔄 Stage" || echo "0")
    NOTHING_FOUND=$(echo "$LOGS" | grep -c "Nothing found" || echo "0")
    ERRORS=$(echo "$LOGS" | grep -c "Error\|error:" || echo "0")
    
    # Display statistics
    echo "📊 СТАТИСТИКА ОБРАБОТКИ (последние 100 записей):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   🌐 Websites найдено:        $WEBSITES_FOUND"
    echo "   📧 Emails найдено:          $EMAILS_FOUND"
    echo "   🎁 BONUS Websites:          $BONUS_WEBSITES"
    echo "   🎁 BONUS Emails:            $BONUS_EMAILS"
    echo "   🔄 Retry Stage 3:           $RETRY_STAGE3"
    echo "   ❌ Ничего не найдено:       $NOTHING_FOUND"
    echo "   ⚠️  Errors:                  $ERRORS"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 ПОСЛЕДНИЕ СОБЫТИЯ:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Show recent important events
    echo "$LOGS" | grep -E "(BONUS|🎁|Retry|🔄|Stage 2.*found|Stage 3.*found|Stage 4.*found|Error)" | tail -15
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⏱️  Обновление через 5 секунд... (Ctrl+C для остановки)"
    
    sleep 5
done

