/**
 * Download Streamable - 100% Gratuito 
 * Motor: API pública do Streamable (scraping JSON)
 */

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Baixa vídeo do Streamable usando a API pública
 * @param {string} url - URL do vídeo do Streamable
 * @returns {Promise<Object>} Objeto com sucesso, buffer e informações do vídeo
 */
export async function download(url) {
  try {
    // Extrair o shortcode da URL (ex: https://streamable.com/abc123 → abc123)
    const match = url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
    if (!match) {
      return { ok: false, message: 'URL do Streamable inválida.' };
    }
    const shortcode = match[1];

    // API pública do Streamable (não precisa de key)
    const res = await axios.get(`https://api.streamable.com/videos/${shortcode}`, {
      headers: { 'User-Agent': UA },
      timeout: 15000
    }).catch(() => null);

    if (res?.data?.files) {
      // Pegar a melhor qualidade disponível
      const files = res.data.files;
      const best = files['mp4-mobile'] || files['mp4'] || Object.values(files)[0];

      if (best?.url) {
        const videoUrl = best.url.startsWith('//') ? `https:${best.url}` : best.url;
        const fileResponse = await axios.get(videoUrl, {
          responseType: 'arraybuffer', timeout: 180000,
          maxContentLength: Infinity, maxBodyLength: Infinity
        });

        return {
          ok: true,
          buffer: Buffer.from(fileResponse.data),
          title: res.data.title || 'Streamable',
          thumbnail: res.data.thumbnail_url || '',
          duration: best.duration || 0,
          width: best.width,
          height: best.height,
          filename: `streamable_${shortcode}.mp4`
        };
      }
    }

    // Fallback: Siputzx
    try {
      const sipRes = await axios.get(`https://api.siputzx.my.id/api/d/streamable?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 30000
      }).then(v => v.data).catch(() => null);

      const link = sipRes?.data?.url || sipRes?.data?.dl;
      if (link) {
        const fileResponse = await axios.get(link, {
          responseType: 'arraybuffer', timeout: 180000,
          maxContentLength: Infinity, maxBodyLength: Infinity
        });
        return {
          ok: true,
          buffer: Buffer.from(fileResponse.data),
          title: sipRes?.data?.title || 'Streamable',
          filename: `streamable_${Date.now()}.mp4`
        };
      }
    } catch (e) {
      console.error('[Streamable] Fallback falhou:', e.message);
    }

    return { ok: false, message: 'Não foi possível baixar o vídeo do Streamable.' };
  } catch (error) {
    console.error('Erro ao baixar do Streamable:', error);
    return { ok: false, message: error.message || 'Erro ao processar a solicitação.' };
  }
}

export default { download };
