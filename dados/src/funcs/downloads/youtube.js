/**
 * Download e Pesquisa YouTube - 100% Gratuito 
 * Motor: fg-senna + Ryzendesu + Siputzx + yt-dlp (via ytHelper.js)
 */

import { downloadYT, getYTInfo } from '../../utils/ytHelper.js';

// Buscar vídeos no YouTube usando yt-search
async function search(query) {
  try {
    const yts = await import('yt-search');
    const searchFn = yts.default || yts;
    const res = await searchFn(query);

    if (res && res.videos && res.videos.length > 0) {
      return {
        ok: true,
        data: res.videos.slice(0, 10).map(v => ({
          title: v.title,
          url: v.url,
          thumbnail: v.image || v.thumbnail,
          duration: v.timestamp,
          views: v.views,
          ago: v.ago,
          author: v.author?.name || ''
        }))
      };
    }

    return { ok: false, msg: 'Nenhum resultado encontrado.' };
  } catch (error) {
    console.error('Erro na busca YouTube:', error.message);
    return { ok: false, msg: 'Erro ao buscar vídeo: ' + error.message };
  }
}

// Baixar áudio (MP3) via ytHelper
async function mp3(url, quality = 128) {
  try {
    const result = await downloadYT(url, 'audio');
    if (result && result.filePath) {
      return {
        ok: true,
        filePath: result.filePath,
        isFile: true,
        filename: `audio_${Date.now()}_${quality}kbps.mp3`,
        quality: `${quality}kbps`
      };
    }
    return { ok: false, msg: 'Falha ao baixar áudio.' };
  } catch (error) {
    console.error('Erro no download MP3:', error.message);
    return { ok: false, msg: 'Erro ao baixar áudio: ' + error.message };
  }
}

// Baixar vídeo (MP4) via ytHelper
async function mp4(url, quality = 360) {
  try {
    const result = await downloadYT(url, 'video');
    if (result && result.filePath) {
      return {
        ok: true,
        filePath: result.filePath,
        isFile: true,
        filename: `video_${Date.now()}_${quality}p.mp4`,
        quality: `${quality}p`
      };
    }
    return { ok: false, msg: 'Falha ao baixar vídeo.' };
  } catch (error) {
    console.error('Erro no download MP4:', error.message);
    return { ok: false, msg: 'Erro ao baixar vídeo: ' + error.message };
  }
}

export {
  search,
  mp3,
  mp4
};

export const ytmp3 = mp3;
export const ytmp4 = mp4;