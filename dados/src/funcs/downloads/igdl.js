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

// Função para baixar post do Instagram
async function igdl(url) {
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
        console.error('❌ igdl error:', error.message);
        return {
            ok: false,
            msg: 'Erro ao baixar post do Instagram: ' + error.message
        };
    }
}

export {
    igdl as dl
};