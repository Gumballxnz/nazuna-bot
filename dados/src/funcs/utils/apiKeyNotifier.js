/**
 * Sistema centralizado de notificação de problemas com API Key
 * Gerencia limite diário de notificações e envia alertas ao dono do bot
 */

// Sistema de cache para controlar avisos diários de API key
const dailyNotifications = {
  count: 0,
  date: null,
  maxNotifications: 3
};

// Função para verificar se pode enviar notificação
function canSendNotification() {
  const today = new Date().toDateString();
  
  // Reset contador se mudou o dia
  if (dailyNotifications.date !== today) {
    dailyNotifications.count = 0;
    dailyNotifications.date = today;
  }
  
  return dailyNotifications.count < dailyNotifications.maxNotifications;
}

// Função para incrementar contador de notificações
function incrementNotificationCount() {
  dailyNotifications.count++;
}

/**
 * Função para verificar se o erro é relacionado à API key
 */
function isApiKeyError(error) {
  if (!error) return false;
  
  const errorMessage = (error.message || '').toLowerCase();
  const statusCode = error.response?.status;
  const responseData = error.response?.data;
  
  const authErrorCodes = [401, 403, 429];
  
  const keyErrorMessages = [
    'api key',
    'unauthorized',
    'invalid token',
    'authentication failed',
    'access denied',
    'quota exceeded',
    'rate limit',
    'forbidden',
    'token expired',
    'invalid credentials'
  ];
  
  if (authErrorCodes.includes(statusCode)) {
    return true;
  }
  
  if (keyErrorMessages.some(msg => errorMessage.includes(msg))) {
    return true;
  }
  
  if (responseData && typeof responseData === 'object') {
    const responseString = JSON.stringify(responseData).toLowerCase();
    if (keyErrorMessages.some(msg => responseString.includes(msg))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Notifica o dono do bot sobre problemas com API Key
 * @param {Object} nazu - Instância do bot
 * @param {string} ownerLid - ID do dono no formato WhatsApp
 * @param {string} error - Mensagem de erro
 * @param {string} serviceName - Nome do serviço afetado (YouTube, TikTok, Instagram, IA)
 * @param {string} prefix - Prefixo do bot (opcional, padrão: '!')
 */
async function notifyOwnerAboutApiKey(nazu, ownerLid, error, serviceName = 'Sistema', prefix = '!') {
  // SILENCIADO POR SOLICITAÇÃO DO USUÁRIO
  console.log(`📡 [API Key Alert Silenced] Serviço: ${serviceName} | Erro: ${error}`);
  return;
  
  // Validar parâmetros obrigatórios
  if (!nazu || !ownerLid) {
    console.error('❌ notifyOwnerAboutApiKey: Parâmetros inválidos', { 
      hasNazu: !!nazu, 
      ownerLid: ownerLid || 'undefined' 
    });
    return;
  }
  
  // Verificar se pode enviar notificação
  if (!canSendNotification()) {
    // Se já atingiu o limite, enviar mensagem de limite apenas uma vez
    if (dailyNotifications.count === dailyNotifications.maxNotifications) {
      const limitMessage = `🔕 *LIMITE DE AVISOS ATINGIDO*

Já foram enviados ${dailyNotifications.maxNotifications} avisos sobre problemas com API key hoje.

Para evitar spam, não enviarei mais notificações até amanhã.

🔧 *Verifique a API key (Cognima) quando possível.*`;

      try {
        await nazu.sendMessage(ownerLid, { text: limitMessage });
        incrementNotificationCount(); // Incrementa para não enviar novamente
      } catch (err) {
        console.error('❌ Erro ao enviar mensagem de limite:', err.message);
      }
    }
    return;
  }
  
  try {
    const message = `🚨 *ALERTA - PROBLEMA COM API KEY ${serviceName.toUpperCase()}* 🚨

📋 *O que é API Key?*
Uma API Key é como uma "senha especial" que permite ao bot acessar os serviços através da plataforma Cognima.

⚠️ *Problema detectado:*
• *Sistema afetado:* ${serviceName}
• *Erro específico:* ${error || 'Chave inválida ou expirada'}
• *Data/Hora:* ${new Date().toLocaleString('pt-BR')}
• *Aviso:* ${dailyNotifications.count + 1}/${dailyNotifications.maxNotifications} de hoje

💳 *Como adquirir API Key:*
• Acesse: https://cog.api.br/plans
• Escolha o plano que melhor se adequa às suas necessidades
• Configure a key no bot após a compra

🔧 *Possíveis causas e soluções:*
1️⃣ *API Key expirada* → Renovar no painel Cognima
2️⃣ *Limite de requisições esgotado* → Adquirir plano em cog.api.br/plans
3️⃣ *Chave incorreta* → Verificar se está correta no config.json
4️⃣ *Problema temporário do servidor* → Aguardar alguns minutos

⚙️ *Como ativar key:*
• Use o comando: ${prefix}apikey suachave
• Exemplo: ${prefix}apikey ABC123XYZ789
• Reinicie o bot após configurar

💬 Você receberá no máximo 3 avisos por dia para evitar spam.`;

    await nazu.sendMessage(ownerLid, { text: message });
    
    // Incrementar contador após envio bem-sucedido
    incrementNotificationCount();
    console.log(`✅ Notificação de API key enviada para o dono (${serviceName})`);
    
  } catch (notifyError) {
    console.error('❌ Erro ao notificar dono sobre API key:', notifyError.message);
  }
}

export {
  notifyOwnerAboutApiKey,
  isApiKeyError,
  canSendNotification,
  incrementNotificationCount
};
