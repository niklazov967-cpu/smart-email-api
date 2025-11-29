#!/bin/bash

# Database Statistics Script
# Uses psql to connect to Supabase and get stats

SUPABASE_URL="https://ptbefsrvvcrjrfxxtogt.supabase.co"
SUPABASE_DB="postgresql://postgres.ptbefsrvvcrjrfxxtogt:LTMkitai2025@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                  📊 ПОЛНАЯ СТАТИСТИКА ВСЕХ ЭТАПОВ                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣ ОБЩЕЕ КОЛИЧЕСТВО КОМПАНИЙ:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "$SUPABASE_DB" -c "SELECT COUNT(*) as total_companies FROM pending_companies;"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣ СТАТУСЫ ПО ЭТАПАМ:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "$SUPABASE_DB" -c "SELECT current_stage, stage2_status, stage3_status, COUNT(*) as count FROM pending_companies GROUP BY current_stage, stage2_status, stage3_status ORDER BY current_stage, stage2_status, stage3_status;"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣ КОМПАНИИ С САЙТАМИ:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "$SUPABASE_DB" -c "SELECT COUNT(*) as total, COUNT(CASE WHEN website IS NOT NULL THEN 1 END) as with_website, COUNT(CASE WHEN website IS NULL THEN 1 END) as no_website FROM pending_companies;"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣ КОМПАНИИ С EMAIL:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "$SUPABASE_DB" -c "SELECT COUNT(*) as total, COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email, COUNT(CASE WHEN email IS NULL THEN 1 END) as no_email FROM pending_companies;"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣ ТОП-20 КОМПАНИЙ С EMAIL:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "$SUPABASE_DB" -c "SELECT company_name, website, email, current_stage, stage2_status, stage3_status FROM pending_companies WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 20;"

echo ""

