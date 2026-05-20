/**
 * Download Spotify - 100% Gratuito 
 * Motor: Siputzx + Ryzendesu + yt-dlp (via busca YouTube)
 */

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Faz download direto de uma música do Spotify via URL
 * @param {string} url - URL do track do Spotify
 * @returns {Promise<Object>} Dados do download
 */
async function download(url) {
  try {
    // Motor 1: Siputzx
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      const link = res?.data?.url || res?.data?.dl || res?.data?.downloadUrl;
      if (link) {
        const audioResponse = await axios.get(link, { responseType: 'arraybuffer', timeout: 120000 });
        return {
          ok: true,
          buffer: Buffer.from(audioResponse.data),
          title: res?.data?.title || 'Spotify',
          artists: res?.data?.artists ? [res.data.artists] : ['Desconhecido'],
          albumImage: res?.data?.thumbnail || res?.data?.image || '',
          filename: `${res?.data?.title || 'spotify'}.mp3`
        };
      }
    } catch (e) {
      console.error('[Spotify] Motor 1 falhou:', e.message);
    }

    // Motor 2: Ryzendesu
    try {
      const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/spotify?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      const link = res?.url || res?.data?.url;
      if (link) {
        const audioResponse = await axios.get(link, { responseType: 'arraybuffer', timeout: 120000 });
        return {
          ok: true,
          buffer: Buffer.from(audioResponse.data),
          title: res?.title || res?.data?.title || 'Spotify',
          artists: [res?.artist || res?.data?.artist || 'Desconhecido'],
          filename: `${res?.title || 'spotify'}.mp3`
        };
      }
    } catch (e) {
      console.error('[Spotify] Motor 2 falhou:', e.message);
    }

    return { ok: false, msg: 'Não foi possível baixar a música do Spotify.' };
  } catch (error) {
    console.error('Erro no download do Spotify:', error);
    return { ok: false, msg: error.message || 'Erro ao baixar do Spotify' };
  }
}

/**
 * Busca e download - placeholder que delega ao download direto
 */
async function searchDownload(query) {
  return { ok: false, msg: 'Use o comando !play para buscar músicas ou envie um link do Spotify.' };
}

export default {
  download,
  searchDownload
};
