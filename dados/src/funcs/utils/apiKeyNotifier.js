/**
 * Sistema centralizado de notificação de problemas com APIs
 * Gerencia limite diário de notificações e envia alertas ao dono do bot
 * 
 * Nota: Sistema 100% gratuito - sem dependência de API paga
 */

// Sistema de cache para controlar avisos diários
const dailyNotifications = {
  count: 0,
  date: null,
  maxNotifications: 3
};

// Verifica se pode enviar notificação
function canSendNotification() {
  const today = new Date().toDateString();
  
  // Reset contador se mudou o dia
  if (dailyNotifications.date !== today) {
    dailyNotifications.count = 0;
    dailyNotifications.date = today;
  }
  
  return dailyNotifications.count < dailyNotifications.maxNotifications;
}

// Incrementa contador de notificações
function incrementNotificationCount() {
  dailyNotifications.count++;
}

/**
 * Verifica se o erro é relacionado a autenticação/rate-limit
 */
function isApiKeyError(error) {
  if (!error) return false;
  
  const statusCode = error.response?.status;
  const authErrorCodes = [401, 403, 429];
  
  if (authErrorCodes.includes(statusCode)) {
    return true;
  }
  
  const errorMessage = (error.message || '').toLowerCase();
  const keyErrorMessages = [
    'unauthorized', 'access denied', 'rate limit', 'forbidden', 'quota exceeded'
  ];
  
  return keyErrorMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Notifica o dono do bot sobre problemas com APIs
 * @param {Object} nazu - Instância do bot
 * @param {string} ownerLid - ID do dono no formato WhatsApp
 * @param {string} error - Mensagem de erro
 * @param {string} serviceName - Nome do serviço afetado
 * @param {string} prefix - Prefixo do bot
 */
async function notifyOwnerAboutApiKey(nazu, ownerLid, error, serviceName = 'Sistema', prefix = '!') {
  // Silenciado — sistema 100% gratuito, sem API key necessária
  console.log(`📡 [API Alert] Serviço: ${serviceName} | Erro: ${error}`);
  return;
}

export {
  notifyOwnerAboutApiKey,
  isApiKeyError,
  canSendNotification,
  incrementNotificationCount
};
