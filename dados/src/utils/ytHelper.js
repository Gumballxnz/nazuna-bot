import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

// Lazy-load fg-senna (carrega puppeteer/chromium sob demanda para economizar RAM)
let _fg = null;
async function getFg() {
    if (!_fg) _fg = (await import('fg-senna')).default;
    return _fg;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajustar para a pasta tmp da Nazuna
const TEMP_DIR = path.join(__dirname, '..', 'tmp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

// Circuit breaker simples — pula motores que falharam nos últimos 3 min
const motorFailures = new Map();
const CIRCUIT_COOLDOWN = 3 * 60 * 1000; // 3 minutos

function motorDisponivel(nome) {
    const lastFail = motorFailures.get(nome);
    if (!lastFail) return true;
    return (Date.now() - lastFail) > CIRCUIT_COOLDOWN;
}

function marcarFalha(nome) {
    motorFailures.set(nome, Date.now());
}

function marcarSucesso(nome) {
    motorFailures.delete(nome);
}

/**
 * Download from YouTube usando cascata de 6 motores
 * Ordem de prioridade:
 *   1. fg-senna (scrapers web, não depende de IP)
 *   2. Cobalt API (robusto, funciona em datacenter)
 *   3. Ryzendesu API
 *   4. BigAPI fallback
 *   5. Siputzx API
 *   6. yt-dlp local (último recurso)
 * 
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
        if (!dl_url && motorDisponivel('fg-senna')) {
            try {
                console.log(`[YouTube] Fase 1: fg-senna (${type})...`);
                const fg = await getFg();
                let res = type === 'audio' ? await fg.yta(url) : await fg.ytv(url, '720p');
                if (res && res.dl_url) {
                    dl_url = res.dl_url;
                    title = res.title || title;
                    marcarSucesso('fg-senna');
                    console.log(`[YouTube] ✅ Fase 1 OK: ${title}`);
                }
            } catch (e) {
                marcarFalha('fg-senna');
                console.log(`[YouTube] Fase 1 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 2: Cobalt API (Robusto, funciona em datacenter, sem rate limit agressivo)
        if (!dl_url && motorDisponivel('cobalt')) {
            try {
                console.log(`[YouTube] Fase 2: Cobalt API...`);
                const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
                    url: url,
                    vCodec: 'h264',
                    vQuality: '720',
                    aFormat: 'mp3',
                    isAudioOnly: type === 'audio'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }).then(r => r.data).catch(() => null);

                if (cobaltRes && cobaltRes.url) {
                    dl_url = cobaltRes.url;
                    marcarSucesso('cobalt');
                    console.log(`[YouTube] ✅ Fase 2 OK (Cobalt)`);
                }
            } catch (e) {
                marcarFalha('cobalt');
                console.log(`[YouTube] Fase 2 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 3: Ryzendesu Fallback
        if (!dl_url && motorDisponivel('ryzendesu')) {
            try {
                console.log(`[YouTube] Fase 3: Ryzendesu...`);
                let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/${type === 'audio' ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`, { timeout: 12000 }).then(v => v.data).catch(() => null);
                dl_url = rz?.url || rz?.data?.url;
                if (dl_url) {
                    marcarSucesso('ryzendesu');
                    console.log(`[YouTube] ✅ Fase 3 OK`);
                }
            } catch (e) {
                marcarFalha('ryzendesu');
                console.log(`[YouTube] Fase 3 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 4: BigAPI (Alternativa)
        if (!dl_url && motorDisponivel('bigapi')) {
            try {
                console.log(`[YouTube] Fase 4: BigAPI...`);
                const endpoint = type === 'audio' ? 'ytmp3' : 'ytmp4';
                let bg = await axios.get(`https://api.bigapi.my.id/api/download/${endpoint}?url=${encodeURIComponent(url)}`, { timeout: 12000 }).then(v => v.data).catch(() => null);
                dl_url = bg?.result?.url || bg?.data?.url || bg?.url;
                if (dl_url) {
                    marcarSucesso('bigapi');
                    console.log(`[YouTube] ✅ Fase 4 OK (BigAPI)`);
                }
            } catch (e) {
                marcarFalha('bigapi');
                console.log(`[YouTube] Fase 4 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 5: Siputzx
        if (!dl_url && motorDisponivel('siputzx')) {
            try {
                console.log(`[YouTube] Fase 5: Siputzx...`);
                let sp = await axios.get(`https://api.siputzx.my.id/api/d/youtube?url=${encodeURIComponent(url)}`, { timeout: 12000 }).then(v => v.data).catch(() => null);
                dl_url = sp?.data?.dl || sp?.data?.url;
                if (dl_url) {
                    marcarSucesso('siputzx');
                    console.log(`[YouTube] ✅ Fase 5 OK`);
                }
            } catch (e) {
                marcarFalha('siputzx');
                console.log(`[YouTube] Fase 5 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        // Fase 6: yt-dlp (Último recurso - provavelmente falha em datacenter)
        if (!dl_url) {
            try {
                console.log(`[YouTube] Fase 6: yt-dlp (último recurso)...`);
                const dlpRes = await ytdlpLocal(url, type);
                if (dlpRes && dlpRes.filePath) {
                    const stats = fs.statSync(dlpRes.filePath);
                    if (stats.size > 1000) {
                        console.log(`[YouTube] ✅ Fase 6 OK via yt-dlp`);
                        return { filePath: dlpRes.filePath, title: dlpRes.title || title, size: stats.size };
                    }
                }
            } catch (e) {
                console.log(`[YouTube] Fase 6 falhou: ${e.message?.substring(0, 80)}`);
            }
        }

        if (!dl_url) throw new Error('Todas as 6 fases falharam. Nenhum motor conseguiu baixar.');

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
 * yt-dlp wrapper local (rebaixado para Fase 6)
 * Usa extractor-args para Android client que tem menos bloqueios
 */
function ytdlpLocal(url, type) {
    return new Promise((resolve) => {
        const id = Date.now();
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const filePath = path.join(TEMP_DIR, `yt_dlp_${id}.${ext}`);
        const formatArg = type === 'audio'
            ? '-x --audio-format mp3 --audio-quality 0'
            : '-f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        const cmd = `yt-dlp --no-playlist --no-warnings --no-check-certificate --extractor-args "youtube:player_client=android,web" -q ${formatArg} -o "${filePath}" "${url}"`;

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
        const fg = await getFg();
        let res = await fg.yta(url);
        return res;
    } catch (e) {
        return { title: 'video' };
    }
}
