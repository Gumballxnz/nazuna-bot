import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRUPOS_DIR = path.join(__dirname, '..', '..', 'database', 'grupos');
const INDEX_FILE = path.join(__dirname, '..', '..', 'database', 'captchaIndex.json');

let captchaIndex = new Map();
let isInitialized = false;
let saveTimeout = null;

async function initCaptchaIndex() {
  if (isInitialized) return;

  try {

    if (existsSync(INDEX_FILE)) {
      const data = await fs.readFile(INDEX_FILE, 'utf-8');
      const parsed = JSON.parse(data);

      const now = Date.now();
      for (const [userId, captchaData] of Object.entries(parsed)) {
        if (captchaData.expiresAt > now) {
          captchaIndex.set(userId, captchaData);
        }
      }

      console.log(`[CaptchaIndex] Carregado ${captchaIndex.size} captchas pendentes do índice`);
    } else {

      await rebuildIndex();
    }

    isInitialized = true;

    setInterval(cleanupExpired, 5 * 60 * 1000);

  } catch (error) {
    console.error('[CaptchaIndex] Erro ao inicializar:', error.message);
    captchaIndex = new Map();
    isInitialized = true;
  }
}

async function rebuildIndex() {
  console.log('[CaptchaIndex] Reconstruindo índice a partir dos grupos...');
  captchaIndex.clear();

  try {
    if (!existsSync(GRUPOS_DIR)) {
      console.log('[CaptchaIndex] Diretório de grupos não existe ainda');
      return;
    }

    const files = await fs.readdir(GRUPOS_DIR);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const groupPath = path.join(GRUPOS_DIR, file);
        const content = await fs.readFile(groupPath, 'utf-8');
        const groupData = JSON.parse(content);

        if (groupData.pendingCaptchas && typeof groupData.pendingCaptchas === 'object') {
          for (const [userId, captchaData] of Object.entries(groupData.pendingCaptchas)) {

            if (captchaData.expiresAt > now) {
              captchaIndex.set(userId, {
                groupId: captchaData.groupId,
                answer: captchaData.answer,
                expiresAt: captchaData.expiresAt,
                groupFile: file
              });
            }
          }
        }
      } catch (err) {

      }
    }

    console.log(`[CaptchaIndex] Índice reconstruído com ${captchaIndex.size} captchas pendentes`);
    await saveIndex();

  } catch (error) {
    console.error('[CaptchaIndex] Erro ao reconstruir índice:', error.message);
  }
}

async function saveIndex() {

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      const data = Object.fromEntries(captchaIndex);
      await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
      await fs.writeFile(INDEX_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CaptchaIndex] Erro ao salvar índice:', error.message);
    }
  }, 2000);
}

function addCaptcha(userId, groupId, answer, expiresAt, groupFile = null) {
  captchaIndex.set(userId, {
    groupId,
    answer,
    expiresAt,
    groupFile: groupFile || `${groupId.replace('@g.us', '')}.json`
  });

  saveIndex();
}

function removeCaptcha(userId) {
  if (captchaIndex.has(userId)) {
    captchaIndex.delete(userId);
    saveIndex();
    return true;
  }
  return false;
}

function getCaptcha(userId) {
  const captcha = captchaIndex.get(userId);

  if (!captcha) return null;

  if (captcha.expiresAt < Date.now()) {
    captchaIndex.delete(userId);
    saveIndex();
    return null;
  }

  return captcha;
}

function hasPendingCaptcha(userId) {
  return getCaptcha(userId) !== null;
}

function cleanupExpired() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, captcha] of captchaIndex) {
    if (captcha.expiresAt < now) {
      captchaIndex.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[CaptchaIndex] Limpeza: ${cleaned} captchas expirados removidos`);
    saveIndex();
  }
}

function getStats() {
  const now = Date.now();
  let expired = 0;
  let active = 0;

  for (const captcha of captchaIndex.values()) {
    if (captcha.expiresAt < now) {
      expired++;
    } else {
      active++;
    }
  }

  return {
    total: captchaIndex.size,
    active,
    expired,
    isInitialized
  };
}

function getCaptchasForGroup(groupId) {
  const result = [];
  const now = Date.now();

  for (const [userId, captcha] of captchaIndex) {
    if (captcha.groupId === groupId && captcha.expiresAt > now) {
      result.push({ userId, ...captcha });
    }
  }

  return result;
}

export {
  initCaptchaIndex,
  rebuildIndex,
  addCaptcha,
  removeCaptcha,
  getCaptcha,
  hasPendingCaptcha,
  cleanupExpired,
  getStats,
  getCaptchasForGroup
};

export default {
  init: initCaptchaIndex,
  add: addCaptcha,
  remove: removeCaptcha,
  get: getCaptcha,
  has: hasPendingCaptcha,
  stats: getStats,
  forGroup: getCaptchasForGroup
};
