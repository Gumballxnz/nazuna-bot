import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Lazy-load fg-senna (carrega sob demanda para economizar RAM)
let _fg = null;
async function getFg() {
    if (!_fg) _fg = (await import('fg-senna')).default;
    return _fg;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta temporária da Nazuna
const TEMP_DIR = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let COBALT_APIS = [
    'https://cobalt.api.scity.gov.mn',
    'https://co.wuk.sh',
    'https://nuko-c.meowing.de',
    'https://subito-c.meowing.de',
    'https://melon.clxxped.lol',
    'https://api-cobalt.eversiege.network',
    'https://api.qwkuns.me',
    'https://kitty.tame.gg'
];

export async function refreshCobaltApis() {
    try {
        const res = await axios.get('https://cobalt.directory/api/working?type=api', {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 6000
        });
        const list = res.data?.data?.youtube || res.data?.data?.general;
        if (Array.isArray(list) && list.length > 0) {
            COBALT_APIS = [...new Set([...list, ...COBALT_APIS])];
        }
    } catch (_) {
        try {
            const res2 = await axios.get('https://instances.hyper.lol/instances.json', {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 6000
            });
            if (Array.isArray(res2.data)) {
                const active = res2.data.filter(i => i.api && i.online).map(i => i.api);
                if (active.length > 0) {
                    COBALT_APIS = [...new Set([...active, ...COBALT_APIS])];
                }
            }
        } catch (_) {}
    }
}
refreshCobaltApis().catch(() => {});
setInterval(() => refreshCobaltApis().catch(() => {}), 30 * 60 * 1000);

export function getCobaltApis() {
    return COBALT_APIS;
}

function cleanMediaUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        let u = new URL(rawUrl.trim());
        if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
            if (u.searchParams.has('v')) {
                const v = u.searchParams.get('v');
                return `https://www.youtube.com/watch?v=${v}`;
            } else if (u.hostname.includes('youtu.be')) {
                const id = u.pathname.replace('/', '');
                if (id) return `https://www.youtube.com/watch?v=${id}`;
            }
        }
        return rawUrl.trim().split('?')[0] || rawUrl.trim();
    } catch (e) {
        return rawUrl.trim();
    }
}

// Circuit breaker simples
const motorFailures = new Map();
const CIRCUIT_COOLDOWN = 2 * 60 * 1000;

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
 * Resolve a URL direta do YouTube e metadados usando fg-senna e Cobalt API.
 */
export async function resolverUrlYT(url, type = 'audio') {
    const targetUrl = cleanMediaUrl(url);
    let dl_url = null;
    let title = 'YouTube';

    // Fase 1: fg-senna (Scraper de alta velocidade)
    if (motorDisponivel('fg-senna')) {
        try {
            console.log(`[YouTube Resolver] Fase 1: fg-senna (${type})...`);
            const fg = await getFg();
            let res = null;
            if (type === 'audio') {
                if (typeof fg.yta === 'function') res = await fg.yta(targetUrl);
                else if (typeof fg.ytmp3 === 'function') res = await fg.ytmp3(targetUrl);
            } else {
                if (typeof fg.ytv === 'function') res = await fg.ytv(targetUrl, '720p');
                else if (typeof fg.ytmp4 === 'function') res = await fg.ytmp4(targetUrl);
            }

            if (res && res.dl_url && res.dl_url.startsWith('http')) {
                dl_url = res.dl_url;
                title = res.title || title;
                marcarSucesso('fg-senna');
                console.log(`[YouTube Resolver] ✅ Fase 1 OK via fg-senna: ${title}`);
                return { dl_url, title };
            }
        } catch (e) {
            marcarFalha('fg-senna');
            console.log(`[YouTube Resolver] Fase 1 (fg-senna) falhou: ${e.message?.substring(0, 80)}`);
        }
    }

    // Fase 2: Cobalt API (Pool dinâmico de instâncias ativas)
    if (motorDisponivel('cobalt')) {
        try {
            console.log(`[YouTube Resolver] Fase 2: Cobalt API...`);
            const payload = type === 'audio' ? {
                url: targetUrl,
                videoQuality: '720',
                downloadMode: 'audio',
                audioFormat: 'mp3'
            } : {
                url: targetUrl,
                videoQuality: '720'
            };

            const promises = COBALT_APIS.slice(0, 6).map(async (api) => {
                try {
                    const response = await axios.post(api, payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'User-Agent': USER_AGENT
                        },
                        timeout: 9000
                    });
                    const data = response.data;
                    if (data && (data.status === 'tunnel' || data.status === 'redirect') && data.url) {
                        return { data, api };
                    }
                    throw new Error(`Status: ${data?.status}`);
                } catch (err) {
                    throw new Error(`API ${api}: ${err.message}`);
                }
            });

            const resolvedCobalt = await Promise.any(promises);
            if (resolvedCobalt?.data?.url) {
                dl_url = resolvedCobalt.data.url;
                title = resolvedCobalt.data.filename || title;
                marcarSucesso('cobalt');
                console.log(`[YouTube Resolver] ✅ Fase 2 OK via Cobalt (${resolvedCobalt.api})`);
                return { dl_url, title };
            }
        } catch (e) {
            marcarFalha('cobalt');
            console.log(`[YouTube Resolver] Fase 2 (Cobalt) falhou.`);
        }
    }

    throw new Error('Não foi possível resolver link direto do YouTube.');
}

