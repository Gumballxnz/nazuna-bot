import path from 'path';
import fs from 'fs';
import axios from 'axios';
import fg from 'fg-senna';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajustar para a pasta tmp da Nazuna
const TEMP_DIR = path.join(__dirname, '..', 'tmp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

/**
 * Download from YouTube using fg-senna bypass (Prioridade Máxima)
 * O yt-dlp é rebaixado para último recurso porque o YouTube bloqueia IPs de datacenter.
 * @param {string} url YouTube URL
 * @param {string} type 'audio' or 'video'
 * @returns {Promise<{filePath: string, title: string, size: number}>}
 */
export async function downloadYT(url, type = 'audio') {
    const filename = `yt_${Date.now()}.${type === 'audio' ? 'mp3' : 'mp4'}`
    const filePath = path.join(TEMP_DIR, filename)

    try {
        let dl_url = null;
        let title = 'YouTube';

        // Fase 1: fg-senna (Motor Principal - Não depende de IP, usa scrapers web)
        try {
            console.log(`[YouTube] Fase 1: fg-senna (${type})...`);
            let res = type === 'audio' ? await fg.yta(url) : await fg.ytv(url, '720p');
            if (res && res.dl_url) {
                dl_url = res.dl_url;
                title = res.title || title;
                console.log(`[YouTube] ✅ Fase 1 OK: ${title}`);
            }
        } catch (e) {
            console.log(`[YouTube] Fase 1 falhou: ${e.message?.substring(0, 80)}`);
        }

        // Fase 2: Ryzendesu Fallback
        if (!dl_url) {
            try {
                console.log(`[YouTube] Fase 2: Ryzendesu...`);
                let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/${type === 'audio' ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`, { timeout: 20000 }).then(v => v.data).catch(() => null);
                dl_url = rz?.url || rz?.data?.url;
                if (dl_url) console.log(`[YouTube] ✅ Fase 2 OK`);
            } catch (e) {
                console.log(`[YouTube] Fase 2 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 3: Siputzx (Último fallback de API)
        if (!dl_url) {
            try {
                console.log(`[YouTube] Fase 3: Siputzx...`);
                let sp = await axios.get(`https://api.siputzx.my.id/api/d/youtube?url=${encodeURIComponent(url)}`, { timeout: 20000 }).then(v => v.data).catch(() => null);
                dl_url = sp?.data?.dl || sp?.data?.url;
                if (dl_url) console.log(`[YouTube] ✅ Fase 3 OK`);
            } catch (e) {
                console.log(`[YouTube] Fase 3 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 4: yt-dlp (Último recurso - provavelmente falha em datacenter)
        if (!dl_url) {
            try {
                console.log(`[YouTube] Fase 4: yt-dlp (último recurso)...`);
                const dlpRes = await ytdlpLocal(url, type);
                if (dlpRes && dlpRes.filePath) {
                    const stats = fs.statSync(dlpRes.filePath);
                    if (stats.size > 1000) {
                        console.log(`[YouTube] ✅ Fase 4 OK via yt-dlp`);
                        return { filePath: dlpRes.filePath, title: dlpRes.title || title, size: stats.size };
                    }
                }
            } catch (e) {
                console.log(`[YouTube] Fase 4 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        if (!dl_url) throw new Error('Todas as 4 fases falharam. Nenhum motor conseguiu baixar.');

        // Baixar o arquivo via stream seguro
        let dl = await axios({ method: 'get', url: dl_url, responseType: 'stream', timeout: 120000 });
        if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);

        await pipeline(dl.data, fs.createWriteStream(filePath));

        let stats = fs.statSync(filePath);
        if (stats.size < 100) throw new Error('Arquivo baixado é muito pequeno ou vazio.');

        return { filePath, title, size: stats.size };
    } catch (e) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error(`[YouTube Helper] ERRO FINAL: ${e.message}`);
        throw e;
    }
}

/**
 * yt-dlp wrapper local (rebaixado para Fase 4)
 */
function ytdlpLocal(url, type) {
    return new Promise((resolve) => {
        const id = Date.now();
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const filePath = path.join(TEMP_DIR, `yt_dlp_${id}.${ext}`);
        const formatArg = type === 'audio'
            ? '-x --audio-format mp3 --audio-quality 0'
            : '-f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        const cmd = `yt-dlp --no-playlist --no-warnings --no-check-certificate -q ${formatArg} -o "${filePath}" "${url}"`;

        exec(cmd, { timeout: 60000 }, (error) => {
            if (error || !fs.existsSync(filePath)) return resolve(null);
            resolve({ filePath, title: 'YouTube' });
        });
    });
}

/**
 * Get video info
 */
export async function getYTInfo(url) {
    try {
        let res = await fg.yta(url);
        return res;
    } catch (e) {
        return { title: 'video' };
    }
}
