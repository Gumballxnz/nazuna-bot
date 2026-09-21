import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSMISSAO_FILE = path.join(__dirname, '../../../database/transmissao.json');

const loadSubscribers = () => {
    try {
        if (fs.existsSync(TRANSMISSAO_FILE)) {
            const data = JSON.parse(fs.readFileSync(TRANSMISSAO_FILE, 'utf8'));
            return data;
        }
        return {
            subscribers: [],
            stats: {
                totalSubscribers: 0,
                totalMessages: 0,
                lastBroadcast: null
            }
        };
    } catch (err) {
        console.error('[TRANSMISSAO] Erro ao carregar inscritos:', err.message);
        return {
            subscribers: [],
            stats: {
                totalSubscribers: 0,
                totalMessages: 0,
                lastBroadcast: null
            }
        };
    }
};

const saveSubscribers = (data) => {
    try {
        const dir = path.dirname(TRANSMISSAO_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(TRANSMISSAO_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('[TRANSMISSAO] Erro ao salvar inscritos:', err.message);
        return false;
    }
};

const subscribe = (userId, userName) => {
    const data = loadSubscribers();

    const alreadySubscribed = data.subscribers.some(sub => sub.id === userId);

    if (alreadySubscribed) {
        return {
            success: false,
            message: '⚠️ Você já está inscrito na lista de transmissão!'
        };
    }

    data.subscribers.push({
        id: userId,
        name: userName || 'Usuário',
        subscribedAt: new Date().toISOString(),
        messagesReceived: 0
    });

    data.stats.totalSubscribers = data.subscribers.length;

    if (saveSubscribers(data)) {
        return {
            success: true,
            message: `✅ *Inscrição realizada com sucesso!*\n\n` +
                     `📱 Você agora receberá as transmissões do dono.\n` +
                     `👥 Total de inscritos: ${data.stats.totalSubscribers}\n\n` +
                     `💡 Para cancelar, use o mesmo comando novamente.`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao inscrever na lista de transmissão.'
    };
};

const unsubscribe = (userId) => {
    const data = loadSubscribers();

    const initialLength = data.subscribers.length;
    data.subscribers = data.subscribers.filter(sub => sub.id !== userId);

    if (data.subscribers.length === initialLength) {
        return {
            success: false,
            message: '⚠️ Você não está inscrito na lista de transmissão!'
        };
    }

    data.stats.totalSubscribers = data.subscribers.length;

    if (saveSubscribers(data)) {
        return {
            success: true,
            message: `✅ *Inscrição cancelada!*\n\n` +
                     `📱 Você não receberá mais transmissões.\n` +
                     `👥 Total de inscritos: ${data.stats.totalSubscribers}`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao cancelar inscrição.'
    };
};

const isSubscribed = (userId) => {
    const data = loadSubscribers();
    return data.subscribers.some(sub => sub.id === userId);
};

const getSubscribers = () => {
    const data = loadSubscribers();
    return data.subscribers;
};

const getStats = () => {
    const data = loadSubscribers();
    return {
        totalSubscribers: data.stats.totalSubscribers,
        totalMessages: data.stats.totalMessages,
        lastBroadcast: data.stats.lastBroadcast,
        subscribers: data.subscribers
    };
};

const incrementMessageCount = (successCount) => {
    const data = loadSubscribers();
    data.stats.totalMessages += successCount;
    data.stats.lastBroadcast = new Date().toISOString();

    data.subscribers.forEach(sub => {
        sub.messagesReceived = (sub.messagesReceived || 0) + 1;
    });

    saveSubscribers(data);
};

const removeSubscriber = (userId) => {
    const data = loadSubscribers();

    const subscriber = data.subscribers.find(sub => sub.id === userId);
    if (!subscriber) {
        return {
            success: false,
            message: '⚠️ Usuário não encontrado na lista!'
        };
    }

    data.subscribers = data.subscribers.filter(sub => sub.id !== userId);
    data.stats.totalSubscribers = data.subscribers.length;

    if (saveSubscribers(data)) {
        return {
            success: true,
            message: `✅ Usuário ${subscriber.name} removido da lista!\n👥 Total: ${data.stats.totalSubscribers}`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao remover usuário.'
    };
};

const clearAll = () => {
    const data = loadSubscribers();
    const count = data.subscribers.length;

    data.subscribers = [];
    data.stats.totalSubscribers = 0;

    if (saveSubscribers(data)) {
        return {
            success: true,
            message: `✅ Lista limpa! ${count} inscrito(s) removido(s).`
        };
    }

    return {
        success: false,
        message: '❌ Erro ao limpar lista.'
    };
};

export {
    subscribe,
    unsubscribe,
    isSubscribed,
    getSubscribers,
    getStats,
    incrementMessageCount,
    removeSubscriber,
    clearAll
};
