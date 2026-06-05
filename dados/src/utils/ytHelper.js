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
 * Resolve a URL direta do YouTube e metadados usando a cascata de motores públicos.
 * Útil para Streaming Direto (Buffer Passthrough) sem tocar no disco da VPS.
 * 
 * @param {string} url YouTube URL
 * @param {string} type 'audio' or 'video'
 * @returns {Promise<{dl_url: string, title: string}>}
 */
export async function resolverUrlYT(url, type = 'audio') {
    let dl_url = null;
    let title = 'YouTube';

    // Fase 1: fg-senna (Não depende de IP, usa scrapers web)
    if (motorDisponivel('fg-senna')) {
        try {
            console.log(`[YouTube Resolver] Fase 1: fg-senna (${type})...`);
            const fg = await getFg();
            let res = null;
            if (type === 'audio') {
                if (typeof fg.yta === 'function') res = await fg.yta(url);
                else if (typeof fg.ytmp3 === 'function') res = await fg.ytmp3(url);
                else if (typeof fg.youtube === 'function') res = await fg.youtube(url);
            } else {
                if (typeof fg.ytv === 'function') res = await fg.ytv(url, '720p');
                else if (typeof fg.ytmp4 === 'function') res = await fg.ytmp4(url);
                else if (typeof fg.youtube === 'function') res = await fg.youtube(url);
            }

            if (res && res.dl_url && res.dl_url.startsWith('http')) {
                dl_url = res.dl_url;
                title = res.title || title;
                marcarSucesso('fg-senna');
                console.log(`[YouTube Resolver] ✅ Fase 1 OK: ${title}`);
                return { dl_url, title };
            }
        } catch (e) {
            marcarFalha('fg-senna');
            console.log(`[YouTube Resolver] Fase 1 falhou: ${e.message?.substring(0, 80)}`);
        }
    }

    // Fase 2: Cobalt API (Robusto, datacenter-friendly, pré-transcodificado H.264)
    if (motorDisponivel('cobalt')) {
        try {
            console.log(`[YouTube Resolver] Fase 2: Cobalt API (v10)...`);
            const cobaltApis = [
                'https://api.cobalt.tools/',
                'https://cobalt-api.kwiatusheq.xyz/',
                'https://api.cobalt.club/'
            ];
            for (const api of cobaltApis) {
                try {
                    const cobaltRes = await axios.post(api, {
                        url: url,
                        vCodec: 'h264',
                        vQuality: '720',
                        aFormat: 'mp3',
                        isAudioOnly: type === 'audio'
                    }, {
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0'
                        },
                        timeout: 8000
                    }).then(r => r.data).catch(() => null);

                    if (cobaltRes && cobaltRes.url && cobaltRes.url.startsWith('http')) {
                        dl_url = cobaltRes.url;
                        title = cobaltRes.filename || 'YouTube Video';
                        marcarSucesso('cobalt');
                        console.log(`[YouTube Resolver] ✅ Fase 2 OK (${api})`);
                        return { dl_url, title };
                    }
                } catch (apiErr) {
                    console.log(`[YouTube Resolver] Cobalt API ${api} falhou: ${apiErr.message}`);
                }
            }
        } catch (e) {
            marcarFalha('cobalt');
            console.log(`[YouTube Resolver] Fase 2 falhou: ${e.message?.substring(0, 80)}`);
        }
    }

    // Fase 3: Ryzendesu Fallback
    if (motorDisponivel('ryzendesu')) {
        try {
            console.log(`[YouTube Resolver] Fase 3: Ryzendesu...`);
            let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/${type === 'audio' ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`, { timeout: 8000 }).then(v => v.data).catch(() => null);
            dl_url = rz?.url || rz?.data?.url;
            if (dl_url) {
                title = rz?.title || rz?.data?.title || title;
                marcarSucesso('ryzendesu');
                console.log(`[YouTube Resolver] ✅ Fase 3 OK`);
                return { dl_url, title };
            }
        } catch (e) {
            marcarFalha('ryzendesu');
            console.log(`[YouTube Resolver] Fase 3 falhou: ${e.message?.substring(0, 80)}`);
        }
    }

    // Fase 4: BigAPI
    if (motorDisponivel('bigapi')) {
        try {
            console.log(`[YouTube Resolver] Fase 4: BigAPI...`);
            const endpoint = type === 'audio' ? 'ytmp3' : 'ytmp4';
            let bg = await axios.get(`https://api.bigapi.my.id/api/download/${endpoint}?url=${encodeURIComponent(url)}`, { timeout: 8000 }).then(v => v.data).catch(() => null);
            dl_url = bg?.result?.url || bg?.data?.url || bg?.url;
            if (dl_url) {
                title = bg?.result?.title || title;
                marcarSucesso('bigapi');
                console.log(`[YouTube Resolver] ✅ Fase 4 OK`);
                return { dl_url, title };
            }
        } catch (e) {
            marcarFalha('bigapi');
            console.log(`[YouTube Resolver] Fase 4 falhou: ${e.message?.substring(0, 80)}`);
        }
    }

    // Fase 5: Siputzx
    if (motorDisponivel('siputzx')) {
        try {
            console.log(`[YouTube Resolver] Fase 5: Siputzx...`);
            let sp = await axios.get(`https://api.siputzx.my.id/api/d/youtube?url=${encodeURIComponent(url)}`, { timeout: 8000 }).then(v => v.data).catch(() => null);
            dl_url = sp?.data?.dl || sp?.data?.url;
            if (dl_url) {
                title = sp?.data?.title || title;
                marcarSucesso('siputzx');
                console.log(`[YouTube Resolver] ✅ Fase 5 OK`);
                return { dl_url, title };
            }
        } catch (e) {
            marcarFalha('siputzx');
            console.log(`[YouTube Resolver] Fase 5 falhou: ${e.message?.substring(0, 80)}`);
        }
    }

    throw new Error('Todas as fases de resolução externa falharam.');
}

/**
 * Download from YouTube usando cascata de resolvedores + fallback local
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

        try {
            const resolved = await resolverUrlYT(url, type);
            dl_url = resolved.dl_url;
            title = resolved.title;
        } catch (resolveErr) {
            console.log(`[YouTube Helper] Falha ao resolver URL em cascata externa: ${resolveErr.message}. Tentando yt-dlp local...`);
        }

        // Se falhar na cascata de APIs externas, tenta o yt-dlp local (Fase 6)
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

        if (!dl_url) throw new Error('Todas as fases de download falharam no servidor.');

        // Baixar o arquivo via stream seguro
        console.log(`[YouTube Helper] Efetuando download físico no disco da VPS a partir do resolvedor...`);
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
        
        // Exportando PATH para garantir que encontre o yt-dlp e ffmpeg na VPS
        const cmd = `export PATH=/usr/bin:/usr/local/bin:/usr/sbin:/sbin:/bin:$PATH && yt-dlp --no-playlist --no-warnings --no-check-certificate --extractor-args "youtube:player_client=android,web" -q ${formatArg} -o "${filePath}" "${url}"`;

        console.log(`[YouTube ytdlpLocal] Executando download local da URL: ${url}`);
        exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[YouTube ytdlpLocal] Erro ao executar yt-dlp:`, error.message);
                console.error(`[YouTube ytdlpLocal] Stderr:`, stderr);
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch {}
                }
                return resolve(null);
            }
            if (!fs.existsSync(filePath)) {
                console.error(`[YouTube ytdlpLocal] Download concluído mas arquivo destino não existe: ${filePath}`);
                return resolve(null);
            }
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
