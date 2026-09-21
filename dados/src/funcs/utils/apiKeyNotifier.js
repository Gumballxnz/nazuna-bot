const dailyNotifications = {
  count: 0,
  date: null,
  maxNotifications: 3
};

function canSendNotification() {
  const today = new Date().toDateString();

  if (dailyNotifications.date !== today) {
    dailyNotifications.count = 0;
    dailyNotifications.date = today;
  }

  return dailyNotifications.count < dailyNotifications.maxNotifications;
}

function incrementNotificationCount() {
  dailyNotifications.count++;
}

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

async function notifyOwnerAboutApiKey(nazu, ownerLid, error, serviceName = 'Sistema', prefix = '!') {

  console.log(`📡 [API Alert] Serviço: ${serviceName} | Erro: ${error}`);
  return;
}

export {
  notifyOwnerAboutApiKey,
  isApiKeyError,
  canSendNotification,
  incrementNotificationCount
};
