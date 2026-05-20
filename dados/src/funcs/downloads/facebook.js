/**
 * Download Facebook - 100% Gratuito 
 * Motor: yt-dlp + APIs públicas (Siputzx, Ryzendesu) + fg-senna
 */

import axios from 'axios';

// Lazy-load fg-senna
let _fg = null;
async function getFg() {
    if (!_fg) _fg = (await import('fg-senna')).default;
    return _fg;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Faz download de vídeo do Facebook em HD
 * @param {string} url - URL do vídeo do Facebook
 * @returns {Promise<Object>} Dados do download
 */
async function downloadHD(url) {
  try {
    // Motor 1: Siputzx
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
      }).then(v => v.data).catch(() => null);

      const link = res?.data?.url || res?.data?.hd || res?.data?.sd;
      if (link) {
        const videoResponse = await axios.get(link, {
          responseType: 'arraybuffer',
          timeout: 180000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(videoResponse.data),
          resolution: 'HD',
          filename: `facebook_video_hd.mp4`
        };
      }
    } catch (e) {
      console.error('[Facebook] Motor 1 (Siputzx) falhou:', e.message);
    }

    // Motor 2: Ryzendesu
    try {
      const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
      }).then(v => v.data).catch(() => null);

      const link = res?.url || res?.data?.url || res?.result?.url_hd || res?.result?.url_sd;
      if (link) {
        const videoResponse = await axios.get(link, {
          responseType: 'arraybuffer',
          timeout: 180000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(videoResponse.data),
          resolution: 'HD',
          filename: `facebook_video_hd.mp4`
        };
      }
    } catch (e) {
      console.error('[Facebook] Motor 2 (Ryzendesu) falhou:', e.message);
    }

    // Motor 3: fg-senna
    try {
      const fg = await getFg();
      const res = await fg.fbdl(url);
      if (res && (res.HD || res.SD)) {
        const link = res.HD || res.SD;
        const videoResponse = await axios.get(link, {
          responseType: 'arraybuffer',
          timeout: 180000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(videoResponse.data),
          resolution: res.HD ? 'HD' : 'SD',
          filename: `facebook_video.mp4`
        };
      }
    } catch (e) {
      console.error('[Facebook] Motor 3 (fg-senna) falhou:', e.message);
    }

    return {
      ok: false,
      msg: 'Não foi possível baixar o vídeo do Facebook. Verifique se o link está correto.'
    };
  } catch (error) {
    console.error('Erro no download do Facebook:', error);

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return { ok: false, msg: 'Timeout ao baixar o vídeo. O arquivo pode ser muito grande.' };
    }

    return { ok: false, msg: error.message || 'Erro ao baixar do Facebook' };
  }
}

export default {
  downloadHD
};
