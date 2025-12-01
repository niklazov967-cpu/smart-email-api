/**
 * DomainPriorityManager - Управление приоритетами доменов
 * 
 * Для китайских поставщиков приоритет:
 * 1. .cn (китайский национальный домен)
 * 2. .com.cn (китайский коммерческий)
 * 3. .com (международный)
 * 4. Остальные
 */

class DomainPriorityManager {
  constructor() {
    // Приоритеты TLD (чем меньше число, тем выше приоритет)
    this.tldPriority = {
      '.cn': 1,          // Китайский национальный домен (ВЫСШИЙ ПРИОРИТЕТ)
      '.com.cn': 2,      // Китайский коммерческий домен
      '.net.cn': 3,      // Китайский сетевой домен
      '.org.cn': 4,      // Китайские организации
      '.com': 5,         // Международный коммерческий
      '.net': 6,         // Международный сетевой
      '.co': 7,          // Колумбия/коммерческий
      '.org': 8,         // Организации
      '.io': 9,          // Международный (стартапы)
      '.asia': 10,       // Азиатский регион
      '.ltd': 11,        // Limited
      '.tech': 12,       // Технологии
      // Остальные TLD получат приоритет 100
    };

    this.defaultPriority = 100;
  }

  /**
   * Извлечь TLD из домена
   * wayken.cn → .cn
   * wayken.com.cn → .com.cn
   * xy-global.co.uk → .co.uk
   */
  extractTld(domain) {
    if (!domain) return null;

    // Очистка домена
    let clean = domain.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('/')[0]; // Убрать путь

    const parts = clean.split('.');
    
    if (parts.length === 1) return null; // Нет TLD
    
    // Проверка составных TLD (.com.cn, .net.cn, .co.uk и т.д.)
    if (parts.length >= 3) {
      const twoPartTld = '.' + parts.slice(-2).join('.');
      if (this.tldPriority[twoPartTld] !== undefined) {
        return twoPartTld;
      }
    }
    
    // Обычный TLD
    return '.' + parts[parts.length - 1];
  }

  /**
   * Получить числовой приоритет TLD
   */
  getTldPriority(domain) {
    const tld = this.extractTld(domain);
    if (!tld) return this.defaultPriority;
    
    return this.tldPriority[tld] || this.defaultPriority;
  }

  /**
   * Извлечь базовый домен без TLD
   * wayken.cn → wayken
   * wayken.com.cn → wayken
   * star-rapid.com → star-rapid
   */
  extractBaseDomain(domain) {
    if (!domain) return null;
    
    let clean = domain.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('/')[0];
    
    const parts = clean.split('.');
    
    if (parts.length === 1) return clean;
    
    // Для составных TLD (.com.cn, .co.uk)
    const tld = this.extractTld(domain);
    if (tld && tld.split('.').length > 2) {
      // .com.cn → убрать 2 части
      return parts.slice(0, -2).join('.');
    }
    
    // Обычный TLD → убрать 1 часть
    return parts.slice(0, -1).join('.');
  }

  /**
   * Сравнить два домена по приоритету
   * Возвращает:
   * - отрицательное число, если domain1 имеет более высокий приоритет
   * - положительное число, если domain2 имеет более высокий приоритет
   * - 0, если равны
   */
  compare(domain1, domain2) {
    const priority1 = this.getTldPriority(domain1);
    const priority2 = this.getTldPriority(domain2);
    return priority1 - priority2;
  }

  /**
   * Выбрать домен с наивысшим приоритетом из массива
   */
  selectBest(domains) {
    if (!domains || domains.length === 0) return null;
    if (domains.length === 1) return domains[0];

    return domains.reduce((best, current) => {
      if (!current) return best;
      if (!best) return current;
      
      const comparison = this.compare(current, best);
      return comparison < 0 ? current : best;
    });
  }

  /**
   * Проверить, являются ли два домена одной компанией (одинаковый базовый домен)
   */
  isSameCompany(domain1, domain2) {
    if (!domain1 || !domain2) return false;
    
    const base1 = this.extractBaseDomain(domain1);
    const base2 = this.extractBaseDomain(domain2);
    
    return base1 === base2 && base1 !== null;
  }

  /**
   * Получить информацию о домене
   */
  getDomainInfo(domain) {
    return {
      original: domain,
      baseDomain: this.extractBaseDomain(domain),
      tld: this.extractTld(domain),
      priority: this.getTldPriority(domain),
      isChinese: this.isChinese(domain)
    };
  }

  /**
   * Проверить, является ли домен китайским
   */
  isChinese(domain) {
    const tld = this.extractTld(domain);
    return tld && (tld.endsWith('.cn') || tld === '.cn');
  }

  /**
   * Выбрать лучшую запись компании из нескольких (для слияния дубликатов)
   * Критерии:
   * 1. Приоритет TLD
   * 2. Validation score
   * 3. Наличие email
   * 4. Дата создания (более ранняя)
   */
  selectBestRecord(records) {
    if (!records || records.length === 0) return null;
    if (records.length === 1) return records[0];

    return records.reduce((best, current) => {
      if (!current) return best;
      if (!best) return current;

      // 1. Сравнить приоритет TLD
      const domainComparison = this.compare(
        current.normalized_domain || current.website,
        best.normalized_domain || best.website
      );
      
      if (domainComparison < 0) return current;
      if (domainComparison > 0) return best;

      // 2. Если TLD одинаковый, сравнить validation_score
      const currentScore = current.validation_score || 0;
      const bestScore = best.validation_score || 0;
      
      if (currentScore > bestScore) return current;
      if (currentScore < bestScore) return best;

      // 3. Если score одинаковый, предпочесть запись с email
      const currentHasEmail = !!current.email;
      const bestHasEmail = !!best.email;
      
      if (currentHasEmail && !bestHasEmail) return current;
      if (!currentHasEmail && bestHasEmail) return best;

      // 4. Если все равно, выбрать более раннюю запись
      const currentDate = new Date(current.created_at || 0);
      const bestDate = new Date(best.created_at || 0);
      
      return currentDate < bestDate ? current : best;
    });
  }

  /**
   * Отладочная информация
   */
  logComparison(domain1, domain2) {
    const info1 = this.getDomainInfo(domain1);
    const info2 = this.getDomainInfo(domain2);
    const comparison = this.compare(domain1, domain2);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Domain Comparison:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📍 Domain 1: ${domain1}`);
    console.log(`   Base: ${info1.baseDomain}`);
    console.log(`   TLD: ${info1.tld}`);
    console.log(`   Priority: ${info1.priority}`);
    console.log(`   Chinese: ${info1.isChinese ? '✅' : '❌'}`);
    console.log(`\n📍 Domain 2: ${domain2}`);
    console.log(`   Base: ${info2.baseDomain}`);
    console.log(`   TLD: ${info2.tld}`);
    console.log(`   Priority: ${info2.priority}`);
    console.log(`   Chinese: ${info2.isChinese ? '✅' : '❌'}`);
    console.log(`\n🏆 Winner: ${comparison < 0 ? domain1 : (comparison > 0 ? domain2 : 'EQUAL')}`);
    console.log(`   ${comparison < 0 ? '👈 Domain 1 wins' : (comparison > 0 ? 'Domain 2 wins 👉' : '🤝 Equal priority')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

// Singleton instance
const domainPriorityManager = new DomainPriorityManager();

module.exports = domainPriorityManager;

