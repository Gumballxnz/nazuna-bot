import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRUPOS_DIR = path.join(__dirname, '../../../database/grupos');

const normalizeText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
};

const loadGroupData = (groupId) => {
    try {
        const groupFile = path.join(GRUPOS_DIR, `${groupId}.json`);
        if (fs.existsSync(groupFile)) {
            const data = JSON.parse(fs.readFileSync(groupFile, 'utf8'));
            return data;
        }
        return {};
    } catch (err) {
        console.error(`[ANTIPALAVRA] Erro ao carregar dados do grupo ${groupId}:`, err.message);
        return {};
    }
};

const saveGroupData = (groupId, data) => {
    try {
        const dir = path.dirname(path.join(GRUPOS_DIR, `${groupId}.json`));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const groupFile = path.join(GRUPOS_DIR, `${groupId}.json`);
        fs.writeFileSync(groupFile, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`[ANTIPALAVRA] Erro ao salvar dados do grupo ${groupId}:`, err.message);
        return false;
    }
};

const getAntipalavraConfig = (groupData) => {
    if (!groupData.antipalavra) {
        groupData.antipalavra = {
            enabled: false,
            blacklist: [],
            stats: {
                totalBans: 0,
                totalDetections: 0,
                lastUpdate: new Date().toISOString()
            }
        };
    }

    if (!groupData.antipalavra.blacklist) {
        groupData.antipalavra.blacklist = [];
    }
    if (!groupData.antipalavra.stats) {
        groupData.antipalavra.stats = {
            totalBans: 0,
            totalDetections: 0,
            lastUpdate: new Date().toISOString()
        };
    }

    return groupData.antipalavra;
};

const enableAntipalavra = (groupId) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    if (config.enabled) {
        return {
            success: false,
            message: '⚠️ O sistema antipalavra já está ativo neste grupo!'
        };
    }

    config.enabled = true;
    config.stats.lastUpdate = new Date().toISOString();

    if (saveGroupData(groupId, groupData)) {
        return {
            success: true,
            message: '✅ Sistema antipalavra ativado! Use comandos para adicionar palavras à blacklist.'
        };
    }

    return {
        success: false,
        message: '❌ Erro ao ativar o sistema antipalavra.'
    };
};

const disableAntipalavra = (groupId) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    if (!config.enabled) {
        return {
            success: false,
            message: '⚠️ O sistema antipalavra já está desativado neste grupo!'
        };
    }

    config.enabled = false;
    config.stats.lastUpdate = new Date().toISOString();

    if (saveGroupData(groupId, groupData)) {
        return {
            success: true,
            message: '✅ Sistema antipalavra desativado! A blacklist foi mantida.'
        };
    }

    return {
        success: false,
        message: '❌ Erro ao desativar o sistema antipalavra.'
    };
};

const addPalavraBlacklist = (groupId, palavra) => {
    if (!palavra || typeof palavra !== 'string') {
        return {
            success: false,
            message: '❌ Palavra inválida!'
        };
    }

    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);
    const palavraNormalizada = normalizeText(palavra);

    if (!palavraNormalizada) {
        return {
            success: false,
            message: '❌ A palavra não pode estar vazia!'
        };
    }

    const exists = config.blacklist.some(item =>
        normalizeText(item.palavra) === palavraNormalizada
    );

    if (exists) {
        return {
            success: false,
            message: '⚠️ Esta palavra já está na blacklist!'
        };
    }

    config.blacklist.push({
        palavra: palavra.trim(),
        palavraNormalizada: palavraNormalizada,
        addedAt: new Date().toISOString(),
        detections: 0
    });

    config.stats.lastUpdate = new Date().toISOString();

    if (saveGroupData(groupId, groupData)) {
        return {
            success: true,
            message: `✅ Palavra "${palavra}" adicionada à blacklist!\n📊 Total de palavras: ${config.blacklist.length}`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao adicionar palavra à blacklist.'
    };
};

