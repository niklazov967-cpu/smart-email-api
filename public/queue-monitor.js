/**
 * API Queue Monitor Widget
 * Показывает текущую длину очереди AI запросов в реальном времени
 * 
 * Использование:
 * 1. Добавить CSS стили (скопировать из этого файла)
 * 2. Добавить HTML бейдж куда нужно
 * 3. Подключить этот скрипт: <script src="/queue-monitor.js"></script>
 * 4. Вызвать: startQueueMonitoring();
 */

// Глобальные переменные для мониторинга
window.queuePollingInterval = null;
window.queueMonitorActive = false;

/**
 * Запустить мониторинг очереди
 * @param {number} updateInterval - Интервал обновления в миллисекундах (по умолчанию 1000мс)
 */
function startQueueMonitoring(updateInterval = 1000) {
  if (window.queueMonitorActive) {
    console.log('Queue monitoring already active');
    return;
  }

  console.log('Starting queue monitoring...');
  window.queueMonitorActive = true;
  
  // Первое обновление сразу
  updateQueueStatus();
  
  // Затем по интервалу
  window.queuePollingInterval = setInterval(updateQueueStatus, updateInterval);
}

/**
 * Остановить мониторинг очереди
 */
function stopQueueMonitoring() {
  if (window.queuePollingInterval) {
    clearInterval(window.queuePollingInterval);
    window.queuePollingInterval = null;
    window.queueMonitorActive = false;
    console.log('Queue monitoring stopped');
  }
}

/**
 * Обновить статус очереди
 */
async function updateQueueStatus() {
  try {
    const response = await fetch('/api/debug/queue-status');
    const data = await response.json();

    if (data.success && data.queues) {
      const sonarPro = data.queues.sonar_pro;
      const sonarBasic = data.queues.sonar_basic;
      
      // Calculate total queue length
      let totalQueue = 0;
      let inProgress = false;
      
      if (sonarPro) {
        totalQueue += sonarPro.queueLength;
        inProgress = inProgress || sonarPro.inProgress;
      }
      
      if (sonarBasic) {
        totalQueue += sonarBasic.queueLength;
        inProgress = inProgress || sonarBasic.inProgress;
      }
      
      // Update badge
      const queueBadge = document.getElementById('queueBadge');
      const queueCount = document.getElementById('queueCount');
      
      if (!queueBadge || !queueCount) {
        console.warn('Queue badge elements not found in DOM');
        return;
      }
      
      queueCount.textContent = totalQueue;
      
      // Update badge style based on queue length
      queueBadge.classList.remove('idle', 'busy', 'overloaded', 'loading');
      
      if (totalQueue === 0 && !inProgress) {
        queueBadge.classList.add('idle');
      } else if (totalQueue > 0 && totalQueue <= 5) {
        queueBadge.classList.add('busy');
      } else if (totalQueue > 5) {
        queueBadge.classList.add('overloaded');
      } else if (inProgress) {
        queueBadge.classList.add('busy');
      }
      
      // Add tooltip with details
      const tooltipText = `Sonar Pro: ${sonarPro?.queueLength || 0} в очереди${sonarPro?.inProgress ? ' (обработка)' : ''}\n` +
                         `Sonar Basic: ${sonarBasic?.queueLength || 0} в очереди${sonarBasic?.inProgress ? ' (обработка)' : ''}\n` +
                         `Последнее обновление: ${new Date().toLocaleTimeString()}`;
      
      queueBadge.title = tooltipText;
      
      // Dispatch custom event for other scripts
      window.dispatchEvent(new CustomEvent('queueStatusUpdated', {
        detail: {
          totalQueue,
          inProgress,
          sonarPro,
          sonarBasic,
          timestamp: Date.now()
        }
      }));
    }
  } catch (error) {
    console.error('Error updating queue status:', error);
    
    // Update badge to show error state
    const queueBadge = document.getElementById('queueBadge');
    const queueCount = document.getElementById('queueCount');
    
    if (queueCount) {
      queueCount.textContent = '?';
    }
    
    if (queueBadge) {
      queueBadge.title = 'Ошибка подключения к API';
    }
  }
}

/**
 * Получить текущий статус очереди (без обновления DOM)
 * @returns {Promise<Object>} Статус очереди
 */
async function getQueueStatus() {
  try {
    const response = await fetch('/api/debug/queue-status');
    const data = await response.json();
    
    if (data.success) {
      return {
        success: true,
        sonarPro: data.queues.sonar_pro,
        sonarBasic: data.queues.sonar_basic,
        timestamp: data.timestamp
      };
    }
    
    return { success: false, error: 'Invalid response' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Auto-start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Check if queue badge exists in DOM
    if (document.getElementById('queueBadge')) {
      console.log('Queue badge found, starting monitoring...');
      startQueueMonitoring();
    }
  });
} else {
  // DOM already loaded
  if (document.getElementById('queueBadge')) {
    console.log('Queue badge found, starting monitoring...');
    startQueueMonitoring();
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopQueueMonitoring();
});

// Export functions for use in other scripts
window.QueueMonitor = {
  start: startQueueMonitoring,
  stop: stopQueueMonitoring,
  update: updateQueueStatus,
  getStatus: getQueueStatus
};

console.log('Queue Monitor Widget loaded successfully');

