import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import NodeCache from 'node-cache';
import readline from 'readline';
import pino from 'pino';
import fs from 'fs/promises';
import path, { dirname, join } from 'path';
import qrcode from 'qrcode-terminal';
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import PerformanceOptimizer from './utils/performanceOptimizer.js';
import RentalExpirationManager from './utils/rentalExpirationManager.js';
import { loadMsgBotOn, isRentalModeActive, getGroupRentalStatus, setGroupRental } from './utils/database.js';
import { buildUserId } from './utils/helpers.js';
import { initCaptchaIndex } from './utils/captchaIndex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MessageQueue {
    constructor(maxWorkers = 4, batchSize = 10, messagesPerBatch = 2) {
        this.queue = [];
        this.maxWorkers = maxWorkers;
        this.batchSize = batchSize;
        this.messagesPerBatch = messagesPerBatch;
        this.activeWorkers = 0;
        this.isProcessing = false;
        this.processingInterval = null;
        this.errorHandler = null;
        this.stats = {
            totalProcessed: 0,
            totalErrors: 0,
            currentQueueLength: 0,
            startTime: Date.now(),
            batchesProcessed: 0,
            avgBatchTime: 0
        };
        this.idCounter = 0; // Contador simples ao invés de crypto.randomUUID()
    }

    setErrorHandler(handler) {
        this.errorHandler = handler;
    }

    async add(message, processor) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                message,
                processor,
                resolve,
                reject,
                timestamp: Date.now(),
                id: `msg_${++this.idCounter}_${Date.now()}`
            });

            this.stats.currentQueueLength = this.queue.length;

            if (!this.isProcessing) {
                this.startProcessing();
            }
        });
    }

    startProcessing() {
        if (this.isProcessing) return;

        this.isProcessing = true;
        // Usa processo recursivo em vez de setInterval para melhor performance
        this.processQueue();
    }

    stopProcessing() {
        this.isProcessing = false;
    }

    resume() {
        if (!this.isProcessing) {
            console.log('[MessageQueue] Retomando processamento');
            this.startProcessing();
        }
    }

    async processQueue() {
        // Processa mensagens em lotes paralelos
        while (this.isProcessing && this.queue.length > 0) {
            // Calcula quantos lotes podemos processar
            const availableBatches = Math.min(
                this.batchSize,
                Math.ceil(this.queue.length / this.messagesPerBatch)
            );

            if (availableBatches === 0) break;

            // Cria array de lotes
            const batches = [];
            for (let i = 0; i < availableBatches && this.queue.length > 0; i++) {
                const batchItems = [];
                for (let j = 0; j < this.messagesPerBatch && this.queue.length > 0; j++) {
                    const item = this.queue.shift();
                    if (item) batchItems.push(item);
                }
                if (batchItems.length > 0) {
                    batches.push(batchItems);
                }
            }

            this.stats.currentQueueLength = this.queue.length;

            // Processa todos os lotes em paralelo
            const batchStartTime = Date.now();
            await Promise.allSettled(
                batches.map(batch => this.processBatch(batch))
            );

            const batchDuration = Date.now() - batchStartTime;
            this.stats.batchesProcessed++;
            this.stats.avgBatchTime =
                (this.stats.avgBatchTime * (this.stats.batchesProcessed - 1) + batchDuration) /
                this.stats.batchesProcessed;
        }

        if (this.queue.length === 0) {
            this.stopProcessing();
        }
    }

    async processBatch(batchItems) {
        // Processa todas as mensagens do lote em paralelo
        const batchPromises = batchItems.map(item => this.processItem(item));

        const results = await Promise.allSettled(batchPromises);

        // Contabiliza resultados
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                this.stats.totalProcessed++;
            } else {
                this.stats.totalErrors++;
            }
        });
    }

    async processItem(item) {
        const { message, processor, resolve, reject } = item;

        try {
            const result = await processor(message);
            resolve(result);
            return result;
        } catch (error) {
            await this.handleProcessingError(item, error);
            reject(error);
            throw error;
        }
    }

    async handleProcessingError(item, error) {
        this.stats.totalErrors++;

        console.error(`❌ Queue processing error for message ${item.id}:`, error.message);

        if (this.errorHandler) {
            try {
                await this.errorHandler(item, error);
            } catch (handlerError) {
                console.error('❌ Error handler failed:', handlerError.message);
            }
        }

        item.reject(error);
    }

    getStatus() {
        const uptime = Date.now() - this.stats.startTime;
        return {
            queueLength: this.queue.length,
            activeWorkers: this.activeWorkers,
            maxWorkers: this.maxWorkers,
            batchSize: this.batchSize,
            messagesPerBatch: this.messagesPerBatch,
            isProcessing: this.isProcessing,
            totalProcessed: this.stats.totalProcessed,
            totalErrors: this.stats.totalErrors,
            currentQueueLength: this.stats.currentQueueLength,
            batchesProcessed: this.stats.batchesProcessed,
            avgBatchTime: Math.round(this.stats.avgBatchTime),
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime),
            throughput: this.stats.totalProcessed > 0 ?
                (this.stats.totalProcessed / (uptime / 1000)).toFixed(2) : 0,
            errorRate: this.stats.totalProcessed > 0 ?
                ((this.stats.totalErrors / this.stats.totalProcessed) * 100).toFixed(2) : 0
        };
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    clear() {
        // Rejeita todas as mensagens pendentes antes de limpar
        this.queue.forEach(item => {
            if (item.reject) {
                item.reject(new Error('Queue cleared'));
            }
        });
        this.queue = [];
        this.stats.currentQueueLength = 0;
        this.stopProcessing();
    }

    async shutdown() {
        console.log('🛑 Finalizando MessageQueue...');
        this.stopProcessing();

        // Aguarda workers ativos terminarem (timeout de 10s)
        const shutdownTimeout = 10000;
        const startTime = Date.now();

        while (this.activeWorkers > 0 && (Date.now() - startTime) < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.activeWorkers > 0) {
            console.warn(`⚠️ ${this.activeWorkers} workers ainda ativos após timeout de shutdown`);
        }

        this.clear();
        console.log('✅ MessageQueue finalizado');
    }
}

const messageQueue = new MessageQueue(1, 1, 1); // 1 worker, 1 lote, 1 msg (Sequencial estrito como o Senna)

const configPath = path.join(__dirname, "config.json");
let config;
let DEBUG_MODE = false; // Modo debug para logs detalhados

// Validação de configuração
try {
    const configContent = readFileSync(configPath, "utf8");
    config = JSON.parse(configContent);

    // Valida campos obrigatórios
    if (!config.prefixo || !config.nomebot || !config.numerodono) {
        throw new Error('Configuração inválida: campos obrigatórios ausentes (prefixo, nomebot, numerodono)');
    }

    // Ativa modo debug se configurado
    DEBUG_MODE = config.debug === true || process.env.NAZUNA_DEBUG === '1';
    if (DEBUG_MODE) {
        console.log('🐛 Modo DEBUG ativado - Logs detalhados habilitados');
    }
} catch (err) {
    console.error(`❌ Erro ao carregar configuração: ${err.message}`);
    process.exit(1);
}

const indexModule = (await import('./index.js')).default ?? (await import('./index.js'));

const performanceOptimizer = new PerformanceOptimizer();

const {
    prefixo,
    nomebot,
    nomedono,
    numerodono
} = config;

