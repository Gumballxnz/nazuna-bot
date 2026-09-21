import fs from 'fs';
import fsPromises from 'fs/promises';
import pathz from 'path';

let jidLidMemoryCache = new Map();
let jidLidCacheFile = null;
let cacheModified = false;
let saveCacheTimeout = null;

function initJidLidCache(cacheFilePath) {
  jidLidCacheFile = cacheFilePath;

  try {
    if (fs.existsSync(cacheFilePath)) {
      const data = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      jidLidMemoryCache = new Map(Object.entries(data.mappings || {}));
      console.log(`✅ Cache JID→LID carregado: ${jidLidMemoryCache.size} entradas`);
    }
  } catch (error) {
    console.warn(`⚠️ Erro ao carregar cache JID→LID: ${error.message}`);
  }

  setInterval(() => {
    if (cacheModified) {
      saveJidLidCache();
    }
  }, 5 * 60 * 1000);
}

function saveJidLidCache(force = false) {
  if (!jidLidCacheFile || (!cacheModified && !force)) return;

  if (!force && saveCacheTimeout) {
    clearTimeout(saveCacheTimeout);
  }

  const doSave = () => {
    try {
      const data = {
        version: '1.0',
        lastUpdate: new Date().toISOString(),
        mappings: Object.fromEntries(jidLidMemoryCache)
      };

      const dirPath = pathz.dirname(jidLidCacheFile);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(jidLidCacheFile, JSON.stringify(data, null, 2));
      cacheModified = false;
    } catch (error) {
      console.error(`❌ Erro ao salvar cache JID→LID: ${error.message}`);
    }
  };

  if (force) {
    doSave();
  } else {
    saveCacheTimeout = setTimeout(doSave, 3000);
  }
}

async function getLidFromJidCached(nazu, jid) {
  if (!isValidJid(jid)) {
    return jid;
  }

  if (jidLidMemoryCache.has(jid)) {
    const cachedLid = jidLidMemoryCache.get(jid);

    return cachedLid.includes(':') ? cachedLid.split(':')[0] + '@lid' : cachedLid;
  }

  try {
    const result = await nazu.onWhatsApp(jid);
    if (result && result[0] && result[0].lid) {
      let lid = result[0].lid;

      if (lid.includes(':')) {
        lid = lid.split(':')[0] + '@lid';
      }

      jidLidMemoryCache.set(jid, lid);
      cacheModified = true;

      return lid;
    }
  } catch (error) {
    console.warn(`⚠️ Erro ao buscar LID para ${jid}: ${error.message}`);
  }

  return jid;
}

async function convertIdsToLid(nazu, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const converted = [];

  const batchSize = 5;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchPromises = batch.map(id => getLidFromJidCached(nazu, id));
    const batchResults = await Promise.all(batchPromises);
    converted.push(...batchResults);
  }

  return converted;
}

function idsMatch(id1, id2) {
  if (!id1 || !id2) return false;

  const clean1 = id1.includes(':') ? id1.split(':')[0] + (id1.includes('@lid') ? '@lid' : '@s.whatsapp.net') : id1;
  const clean2 = id2.includes(':') ? id2.split(':')[0] + (id2.includes('@lid') ? '@lid' : '@s.whatsapp.net') : id2;

  const base1 = clean1.split('@')[0];
  const base2 = clean2.split('@')[0];

  return base1 === base2;
}

function idInArray(id, array) {
  if (!id || !Array.isArray(array)) return false;

  const cleanId = id.includes(':') ? id.split(':')[0] + (id.includes('@lid') ? '@lid' : '@s.whatsapp.net') : id;
  const baseId = cleanId.split('@')[0];

  return array.some(item => {
    if (!item) return false;

    const cleanItem = item.includes(':') ? item.split(':')[0] + (item.includes('@lid') ? '@lid' : '@s.whatsapp.net') : item;
    const baseItem = cleanItem.split('@')[0];
    return baseItem === baseId;
  });
}

async function normalizeUserId(nazu, userId) {
  if (!userId || typeof userId !== 'string') return userId;

  if (isValidLid(userId)) {
    return userId;
  }

  if (isValidJid(userId)) {
    return await getLidFromJidCached(nazu, userId);
  }

  return userId;
}

function flushJidLidCache() {
  if (saveCacheTimeout) {
    clearTimeout(saveCacheTimeout);
  }
  saveJidLidCache(true);
}

