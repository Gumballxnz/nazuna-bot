/**
 * Download Universal (AllDL) - 100% Gratuito 
 * Motor: Siputzx + Ryzendesu
 * 
 * Suporta múltiplas plataformas de vídeo e áudio automaticamente
 */

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Extrai todos os formatos de mídia disponíveis de uma URL
 * @param {string} url - URL de qualquer plataforma suportada
 * @returns {Promise<Object>} Objeto com metadata e todos os formatos disponíveis
 */
export async function getAllMedia(url) {
  try {
    // Motor 1: Siputzx (alldl genérico)
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/alldl?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      if (res?.data) {
        const media = [];
        if (res.data.url) {
          media.push({
            url: res.data.url,
            type: res.data.url.includes('.mp4') ? 'video' : 'audio',
            quality: 'default'
          });
        }
        if (res.data.hd) media.push({ url: res.data.hd, type: 'video', quality: 'HD' });
        if (res.data.sd) media.push({ url: res.data.sd, type: 'video', quality: 'SD' });

        if (media.length > 0) {
          return {
            ok: true,
            metadata: { title: res.data.title || '', thumbnail: res.data.thumbnail || '' },
            media: media,
            totalItems: media.length,
            videoCount: media.filter(m => m.type === 'video').length,
            audioCount: media.filter(m => m.type === 'audio').length,
            imageCount: 0
          };
        }
      }
    } catch (e) {
      console.error('[AllDL] Motor 1 falhou:', e.message);
    }

    return { ok: false, message: 'Não foi possível extrair mídia desta URL.' };
  } catch (error) {
    console.error('Erro ao buscar formatos de mídia:', error);
    return { ok: false, message: error.message || 'Erro ao processar a solicitação.' };
  }
}

/**
 * Baixa um formato específico de mídia
 * @param {string} mediaUrl - URL direta da mídia
 * @param {string} type - Tipo de mídia (video, audio, image)
 * @returns {Promise<Object>} Buffer do arquivo baixado
 */
export async function downloadMedia(mediaUrl, type = 'video') {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const buffer = Buffer.from(response.data);
    return { ok: true, buffer, size: buffer.length };
  } catch (error) {
    console.error('Erro ao baixar mídia:', error);
    return { ok: false, message: 'Erro ao baixar o arquivo.' };
  }
}

export default { getAllMedia, downloadMedia };