const rentalExpirationManager = new RentalExpirationManager(null, {
    ownerNumber: numerodono,
    ownerName: nomedono,
    checkInterval: '0 */6 * * *',
    warningDays: 3,
    finalWarningDays: 1,
    cleanupDelayHours: 24,
    enableNotifications: true,
    enableAutoCleanup: true,
    logFile: path.join(__dirname, '../logs/rental_expiration.log')
});

const logger = pino({
    level: 'silent'
});

const AUTH_DIR = path.join(__dirname, '..', 'database', 'qr-code');
const DATABASE_DIR = path.join(__dirname, '..', 'database');
const GLOBAL_BLACKLIST_PATH = path.join(__dirname, '..', 'database', 'dono', 'globalBlacklist.json');

let msgRetryCounterCache;
let messagesCache;

async function initializeOptimizedCaches() {
    try {
        await performanceOptimizer.initialize();

        // Inicializa índice de captcha para busca rápida
        await initCaptchaIndex();

        msgRetryCounterCache = {
            get: (key) => performanceOptimizer.cacheGet('msgRetry', key),
            set: (key, value, ttl) => performanceOptimizer.cacheSet('msgRetry', key, value, ttl),
            del: (key) => performanceOptimizer.modules.cacheManager?.del('msgRetry', key)
        };

        messagesCache = new Map();

    } catch (error) {
        console.error('❌ Erro ao inicializar sistema de otimização:', error.message);

        msgRetryCounterCache = new NodeCache({
            stdTTL: 5 * 60,
            useClones: false
        });
        messagesCache = new Map();

    }
}
let codeMode = process.argv.includes('--code') || process.env.NAZUNA_CODE_MODE === '1';
// Suporte a --phone=NUMERO para evitar readline interativo (ex: node connect.js --code --phone=258858148698)
const phoneArg = (process.argv.find(a => a.startsWith('--phone=')) || '').replace('--phone=', '').replace(/\D/g, '');

// Cleanup otimizado do cache de mensagens
let cacheCleanupInterval = null;
const setupMessagesCacheCleanup = () => {
    if (cacheCleanupInterval) clearInterval(cacheCleanupInterval);

    cacheCleanupInterval = setInterval(() => {
        if (!messagesCache) return;

        // Limite duro: se passar de 300, limpa imediatamente
        if (messagesCache.size > 300) {
            const keysToDelete = messagesCache.size - 200; // Mantém apenas 200
            const keys = Array.from(messagesCache.keys()).slice(0, keysToDelete);
            keys.forEach(key => messagesCache.delete(key));
            console.log(`🧹 Cache limpo: ${keysToDelete} mensagens removidas (total: ${messagesCache.size})`);
        }
    }, 120000); // A cada 2 minutos (era 5)
};

// Inicia cleanup quando o bot conectar
const startCacheCleanup = () => {
    setupMessagesCacheCleanup();
};

const ask = (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
    }));
};

async function clearAuthDir() {
    try {
        await fs.rm(AUTH_DIR, {
            recursive: true,
            force: true
        });
        console.log(`🗑️ Pasta de autenticação (${AUTH_DIR}) excluída com sucesso.`);
    } catch (err) {
        console.error(`❌ Erro ao excluir pasta de autenticação: ${err.message}`);
    }
}

async function loadGroupSettings(groupId) {
    const groupFilePath = path.join(DATABASE_DIR, 'grupos', `${groupId}.json`);
    try {
        const data = await fs.readFile(groupFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`❌ Erro ao ler configurações do grupo ${groupId}: ${e.message}`);
        }
        return {};
    }
}

async function loadGlobalBlacklist() {
    try {
        const data = await fs.readFile(GLOBAL_BLACKLIST_PATH, 'utf-8');
        return JSON.parse(data).users || {};
    } catch (e) {
        console.error(`❌ Erro ao ler blacklist global: ${e.message}`);
        return {};
    }
}

function formatMessageText(template, replacements) {
    let text = template;
    for (const [key, value] of Object.entries(replacements)) {
        text = text.replaceAll(key, value);
    }
    return text;
}

async function createGroupMessage(NazunaSock, groupMetadata, participants, settings, isWelcome = true) {
    const jsonGp = await loadGroupSettings(groupMetadata.id);
    const mentions = participants.map(p => p);
    const bannerName = participants.length === 1 ? participants[0].split('@')[0] : `${participants.length} Membros`;
    const replacements = {
        '#numerodele#': participants.map(p => `@${p.split('@')[0]}`).join(', '),
        '#nomedogp#': groupMetadata.subject,
        '#desc#': groupMetadata.desc || 'Nenhuma',
        '#membros#': groupMetadata.participants.length,
    };
    const defaultText = isWelcome ?
        (jsonGp.textbv ? jsonGp.textbv : "╭━━━⊱ 🌟 *BEM-VINDO(A/S)!* 🌟 ⊱━━━╮\n│\n│ 👤 #numerodele#\n│\n│ 🏠 Grupo: *#nomedogp#*\n│ 👥 Membros: *#membros#*\n│\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n✨ *Seja bem-vindo(a/s) ao grupo!* ✨") :
        (jsonGp.exit.text ? jsonGp.exit.text : "╭━━━⊱ 👋 *ATÉ LOGO!* 👋 ⊱━━━╮\n│\n│ 👤 #numerodele#\n│\n│ 🚪 Saiu do grupo\n│ *#nomedogp#*\n│\n╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n💫 *Até a próxima!* 💫");
    const text = formatMessageText(settings.text || defaultText, replacements);
    const message = {
        text,
        mentions
    };
    if (settings.image) {
        let profilePicUrl = 'https://raw.githubusercontent.com/nazuninha/uploads/main/outros/1747053564257_bzswae.bin';
        if (participants.length === 1) {
            profilePicUrl = await NazunaSock.profilePictureUrl(participants[0], 'image').catch(() => profilePicUrl);
        }

        const image = settings.image === 'banner' ? {
            url: profilePicUrl
        } : {
            url: settings.image
        };

        if (image) {
            message.image = image;
            message.caption = text;
            delete message.text;
        }
    }
    return message;
}