/**
 * Downloads a YouTube video or audio with streaming to local disk.
 */
export async function downloadYT(url, type = 'audio') {
    const filename = `yt_${Date.now()}`;
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    const filePath = path.join(TEMP_DIR, `${filename}.${ext}`);
    const targetUrl = cleanMediaUrl(url);

    let dl_url = null;
    let title = 'YouTube';

    // 1. Tenta resolver via APIs de streaming (fg-senna / Cobalt)
    try {
        const resolved = await resolverUrlYT(targetUrl, type);
        dl_url = resolved.dl_url;
        title = resolved.title;
    } catch (resolveErr) {
        console.log(`[YouTube Downloader] Streaming direto falhou: ${resolveErr.message}. Tentando yt-dlp local...`);
    }

    // Se resolveu a URL externa com sucesso, baixa o arquivo para a VPS
    if (dl_url) {
        try {
            console.log(`[YouTube Downloader] Baixando stream da URL resolvida para o disco...`);
            const writer = fs.createWriteStream(filePath);
            const streamResponse = await axios({
                method: 'get',
                url: dl_url,
                responseType: 'stream',
                headers: { 'User-Agent': USER_AGENT },
                timeout: 180000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            await pipeline(streamResponse.data, writer);

            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.size > 100) {
                    const cleanTitle = (title || filename).replace(/[^\w\s\-\.]/gi, '');
                    console.log(`[YouTube Downloader] ✅ Download concluído: ${cleanTitle} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                    return { filePath, title: cleanTitle, size: stats.size };
                }
            }
        } catch (downloadErr) {
            console.error(`[YouTube Downloader] Erro ao gravar stream no disco: ${downloadErr.message}`);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
    }

    // 2. Se falhou na resolução de stream, executa yt-dlp local na VPS
    try {
        console.log(`[YouTube Downloader] Executando yt-dlp local na VPS...`);
        const dlpRes = await ytdlpLocal(targetUrl, type, filePath);
        if (dlpRes && dlpRes.filePath && fs.existsSync(dlpRes.filePath)) {
            const stats = fs.statSync(dlpRes.filePath);
            if (stats.size > 100) {
                console.log(`[YouTube Downloader] ✅ yt-dlp local concluído: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                return { filePath: dlpRes.filePath, title: dlpRes.title || title, size: stats.size };
            }
        }
    } catch (dlpErr) {
        console.error(`[YouTube Downloader] yt-dlp local falhou:`, dlpErr.message);
    }

    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
    }
    throw new Error('Todas as fases de download falharam no servidor.');
}

/**
 * yt-dlp wrapper local com suporte a cookies
 */
function ytdlpLocal(url, type, targetPath) {
    return new Promise((resolve) => {
        const id = Date.now();
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const filePath = targetPath || path.join(TEMP_DIR, `yt_dlp_${id}.${ext}`);
        
        // Formato otimizado
        const formatArg = type === 'audio'
            ? '-f "ba[ext=m4a]/ba/b" --extract-audio --audio-format mp3 --audio-quality 128k'
            : '-f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b" --merge-output-format mp4';

        // Localizar cookies
        const possibleCookiePaths = [
            path.join(__dirname, '..', '..', '..', 'cookies.txt'),
            path.join(__dirname, '..', '..', 'cookies.txt'),
            path.join(__dirname, '..', 'cookies.txt'),
            '/home/ubuntu/senna-bot/cookies.txt',
            '/home/ubuntu/nazuna-bot/cookies.txt'
        ];

        let cookiesArg = '';
        for (const cp of possibleCookiePaths) {
            if (fs.existsSync(cp)) {
                cookiesArg = `--cookies "${cp}"`;
                break;
            }
        }

        const cmd = `export PATH=/usr/bin:/usr/local/bin:/usr/sbin:/sbin:/bin:$PATH && yt-dlp --no-playlist --no-warnings --no-check-certificate ${cookiesArg} -q ${formatArg} -o "${filePath}" "${url}"`;

        exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[YouTube ytdlpLocal] Erro ao executar yt-dlp:`, error.message);
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch {}
                }
                return resolve(null);
            }
            if (!fs.existsSync(filePath)) {
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
        return res || { title: 'video' };
    } catch (e) {
        return { title: 'video' };
    }
}