function formatUptime(seconds, longFormat = false, showZero = false) {
  const d = Math.floor(seconds / (24 * 3600));
  const h = Math.floor(seconds % (24 * 3600) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  const formats = longFormat ? {
    d: val => `${val} ${val === 1 ? 'dia' : 'dias'}`,
    h: val => `${val} ${val === 1 ? 'hora' : 'horas'}`,
    m: val => `${val} ${val === 1 ? 'minuto' : 'minutos'}`,
    s: val => `${val} ${val === 1 ? 'segundo' : 'segundos'}`
  } : {
    d: val => `${val}d`,
    h: val => `${val}h`,
    m: val => `${val}m`,
    s: val => `${val}s`
  };
  const uptimeStr = [];
  if (d > 0 || showZero) uptimeStr.push(formats.d(d));
  if (h > 0 || showZero) uptimeStr.push(formats.h(h));
  if (m > 0 || showZero) uptimeStr.push(formats.m(m));
  if (s > 0 || showZero) uptimeStr.push(formats.s(s));
  return uptimeStr.length > 0 ? uptimeStr.join(longFormat ? ', ' : ' ') : longFormat ? '0 segundos' : '0s';
}

const normalizar = (texto, keepCase = false) => {
  if (!texto || typeof texto !== 'string') return '';
  const normalizedText = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return keepCase ? normalizedText : normalizedText.toLowerCase();
};

const normalizeParam = (param) => {
  if (!param || typeof param !== 'string') return '';
  return param
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[_\-]/g, '');
};

const compareParams = (input, target) => {
  return normalizeParam(input) === normalizeParam(target);
};

const findKeyIgnoringAccents = (obj, searchKey) => {
  if (!obj || typeof obj !== 'object' || !searchKey) return null;

  const normalizedSearch = normalizeParam(searchKey);

  if (obj[searchKey]) return searchKey;
  if (obj[normalizedSearch]) return normalizedSearch;

  for (const key of Object.keys(obj)) {
    if (normalizeParam(key) === normalizedSearch) {
      return key;
    }
  }

  return null;
};

const findInArrayIgnoringAccents = (arr, searchItem) => {
  if (!Array.isArray(arr) || !searchItem) return null;

  const normalizedSearch = normalizeParam(searchItem);

  return arr.find(item => {
    if (typeof item === 'string') {
      return normalizeParam(item) === normalizedSearch;
    }
    if (item && typeof item === 'object' && item.name) {
      return normalizeParam(item.name) === normalizedSearch;
    }
    return false;
  });
};