async function handleGroupParticipantsUpdate(NazunaSock, inf) {
    try {
        const from = inf.id || inf.jid || (inf.participants && inf.participants.length > 0 ? inf.participants[0].split('@')[0] + '@s.whatsapp.net' : null);

        if (DEBUG_MODE) {
            console.log('🐛 [handleGroupParticipantsUpdate] Processando evento...');
            console.log('🐛 Group ID extraído:', from);
        }

        if (!from) {
            console.error('❌ Erro: ID do grupo não encontrado nos dados do evento.');
            if (DEBUG_MODE) {
                console.log('🐛 Dados do evento:', JSON.stringify(inf, null, 2));
            }
            return;
        }

        // Valida se são participantes válidos
        if (!inf.participants || !Array.isArray(inf.participants) || inf.participants.length === 0) {
            console.warn('⚠️ Evento de participantes sem lista válida');
            return;
        }

        // Ignora eventos do próprio bot
        const botId = NazunaSock.user.id.split(':')[0];

        inf.participants = inf.participants.map(isValidParticipant).filter(Boolean);

        if (inf.participants.some(p => p && typeof p === 'string' && p.startsWith(botId))) {
            // Se o bot foi adicionado, verifica se o modo de aluguel está ativo e se o grupo é autorizado
            if (isRentalModeActive()) {
                const configPath = path.join(__dirname, '..', 'config.json');
                const config = JSON.parse(readFileSync(configPath, 'utf8'));
                const rentalStatus = getGroupRentalStatus(from);
                if (!rentalStatus.active) {
                    const ownerNumber = config.numerodono || "5511999999999";
                    const ownerJid = `${ownerNumber}@s.whatsapp.net`;
                    const isOwnerAdder = inf.author === ownerJid || (config.lidowner && inf.author === config.lidowner);

                    if (isOwnerAdder) {
                        // Se o dono adicionou, autoriza permanentemente o grupo automaticamente
                        setGroupRental(from, 'permanent');
                        await NazunaSock.sendMessage(from, { 
                            text: "👑 *DONO DETECTADO*\n\nIdentifiquei que o meu dono me adicionou a este grupo. O aluguel foi ativado automaticamente como *PERMANENTE*. Divirtam-se! ✨"
                        }).catch(() => {});
                        return;
                    }

                    await NazunaSock.sendMessage(from, { 
                        text: `⏳ *ESTE GRUPO NÃO ESTÁ AUTORIZADO*\n\nO modo de aluguel global está ATIVADO. Tens *24 horas* para enviar um código de ativação válido ou solicitar a autorização ao meu dono, caso contrário sairei automaticamente para poupar recursos.\n\n📱 *Contato do Dono:* wa.me/${ownerNumber}\n\nContate para ativar.`
                    }).catch(() => {});
                    
                    setTimeout(async () => {
                        try {
                            const finalStatus = getGroupRentalStatus(from);
                            if (!finalStatus.active) {
                                await NazunaSock.groupLeave(from);
                                console.log(`[AUTO-LEAVE] Tempo esgotado (24h). Saí do grupo não autorizado: ${from}`);
                            }
                        } catch (err) {
                            console.error(`[AUTO-LEAVE] Erro ao sair do grupo ${from}:`, err.message);
                        }
                    }, 86400000); // 24 horas
                }
            }
            return;
        }

        let groupMetadata = await NazunaSock.groupMetadata(from).catch(err => {
            console.error(`❌ Erro ao buscar metadados do grupo ${from}: ${err.message}`);
            return null;
        });

        if (!groupMetadata) {
            console.error(`❌ Metadados do grupo ${from} não encontrados.`);
            return;
        }

        const groupSettings = await loadGroupSettings(from);
        const globalBlacklist = await loadGlobalBlacklist();
        switch (inf.action) {
            case 'add': {
                const membersToWelcome = [];
                const membersToRemove = [];
                const removalReasons = [];
                for (const participant of inf.participants) {
                    if (globalBlacklist[participant]) {
                        membersToRemove.push(participant);
                        removalReasons.push(`@${participant.split('@')[0]} (blacklist global: ${globalBlacklist[participant].reason})`);
                        continue;
                    }
                    if (groupSettings.blacklist?.[participant]) {
                        membersToRemove.push(participant);
                        removalReasons.push(`@${participant.split('@')[0]} (lista negra do grupo: ${groupSettings.blacklist[participant].reason})`);
                        continue;
                    }
                    if (groupSettings.bemvindo) {
                        membersToWelcome.push(participant);
                    }
                }
                if (membersToRemove.length > 0) {
                    await NazunaSock.groupParticipantsUpdate(from, membersToRemove, 'remove').catch(err => {
                        console.error(`❌ Erro ao remover membros do grupo ${from}: ${err.message}`);
                    });

                    await NazunaSock.sendMessage(from, {
                        text: `🚫 Foram removidos ${membersToRemove.length} membros por regras de moderação:\n- ${removalReasons.join('\n- ')}`,
                        mentions: membersToRemove,
                    }).catch(err => {
                        console.error(`❌ Erro ao enviar notificação de remoção: ${err.message}`);
                    });
                }

                if (membersToWelcome.length > 0) {
                    const message = await createGroupMessage(NazunaSock, groupMetadata, membersToWelcome, groupSettings.welcome || {
                        text: groupSettings.textbv
                    });

                    await NazunaSock.sendMessage(from, message).catch(err => {
                        console.error(`❌ Erro ao enviar mensagem de boas-vindas: ${err.message}`);
                    });
                }
                break;
            }
            case 'remove': {
                if (groupSettings.exit?.enabled) {
                    const message = await createGroupMessage(NazunaSock, groupMetadata, inf.participants, groupSettings.exit, false);
                    await NazunaSock.sendMessage(from, message).catch(err => {
                        console.error(`❌ Erro ao enviar mensagem de saída: ${err.message}`);
                    });
                }
                break;
            }
            case 'promote':
            case 'demote': {
                // Ação sem notificação
                break;
            }
        }
    } catch (error) {
        console.error(`❌ Erro em handleGroupParticipantsUpdate: ${error.message}\n${error.stack}`);
    }
}

// Handler para solicitações de entrada em grupos
// Evento 'group.join-request' emitido pelo Baileys
async function handleGroupJoinRequest(NazunaSock, inf) {
    try {
        const from = inf.id;

        if (DEBUG_MODE) {
            console.log('🐛 [handleGroupJoinRequest] Processando solicitação...');
            console.log('🐛 Group ID:', from);
            console.log('🐛 Action:', inf.action);
            console.log('🐛 Participant (LID):', inf.participant);
            console.log('🐛 Participant Phone:', inf.participantPn);
            console.log('🐛 Author:', inf.author);
            console.log('🐛 Method:', inf.method);
        }

        if (!from) {
            if (DEBUG_MODE) console.log('🐛 Group ID não encontrado, abortando');
            return;
        }

        const groupSettings = await loadGroupSettings(from);

        if (DEBUG_MODE) {
            console.log('🐛 Group settings:');
            console.log('  - autoAcceptRequests:', groupSettings.autoAcceptRequests);
            console.log('  - captchaEnabled:', groupSettings.captchaEnabled);
            console.log('  - x9:', groupSettings.x9);
        }

        // O participante pode vir como LID ou phone number
        const participantJid = inf.participantPn || inf.participant;
        const participantDisplay = participantJid ? participantJid.split('@')[0] : 'Desconhecido';

        // Auto-aceitar se configurado e for uma nova solicitação
        if (groupSettings.autoAcceptRequests && inf.action === 'created' && participantJid) {
            try {
                // Se captcha estiver ativado
                if (groupSettings.captchaEnabled) {
                    const num1 = Math.floor(Math.random() * 10) + 1;
                    const num2 = Math.floor(Math.random() * 10) + 1;
                    const answer = num1 + num2;

                    // Salvar captcha pendente
                    if (!groupSettings.pendingCaptchas) groupSettings.pendingCaptchas = {};
                    groupSettings.pendingCaptchas[participantJid] = {
                        answer,
                        groupId: from,
                        timestamp: Date.now()
                    };
                    await saveGroupSettings(from, groupSettings);

                    // Enviar captcha no PV
                    await NazunaSock.sendMessage(participantJid, {
                        text: `🔐 *Verificação de Segurança*\n\nVocê solicitou entrar no grupo. Para ser aprovado, resolva esta conta:\n\n❓ Quanto é *${num1} + ${num2}*?\n\n⏱️ Você tem 5 minutos para responder.\n\n💡 Responda apenas com o número.`
                    }).catch(err => console.error(`❌ Erro ao enviar captcha: ${err.message}`));

                    // Auto-rejeitar após 5 minutos se não responder
                    setTimeout(async () => {
                        const currentSettings = await loadGroupSettings(from);
                        if (currentSettings.pendingCaptchas?.[participantJid]) {
                            delete currentSettings.pendingCaptchas[participantJid];
                            await saveGroupSettings(from, currentSettings);
                            await NazunaSock.groupRequestParticipantsUpdate(from, [participantJid], 'reject').catch(() => { });
                        }
                    }, 5 * 60 * 1000);
                } else {
                    // Auto-aceitar direto sem captcha
                    await NazunaSock.groupRequestParticipantsUpdate(from, [participantJid], 'approve');
                }
            } catch (err) {
                console.error(`Erro ao processar auto-aceitar: ${err.message}`);
            }
        }
    } catch (error) {
        console.error(`❌ Erro em handleGroupJoinRequest: ${error.message}`);
    }
}

