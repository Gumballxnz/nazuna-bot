/**
 * Download Dailymotion - 100% Gratuito 
 * Motor: Siputzx + Ryzendesu
 */

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Baixa vídeo do Dailymotion
 * @param {string} url - URL do vídeo do Dailymotion
 * @returns {Promise<Object>} Objeto com sucesso, buffer e informações do vídeo
 */
export async function download(url) {
  try {
    // Motor 1: Siputzx
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/dailymotion?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      const link = res?.data?.url || res?.data?.dl;
      if (link) {
        const fileResponse = await axios.get(link, {
          responseType: 'arraybuffer', timeout: 180000,
          maxContentLength: Infinity, maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(fileResponse.data),
          title: res?.data?.title || 'Dailymotion',
          thumbnail: res?.data?.thumbnail || '',
          filename: `dailymotion_${Date.now()}.mp4`
        };
      }
    } catch (e) {
      console.error('[Dailymotion] Motor 1 falhou:', e.message);
    }

    // Motor 2: Ryzendesu
    try {
      const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/dailymotion?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      const link = res?.url || res?.data?.url;
      if (link) {
        const fileResponse = await axios.get(link, {
          responseType: 'arraybuffer', timeout: 180000,
          maxContentLength: Infinity, maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(fileResponse.data),
          title: res?.title || res?.data?.title || 'Dailymotion',
          filename: `dailymotion_${Date.now()}.mp4`
        };
      }
    } catch (e) {
      console.error('[Dailymotion] Motor 2 falhou:', e.message);
    }

    return { ok: false, message: 'Não foi possível baixar o vídeo do Dailymotion.' };
  } catch (error) {
    console.error('Erro ao baixar do Dailymotion:', error);
    return { ok: false, message: error.message || 'Erro ao processar a solicitação.' };
  }
}

export default { download };
