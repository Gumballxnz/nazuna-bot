/**
 * Download Instagram usando fg-senna (100% gratuito, sem API key)
 * Motor principal: fg-senna (igdl)
 */

import axios from 'axios';

// Lazy-load fg-senna
let _fg = null;
async function getFg() {
    if (!_fg) _fg = (await import('fg-senna')).default;
    return _fg;
}

// Baixar buffer de uma URL
async function downloadBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return Buffer.from(res.data);
}

const COBALT_INSTANCES = [
    'https://api.cobalt.tools/api/json',
    'https://cobalt-api.kwiatusheq.xyz/api/json',
    'https://api.cobalt.club/api/json'
];

async function igdlCobalt(url) {
    const payload = {
        url: url,
        downloadMode: 'auto'
    };

    for (const api of COBALT_INSTANCES) {
        try {
            const response = await axios.post(api, payload, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 15000
            });

            const data = response.data;
            if (!data) continue;

            // Galeria picker
            if (data.status === 'picker' && Array.isArray(data.picker)) {
                const results = [];
                for (const item of data.picker) {
                    try {
                        const mediaUrl = item.url;
                        if (!mediaUrl) continue;
                        const buff = await downloadBuffer(mediaUrl);
                        const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video') || item.type === 'video';
                        results.push({
                            type: isVideo ? 'video' : 'image',
                            buff
                        });
                    } catch (e) {
                        console.error('[igdl-cobalt] Erro ao baixar item do picker:', e.message);
                    }
                }
                if (results.length > 0) {
                    return { ok: true, data: results, count: results.length };
                }
            }

            // Item único
            if (data.url) {
                const buff = await downloadBuffer(data.url);
                const isVideo = data.url.includes('.mp4') || data.url.includes('video') || data.filename?.includes('.mp4') || data.status === 'stream';
                return { ok: true, data: [{ type: isVideo ? 'video' : 'image', buff }], count: 1 };
            }
        } catch (error) {
            console.error(`[igdl-cobalt] Erro na instância ${api}:`, error.message);
        }
    }
    throw new Error('Todas as instâncias de Cobalt falharam.');
}

// Função para baixar post do Instagram
async function igdl(url) {
    // Tenta primeiro o fg-senna
    try {
        const fg = await getFg();
        const res = await fg.igdl(url).catch(() => null);

        if (!res) throw new Error('fg-senna retornou vazio');

        // Galeria (multiplos itens)
        if (res.result && Array.isArray(res.result) && res.result.length > 0) {
            const results = [];
            for (const item of res.result) {
                try {
                    const mediaUrl = item.url || item.dl_url;
                    if (!mediaUrl) continue;
                    const buff = await downloadBuffer(mediaUrl);
                    const isVideo = mediaUrl.includes('.mp4') || item.type === 'video';
                    results.push({
                        type: isVideo ? 'video' : 'image',
                        buff
                    });
                } catch (e) {
                    console.error('[igdl] Erro ao baixar item:', e.message);
                }
            }
            if (results.length > 0) {
                return { ok: true, data: results, count: results.length };
            }
        }

        // Video unico
        if (res.dl_url) {
            const buff = await downloadBuffer(res.dl_url);
            return { ok: true, data: [{ type: 'video', buff }], count: 1 };
        }

        throw new Error('Nenhuma mídia encontrada na resposta');

    } catch (error) {
        console.error('⚠️ igdl (fg-senna) falhou:', error.message, '. Tentando fallback Cobalt...');
        try {
            return await igdlCobalt(url);
        } catch (cobaltError) {
            console.error('❌ igdl final error:', cobaltError.message);
            return {
                ok: false,
                msg: 'Erro ao baixar post do Instagram: ' + cobaltError.message
            };
        }
    }
}

export {
    igdl as dl
};