const isValidJid = (str) => /^\d+@s\.whatsapp\.net$/.test(str);
const isValidLid = (str) => /^[a-zA-Z0-9_]+@lid$/.test(str);
const isValidUserId = (str) => isValidJid(str) || isValidLid(str);

/**
 * Validates if a participant object has a valid ID and extracts the ID
 * @param {object|string} participant - The participant object or string to validate
 * @returns {string|boolean} - The participant ID if valid, false otherwise
 */
function isValidParticipant(participant) {
    // If participant is already a string, validate it directly
    if (typeof participant === 'string') {
        if (participant.trim().length === 0) return false;
        return participant;
    }

    // If participant is an object with id property
    if (participant && typeof participant === 'object' && participant.hasOwnProperty('id')) {
        const id = participant.id;
        if (id === null || id === undefined || id === '') return false;
        if (typeof id === 'string' && id.trim().length === 0) return false;
        if (id === 0) return false;

        return id;
    }

    return false;
}

function collectJidsFromJson(obj, jidsSet = new Set()) {
    if (Array.isArray(obj)) {
        obj.forEach(item => collectJidsFromJson(item, jidsSet));
    } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(value => collectJidsFromJson(value, jidsSet));
    } else if (typeof obj === 'string' && isValidJid(obj)) {
        jidsSet.add(obj);
    }
    return jidsSet;
}

function replaceJidsInJson(obj, jidToLidMap, orphanJidsSet, replacementsCount = { count: 0 }, removalsCount = { count: 0 }) {
    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            const newItem = replaceJidsInJson(item, jidToLidMap, orphanJidsSet, replacementsCount, removalsCount);
            if (newItem !== item) obj[index] = newItem;
        });
    } else if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        Object.keys(obj).forEach(key => {
            const value = obj[key];
            if (typeof value === 'string' && isValidJid(value)) {
                if (jidToLidMap.has(value)) {
                    obj[key] = jidToLidMap.get(value);
                    replacementsCount.count++;
                } else if (orphanJidsSet.has(value)) {
                    delete obj[key];
                    removalsCount.count++;
                }
            } else {
                const newValue = replaceJidsInJson(value, jidToLidMap, orphanJidsSet, replacementsCount, removalsCount);
                if (newValue !== value) obj[key] = newValue;
            }
        });
    } else if (typeof obj === 'string' && isValidJid(obj)) {
        if (jidToLidMap.has(obj)) {
            replacementsCount.count++;
            return jidToLidMap.get(obj);
        } else if (orphanJidsSet.has(obj)) {
            removalsCount.count++;
            return null;
        }
    }
    return obj;
}

async function scanForJids(directory) {
    const uniqueJids = new Set();
    const affectedFiles = new Map();
    const jidFiles = new Map();

    const scanFileContent = async (filePath) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const jsonObj = JSON.parse(content);
            const fileJids = collectJidsFromJson(jsonObj);
            if (fileJids.size > 0) {
                affectedFiles.set(filePath, Array.from(fileJids));
                fileJids.forEach(jid => uniqueJids.add(jid));
            }
        } catch (parseErr) {
            console.warn(`⚠️ Arquivo ${filePath} não é JSON válido. Usando fallback regex.`);
            const jidPattern = /(\d+@s\.whatsapp\.net)/g;
            const content = await fs.readFile(filePath, 'utf-8');
            let match;
            const fileJids = new Set();
            while ((match = jidPattern.exec(content)) !== null) {
                const jid = match[1];
                uniqueJids.add(jid);
                fileJids.add(jid);
            }
            if (fileJids.size > 0) {
                affectedFiles.set(filePath, Array.from(fileJids));
            }
        }
    };

    const checkAndScanFilename = async (fullPath) => {
        try {
            const basename = path.basename(fullPath, '.json');
            const filenameMatch = basename.match(/(\d+@s\.whatsapp\.net)/);
            if (filenameMatch) {
                const jidFromName = filenameMatch[1];
                if (isValidJid(jidFromName)) {
                    uniqueJids.add(jidFromName);
                    jidFiles.set(jidFromName, fullPath);
                }
            }
            await scanFileContent(fullPath);
        } catch (err) {
            console.error(`Erro ao processar ${fullPath}: ${err.message}`);
        }
    };

    const scanDir = async (dirPath) => {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    await scanDir(fullPath);
                } else if (entry.name.endsWith('.json')) {
                    await checkAndScanFilename(fullPath);
                }
            }
        } catch (err) {
            console.error(`Erro ao escanear diretório ${dirPath}: ${err.message}`);
        }
    };

    await scanDir(directory);

    try {
        await scanFileContent(configPath);
        const configBasename = path.basename(configPath, '.json');
        const filenameMatch = configBasename.match(/(\d+@s\.whatsapp\.net)/);
        if (filenameMatch) {
            const jidFromName = filenameMatch[1];
            if (isValidJid(jidFromName)) {
                uniqueJids.add(jidFromName);
                jidFiles.set(jidFromName, configPath);
            }
        }
    } catch (err) {
        console.error(`Erro ao escanear config.json: ${err.message}`);
    }

    return {
        uniqueJids: Array.from(uniqueJids),
        affectedFiles: Array.from(affectedFiles.entries()),
        jidFiles: Array.from(jidFiles.entries())
    };
}

async function replaceJidsInContent(affectedFiles, jidToLidMap, orphanJidsSet) {
    let totalReplacements = 0;
    let totalRemovals = 0;
    const updatedFiles = [];

    for (const [filePath, jids] of affectedFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            let jsonObj = JSON.parse(content);
            const replacementsCount = { count: 0 };
            const removalsCount = { count: 0 };
            replaceJidsInJson(jsonObj, jidToLidMap, orphanJidsSet, replacementsCount, removalsCount);
            if (replacementsCount.count > 0 || removalsCount.count > 0) {
                const updatedContent = JSON.stringify(jsonObj, null, 2);
                await fs.writeFile(filePath, updatedContent, 'utf-8');
                totalReplacements += replacementsCount.count;
                totalRemovals += removalsCount.count;
                updatedFiles.push(path.basename(filePath));
            }
        } catch (err) {
            console.error(`Erro ao substituir em ${filePath}: ${err.message}`);
        }
    }

    return { totalReplacements, totalRemovals, updatedFiles };
}

