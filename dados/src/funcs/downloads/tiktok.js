/**
 * Download e Pesquisa TikTok - 100% Gratuito 
 * Motor: APIs públicas (Siputzx, Ryzendesu) + fg-senna
 */

import axios from 'axios';

// Lazy-load fg-senna
let _fg = null;
async function getFg() {
    if (!_fg) _fg = (await import('fg-senna')).default;
    return _fg;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Pesquisar vídeos no TikTok
async function tiktokSearch(query) {
  try {
    // Motor 1: fg-senna (ttsearch)
    try {
      const fg = await getFg();
      const res = await fg.ttsearch(query);
      if (res && res.result && Array.isArray(res.result) && res.result.length > 0) {
        return {
          ok: true,
          data: res.result.map(v => ({
            title: v.title || v.desc || '',
            url: v.play || v.url || '',
            thumbnail: v.cover || v.thumbnail || '',
            author: v.author || ''
          })).filter(v => v.url)
        };
      }
    } catch (e) {
      console.error('[TikTok Search] fg-senna falhou:', e.message);
    }

    return { ok: false, msg: 'Nenhum resultado encontrado.' };
  } catch (error) {
    console.error('Erro na pesquisa TikTok:', error.message);
    return { ok: false, msg: 'Erro ao pesquisar vídeo: ' + error.message };
  }
}

// Baixar vídeo do TikTok
async function tiktokDownload(url) {
  try {
    const fg = await getFg();
    const res = await fg.tiktok(url);
    if (res && res.result) {
      const d = res.result;
      if (d.type === 'image' && d.images) {
        return { ok: true, title: d.title || 'TikTok', urls: d.images, type: 'image', mime: 'image/jpeg' };
      }
      if (d.play) {
        return { ok: true, title: d.title || 'TikTok', urls: [d.play], type: 'video', mime: 'video/mp4' };
      }
    }

    return { ok: false, msg: 'Falha ao baixar vídeo do TikTok via fg-senna.' };
  } catch (error) {
    console.error('Erro no download TikTok:', error.message);
    return { ok: false, msg: 'Erro ao baixar vídeo: ' + error.message };
  }
}

export {
  tiktokSearch as search,
  tiktokDownload as dl
};