/**
 * Download Instagram usando Pool Dinâmico de Cobalt, fg-senna e APIs de alta velocidade
 */

import axios from 'axios';
import { getCobaltApis } from '../../utils/ytHelper.js';

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

async function igdlCobalt(url) {
    const payload = {
        url: url,
        downloadMode: 'auto'
    };

    const apis = getCobaltApis ? getCobaltApis() : [
        'https://cobalt.api.scity.gov.mn',
        'https://co.wuk.sh',
        'https://nuko-c.meowing.de',
        'https://subito-c.meowing.de',
        'https://melon.clxxped.lol',
        'https://api-cobalt.eversiege.network'
    ];

    for (const api of apis.slice(0, 6)) {
        try {
            const response = await axios.post(api, payload, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
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
            // Próxima instância
        }
    }
    throw new Error('Todas as instâncias de Cobalt falharam.');
}

async function igdlInstaVideoSave(url) {
    try {
        const response = await axios.post('https://www.instavideosave.net/api/instagram', {
            url: url
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 12000
        });

        const json = response.data;
        const mediaUrl = json?.data?.[0]?.url || json?.data?.url || json?.url || json?.result?.[0]?.url;
        if (mediaUrl) {
            const buff = await downloadBuffer(mediaUrl);
            const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video');
            return { ok: true, data: [{ type: isVideo ? 'video' : 'image', buff }], count: 1 };
        }
    } catch (e) {}
    throw new Error('API instavideosave falhou.');
}

// Função para baixar post do Instagram
async function igdl(url) {
    // 1. Tenta Cobalt (Mais rápido e suporta múltiplas instâncias)
    try {
        const resCobalt = await igdlCobalt(url);
        if (resCobalt && resCobalt.ok) return resCobalt;
    } catch (_) {}

    // 2. Tenta fg-senna
    try {
        const fg = await getFg();
        const res = await fg.igdl(url).catch(() => null);

        if (res) {
            // Galeria (múltiplos itens)
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
                    } catch (e) {}
                }
                if (results.length > 0) {
                    return { ok: true, data: results, count: results.length };
                }
            }

            // Vídeo/imagem único
            const dlUrl = res.dl_url || res.url;
            if (dlUrl) {
                const buff = await downloadBuffer(dlUrl);
                const isVideo = dlUrl.includes('.mp4') || res.type === 'video' || !res.thumb;
                return { ok: true, data: [{ type: isVideo ? 'video' : 'image', buff }], count: 1 };
            }
        }
    } catch (_) {}

    // 3. Tenta InstaVideoSave API
    try {
        const resInsta = await igdlInstaVideoSave(url);
        if (resInsta && resInsta.ok) return resInsta;
    } catch (_) {}

    return {
        ok: false,
        msg: 'Não foi possível baixar mídia do Instagram.'
    };
}

export {
    igdl as dl
};