async function handleJidFiles(jidFiles, jidToLidMap, orphanJidsSet) {
    let totalReplacements = 0;
    let totalRemovals = 0;
    const updatedFiles = [];
    const renamedFiles = [];
    const deletedFiles = [];

    for (const [jid, oldPath] of jidFiles) {
        if (orphanJidsSet.has(jid)) {
            try {
                await fs.unlink(oldPath);
                deletedFiles.push(path.basename(oldPath));
                totalRemovals++;
                continue;
            } catch (err) {
                console.error(`Erro ao excluir arquivo órfão ${oldPath}: ${err.message}`);
            }
        }

        const lid = jidToLidMap.get(jid);
        if (!lid) {
            continue;
        }

        try {
            const content = await fs.readFile(oldPath, 'utf-8');
            let jsonObj = JSON.parse(content);
            const replacementsCount = { count: 0 };
            const removalsCount = { count: 0 };
            replaceJidsInJson(jsonObj, jidToLidMap, orphanJidsSet, replacementsCount, removalsCount);
            totalReplacements += replacementsCount.count;
            totalRemovals += removalsCount.count;

            const dir = path.dirname(oldPath);
            const newPath = join(dir, `${lid}.json`);

            try {
                await fs.access(newPath);
                continue;
            } catch { }

            const updatedContent = JSON.stringify(jsonObj, null, 2);
            await fs.writeFile(newPath, updatedContent, 'utf-8');
            await fs.unlink(oldPath);

            updatedFiles.push(path.basename(newPath));
            renamedFiles.push({ old: path.basename(oldPath), new: path.basename(newPath) });

        } catch (err) {
            console.error(`Erro ao processar renomeação de ${oldPath}: ${err.message}`);
        }
    }

    return { totalReplacements, totalRemovals, updatedFiles, renamedFiles, deletedFiles };
}

async function fetchLidWithRetry(NazunaSock, jid, maxRetries = 3) {
    if (!jid || !isValidJid(jid)) {
        console.warn(`⚠️ JID inválido fornecido: ${jid}`);
        return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await NazunaSock.onWhatsApp(jid);
            if (result && result[0] && result[0].lid) {
                return { jid, lid: result[0].lid };
            }
            return null;
        } catch (err) {
            if (attempt === maxRetries) {
                console.warn(`⚠️ Falha ao buscar LID para ${jid} após ${maxRetries} tentativas`);
            }
        }
        if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
    }
    return null;
}

async function fetchLidsInBatches(NazunaSock, uniqueJids, batchSize = 5) {
    const lidResults = [];
    const jidToLidMap = new Map();
    let successfulFetches = 0;

    for (let i = 0; i < uniqueJids.length; i += batchSize) {
        const batch = uniqueJids.slice(i, i + batchSize);

        const batchPromises = batch.map(jid => fetchLidWithRetry(NazunaSock, jid));
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                const { jid, lid } = result.value;
                lidResults.push({ jid, lid });
                jidToLidMap.set(jid, lid);
                successfulFetches++;
            }
        });

        if (i + batchSize < uniqueJids.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return { lidResults, jidToLidMap, successfulFetches };
}

