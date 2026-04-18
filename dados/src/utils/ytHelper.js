import path from 'path';
import fs from 'fs';
import axios from 'axios';
import fg from 'fg-senna';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

// Importação dinâmica para evitar circular dependency se necessário, ou apenas usar via exec direta
const ytdlp = async (url, type) => {
    return new Promise((resolve) => {
        const id = Date.now();
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const tmpDir = path.join(process.cwd(), 'dados', 'src', 'tmp');
        const filePath = path.join(tmpDir, `yt_dlp_${id}.${ext}`);
        const formatArg = type === 'audio' ? '-x --audio-format mp3 --audio-quality 0' : '-f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        const cmd = `yt-dlp --no-playlist --no-warnings --no-check-certificate -q ${formatArg} -o "${filePath}" "${url}"`;
        
        exec(cmd, { timeout: 120000 }, (error) => {
            if (error || !fs.existsSync(filePath)) return resolve(null);
            resolve({ filePath, title: 'YouTube' });
        });
    });
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajustar para a pasta tmp da Nazuna
const TEMP_DIR = path.join(__dirname, '..', 'tmp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

/**
 * Download from YouTube using fg-senna bypass
 * @param {string} url YouTube URL
 * @param {string} type 'audio' or 'video'
 * @returns {Promise<{filePath: string, title: string, size: number}>}
 */
export async function downloadYT(url, type = 'audio') {
    const filename = `yt_${Date.now()}.${type === 'audio' ? 'mp3' : 'mp4'}`
    const filePath = path.join(TEMP_DIR, filename)

    try {
        // Fase 1: Motor Direct (yt-dlp) - Alta Qualidade
        const dlpRes = await ytdlp(url, type);
        if (dlpRes && dlpRes.filePath) {
            const stats = fs.statSync(dlpRes.filePath);
            if (stats.size > 1000) {
                return { filePath: dlpRes.filePath, title: dlpRes.title, size: stats.size };
            }
        }

        // Fase 2: APIs Cascade
        let res = type === 'audio' ? await fg.yta(url).catch(() => null) : await fg.ytv(url).catch(() => null)
        let dl_url = res?.dl_url

        if (!dl_url) {
            // Fallback 1: Ryzendesu
            let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/${type === 'audio' ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`).then(v=>v.data).catch(()=>null)
            dl_url = rz?.url || rz?.data?.url
        }

        if (!dl_url) {
            // Fallback 2: Siputzx (mesma API do FB)
            let sp = await axios.get(`https://api.siputzx.my.id/api/d/youtube?url=${encodeURIComponent(url)}`).then(v=>v.data).catch(()=>null)
            dl_url = sp?.data?.dl || sp?.data?.url
        }

        if (!dl_url) throw new Error('Não foi possível gerar link de download em nenhum motor.')

        let dl = await axios({ method: 'get', url: dl_url, responseType: 'stream' });
        if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`)
        
        await pipeline(dl.data, fs.createWriteStream(filePath))
        
        let stats = fs.statSync(filePath)
        if (stats.size < 100) throw new Error('Arquivo baixado é muito pequeno ou vazio.')

        return {
            filePath,
            title: res?.title || filename,
            size: stats.size
        }
    } catch (e) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        console.error(`[YouTube Helper] ${e.message}`)
        throw e
    }
}

/**
 * Get video info
 */
export async function getYTInfo(url) {
    try {
        let res = await fg.yta(url)
        return res
    } catch (e) {
        return { title: 'video' }
    }
}
