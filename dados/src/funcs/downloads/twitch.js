/**
 * Download Twitch - 100% Gratuito 
 * Motor: Siputzx + Ryzendesu
 */

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function download(url) {
  try {
    // Motor 1: Siputzx
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/twitch?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      const link = res?.data?.url || res?.data?.dl;
      if (link) {
        const videoResponse = await axios.get(link, {
          responseType: 'arraybuffer', timeout: 180000,
          maxContentLength: Infinity, maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(videoResponse.data),
          title: res?.data?.title || 'Twitch Clip',
          streamer: res?.data?.streamer || '',
          filename: `twitch_${Date.now()}.mp4`
        };
      }
    } catch (e) {
      console.error('[Twitch] Motor 1 falhou:', e.message);
    }

    return { ok: false, msg: 'Não foi possível baixar o clip/VOD do Twitch.' };
  } catch (error) {
    console.error('Erro no download do Twitch:', error);
    return { ok: false, msg: error.message || 'Erro ao baixar do Twitch' };
  }
}

export default { download };