async function updateOwnerLid(NazunaSock) {
    const ownerJid = `${numerodono}@s.whatsapp.net`;
    try {
        const result = await fetchLidWithRetry(NazunaSock, ownerJid);
        if (result) {
            config.lidowner = result.lid;
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
    } catch (err) {
        console.error(`❌ Erro ao atualizar LID do dono: ${err.message}`);
    }
}

async function performMigration(NazunaSock) {
    let scanResult;
    try {
        scanResult = await scanForJids(DATABASE_DIR);
    } catch (err) {
        console.error(`Erro crítico no scan: ${err.message}`);
        return;
    }

    const { uniqueJids, affectedFiles, jidFiles } = scanResult;

    if (uniqueJids.length === 0) {
        return;
    }

    const { jidToLidMap, successfulFetches } = await fetchLidsInBatches(NazunaSock, uniqueJids);
    const orphanJidsSet = new Set(uniqueJids.filter(jid => !jidToLidMap.has(jid)));

    if (jidToLidMap.size === 0) {
        return;
    }

    let totalReplacements = 0;
    let totalRemovals = 0;
    const allUpdatedFiles = [];

    try {
        const renameResult = await handleJidFiles(jidFiles, jidToLidMap, orphanJidsSet);
        totalReplacements += renameResult.totalReplacements;
        totalRemovals += renameResult.totalRemovals;
        allUpdatedFiles.push(...renameResult.updatedFiles);

        const filteredAffected = affectedFiles.filter(([filePath]) => !jidFiles.some(([, jidPath]) => jidPath === filePath));
        const contentResult = await replaceJidsInContent(filteredAffected, jidToLidMap, orphanJidsSet);
        totalReplacements += contentResult.totalReplacements;
        totalRemovals += contentResult.totalRemovals;
        allUpdatedFiles.push(...contentResult.updatedFiles);
    } catch (processErr) {
        console.error(`Erro no processamento de substituições: ${processErr.message}`);
        return;
    }

}

// Variáveis de controle de reconexão (declaradas aqui para evitar temporal dead zone)
let reconnectAttempts = 0;
let isReconnecting = false; // Flag para evitar múltiplas reconexões simultâneas
let reconnectTimer = null; // Timer de reconexão para poder cancelar
let forbidden403Attempts = 0; // Contador específico para erro 403
let consecutive428Count = 0; // Contador de 428 consecutivos para detectar loop
const MAX_RECONNECT_ATTEMPTS = 15;
const MAX_403_ATTEMPTS = 3; // Máximo de 3 tentativas para erro 403
const MAX_428_CONSECUTIVE = 5; // Máximo de 428 consecutivos antes de parar
const RECONNECT_DELAY_BASE = 5000; // 5 segundos base
const MAX_RECONNECT_DELAY = 120000; // Máximo 2 minutos de delay




async function createBotSocket(authDir) {
    try {
        await fs.mkdir(path.join(DATABASE_DIR, 'grupos'), { recursive: true });
        await fs.mkdir(authDir, { recursive: true });
        const {
            state,
            saveCreds,
            signalRepository
        } = await useMultiFileAuthState(authDir, makeCacheableSignalKeyStore);

        // Busca a versão mais recente do Baileys e simula browser macOS nativo
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Usando versão do WhatsApp: ${version.join('.')}`);

        const NazunaSock = makeWASocket({
            version,
            browser: Browsers.ubuntu('Chrome'),
            emitOwnEvents: true,
            fireInitQueries: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 180000,
            retryRequestDelayMs: 10000,
            qrTimeout: 180000,
            keepAliveIntervalMs: 30_000, // 30s para detectar morte de conexão mais rápido
            defaultQueryTimeoutMs: 60_000, // Timeout de 60s para queries (evita travamento infinito)
            msgRetryCounterCache,
            auth: state,
            signalRepository,
            logger
        });

        // Registra os listeners ANTES de pedir o pairing code
        // para que creds.update salve as credenciais corretamente
        NazunaSock.ev.on('creds.update', saveCreds);

        if (codeMode && !NazunaSock.authState.creds.registered) {
            let phoneNumber;
            if (phoneArg && /^\d{10,15}$/.test(phoneArg)) {
                phoneNumber = phoneArg;
                console.log(`📱 Usando número via argumento: +${phoneNumber}`);
            } else {
                console.log('📱 Insira o número de telefone (com código de país, ex: +14155552671 ou +551199999999): ');
                phoneNumber = await ask('--> ');
                phoneNumber = phoneNumber.replace(/\D/g, '');
                if (!/^\d{10,15}$/.test(phoneNumber)) {
                    console.log('⚠️ Número inválido! Use um número válido com código de país (ex: +14155552671 ou +551199999999).');
                    process.exit(1);
                }
            }
            // Espera 5s para o WebSocket estabilizar antes de pedir o código
            console.log('⏳ Aguardando estabilização da conexão (5s)...');
            await new Promise(r => setTimeout(r, 5000));
            const code = await NazunaSock.requestPairingCode(phoneNumber.replaceAll('+', '').replaceAll(' ', '').replaceAll('-', ''));
            console.log(`🔑 Código de pareamento: ${code}`);
            console.log('📲 Envie este código no WhatsApp para autenticar o bot.');
            console.log('⏳ Aguardando autenticação... Não feche o terminal.');
        }



        NazunaSock.ev.on('groups.update', async (updates) => {
            if (!Array.isArray(updates) || updates.length === 0) return;

            if (DEBUG_MODE) {
                console.log('\n🐛 ========== GROUPS UPDATE ==========');
                console.log('📅 Timestamp:', new Date().toISOString());
                console.log('📊 Number of updates:', updates.length);
                updates.forEach((update, index) => {
                    console.log(`\n--- Update ${index + 1} ---`);
                    console.log('📦 Update data:', JSON.stringify(update, null, 2));
                });
                console.log('🐛 ====================================\n');
            }

            // Processa atualizações em lote para melhor performance
            const updatePromises = updates.map(async ([ev]) => {
                if (!ev || !ev.id) return;

                try {
                    const meta = await NazunaSock.groupMetadata(ev.id).catch(() => null);
                    if (meta) {
                        // Metadados atualizados, pode ser usado para cache futuro
                        if (DEBUG_MODE) {
                            console.log('🐛 Metadata fetched for group:', ev.id);
                        }
                    }
                } catch (e) {
                    console.error(`❌ Erro ao atualizar metadados do grupo ${ev.id}: ${e.message}`);
                }
            });

            await Promise.allSettled(updatePromises);
        });

        NazunaSock.ev.on('group-participants.update', async (inf) => {
            if (DEBUG_MODE) {
                console.log('\n🐛 ========== GROUP PARTICIPANTS UPDATE ==========');
                console.log('📅 Timestamp:', new Date().toISOString());
                console.log('🆔 Group ID:', inf.id || inf.jid || 'unknown');
                console.log('⚡ Action:', inf.action);
                console.log('👥 Participants:', inf.participants);
                console.log('� Author:', inf.author || 'N/A');
                console.log('�📦 Full event data:', JSON.stringify(inf, null, 2));
                console.log('🐛 ================================================\n');
            }
            await handleGroupParticipantsUpdate(NazunaSock, inf);
        });

        // Listener para solicitações de entrada em grupos (join requests)
        NazunaSock.ev.on('group.join-request', async (inf) => {
            if (DEBUG_MODE) {
                console.log('\n🐛 ========== GROUP JOIN REQUEST ==========');
                console.log('📅 Timestamp:', new Date().toISOString());
                console.log('🆔 Group ID:', inf.id);
                console.log('⚡ Action:', inf.action);
                console.log('👤 Participant:', inf.participant);
                console.log('📱 Participant Phone:', inf.participantPn);
                console.log('👮 Author:', inf.author);
                console.log('📝 Method:', inf.method);
                console.log('📦 Full event data:', JSON.stringify(inf, null, 2));
                console.log('🐛 ===========================================\n');
            }
            await handleGroupJoinRequest(NazunaSock, inf);
        });

        let messagesListenerAttached = false;

        const queueErrorHandler = async (item, error) => {
            console.error(`❌ Critical error processing message ${item.id}:`, error);

            if (error.message.includes('ENOSPC') || error.message.includes('ENOMEM')) {
                console.error('🚨 Critical system error detected, triggering emergency cleanup...');
                try {
                    await performanceOptimizer.emergencyCleanup();
                } catch (cleanupErr) {
                    console.error('❌ Emergency cleanup failed:', cleanupErr.message);
                }
            }

            console.error({
                messageId: item.id,
                errorType: error.constructor.name,
                errorMessage: error.message,
                stack: error.stack,
                messageTimestamp: item.timestamp,
                queueStatus: messageQueue.getStatus()
            });
        };

        messageQueue.setErrorHandler(queueErrorHandler);

        const processMessage = async (info) => {
            // Verifica se é uma solicitação de entrada (messageStubType no info, não em message)
            const isJoinRequest = info?.messageStubType === 172; // GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD

            // Solicitações de entrada não têm message, apenas messageStubType
            if (isJoinRequest) {
                // Cria um objeto message fake para o index.js processar
                info.message = {
                    messageStubType: info.messageStubType,
                    messageStubParameters: info.messageStubParameters
                };
            }

            if (!info || !info.message || !info.key?.remoteJid) {
                return;
            }

            // Cache da mensagem para uso posterior no processamento (anti-delete, resumirchat, etc)
            if (messagesCache && info.key?.id && info.key?.remoteJid) {
                // Limite duro: não adicionar se cache já está cheio
                if (messagesCache.size < 400) {
                    const cacheKey = `${info.key.remoteJid}_${info.key.id}`;
                    messagesCache.set(cacheKey, info);
                }
            }

            // Processa mensagem
            if (typeof indexModule === 'function') {
                await indexModule(NazunaSock, info, null, messagesCache, rentalExpirationManager);
            } else {
                throw new Error('Módulo index.js não é uma função válida. Verifique o arquivo index.js.');
            }
        };

        const attachMessagesListener = () => {
            if (messagesListenerAttached) return;
            messagesListenerAttached = true;

            NazunaSock.ev.on('messages.upsert', async (m) => {
                if (!m.messages || !Array.isArray(m.messages)) return;
                
                if (DEBUG_MODE) console.log(`[MSG-DEBUG] Upsert received: type=${m.type}, msgCount=${m.messages.length}`);

                // Se for 'append', só processa se for solicitação de entrada (messageStubType 172)
                if (m.type === 'append') {
                    const isJoinRequest = m.messages.some(info => info?.messageStubType === 172);
                    if (!isJoinRequest) return;
                }

                // Processa 'notify' (mensagens normais) e 'append' (apenas solicitações de entrada)
                if (m.type !== 'notify' && m.type !== 'append') return;

                try {

                    const messageProcessingPromises = m.messages.map(info => {
                        // Watchdog removido
                        return messageQueue.add(info, processMessage).catch(err => {
                            console.error(`❌ Failed to queue message ${info.key?.id}: ${err.message}`);
                        });
                    });

                    await Promise.allSettled(messageProcessingPromises);

                } catch (err) {
                    console.error(`❌ Error in message upsert handler: ${err.message}`);

                    if (err.message.includes('ENOSPC') || err.message.includes('ENOMEM')) {
                        console.error('🚨 Critical system error detected, triggering emergency cleanup...');
                        try {
                            await performanceOptimizer.emergencyCleanup();
                        } catch (cleanupErr) {
                            console.error('❌ Emergency cleanup failed:', cleanupErr.message);
                        }
                    }
                }
            });
        };

        NazunaSock.ev.on('connection.update', async (update) => {
            const {
                connection,
                lastDisconnect,
                qr
            } = update;
            if (qr && !NazunaSock.authState.creds.registered && !codeMode) {
                console.log('🔗 QR Code gerado para autenticação:');

                // Gerar arquivo HTML com o QR Code
                const htmlContent = `
                    <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta http-equiv="refresh" content="2">
                            <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
                            <meta http-equiv="Pragma" content="no-cache">
                            <meta http-equiv="Expires" content="0">
                            <title>Nazuna Bot - QR Code</title>
                            <style>
                                body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background-color: #f0f2f5; }
                                .container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
                                h1 { color: #333; margin-bottom: 20px; }
                                p { color: #666; margin-top: 20px; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>🤖 Escaneie o QR Code</h1>
                                <div id="qrcode"></div>
                                <p>Atualiza automaticamente a cada 2 segundos...</p>
                            </div>
                            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                            <script>
                                new QRCode(document.getElementById("qrcode"), {
                                    text: "${qr}",
                                    width: 256,
                                    height: 256,
                                    colorDark : "#000000",
                                    colorLight : "#ffffff",
                                    correctLevel : QRCode.CorrectLevel.H
                                });
                            </script>
                        </body>
                    </html>
                `;
                await fs.writeFile(path.join(process.cwd(), 'qrcode.html'), htmlContent);
                console.log(`📄 QR Code salvo em: ${path.join(process.cwd(), 'qrcode.html')}`);

                qrcode.generate(qr, {
                    small: true
                }, (qrcodeText) => {
                    console.log(qrcodeText);
                });
                console.log('📱 Escaneie o QR code acima (ou abra qrcode.html no Chrome) com o WhatsApp.');
            }
            if (connection === 'open') {
                console.log(`🔄 Conexão aberta. Inicializando sistema de otimização...`);

                // Reset de flags apenas quando conexão REALMENTE abre
                codeMode = false; // Desativa o modo de pareamento permanentemente após o sucesso
                isReconnecting = false;
                reconnectAttempts = 0;
                forbidden403Attempts = 0;
                // NÃO resetar consecutive428Count aqui!
                // O 428 chega logo após o open, criando loop infinito se resetar.
                // Em vez disso, reseta após 60s de conexão estável.
                if (global._428ResetTimer) clearTimeout(global._428ResetTimer);
                global._428ResetTimer = setTimeout(() => {
                    if (consecutive428Count > 0) {
                        console.log(`✅ Conexão estável por 60s. Resetando contador 428 (era ${consecutive428Count}).`);
                        consecutive428Count = 0;
                    }
                }, 60000);

                if (global.nazuWatchdog) clearInterval(global.nazuWatchdog);
                global.nazuWatchdog = setInterval(async () => {
                    if (!NazunaSock) return;
                    try {
                        // Faz um ping inofensivo para garantir que o socket responde
                        await NazunaSock.presenceSubscribe(NazunaSock.user?.id).catch(() => {});
                    } catch (e) {
                        if (String(e).includes('Connection Closed') || String(e).includes('closed')) {
                            console.error('🚨 Watchdog: Connection Closed detectado ativamente! Forçando restart...');
                            process.exit(1);
                        }
                    }
                }, 45000); // Checa a cada 45 segundos

                await initializeOptimizedCaches();

                await updateOwnerLid(NazunaSock);
                await performMigration(NazunaSock);

                rentalExpirationManager.nazu = NazunaSock;
                await rentalExpirationManager.initialize();

                attachMessagesListener();
                startCacheCleanup(); // Inicia o sistema de limpeza de cache

                // Envia mensagem de boas-vindas para o dono
                try {
                    const msgBotOnConfig = loadMsgBotOn();

                    if (msgBotOnConfig.enabled) {
                        // Aguarda 3 segundos para garantir que o bot está totalmente conectado
                        setTimeout(async () => {
                            try {
                                const ownerJid = buildUserId(numerodono, config);
                                await NazunaSock.sendMessage(ownerJid, {
                                    text: msgBotOnConfig.message
                                });
                                console.log('✅ Mensagem de inicialização enviada para o dono');
                            } catch (sendError) {
                                console.error('❌ Erro ao enviar mensagem de inicialização:', sendError.message);
                            }
                        }, 3000);
                    } else {
                        console.log('ℹ️ Mensagem de inicialização desativada');
                    }
                } catch (msgError) {
                    console.error('❌ Erro ao processar mensagem de inicialização:', msgError.message);
                }

                // Inicializa sub-bots automaticamente
                try {
                    if (typeof indexModule === 'function') {
                        await indexModule(NazunaSock, { isStartup: true, key: { remoteJid: 'status@broadcast', id: 'fake_123' }, message: { conversation: 'fake_startup_event' } }, null, messagesCache, rentalExpirationManager);
                    }
                    
                    const subBotManagerModule = await import('./utils/subBotManager.js');
                    const subBotManager = subBotManagerModule.default ?? subBotManagerModule;
                    console.log('🤖 Verificando sub-bots cadastrados...');
                    setTimeout(async () => {
                        await subBotManager.initializeAllSubBots();
                    }, 5000);
                } catch (error) {
                    console.error('❌ Erro ao inicializar sub-bots:', error.message);
                }

                console.log(`✅ Bot ${nomebot} iniciado com sucesso! Prefixo: ${prefixo} | Dono: ${nomedono}`);
                console.log(`📊 Configuração: ${messageQueue.batchSize} lotes de ${messageQueue.messagesPerBatch} mensagens (${messageQueue.batchSize * messageQueue.messagesPerBatch} msgs paralelas)`);
            }
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const reasonMessage = {
                    [DisconnectReason.loggedOut]: 'Deslogado do WhatsApp',
                    401: 'Sessão expirada',
                    403: 'Acesso proibido (Forbidden)',
                    [DisconnectReason.connectionClosed]: 'Conexão fechada',
                    [DisconnectReason.connectionLost]: 'Conexão perdida',
                    [DisconnectReason.connectionReplaced]: 'Conexão substituída',
                    [DisconnectReason.timedOut]: 'Tempo de conexão esgotado',
                    [DisconnectReason.badSession]: 'Sessão inválida',
                    [DisconnectReason.restartRequired]: 'Reinício necessário',
                }[reason] || 'Motivo desconhecido';

                console.log(`❌ Conexão fechada. Código: ${reason} | Motivo: ${reasonMessage} | Tentativa: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

                // Limpa recursos antes de reconectar
                // Watchdog removido
                if (cacheCleanupInterval) {
                    clearInterval(cacheCleanupInterval);
                    cacheCleanupInterval = null;
                }

                // Tratamento especial para erro 428 (Connection Closed / rate limit)
                // O 428 é o erro mais perigoso porque cria loops infinitos:
                // O bot conecta (open), recebe 428 logo depois, reconnectAttempts reseta no open,
                // e o ciclo se repete INFINITAMENTE sem nunca atingir o limite de 15.
                if (reason === 428) {
                    consecutive428Count++;
                    console.log(`⚠️ Erro 428 consecutivo #${consecutive428Count}/${MAX_428_CONSECUTIVE}`);

                    // Em codeMode: para imediatamente no 1º 428 — o código já foi exibido,
                    // se reconectar gera outro código invalidando o anterior.
                    if (codeMode) {
                        console.log('⏸️ Rate limit do WhatsApp (428) em modo pareamento. O código acima ainda é válido por ~3 min.');
                        console.log('📲 Insira o código no WhatsApp AGORA. O bot aguarda a conexão.');
                        // Espera em silêncio a conexão ser feita — não reconecta!
                        return;
                    }

                    if (consecutive428Count >= MAX_428_CONSECUTIVE) {
                        console.log('🛑 Loop de 428 detectado! O WhatsApp está recusando esta sessão repetidamente.');
                        console.log('🛑 Parando o bot DEFINITIVAMENTE para evitar ban.');
                        console.log('🛑 Será necessário re-parear o bot manualmente.');
                        // Cria lock file para impedir PM2 de reiniciar em loop
                        try {
                            const lockPath = path.join(DATABASE_DIR, '428_LOCK');
                            await fs.writeFile(lockPath, `Loop 428 detectado em ${new Date().toISOString()}. Re-pareamento necessário.`);
                            // Para o PM2 definitivamente em vez de process.exit que reinicia
                            execSync('pm2 stop nazuna', { timeout: 5000 });
                        } catch (e) {
                            process.exit(0); // exit 0 = PM2 não reinicia se configurado com --stop-exit-codes 0
                        }
                        return;
                    }

                    // Delay progressivo para 428: 10s, 20s, 40s, 60s, 120s
                    const delay428 = Math.min(10000 * Math.pow(2, consecutive428Count - 1), MAX_RECONNECT_DELAY);
                    console.log(`🔄 Aguardando ${Math.round(delay428 / 1000)}s antes de reconectar (anti-loop 428)...`);
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(() => {
                        startNazu();
                    }, delay428);
                    return;
                }

                // Reset do contador 428 se for outro tipo de erro
                consecutive428Count = 0;

                // Tratamento especial para erro 403 (Forbidden)
                if (reason === 403) {
                    forbidden403Attempts++;
                    console.log(`⚠️ Erro 403 detectado. Tentativa ${forbidden403Attempts}/${MAX_403_ATTEMPTS}`);

                    if (forbidden403Attempts >= MAX_403_ATTEMPTS) {
                        console.log('❌ Máximo de tentativas para erro 403 atingido. Apagando QR code e parando...');
                        await clearAuthDir();
                        console.log('🗑️ Autenticação removida. Reinicie o bot para gerar um novo QR code.');
                        process.exit(1);
                    }

                    // Aguarda antes de tentar reconectar
                    console.log('🔄 Tentando reconectar em 5 segundos...');
                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                    }
                    reconnectTimer = setTimeout(() => {
                        startNazu();
                    }, 5000);
                    return;
                }

                // Reset do contador 403 se for outro tipo de erro
                forbidden403Attempts = 0;

                // APENAS loggedOut real apaga a sessão (NÃO 401/badSession)
                if (reason === DisconnectReason.loggedOut) {
                    await clearAuthDir();
                    console.log('🔄 Sessão foi deslogada pelo WhatsApp. Nova autenticação necessária.');
                    process.exit(1);
                } else if (reason === DisconnectReason.badSession) {
                    console.log('⚠️ Sessão reportada como inválida. Reiniciando sem apagar credenciais...');
                } else if (reason === 401) {
                    if (codeMode) {
                        console.log('❌ Sessão inválida em modo de pareamento (401). Limpando sessão...');
                        await clearAuthDir();
                        console.log('🗑️ Sessão apagada. Reinicie o bot e tente parear novamente.');
                        process.exit(0);
                    } else {
                        console.log('⚠️ Sessão expirada (401). Reiniciando sem apagar credenciais...');
                    }
                }

                if (reason === DisconnectReason.connectionReplaced) {
                    console.log('⚠️ Conexão substituída por outra instância. Não reconectando para evitar conflito.');
                    process.exit(0);
                }

                if (reason === DisconnectReason.restartRequired) {
                    console.log('🔄 Reinício necessário (515) — reiniciando imediatamente...');
                    process.exit(1);
                }

                reconnectAttempts++;

                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.error(`❌ Máximo de tentativas de reconexão (${MAX_RECONNECT_ATTEMPTS}) atingido. Parando...`);
                    process.exit(1);
                }

                // Para garantir que o PM2 reinicie de forma totalmente limpa e evite sockets zumbis/memory leak:
                console.log(`🔄 Reiniciando processo via PM2 para limpeza de memória...`);
                
                // Se for rate limit (428), esperamos antes de encerrar para não causar loop no PM2
                if (reason === 428) {
                    const delay428 = Math.min(10000 * Math.pow(2, consecutive428Count - 1), MAX_RECONNECT_DELAY);
                    console.log(`⏳ Aguardando ${Math.round(delay428 / 1000)}s antes de reiniciar (anti-loop 428)...`);
                    setTimeout(() => process.exit(1), delay428);
                } else {
                    // Outros erros menores
                    setTimeout(() => process.exit(1), 3000);
                }
            }
        });
        return NazunaSock;
    } catch (err) {
        console.error(`❌ Erro ao criar socket do bot: ${err.message}`);
        process.exit(1);
    }
}