const PARAM_ALIASES = {

  'lobo': ['lobo', 'wolf', 'lobinho', 'lôbo'],
  'dragao': ['dragao', 'dragão', 'dragon', 'dracarys', 'drago'],
  'fenix': ['fenix', 'fênix', 'phoenix', 'fenixe', 'phenix'],
  'tigre': ['tigre', 'tiger', 'tigrinho', 'tigrão'],
  'aguia': ['aguia', 'águia', 'eagle', 'falcao', 'falcão'],
  'gato': ['gato', 'cat', 'gatinho', 'felino'],
  'cao': ['cao', 'cão', 'cachorro', 'dog', 'doguinho', 'caozinho', 'cãozinho'],
  'coelho': ['coelho', 'rabbit', 'bunny', 'coelhinho'],
  'coruja': ['coruja', 'owl', 'corujinha'],
  'urso': ['urso', 'bear', 'ursinho'],

  'vermelho': ['vermelho', 'red', 'rubro', 'encarnado', 'vermelha'],
  'preto': ['preto', 'black', 'negro', 'preta'],
  'verde': ['verde', 'green'],
  'azul': ['azul', 'blue'],
  'branco': ['branco', 'white', 'branca'],
  'amarelo': ['amarelo', 'yellow', 'dourado', 'amarela'],
  'roxo': ['roxo', 'purple', 'violeta', 'roxa'],
  'laranja': ['laranja', 'orange'],

  'cara': ['cara', 'heads', 'caras', 'c'],
  'coroa': ['coroa', 'tails', 'coroas', 'co'],

  'pedra': ['pedra', 'stone', 'rock', 'rocha'],
  'ferro': ['ferro', 'iron', 'metal', 'aço', 'aco'],
  'ouro': ['ouro', 'gold', 'dourado'],
  'diamante': ['diamante', 'diamond', 'diamant', 'brilhante'],
  'madeira': ['madeira', 'wood', 'lenha'],
  'carvao': ['carvao', 'carvão', 'coal'],
  'corda': ['corda', 'rope'],
  'couro': ['couro', 'leather'],
  'linha': ['linha', 'thread', 'fio'],
  'cristal': ['cristal', 'crystal'],

  'estagiario': ['estagiario', 'estagiário', 'estag', 'intern'],
  'designer': ['designer', 'design', 'grafico', 'gráfico'],
  'programador': ['programador', 'dev', 'developer', 'coder', 'prog'],
  'gerente': ['gerente', 'manager', 'chefe', 'ger'],

  'pickaxe_bronze': ['pickaxe_bronze', 'picareta_bronze', 'picaretabronze', 'bronze'],
  'pickaxe_ferro': ['pickaxe_ferro', 'picareta_ferro', 'picaretaferro', 'pferro'],
  'pickaxe_diamante': ['pickaxe_diamante', 'picareta_diamante', 'picaretadiamante', 'pdiamante'],

  'titulo_lendario': ['titulo_lendario', 'titulo', 'título', 'titulolendario'],
  'mascote_raro': ['mascote_raro', 'mascote', 'mascoterato'],
  'mansao': ['mansao', 'mansão', 'mansion', 'casa'],
  'yate': ['yate', 'iate', 'yacht', 'barco'],
  'jet_privado': ['jet_privado', 'jato', 'jet', 'aviao', 'avião'],
  'diamante_eterno': ['diamante_eterno', 'diamanteeterno', 'eternodiamond'],
  'coroa_rei': ['coroa_rei', 'coroa', 'crown', 'coroareal'],
  'boost_permanente': ['boost_permanente', 'boostperm', 'permanenteboost'],
  'protecao_vip': ['protecao_vip', 'protecaovip', 'vip', 'proteção'],
  'multiplicador_xp': ['multiplicador_xp', 'multxp', 'xpmult', 'multiplicadorxp'],

  'xp': ['xp', 'experiencia', 'experiência', 'exp'],
  'money': ['money', 'dinheiro', 'grana', 'coins', 'moedas'],
  'luck': ['luck', 'sorte', 'lucky'],
  'power': ['power', 'poder', 'força', 'forca'],
  'mega': ['mega', 'all', 'todos', 'full'],

  'sim': ['sim', 'yes', 's', 'y', 'si', 'positivo'],
  'nao': ['nao', 'não', 'no', 'n', 'negativo'],
  'confirmar': ['confirmar', 'confirm', 'confirmado', 'ok', 'sim', 'aceito', 'aceitar']
};

const resolveParamAlias = (input) => {
  if (!input) return null;

  const normalized = normalizeParam(input);

  for (const [canonical, aliases] of Object.entries(PARAM_ALIASES)) {
    for (const alias of aliases) {
      if (normalizeParam(alias) === normalized) {
        return canonical;
      }
    }
  }

  return normalized;
};

const matchParam = (input, validOptions) => {
  if (!input || !validOptions) return null;

  const normalizedInput = normalizeParam(input);
  const resolvedInput = resolveParamAlias(input);

  if (Array.isArray(validOptions)) {
    for (const option of validOptions) {
      if (normalizeParam(option) === normalizedInput ||
          normalizeParam(option) === resolvedInput) {
        return option;
      }
    }
  } else if (typeof validOptions === 'object') {
    for (const key of Object.keys(validOptions)) {
      if (normalizeParam(key) === normalizedInput ||
          normalizeParam(key) === resolvedInput) {
        return key;
      }
    }
  }

  return null;
};

const isGroupId = (id) => id && typeof id === 'string' && id.endsWith('@g.us');
const isUserId = (id) => id && typeof id === 'string' && (id.includes('@lid') || id.includes('@s.whatsapp.net'));
const isValidLid = (str) => /^[a-zA-Z0-9_]+@lid$/.test(str);
const isValidJid = (str) => /^\d+@s\.whatsapp\.net$/.test(str);

const getUserName = (userId) => {
  if (!userId || typeof userId !== 'string') return 'unknown';
  if (userId.includes('@lid')) {
    return userId.split('@')[0];
  } else if (userId.includes('@s.whatsapp.net')) {
    return userId.split('@')[0];
  }
  return userId.split('@')[0] || userId;
};

