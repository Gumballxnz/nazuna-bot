import axios from 'axios';

const CONFIG = {
    API: {
        BASE_URL: 'https://tenor.googleapis.com/v2',
        KEY: "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ",
        DEFAULT_PARAMS: {
            contentfilter: 'high',
            media_filter: 'png_transparent',
            component: 'proactive',
            collection: 'emoji_kitchen_v5',
        },
    },
    RETRY: {
        MAX_ATTEMPTS: 3,
        DELAY_MS: 1000,
    },
};

class EmojiMixError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EmojiMixError';
    }
}

class TenorClient {
    constructor(apiKey) {
        if (!apiKey) {
            throw new EmojiMixError('Chave da API Tenor não configurada. Verifique suas variáveis de ambiente.');
        }

        this.api = axios.create({
            baseURL: CONFIG.API.BASE_URL,
            params: {
                key: apiKey,
                ...CONFIG.API.DEFAULT_PARAMS,
            },
        });
    }

    async fetchMix(emoji1, emoji2) {
        const query = `${emoji1}_${emoji2}`;

        for (let attempt = 1; attempt <= CONFIG.RETRY.MAX_ATTEMPTS; attempt++) {
            try {
                const response = await this.api.get('/featured', {
                    params: { q: query },
                });

                if (!response.data?.results?.length) {
                    throw new EmojiMixError('Combinação de emojis não disponível.');
                }

                return response.data.results.map(result => result.url);
            } catch (error) {

                if (error.response?.status === 429 && attempt < CONFIG.RETRY.MAX_ATTEMPTS) {
                    console.warn(`[EmojiMix] Rate limit atingido. Tentando novamente em ${attempt}s...`);
                    await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY.DELAY_MS * attempt));
                } else {

                    throw new EmojiMixError(`Erro ao buscar emojis: ${error.message}`);
                }
            }
        }
    }
}

const client = new TenorClient(CONFIG.API.KEY);

async function emojiMix(emoji1, emoji2) {
    try {
        const urls = await client.fetchMix(emoji1, emoji2);

        return urls[Math.floor(Math.random() * urls.length)];
    } catch (error) {
        console.error(`[Erro Final] ${error.message}`);

        throw error;
    }
}

export default emojiMix;