async function startNazu() {
    // Verifica lock de loop 428
    try {
        const lockPath = path.join(DATABASE_DIR, '428_LOCK');
        await fs.access(lockPath);
        console.log('🛑 LOCK de 428 detectado! O bot foi parado por loop de desconexão.');
        console.log('🛑 Para reconectar: delete o arquivo dados/database/428_LOCK e re-pareie.');
        process.exit(0);
    } catch {
        // Prossegue
    }

    try {
        console.log(`🚀 Iniciando Nazuna... (tentativa ${reconnectAttempts + 1})`);
        await createBotSocket(AUTH_DIR);
    } catch (err) {
        console.error(`❌ Erro ao iniciar o bot: ${err.message}`);
        process.exit(1);
    }
}

/**
 * Função unificada para desligamento gracioso
 */
async function gracefulShutdown(signal) {
    const signalName = signal === 'SIGTERM' ? 'SIGTERM' : 'SIGINT';
    console.log(`📡 ${signalName} recebido, parando bot graciosamente...`);

    // Cancela qualquer timer de reconexão pendente
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    isReconnecting = false;

    let shutdownTimeout;

    // Timeout de segurança para forçar saída após 15 segundos
    shutdownTimeout = setTimeout(() => {
        console.error('⚠️ Timeout de shutdown, forçando saída...');
        process.exit(1);
    }, 15000);

    try {
        // Desconecta sub-bots
        try {
            const subBotManagerModule = await import('./utils/subBotManager.js');
            const subBotManager = subBotManagerModule.default ?? subBotManagerModule;
            await subBotManager.disconnectAllSubBots();
            console.log('✅ Sub-bots desconectados');
        } catch (error) {
            console.error('❌ Erro ao desconectar sub-bots:', error.message);
        }

        // Limpa recursos
        if (cacheCleanupInterval) {
            clearInterval(cacheCleanupInterval);
            cacheCleanupInterval = null;
        }

        // Finaliza fila de mensagens
        await messageQueue.shutdown();
        console.log('✅ MessageQueue finalizado');

        // Finaliza otimizador
        await performanceOptimizer.shutdown();
        console.log('✅ Performance optimizer finalizado');

        clearTimeout(shutdownTimeout);
        console.log('✅ Desligamento concluído');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro durante desligamento:', error.message);
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', async (error) => {
    console.error('🚨 Erro não capturado:', error.message);
    console.error(error.stack);

    const isCritical = error.message.includes('ENOSPC') ||
        error.message.includes('ENOMEM') ||
        error.message.includes('MODULE_NOT_FOUND') ||
        error.message.includes('Cannot find module');

    if (error.message.includes('ENOSPC') || error.message.includes('ENOMEM')) {
        try {
            await performanceOptimizer.emergencyCleanup();
        } catch (cleanupErr) {
            console.error('❌ Falha na limpeza de emergência:', cleanupErr.message);
        }
    }

    if (isCritical) {
        console.error('💀 Erro crítico — encerrando para restart pelo PM2...');
        process.exit(1);
    } else {
        console.warn('⚠️ Erro não-crítico — bot continuará funcionando.');
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('🚨 Promise não tratada:', reason);
});

export { rentalExpirationManager, messageQueue };

startNazu();