const getLidFromJid = async (nazu, jid) => {
  if (!isValidJid(jid)) return jid;
  try {
    const result = await nazu.onWhatsApp(jid);
    if (result && result[0] && result[0].lid) {
      return result[0].lid;
    }
  } catch (error) {
    console.warn(`Erro ao obter LID para ${jid}: ${error.message}`);
  }
  return jid;
};

const buildUserId = (numberString, config) => {
  if (config.lidowner && numberString === config.numerodono) {
    return config.lidowner;
  }
  return numberString.replace(/[^\d]/g, '') + '@s.whatsapp.net';
};

const getBotId = (nazu) => {
  const botId = nazu.user.id.split(':')[0];
  return botId.includes('@lid') ? botId : botId + '@s.whatsapp.net';
};

function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, {
        recursive: true
      });
    }
    return true;
  } catch (error) {
    console.error(`❌ Erro ao criar diretório ${dirPath}:`, error);
    return false;
  }
}

function ensureJsonFileExists(filePath, defaultContent = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      const dirPath = pathz.dirname(filePath);
      ensureDirectoryExists(dirPath);
      fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
    }
    return true;
  } catch (error) {
    console.error(`❌ Erro ao criar arquivo JSON ${filePath}:`, error);
    return false;
  }
}

const jsonFileCache = new Map();
const JSON_CACHE_TTL = 30000;

const loadJsonFile = (path, defaultValue = {}, useCache = false) => {
  try {

    if (useCache && jsonFileCache.has(path)) {
      const cached = jsonFileCache.get(path);
      if (Date.now() - cached.timestamp < JSON_CACHE_TTL) {
        return cached.data;
      }
      jsonFileCache.delete(path);
    }

    if (!fs.existsSync(path)) return defaultValue;

    const data = JSON.parse(fs.readFileSync(path, 'utf-8'));

    if (useCache) {
      jsonFileCache.set(path, { data, timestamp: Date.now() });
    }

    return data;
  } catch (error) {
    console.error(`Erro ao carregar arquivo ${path}:`, error);
    return defaultValue;
  }
};

function clearJsonFileCache(path = null) {
  if (path) {
    jsonFileCache.delete(path);
  } else {
    jsonFileCache.clear();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [path, cached] of jsonFileCache.entries()) {
    if (now - cached.timestamp > JSON_CACHE_TTL) {
      jsonFileCache.delete(path);
    }
  }
}, 60000);

const BACKUP_DIR = pathz.join(pathz.dirname(pathz.dirname(pathz.dirname(import.meta.url.replace('file://', '')))), 'database', 'backups');

function createBackup(filePath) {
  try {
    if (!fs.existsSync(filePath)) return true;

    const backupDir = BACKUP_DIR;
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const fileName = pathz.basename(filePath);
    const timestamp = Date.now();
    const backupPath = pathz.join(backupDir, `${fileName}.${timestamp}.bak`);

    fs.copyFileSync(filePath, backupPath);

    const allBackups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(fileName + '.') && f.endsWith('.bak'))
      .sort()
      .reverse();

    if (allBackups.length > 5) {
      allBackups.slice(5).forEach(oldBackup => {
        try { fs.unlinkSync(pathz.join(backupDir, oldBackup)); } catch (e) {}
      });
    }

    return true;
  } catch (error) {
    console.error(`⚠️ Erro ao criar backup de ${filePath}:`, error.message);
    return false;
  }
}

