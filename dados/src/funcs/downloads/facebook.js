/**
 * Download Facebook - 100% Gratuito 
 * Motor: yt-dlp nativo
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const tmpDir = path.join(process.cwd(), 'tmp');

/**
 * Faz download de vídeo do Facebook em HD
 * @param {string} url - URL do vídeo do Facebook
 * @returns {Promise<Object>} Dados do download
 */
async function downloadHD(url) {
  const id = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const filePath = path.join(tmpDir, `fb_cmd_${id}.mp4`);
  try {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const cmd = `export PATH=/usr/bin:/usr/local/bin:$PATH && yt-dlp --no-playlist --no-warnings --no-check-certificate -f "b[vcodec^=avc]/b[vcodec^=h264]/hd/sd/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" --merge-output-format mp4 -o "${filePath}" "${url}"`;
    await execAsync(cmd, { timeout: 120000 });

    let finalPath = filePath;
    if (!fs.existsSync(finalPath)) {
      const found = fs.readdirSync(tmpDir).find(f => f.startsWith(`fb_cmd_${id}`));
      if (found) finalPath = path.join(tmpDir, found);
    }

    if (fs.existsSync(finalPath)) {
      const buffer = fs.readFileSync(finalPath);
      try { fs.unlinkSync(finalPath); } catch {}
      return {
        ok: true,
        buffer,
        resolution: 'HD',
        filename: 'facebook_video_hd.mp4',
        allQualities: []
      };
    }
    return { ok: false, msg: 'Vídeo não foi gerado pelo yt-dlp.' };
  } catch (error) {
    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
    console.error('[Facebook downloadHD error]:', error.message);
    return { ok: false, msg: error.message || 'Erro ao baixar do Facebook' };
  }
}

export default {
  downloadHD
};