const removePalavraBlacklist = (groupId, palavra) => {
    if (!palavra || typeof palavra !== 'string') {
        return {
            success: false,
            message: '❌ Palavra inválida!'
        };
    }

    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);
    const palavraNormalizada = normalizeText(palavra);

    const initialLength = config.blacklist.length;
    config.blacklist = config.blacklist.filter(item =>
        normalizeText(item.palavra) !== palavraNormalizada
    );

    if (config.blacklist.length === initialLength) {
        return {
            success: false,
            message: '⚠️ Esta palavra não está na blacklist!'
        };
    }

    config.stats.lastUpdate = new Date().toISOString();

    if (saveGroupData(groupId, groupData)) {
        return {
            success: true,
            message: `✅ Palavra "${palavra}" removida da blacklist!\n📊 Total de palavras: ${config.blacklist.length}`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao remover palavra da blacklist.'
    };
};

const listPalavrasBlacklist = (groupId) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    if (config.blacklist.length === 0) {
        return {
            success: true,
            message: '📋 A blacklist está vazia. Use o comando para adicionar palavras.',
            blacklist: []
        };
    }

    const sorted = [...config.blacklist].sort((a, b) => b.detections - a.detections);

    let message = `📋 *BLACKLIST DE PALAVRAS*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 Status: ${config.enabled ? '✅ Ativo' : '❌ Desativado'}\n`;
    message += `🔢 Total de palavras: ${config.blacklist.length}\n`;
    message += `🚫 Total de bans: ${config.stats.totalBans}\n`;
    message += `🔍 Total de detecções: ${config.stats.totalDetections}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    sorted.forEach((item, index) => {
        message += `${index + 1}. "${item.palavra}"\n`;
        message += `   ├ 🔍 Detecções: ${item.detections}\n`;
        message += `   └ 📅 Adicionada: ${new Date(item.addedAt).toLocaleDateString('pt-BR')}\n\n`;
    });

    return {
        success: true,
        message: message.trim(),
        blacklist: sorted
    };
};

const clearBlacklist = (groupId) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    if (config.blacklist.length === 0) {
        return {
            success: false,
            message: '⚠️ A blacklist já está vazia!'
        };
    }

    const count = config.blacklist.length;
    config.blacklist = [];
    config.stats.lastUpdate = new Date().toISOString();

    if (saveGroupData(groupId, groupData)) {
        return {
            success: true,
            message: `✅ Blacklist limpa! ${count} palavra(s) removida(s).`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao limpar blacklist.'
    };
};

const checkMessage = (groupId, messageText) => {
    if (!messageText || typeof messageText !== 'string') {
        return null;
    }

    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    if (!config.enabled || config.blacklist.length === 0) {
        return null;
    }

    const messageNormalized = normalizeText(messageText);

    for (const item of config.blacklist) {

        if (messageNormalized.includes(item.palavraNormalizada)) {

            item.detections++;
            config.stats.totalDetections++;
            config.stats.lastUpdate = new Date().toISOString();
            saveGroupData(groupId, groupData);

            return {
                detected: true,
                palavra: item.palavra,
                palavraOriginal: item.palavra
            };
        }
    }

    return null;
};

const registerBan = (groupId, userId, palavra) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    config.stats.totalBans++;
    config.stats.lastUpdate = new Date().toISOString();

    if (!config.banHistory) {
        config.banHistory = [];
    }

    config.banHistory.push({
        userId: userId,
        palavra: palavra,
        bannedAt: new Date().toISOString()
    });

    if (config.banHistory.length > 100) {
        config.banHistory = config.banHistory.slice(-100);
    }

    saveGroupData(groupId, groupData);
};

const getStats = (groupId) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);

    return {
        enabled: config.enabled,
        totalWords: config.blacklist.length,
        totalBans: config.stats.totalBans,
        totalDetections: config.stats.totalDetections,
        lastUpdate: config.stats.lastUpdate,
        topWords: config.blacklist
            .sort((a, b) => b.detections - a.detections)
            .slice(0, 5)
            .map(item => ({
                palavra: item.palavra,
                detections: item.detections
            }))
    };
};

const isActive = (groupId) => {
    const groupData = loadGroupData(groupId);
    const config = getAntipalavraConfig(groupData);
    return config.enabled === true;
};

export {
    enableAntipalavra,
    disableAntipalavra,
    addPalavraBlacklist,
    removePalavraBlacklist,
    listPalavrasBlacklist,
    clearBlacklist,
    checkMessage,
    registerBan,
    getStats,
    isActive
};