function recoverFromBackup(filePath) {
  try {
    const backupDir = BACKUP_DIR;
    if (!fs.existsSync(backupDir)) return null;

    const fileName = pathz.basename(filePath);
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(fileName + '.') && f.endsWith('.bak'))
      .sort()
      .reverse();

    for (const backup of backups) {
      try {
        const backupPath = pathz.join(backupDir, backup);
        const content = fs.readFileSync(backupPath, 'utf-8');
        const data = JSON.parse(content);
        console.log(`✅ Recuperado de backup: ${backup}`);
        return data;
      } catch (e) {
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

function sanitizeJsonString(str) {
  if (typeof str !== 'string') return str;

  str = str.replace(/^\uFEFF/, '');

  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  str = str.replace(/\\'/g, "'");

  str = str.replace(/,\s*([\]}])/g, '$1');

  return str.trim();
}

function validateAndRepairData(data, expectedStructure) {
  if (data === null || data === undefined) {
    return expectedStructure;
  }

  if (typeof expectedStructure !== 'object' || expectedStructure === null) {
    return data;
  }

  if (typeof data !== 'object') {
    return expectedStructure;
  }

  const result = Array.isArray(expectedStructure) ? [] : {};

  if (Array.isArray(expectedStructure)) {
    if (Array.isArray(data)) {
      return data;
    }
    return expectedStructure;
  }

  for (const key in expectedStructure) {
    if (data.hasOwnProperty(key)) {
      if (typeof expectedStructure[key] === 'object' && expectedStructure[key] !== null && !Array.isArray(expectedStructure[key])) {
        result[key] = validateAndRepairData(data[key], expectedStructure[key]);
      } else {
        result[key] = data[key];
      }
    } else {
      result[key] = expectedStructure[key];
    }
  }

  for (const key in data) {
    if (!result.hasOwnProperty(key)) {
      result[key] = data[key];
    }
  }

  return result;
}

function loadJsonFileSafe(filePath, defaultValue = {}, expectedStructure = null) {
  let data = null;
  let recovered = false;

  try {

    if (!fs.existsSync(filePath)) {
      ensureJsonFileExists(filePath, defaultValue);
      return defaultValue;
    }

    let content = fs.readFileSync(filePath, 'utf-8');

    if (!content || content.trim() === '') {
      console.warn(`⚠️ Arquivo vazio: ${filePath}, usando valor padrão`);
      data = defaultValue;
      recovered = true;
    } else {

      try {
        data = JSON.parse(content);
      } catch (parseError) {
        console.warn(`⚠️ JSON inválido em ${filePath}, tentando sanitizar...`);

        try {
          content = sanitizeJsonString(content);
          data = JSON.parse(content);
          console.log(`✅ JSON recuperado após sanitização: ${filePath}`);
          recovered = true;
        } catch (sanitizeError) {
          console.error(`❌ Falha ao sanitizar ${filePath}, tentando backup...`);

          data = recoverFromBackup(filePath);

          if (data) {
            recovered = true;
          } else {
            console.error(`❌ Sem backup disponível para ${filePath}, usando valor padrão`);
            data = defaultValue;
            recovered = true;
          }
        }
      }
    }

    if (expectedStructure && data) {
      const repairedData = validateAndRepairData(data, expectedStructure);
      if (JSON.stringify(repairedData) !== JSON.stringify(data)) {
        data = repairedData;
        recovered = true;
      }
    }

    if (recovered && data) {
      try {
        createBackup(filePath);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ Arquivo reparado e salvo: ${filePath}`);
      } catch (saveError) {
        console.error(`⚠️ Erro ao salvar arquivo reparado: ${filePath}`);
      }
    }

    return data || defaultValue;

  } catch (error) {
    console.error(`❌ Erro crítico ao carregar ${filePath}:`, error.message);
    return defaultValue;
  }
}

async function saveJsonFileSafe(filePath, data, createBackupFile = true) {
  try {

    if (data === undefined) {
      console.error(`❌ Tentativa de salvar undefined em ${filePath}`);
      return false;
    }

    let jsonString;
    try {
      jsonString = JSON.stringify(data, null, 2);
    } catch (stringifyError) {
      console.error(`❌ Dados não serializáveis para ${filePath}:`, stringifyError.message);
      return false;
    }

    try {
      JSON.parse(jsonString);
    } catch (validateError) {
      console.error(`❌ JSON gerado é inválido para ${filePath}`);
      return false;
    }

    if (createBackupFile && fs.existsSync(filePath)) {
      createBackup(filePath);
    }

    const dirPath = pathz.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      await fsPromises.mkdir(dirPath, { recursive: true });
    }

    const tempPath = filePath + '.tmp';
    await fsPromises.writeFile(tempPath, jsonString, 'utf-8');

    const writtenContent = await fsPromises.readFile(tempPath, 'utf-8');
    try {
      JSON.parse(writtenContent);
    } catch (verifyError) {
      console.error(`❌ Verificação falhou para ${filePath}, abortando`);
      await fsPromises.unlink(tempPath);
      return false;
    }

    await fsPromises.rename(tempPath, filePath);

    return true;

  } catch (error) {
    console.error(`❌ Erro ao salvar ${filePath}:`, error.message);

    try {
      const tempPath = filePath + '.tmp';
      if (fs.existsSync(tempPath)) {
        await fsPromises.unlink(tempPath);
      }
    } catch (e) {}

    return false;
  }
}

function validateLevelingUser(user) {
  const defaultUser = {
    level: 1,
    xp: 0,
    messages: 0,
    commands: 0,
    patent: 'Iniciante',
    lastMessage: 0
  };

  if (!user || typeof user !== 'object') {
    return defaultUser;
  }

  return {
    level: typeof user.level === 'number' && user.level >= 1 ? Math.floor(user.level) : 1,
    xp: typeof user.xp === 'number' && user.xp >= 0 ? Math.floor(user.xp) : 0,
    messages: typeof user.messages === 'number' && user.messages >= 0 ? Math.floor(user.messages) : 0,
    commands: typeof user.commands === 'number' && user.commands >= 0 ? Math.floor(user.commands) : 0,
    patent: typeof user.patent === 'string' ? user.patent : 'Iniciante',
    lastMessage: typeof user.lastMessage === 'number' ? user.lastMessage : 0,
    ...user
  };
}

function validateEconomyUser(user) {
  const defaultUser = {
    wallet: 0,
    bank: 0,
    level: 1,
    exp: 0,
    power: 100,
    inventory: {},
    tools: {},
    materials: {},
    pets: [],
    achievements: {},
    stats: {}
  };

  if (!user || typeof user !== 'object') {
    return defaultUser;
  }

  return {
    wallet: typeof user.wallet === 'number' ? Math.max(0, Math.floor(user.wallet)) : 0,
    bank: typeof user.bank === 'number' ? Math.max(0, Math.floor(user.bank)) : 0,
    level: typeof user.level === 'number' && user.level >= 1 ? Math.floor(user.level) : 1,
    exp: typeof user.exp === 'number' && user.exp >= 0 ? Math.floor(user.exp) : 0,
    power: typeof user.power === 'number' && user.power >= 0 ? Math.floor(user.power) : 100,
    inventory: typeof user.inventory === 'object' && user.inventory !== null ? user.inventory : {},
    tools: typeof user.tools === 'object' && user.tools !== null ? user.tools : {},
    materials: typeof user.materials === 'object' && user.materials !== null ? user.materials : {},
    pets: Array.isArray(user.pets) ? user.pets : [],
    achievements: typeof user.achievements === 'object' && user.achievements !== null ? user.achievements : {},
    stats: typeof user.stats === 'object' && user.stats !== null ? user.stats : {},
    ...user
  };
}

function validateGroupData(data) {
  const defaultData = {
    welcome: false,
    welcomeMsg: '',
    goodbye: false,
    goodbyeMsg: '',
    antilink: false,
    antifake: false,
    modorpg: false,
    leveling: false
  };

  if (!data || typeof data !== 'object') {
    return defaultData;
  }

  return {
    ...defaultData,
    ...data,
    welcome: typeof data.welcome === 'boolean' ? data.welcome : false,
    goodbye: typeof data.goodbye === 'boolean' ? data.goodbye : false,
    antilink: typeof data.antilink === 'boolean' ? data.antilink : false,
    antifake: typeof data.antifake === 'boolean' ? data.antifake : false,
    modorpg: typeof data.modorpg === 'boolean' ? data.modorpg : false,
    leveling: typeof data.leveling === 'boolean' ? data.leveling : false
  };
}

export {
  formatUptime,
  normalizar,
  isGroupId,
  isUserId,
  isValidLid,
  isValidJid,
  getUserName,
  getLidFromJid,
  buildUserId,
  getBotId,
  ensureDirectoryExists,
  ensureJsonFileExists,
  loadJsonFile,
  clearJsonFileCache,
  initJidLidCache,
  saveJidLidCache,
  flushJidLidCache,
  getLidFromJidCached,
  normalizeUserId,
  convertIdsToLid,
  idsMatch,
  idInArray,

  createBackup,
  recoverFromBackup,
  sanitizeJsonString,
  validateAndRepairData,
  loadJsonFileSafe,
  saveJsonFileSafe,
  validateLevelingUser,
  validateEconomyUser,
  validateGroupData,

  normalizeParam,
  compareParams,
  findKeyIgnoringAccents,
  findInArrayIgnoringAccents,
  resolveParamAlias,
  matchParam,
  PARAM_ALIASES
};

function parseCustomCommandMeta(tokens) {
  const settings = {
    ownerOnly: false,
    adminOnly: false,
    context: 'both',
    params: [],
    placeholders: {}
  };

  const rest = [];

  const metaRegex = /^\[(.*)\]$/;
  const angleRegex = /^<(.*)>$/;

  let idx = 0;
  while (idx < tokens.length) {
    const t = tokens[idx];

    const angleMatch = ('' + t).match(angleRegex);
    let partsToProcess = [];
    if (angleMatch) {

      const inner = angleMatch[1].trim();

      const innerParts = inner.split(/\s*[/|,]+\s*|\s+/).filter(Boolean);
      partsToProcess = innerParts;
    } else {
      const m = t.match(metaRegex);
      if (!m) break;
      const content = m[1].trim();
      partsToProcess = [content];
    }
    for (const raw of partsToProcess) {

      const contentPart = ('' + raw).trim().replace(/^\[|\]$/g, '').trim();
      if (!contentPart) continue;
      const parts = contentPart.split(':');
      const directive = parts[0].toLowerCase();
      switch (directive) {
      case 'admin':
        settings.adminOnly = true;
        break;
      case 'owner':
        settings.ownerOnly = true;
        break;
      case 'group':
        settings.context = 'group';
        break;
      case 'private':
        settings.context = 'private';
        break;
      case 'both':
        settings.context = 'both';
        break;
      case 'param': {

        const parts2 = parts.slice(1).filter(Boolean);
        let type = 'string';
        let name = '';
        let required = false;
        let restFlag = false;
        let min = undefined;
        let max = undefined;
        let def = undefined;
        let regex = undefined;
        let enumVals = undefined;

        for (let tok of parts2) {
          tok = tok.trim();
          if (!tok) continue;
          const tl = tok.toLowerCase();
          if (tl === 'required') {
            required = true;
            continue;
          }
          if (tl === 'optional') {
            required = false;
            continue;
          }
          if (tl === 'rest' || tl === '...') {
            restFlag = true;
            continue;
          }

          if (tok.includes('=')) {
            const [k, ...restParts2] = tok.split('=');
            const v = restParts2.join('=');
            const key = k.trim().toLowerCase();
            if (key === 'min') min = Number(v);
            else if (key === 'max') max = Number(v);
            else if (key === 'default' || key === 'def') def = v;
            else if (key === 'regex' || key === 'pattern') regex = v;
            else if (key === 'enum') {
              enumVals = v.split('|').map(x => x.trim()).filter(Boolean);
            }
            continue;
          }

          const recognizedTypes = ['number', 'int', 'float', 'string', 'boolean', 'regex', 'enum'];
          if (recognizedTypes.includes(tl)) {
            type = tl;
            continue;
          }

          if (!name) name = tok;
        }
        if (!name && parts2.length > 0) name = parts2[0];
        if (name) {
          const pName = normalizeParamName(name);
          const paramObj = { name: pName, required: !!required, type, rest: !!restFlag };
          if (min !== undefined) paramObj.min = min;
          if (max !== undefined) paramObj.max = max;
          if (def !== undefined) paramObj.default = def;
          if (regex !== undefined) paramObj.pattern = regex;
          if (enumVals !== undefined) paramObj.enum = enumVals;
          settings.params.push(paramObj);
        }
        break;
      }
      case 'placeholder': {

        const restParts = content.split(':').slice(1).join(':');
        const eqIndex = restParts.indexOf('=');
        if (eqIndex > -1) {
          const key = restParts.slice(0, eqIndex).trim();
          const val = restParts.slice(eqIndex + 1).trim();
          if (key) settings.placeholders[key] = val;
        }
        break;
      }
      default: {

        const fallbackParts = parts;

        const last = fallbackParts[fallbackParts.length - 1].toLowerCase();
        const required = last === 'required' || last === 'optional' ? last === 'required' : false;

        let type = 'string';
        let name = null;

        const coreParts = required ? fallbackParts.slice(0, -1) : fallbackParts.slice();

        const recognizedTypes = ['number', 'int', 'float', 'string'];
        let idxType = coreParts.findIndex(p => recognizedTypes.includes(p.toLowerCase()));
        if (idxType !== -1) {
          type = coreParts[idxType].toLowerCase();

          coreParts.splice(idxType, 1);
        }

        for (const p2 of coreParts) {
          if (p2 && !recognizedTypes.includes(p2.toLowerCase())) {
            name = p2;
            break;
          }
        }
        if (!name && coreParts.length > 0) name = coreParts[0];
        if (name) {
          settings.params.push({ name: normalizar(name), required: !!required, type });
        }
        break;
      }
    }
    }
    idx++;
  }

  for (let j = idx; j < tokens.length; j++) {
    rest.push(tokens[j]);
  }

  return { settings, rest };
}

function buildUsageFromParams(trigger, params = []) {

  const parts = params.map(p => {
    const type = (p.type || 'string');
    const rest = p.rest ? '...' : '';
    const def = typeof p.default !== 'undefined' ? `=${p.default}` : '';
    const minMax = (typeof p.min !== 'undefined' || typeof p.max !== 'undefined') ? `:${p.min || ''}-${p.max || ''}` : '';
    const enumList = Array.isArray(p.enum) && p.enum.length ? `:${p.enum.join('|')}` : '';
    const core = `${p.name}:${type}${rest}${def}${minMax}${enumList}`;
    return p.required ? `<${core}>` : `[${core}]`;
  });
  return `${trigger}${parts.length ? ' ' + parts.join(' ') : ''}`;
}

export { parseCustomCommandMeta, buildUsageFromParams };

function parseArgsFromString(input) {
  const s = (input || '').trim();
  if (!s) return [];
  let inner = s;
  if (inner.startsWith('<') && inner.endsWith('>')) {
    inner = inner.slice(1, -1).trim();
  }
  if (inner.includes('|')) {
    return inner.split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean);
  }
  if (inner.includes('/')) {
    return inner.split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean);
  }
  return inner.split(/\s+/).filter(Boolean);
}

export { parseArgsFromString };

function escapeRegExp(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { escapeRegExp };

function normalizeParamName(name) {
  if (!name || typeof name !== 'string') return '';
  const n = normalizar(name || '');

  return n.replace(/[^a-z0-9_]/g, '_');
}

function validateParamValue(value, def = {}) {
  if (typeof def !== 'object') return { ok: true };
  const t = def.type || 'string';
  if ((typeof value === 'undefined' || value === null || value === '') && typeof def.default !== 'undefined') {
    value = def.default;
  }
  if ((typeof value === 'undefined' || value === null || value === '') && def.required) {
    return { ok: false, message: `Parâmetro ${def.name} é obrigatório.` };
  }
  if (typeof value === 'undefined' || value === null || value === '') return { ok: true };
  switch (t) {
    case 'int': {
      const n = Number(value);
      if (isNaN(n) || !Number.isInteger(n)) return { ok: false, message: `Parâmetro ${def.name} deve ser um inteiro.` };
      if (def.min !== undefined && n < def.min) return { ok: false, message: `Parâmetro ${def.name} deve ser >= ${def.min}.` };
      if (def.max !== undefined && n > def.max) return { ok: false, message: `Parâmetro ${def.name} deve ser <= ${def.max}.` };
      return { ok: true };
    }
    case 'float':
    case 'number': {
      const n = Number(value);
      if (isNaN(n)) return { ok: false, message: `Parâmetro ${def.name} deve ser numérico.` };
      if (def.min !== undefined && n < def.min) return { ok: false, message: `Parâmetro ${def.name} deve ser >= ${def.min}.` };
      if (def.max !== undefined && n > def.max) return { ok: false, message: `Parâmetro ${def.name} deve ser <= ${def.max}.` };
      return { ok: true };
    }
    case 'boolean': {
      const lv = ('' + value).toLowerCase();
      if (!['true', 'false', '1', '0', 'yes', 'no', 'sim', 'nao', 'não'].includes(lv)) {
        return { ok: false, message: `Parâmetro ${def.name} deve ser booleano (true/false).` };
      }
      return { ok: true };
    }
    case 'regex': {
      try {
        const re = new RegExp(def.pattern);
        return re.test(value) ? { ok: true } : { ok: false, message: `Parâmetro ${def.name} não corresponde ao padrão.` };
      } catch (e) {
        return { ok: false, message: `Padrão regex inválido: ${def.pattern}` };
      }
    }
    case 'enum': {
      if (Array.isArray(def.enum) && def.enum.length && !def.enum.includes(value)) {
        return { ok: false, message: `Parâmetro ${def.name} deve ser um de: ${def.enum.join(', ')}` };
      }
      return { ok: true };
    }
    default:

      return { ok: true };
  }
}

export { normalizeParamName, validateParamValue };
