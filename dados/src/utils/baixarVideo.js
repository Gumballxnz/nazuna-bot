/**
 * Módulo de Download Universal - 100% Gratuito
 * 
 * Plataformas suportadas e métodos:
 * - TikTok: @tobyg74/tiktok-api-dl + TikWM API (fallback)
 * - Instagram: Scraping via múltiplas APIs públicas
 * - YouTube: yt-dlp (requer deno no servidor)
 * - Facebook: Scraping via APIs públicas
 * - Twitter/X: fxtwitter API
 * - Spotify/SoundCloud: yt-dlp
 * - Pinterest: Scraping
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);
import { pipeline } from 'stream/promises';
import { downloadYT, getYTInfo, resolverUrlYT } from './ytHelper.js';

// Lazy-load fg-senna (carrega puppeteer/chromium em memoria)
let _fg = null;
async function getFg() {
    if (!_fg) _fg = (await import('fg-senna')).default;
    return _fg;
}

// Motor de download universal via Cobalt (Fase 1 global)
async function baixarCobaltGenerico(url, formato = 'video') {
    const cobaltApis = [
        'https://cobaltapi.kittycat.boo/',
        'https://api.cobalt.tools/'
    ];
    for (const api of cobaltApis) {
        try {
            console.log(`[Cobalt Generico] Tentando download via: ${api}`);
            const cobaltRes = await axios.post(api, {
                url: url,
                videoQuality: '720',
                audioFormat: 'mp3',
                downloadMode: formato === 'audio' ? 'audio' : 'auto'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            }).then(r => r.data);

            if (cobaltRes) {
                if ((cobaltRes.status === 'redirect' || cobaltRes.status === 'tunnel') && cobaltRes.url) {
                    if (formato === 'audio') {
                        return { type: 'audio', url: cobaltRes.url, desc: cobaltRes.filename || 'Audio' };
                    }
                    return { type: 'video', url: cobaltRes.url, desc: cobaltRes.filename || 'Video' };
                } else if (cobaltRes.status === 'picker' && cobaltRes.picker && cobaltRes.picker.length > 0) {
                    const urls = cobaltRes.picker.map(item => item.url);
                    return { type: 'images', urls: urls, desc: 'Galeria' };
                }
            }
        } catch (apiErr) {
            console.warn(`[Cobalt Generico] API ${api} falhou: ${apiErr.message}`);
        }
    }
    return null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta temporária
const tmpDir = path.join(__dirname, '..', '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Limpeza automática a cada 15 min
setInterval(() => {
    try {
        const now = Date.now();
        for (const f of fs.readdirSync(tmpDir)) {
            const fp = path.join(tmpDir, f);
            if (now - fs.statSync(fp).mtimeMs > 900000) fs.unlinkSync(fp);
        }
    } catch {}
}, 900000);

// Headers padrão
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ==================== DETECTAR PLATAFORMA ====================
function detectarPlataforma(url) {
    const u = url.toLowerCase();
    if (u.includes('tiktok.com') || u.includes('vt.tiktok')) return 'TikTok';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('instagram.com') || u.includes('instagr.am')) return 'Instagram';
    if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'Facebook';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
    if (u.includes('spotify.com')) return 'Spotify';
    if (u.includes('soundcloud.com')) return 'SoundCloud';
    if (u.includes('pinterest.com') || u.includes('pin.it')) return 'Pinterest';
    if (u.includes('reddit.com') || u.includes('redd.it')) return 'Reddit';
    if (u.includes('vimeo.com')) return 'Vimeo';
    if (u.includes('dailymotion.com') || u.includes('dai.ly')) return 'Dailymotion';
    if (u.includes('streamable.com')) return 'Streamable';
    if (u.includes('twitch.tv') || u.includes('twitch.com')) return 'Twitch';
    if (u.includes('bandcamp.com')) return 'Bandcamp';
    if (u.includes('mediafire.com')) return 'Mediafire';
    return null;
}

// ==================== TIKTOK ====================
async function baixarTiktok(url) {
    try {
        const tiktokMod = await import('../funcs/downloads/tiktok.js');
        const dlFn = tiktokMod.dl || tiktokMod.default?.dl;
        if (typeof dlFn === 'function') {
            const res = await dlFn(url);
            if (res && res.ok && res.urls && res.urls.length > 0) {
                if (res.type === 'image' || res.type === 'images') {
                    return { type: 'images', urls: res.urls, desc: res.title || 'TikTok' };
                }
                return { type: 'video', url: res.urls[0], desc: res.title || 'TikTok' };
            }
        }
    } catch (e) {
        console.error('[TikTok Central Dl error]', e.message);
    }
    throw new Error('TikTok: Falha ao extrair mídia via módulo unificado.');
}

// ==================== INSTAGRAM ====================
async function baixarInstagram(url) {
    try {
        // Motor 1: yt-dlp local (Alta Qualidade - mais confiavel)
        try {
            const ytRes = await ytdlpBaixar(url, 'video');
            if (ytRes && ytRes.filePath) {
                return { type: 'video', url: ytRes.filePath, filePath: ytRes.filePath, isFile: true, desc: 'Instagram (HD)' };
            }
        } catch (e) {
            // yt-dlp falhou, continua para o módulo central
        }

        const igdlMod = await import('../funcs/downloads/igdl.js');
        const dlFn = igdlMod.dl || igdlMod.default?.dl;
        if (typeof dlFn === 'function') {
            const res = await dlFn(url);
            if (res && res.ok && res.data && res.data.length > 0) {
                if (res.data.length === 1) {
                    const item = res.data[0];
                    const id = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
                    const ext = item.type === 'video' ? 'mp4' : 'jpg';
                    const filePath = path.join(tmpDir, `ig_${id}.${ext}`);
                    fs.writeFileSync(filePath, item.buff);
                    return { type: item.type, filePath, isFile: true, desc: 'Instagram' };
                } else {
                    const filePaths = [];
                    for (const [idx, item] of res.data.entries()) {
                        const ext = item.type === 'video' ? 'mp4' : 'jpg';
                        const filePath = path.join(tmpDir, `ig_${Date.now()}_${idx}.${ext}`);
                        fs.writeFileSync(filePath, item.buff);
                        filePaths.push({ type: item.type, filePath, isFile: true });
                    }
                    return { type: 'gallery', files: filePaths, desc: 'Instagram (Galeria)' };
                }
            }
        }
    } catch (e) {
        console.error('[Instagram Central Dl Error]', e.message);
    }
    throw new Error('Instagram: Falha ao extrair mídia via módulo unificado.');
}

// ==================== YOUTUBE ====================
async function baixarYoutube(url, formato = 'video') {
    try {
        console.log(`[baixarYoutube] Iniciando resolução híbrida para: ${url}`);
        
        // 1. Tentar resolver a URL direta de streaming síncrono super rápido via resolvedores externos
        let resolved = null;
        try {
            resolved = await resolverUrlYT(url, formato);
        } catch (resErr) {
            console.warn(`[baixarYoutube] Falha rápida ao obter URL direta: ${resErr.message}`);
        }

        if (resolved && resolved.dl_url) {
            const dl_url = resolved.dl_url;
            const title = resolved.title || 'YouTube';
            console.log(`[baixarYoutube] URL direta obtida: ${dl_url.substring(0, 80)}...`);

            // 2. Tentar HEAD request para ler o content-length
            let sizeBytes = 0;
            try {
                const headRes = await axios.head(dl_url, { timeout: 3000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                sizeBytes = parseInt(headRes.headers['content-length'] || '0', 10);
                console.log(`[baixarYoutube] HEAD request retornou tamanho: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
            } catch (headErr) {
                console.log(`[baixarYoutube] HEAD request falhou ou não retornou tamanho: ${headErr.message}`);
            }

            const sizeMB = sizeBytes / (1024 * 1024);

            // 3. Regra Híbrida de Decisão
            // Se o tamanho for maior ou igual a 15MB, ou se não conseguirmos obter o tamanho (segurança), enviamos via Streaming Direto como documento!
            if (sizeBytes === 0 || sizeMB >= 15) {
                console.log(`[baixarYoutube] Vídeo grande (${sizeMB.toFixed(2)} MB >= 15MB ou indefinido). Ativando Modo Ultra Velocidade (Streaming Direto + Documento)`);
                return {
                    type: 'document',
                    url: dl_url,
                    streamingDireto: true,
                    filename: `YouTube - ${title.replace(/[^a-zA-Z0-9\s-_]/g, '')}.mp4`,
                    desc: title,
                    isUltra: true
                };
            } else {
                console.log(`[baixarYoutube] Vídeo pequeno (${sizeMB.toFixed(2)} MB < 15MB). Efetuando download tradicional para reprodução em chat...`);
            }
        }

        // 4. Download físico tradicional se for vídeo pequeno ou falhar a resolução ultra-rápida
        const dl = await downloadYT(url, formato);
        if (dl && dl.filePath) {
            return { type: formato, url: dl.filePath, filePath: dl.filePath, desc: dl.title || 'YouTube', isFile: true };
        }
    } catch (e) {
        console.error('[YouTube ytHelper]', e.message);
    }
    throw new Error('YouTube bloqueado no Datacenter. Todos os métodos falharam.');
}

// ==================== FACEBOOK ====================
async function baixarFacebook(url) {
    try {
        // Fase 1: yt-dlp local (Alta Qualidade)
        try {
            const ytRes = await ytdlpBaixar(url, 'video');
            if (ytRes && ytRes.filePath) {
                 return { type: 'video', url: ytRes.filePath, filePath: ytRes.filePath, isFile: true, desc: 'Facebook (YT-DLP)' };
            }
        } catch (e) {
            // yt-dlp falhou, desliza para o módulo central
        }

        const facebookMod = await import('../funcs/downloads/facebook.js');
        const dlFn = facebookMod.dl || facebookMod.default?.downloadHD || facebookMod.default?.dl;
        if (typeof dlFn === 'function') {
            const res = await dlFn(url);
            if (res && res.ok && res.buffer) {
                const id = Date.now();
                const filePath = path.join(tmpDir, `fb_${id}.mp4`);
                fs.writeFileSync(filePath, res.buffer);
                return { type: 'video', filePath, isFile: true, desc: `Facebook (${res.resolution || 'HD'})` };
            }
        }
    } catch (e) {
        console.error('[Facebook Central Dl error]', e.message);
    }
    throw new Error('Facebook: Todos os motores de download falharam.');
}

// ==================== TWITTER/X ====================
async function baixarTwitter(url) {
    try {
        const fg = await getFg();
        const res = await fg.twitter(url);
        if (res && (res.HD || res.SD)) {
             return { type: 'video', url: res.HD || res.SD, desc: res.desc || 'Twitter/X' };
        }
    } catch (e) {
        console.error('[Twitter fg-senna]', e.message);
    }
    throw new Error('Twitter: Falha ao extrair mídia via fg-senna');
}

async function baixarMediafire(url) {
    try {
        // Motor 1: Siputzx
        let sip = await axios.get(`https://api.siputzx.my.id/api/d/mediafire?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        if (sip && sip.data && sip.data.url) {
            return { type: 'document', url: sip.data.url, filename: sip.data.name, ext: sip.data.ext, desc: 'Mediafire (API 1)' };
        }

        // Motor 2: Ryzendesu
        let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/mediafire?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        if (rz && rz.url) {
             return { type: 'document', url: rz.url, filename: rz.fileName || rz.nome || 'arquivo', ext: rz.ext || 'bin', desc: 'Mediafire (API 2)' };
        }

        // Motor 3: fg-senna
        const fg = await getFg();
        const res = await fg.mediafire(url);
        if (res && res.url) {
             return { type: 'document', url: res.url, filename: res.filename, ext: res.ext, desc: 'Mediafire (API 3)' };
        }
    } catch (e) {
        console.error('[Mediafire Cascade]', e.message);
    }
    throw new Error('Mediafire: Falha ao extrair arquivo em todos os motores.');
}

// ==================== PINTEREST ====================
async function baixarPinterest(url) {
    try {
        const pinterestMod = await import('../funcs/downloads/pinterest.js');
        const dlFn = pinterestMod.dl || pinterestMod.default?.dl;
        if (typeof dlFn === 'function') {
            const res = await dlFn(url);
            if (res && res.ok && res.urls && res.urls.length > 0) {
                return {
                    type: res.type || (res.urls[0].includes('.mp4') ? 'video' : 'image'),
                    url: res.urls[0],
                    desc: res.title || 'Pinterest'
                };
            }
        }
    } catch (e) {
        console.error('[Pinterest Central Dl error]', e.message);
    }
    try { const r = await ytdlpBaixar(url); if (r) return r; } catch {}
    throw new Error('Pinterest: falhou ao extrair mídia via módulo unificado.');
}

// ==================== REDDIT ====================
async function baixarReddit(url) {
    try {
        // Converter para .json
        const jsonUrl = url.replace(/\/$/, '') + '.json';
        const { data } = await axios.get(jsonUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (bot)' }, timeout: 10000
        });
        const post = data?.[0]?.data?.children?.[0]?.data;
        if (post) {
            // Vídeo do Reddit
            if (post.is_video && post.media?.reddit_video?.fallback_url) {
                return { type: 'video', url: post.media.reddit_video.fallback_url, desc: post.title || 'Reddit' };
            }
            // Imagem
            if (post.url_overridden_by_dest && /\.(jpg|png|gif|webp)/i.test(post.url_overridden_by_dest)) {
                return { type: 'image', url: post.url_overridden_by_dest, desc: post.title || 'Reddit' };
            }
        }
    } catch {}
    try { const r = await ytdlpBaixar(url); if (r) return r; } catch {}
    throw new Error('Reddit: falhou');
}

// ==================== GENÉRICOS VIA YT-DLP ====================
// Spotify, SoundCloud, Vimeo, Dailymotion, Streamable, Twitch, Bandcamp
async function baixarGenerico(url, plataforma) {
    try {
        const result = await ytdlpBaixar(url);
        if (result && result.filePath) {
            result.url = result.filePath;
            result.isFile = true;
            return result;
        }
    } catch (e) { console.error(`[${plataforma} yt-dlp]`, e.message); }
    throw new Error(`${plataforma}: download falhou`);
}

// ==================== YT-DLP WRAPPER ====================
function ytdlpBaixar(url, formato = 'video') {
    return new Promise((resolve, reject) => {
        const id = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        const ext = formato === 'audio' ? 'mp3' : 'mp4';
        const filePath = path.join(tmpDir, `dl_${id}.${ext}`);
        
        let formatArg;
        if (formato === 'audio') {
            formatArg = '-x --audio-format mp3 --audio-quality 0';
        } else {
            // Regra de alta qualidade: Prioriza 1080p/720p H.264
            formatArg = `-f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4`;
        }

        const cmd = `export PATH=/home/ubuntu/.deno/bin:/usr/bin:/usr/local/bin:$PATH && yt-dlp --no-playlist --no-warnings --no-check-certificate --extractor-args 'youtube:player_client=android,web' --user-agent '${UA}' --sleep-requests 1 --retries 3 --socket-timeout 30 -q ${formatArg} -o '${filePath}' '${url}'`;
        
        const proc = exec(cmd, { timeout: 120000 }, (error) => {
            if (error) {
                // Limpar arquivo se existir
                try { fs.unlinkSync(filePath); } catch {}
                return reject(new Error(error.message?.substring(0, 100)));
            }
            
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.size > 0) {
                    resolve({ type: formato === 'audio' ? 'audio' : 'video', filePath, desc: '', formato });
                    return;
                }
            }
            // yt-dlp pode ter renomeado o arquivo
            const possibleFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith(`dl_${id}`));
            if (possibleFiles.length > 0) {
                const actualPath = path.join(tmpDir, possibleFiles[0]);
                resolve({ type: formato === 'audio' ? 'audio' : 'video', filePath: actualPath, desc: '', formato });
                return;
            }
            reject(new Error('Arquivo não encontrado após download'));
        });
    });
}

// ==================== DOWNLOAD STREAM SEGURO ====================
async function baixarStreamLocal(mediaUrl, ext) {
    const filePath = path.join(tmpDir, `stm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`);
    const dl = await axios({
        method: 'get',
        url: mediaUrl,
        responseType: 'stream',
        headers: { 'User-Agent': UA }
    });
    if (dl.status !== 200) throw new Error(`Falha no download (Stream): HTTP ${dl.status}`);
    await pipeline(dl.data, fs.createWriteStream(filePath));
    return filePath;
}

// ==================== O DETECTOR DE COLISÕES (Fase 3: FFprobe Sniffer) ====================
async function verificarEConverterCodec(filePath) {
    if (!filePath || !filePath.endsWith('.mp4')) return filePath;
    try {
        // Usa o ffprobe para extrair o nome do codec oculto nos metadados
        const cmdProbe = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const { stdout } = await execPromise(cmdProbe);
        const codec = stdout.trim().toLowerCase();
        
        console.log(`[Codec Sniffer] Ficheiro detectado com codec: ${codec}`);

        if (codec === 'h264' || codec === 'h264(high)') {
            // Se já for H264, usamos turbo copy apenas para afinar o faststart
            const finalPath = filePath.replace('.mp4', '_ready.mp4');
            await execPromise(`ffmpeg -y -i "${filePath}" -c copy -movflags +faststart "${finalPath}"`);
            try { fs.unlinkSync(filePath); } catch {}
            return finalPath;
        } else if (codec && codec !== '') {
            // Se for VP9, AV1, HEVC, etc, o WhatsApp recusa! Tritramos pixels com libx264
            console.log(`[Codec Sniffer] Codec Incompatível (${codec}). Triturando formato para H.264...`);
            const finalPath = filePath.replace('.mp4', '_ready.mp4');
            // ultrafast preset e crf 30 para conversão ultra leve no VPS de 1GB
            await execPromise(`ffmpeg -y -i "${filePath}" -c:v libx264 -preset ultrafast -crf 30 -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:a aac -movflags +faststart "${finalPath}"`);
            try { fs.unlinkSync(filePath); } catch {}
            return finalPath;
        }
    } catch (e) {
        console.error(`[Codec Sniffer] Ignorado devido a erro:`, e.message);
        return filePath;
    }
}

// ==================== O REFINADOR DE ÁUDIO (Garante compatibilidade) ====================
async function refinarAudio(filePath) {
    if (!filePath) return filePath;
    try {
        const finalPath = filePath.replace('.mp3', '_ready.mp3');
        // Força re-encoding para MP3 128k constante para garantir que o WhatsApp aceite
        await execPromise(`ffmpeg -i "${filePath}" -vn -ar 44100 -ac 2 -b:a 128k -y "${finalPath}"`);
        try { fs.unlinkSync(filePath); } catch {}
        return finalPath;
    } catch (e) {
        console.error(`[Audio Refiner] Erro ao refinar áudio:`, e.message);
        return filePath;
    }
}

// ==================== ENVIAR MÍDIA ====================
async function enviarMidia(nazu, from, m, resultado, plataforma) {
    // Preparar atributos extras (thumbnail, contexto)
    const extraAttrs = {};
    if (resultado.thumbnail) {
        extraAttrs.contextInfo = {
            externalAdReply: {
                title: resultado.desc || plataforma,
                mediaType: resultado.type === 'audio' ? 2 : 1,
                thumbnailUrl: resultado.thumbnail,
                sourceUrl: resultado.sourceUrl || ''
            }
        };
    }

    if (resultado.type === 'video') {
        let finalFilePath = null;

        if (resultado.filePath) {
            // Enviado de arquivo local (yt-dlp)
            finalFilePath = resultado.filePath;
        } else if (resultado.isStream) {
            // Stream do ytdl-core (Legado, embora não usámos muito)
            const tmpFp = path.join(tmpDir, `yt_${Date.now()}.mp4`);
            await new Promise((resolve, reject) => {
                const dl = resultado.ytdlCore.default || resultado.ytdlCore;
                const stream = dl(resultado.ytdlUrl, { quality: 'highest', filter: 'videoandaudio' });
                const ws = fs.createWriteStream(tmpFp);
                stream.pipe(ws);
                stream.on('error', reject);
                ws.on('finish', resolve);
                ws.on('error', reject);
            });
            finalFilePath = tmpFp;
        } else {
            // Stream seguro de URL externas da cascata APIs (Siputzx, Ryzendesu)
            finalFilePath = await baixarStreamLocal(resultado.url, 'mp4');
        }

        // --- A MÁGICA FINAL: Fase 3 ---
        // Se o video não for compativel com WhatsApp, nós ressucitamos!
        if (finalFilePath) {
            let stats = null;
            try { stats = fs.statSync(finalFilePath); } catch {}
            const limit = 15 * 1024 * 1024; // 15MB
            const isBig = stats && stats.size >= limit;

            if (isBig) {
                // Vídeo grande (>= 15MB) -> Envio instantâneo como Documento MP4 limpo! (Pula re-encoding pesado para economizar CPU)
                console.log(`[enviarMidia] Vídeo grande (${stats ? (stats.size / 1024 / 1024).toFixed(2) : '?'}MB >= 15MB). Modo Ultra Velocidade (Documento) ativo.`);
                await nazu.sendMessage(from, {
                    document: { url: finalFilePath },
                    mimetype: 'video/mp4',
                    fileName: resultado.filename || path.basename(finalFilePath) || 'video.mp4'
                });
            } else {
                // Vídeo pequeno (< 15MB) -> SEMPRE como Player de Vídeo Nativo no Chat!
                console.log(`[enviarMidia] Vídeo pequeno (${stats ? (stats.size / 1024 / 1024).toFixed(2) : '?'}MB < 15MB). Garantindo player nativo no chat.`);
                
                // Converte o codec se for incompatível para que o player nativo do WhatsApp funcione perfeitamente
                finalFilePath = await verificarEConverterCodec(finalFilePath);

                // Sanitizar a legenda: remover qualquer link http/https para não ser bloqueado pelo WhatsApp
                let descSanitizada = resultado.desc ? resultado.desc.replace(/https?:\/\/[^\s]+/gi, '').trim() : '';
                const captionMsg = `✅ ${plataforma}${descSanitizada ? `\n📝 ${descSanitizada}` : ''}`;

                // Envia como player nativo sem citação (quoted: m) e sem extraAttrs (zero links que barram a entrega)
                await nazu.sendMessage(from, {
                    video: { url: finalFilePath },
                    mimetype: 'video/mp4',
                    caption: captionMsg
                });
            }
            
            // Auto Destruição do rastro
            try { fs.unlinkSync(finalFilePath); } catch {}
        }
    } else if (resultado.type === 'audio') {
        if (resultado.filePath) {
            await nazu.sendMessage(from, {
                audio: { url: resultado.filePath },
                mimetype: 'audio/mpeg',
                ...extraAttrs
            }, { quoted: m });
            try { fs.unlinkSync(resultado.filePath); } catch {}
        } else {
            const filePath = await baixarStreamLocal(resultado.url, 'mp3');
            await nazu.sendMessage(from, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                ...extraAttrs
            }, { quoted: m });
            try { fs.unlinkSync(filePath); } catch {}
        }
    } else if (resultado.type === 'document') {
        // Ex.: Mediafire ou YouTube Ultra Velocidade
        if (resultado.streamingDireto) {
            console.log(`[enviarMidia] Baixando stream da URL externa em disco para envio seguro: ${resultado.url.substring(0, 80)}...`);
            let tempPath = null;
            try {
                // Baixa o arquivo em bloco direto no disco de forma ultra rápida e leve em RAM
                tempPath = await baixarStreamLocal(resultado.url, 'mp4');
                console.log(`[enviarMidia] Download do stream concluído. Enviando documento local: ${tempPath}`);

                await nazu.sendMessage(from, {
                    document: { url: tempPath },
                    mimetype: 'video/mp4',
                    fileName: resultado.filename || 'video.mp4',
                    ...extraAttrs
                });
            } catch (errStream) {
                console.error(`[enviarMidia] Erro no stream do documento:`, errStream.message);
                throw errStream;
            } finally {
                if (tempPath && fs.existsSync(tempPath)) {
                    try { fs.unlinkSync(tempPath); } catch {}
                }
            }
        } else if (resultado.filePath) {
            await nazu.sendMessage(from, {
                document: { url: resultado.filePath },
                mimetype: 'application/octet-stream',
                fileName: resultado.filename || `arquivo.${resultado.ext || 'bin'}`,
                ...extraAttrs
            });
            try { fs.unlinkSync(resultado.filePath); } catch {}
        } else {
            const filePath = await baixarStreamLocal(resultado.url, resultado.ext || 'bin');
            await nazu.sendMessage(from, {
                document: { url: filePath },
                mimetype: 'application/octet-stream',
                fileName: resultado.filename || `arquivo.${resultado.ext || 'bin'}`,
                ...extraAttrs
            });
            try { fs.unlinkSync(filePath); } catch {}
        }
    } else if (resultado.type === 'image') {
        const filePath = await baixarStreamLocal(resultado.url, 'jpg');
        await nazu.sendMessage(from, {
            image: { url: filePath },
            caption: `✅ ${plataforma}`
        }, { quoted: m });
         try { fs.unlinkSync(filePath); } catch {}
    } else if (resultado.type === 'images') {
        for (const imgUrl of resultado.urls.slice(0, 10)) {
            try {
                const filePath = await baixarStreamLocal(imgUrl, 'jpg');
                await nazu.sendMessage(from, {
                    image: { url: filePath },
                    caption: `✅ ${plataforma}`
                }, { quoted: m });
                try { fs.unlinkSync(filePath); } catch {}
            } catch {}
        }
    } else if (resultado.type === 'gallery') {
        for (const fileObj of resultado.files) {
            try {
                if (fileObj.type === 'video') {
                    let finalPath = await verificarEConverterCodec(fileObj.filePath);
                    await nazu.sendMessage(from, {
                        video: { url: finalPath },
                        mimetype: 'video/mp4',
                        caption: `✅ ${plataforma}${resultado.desc ? `\n📝 ${resultado.desc}` : ''}`
                    }, { quoted: m });
                    try { fs.unlinkSync(finalPath); } catch {}
                } else {
                    await nazu.sendMessage(from, {
                        image: { url: fileObj.filePath },
                        caption: `✅ ${plataforma}`
                    }, { quoted: m });
                    try { fs.unlinkSync(fileObj.filePath); } catch {}
                }
            } catch (e) {
                console.error('[Gallery Send Error]', e.message);
            }
        }
    }
}

// ==================== FUNÇÃO PRINCIPAL ====================
export default async function baixarVideoLocal(nazu, from, m, q, reply) {
    try {
        if (!q) {
            return reply('❌ Envie um link válido.\n\n📌 *Sites suportados:*\n• TikTok • YouTube • Instagram\n• Facebook • Twitter/X • Spotify\n• SoundCloud • Pinterest • Reddit\n• Vimeo • Dailymotion • Streamable');
        }

        const url = q.trim().split(' ')[0];
        const plataforma = detectarPlataforma(url);

        if (!plataforma) {
            return reply('❌ Link não suportado.\n\n📌 *Sites suportados:*\n• TikTok • YouTube • Instagram\n• Facebook • Twitter/X • Spotify\n• SoundCloud • Pinterest • Reddit\n• Vimeo • Dailymotion • Streamable');
        }

        // Reagir com loading
        if (m.key) await nazu.sendMessage(from, { react: { text: '⏳', key: m.key } }).catch(() => {});

        // Mensagem de status progressiva
        await nazu.sendMessage(from, { text: `📥 Processando mídia do ${plataforma}...` }, { quoted: m }).catch(() => {});

        let resultado;
        try {
            // Tenta Cobalt em primeiro lugar para todas as plataformas exceto Mediafire e Spotify
            if (plataforma !== 'Mediafire' && plataforma !== 'Spotify') {
                try {
                    console.log(`[downloader] Tentando Cobalt em primeiro lugar para ${plataforma}...`);
                    resultado = await baixarCobaltGenerico(url, 'video');
                } catch (cobaltErr) {
                    console.warn(`[downloader] Cobalt falhou, usando fallback: ${cobaltErr.message}`);
                }
            }

            if (!resultado) {
                switch (plataforma) {
                    case 'TikTok':      resultado = await baixarTiktok(url); break;
                    case 'YouTube':     resultado = await baixarYoutube(url, 'video'); break;
                    case 'Instagram':   resultado = await baixarInstagram(url); break;
                    case 'Facebook':    resultado = await baixarFacebook(url); break;
                    case 'Twitter/X':   resultado = await baixarTwitter(url); break;
                    case 'Pinterest':   resultado = await baixarPinterest(url); break;
                    case 'Reddit':      resultado = await baixarReddit(url); break;
                    case 'Mediafire':   resultado = await baixarMediafire(url); break;
                    default:            resultado = await baixarGenerico(url, plataforma); break;
                }
            }
        } catch (err) {
            console.error(`[Download ${plataforma}] Erro:`, err.message);
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return nazu.sendMessage(from, { text: `❌ Falha ao baixar do ${plataforma}.` }, { quoted: m });
        }

        if (!resultado) {
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return nazu.sendMessage(from, { text: `❌ Não foi possível extrair mídia do ${plataforma}.` }, { quoted: m });
        }

        // Enviar a mídia
        try {
            // Recuperar thumbnail externa (link) caso o WhatsApp tenha providenciado meta original
            resultado.thumbnail = resultado.thumbnail || m?.message?.extendedTextMessage?.matchedText;
            await enviarMidia(nazu, from, m, resultado, plataforma);
            if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
        } catch (e) {
            console.error('Erro no enviarMidia:', e.message);
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        }

    } catch (err) {
        console.error('Erro fatal no downloader:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro interno ao iniciar download.');
    }
}

// ==================== SISTEMA DE CONFIRMAÇÃO PLAY (Estilo Senna) ====================
const playConfirmations = new Map();

export function getPlayConfirmations() {
    return playConfirmations;
}

// ==================== PLAY (BUSCA + MENU DE ESCOLHA) ====================
export async function playAudio(nazu, from, m, q, reply) {
    try {
        if (!q) return reply(`╭━━━⊱ 🎵 *PLAY* 🎵 ⊱━━━╮
│
│ 📝 Digite o nome da música ou vídeo
│
│  *Exemplos:*
│  !play Imagine Dragons
│  !play https://youtube.com/...
│
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`);

        if (m.key) await nazu.sendMessage(from, { react: { text: '🔍', key: m.key } }).catch(() => {});

        // Buscar no YouTube
        let video = null;
        try {
            const yts = await import('yt-search');
            const searchFn = yts.default || yts;
            const res = await searchFn(q);
            if (res && res.videos && res.videos.length > 0) {
                video = res.videos[0];
            }
        } catch (e) { console.error('[yt-search error]', e.message); }

        if (!video) {
            if (m.key) nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply('❌ Nenhum resultado encontrado.');
        }

        // Predição de peso (igual Senna)
        const seconds = video.seconds || 0;
        const audioSize = (seconds * 0.016).toFixed(1);
        const videoSize = (seconds * 0.1).toFixed(1);

        if (m.key) await nazu.sendMessage(from, { react: { text: '🎧', key: m.key } }).catch(() => {});

        const msg = `╭━━━⊱ 🎵 *NAZUNA PLAY* 🎵 ⊱━━━╮
│
│ 📌 *Título:* ${video.title}
│ 📆 *Postado:* ${video.ago || 'N/A'}
│ ⌚ *Duração:* ${video.timestamp || 'N/A'}
│ 👀 *Vistas:* ${(video.views || 0).toLocaleString()}
│
│ ━━━━━━━━━━━━━━━━━━━━━━━
│ Responda com *1* ou *2*:
│
│ 1️⃣ = MP3 (Áudio)  ~ ${audioSize} MB 🎵
│ 2️⃣ = MP4 (Vídeo)  ~ ${videoSize} MB 🎬
│
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

        // Enviar thumbnail do vídeo se disponível
        const thumb = video.image || video.thumbnail;
        if (thumb) {
            try {
                await nazu.sendMessage(from, {
                    image: { url: thumb },
                    caption: msg
                }, { quoted: m });
            } catch (thumbErr) {
                // Thumbnail 404 ou indisponível — envia só texto
                console.warn(`[play] Thumbnail falhou (${thumbErr.message?.substring(0, 60)}), enviando texto`);
                await nazu.sendMessage(from, { text: msg }, { quoted: m });
            }
        } else {
            await nazu.sendMessage(from, { text: msg }, { quoted: m });
        }

        // Salvar pendência de confirmação (expira em 60s)
        const senderJid = m.key?.participant || m.key?.remoteJid || from;
        const confirmKey = `${senderJid}_${from}`;
        
        // Limpar timer anterior se existir
        if (playConfirmations.has(confirmKey)) {
            clearTimeout(playConfirmations.get(confirmKey).timeout);
        }

        playConfirmations.set(confirmKey, {
            url: video.url,
            title: video.title,
            thumb: thumb,
            from: from,
            m: m,
            timeout: setTimeout(() => {
                playConfirmations.delete(confirmKey);
            }, 60000) // 1 minuto para responder
        });

    } catch (err) {
        console.error('Erro no play:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao processar o comando.');
    }
}

// ==================== HANDLER DE CONFIRMAÇÃO (1 ou 2) ====================
export async function handlePlayConfirmation(nazu, from, m, text, senderJid) {
    const confirmKey = `${senderJid}_${from}`;
    const pending = playConfirmations.get(confirmKey);
    if (!pending) return false;

    const choice = text.trim();
    if (choice !== '1' && choice !== '2') return false;

    // Consumir a confirmação imediatamente para liberar o estado
    clearTimeout(pending.timeout);
    playConfirmations.delete(confirmKey);

    if (m.key) await nazu.sendMessage(from, { react: { text: '⏳', key: m.key } }).catch(() => {});

    const type = choice === '1' ? 'audio' : 'video';

    // EXECUTAR EM SEGUNDO PLANO (Não usar await no fluxo principal)
    (async () => {
        try {
            const dl = await downloadYT(pending.url, type);

            if (type === 'audio') {
                let finalPath = dl.filePath;
                finalPath = await refinarAudio(finalPath);
                await nazu.sendMessage(from, {
                    audio: { url: finalPath },
                    mimetype: 'audio/mpeg',
                }, { quoted: m });
                try { fs.unlinkSync(finalPath); } catch {}
            } else {
                // Vídeo usa a lógica híbrida inteligente de ultra velocidade!
                const resultado = await baixarYoutube(pending.url, 'video');
                if (resultado) {
                    // Garantir que a legenda correta do play seja exibida
                    resultado.desc = pending.title;
                    await enviarMidia(nazu, from, m, resultado, 'YouTube');
                } else {
                    throw new Error('Falha ao obter vídeo no play.');
                }
            }
            try { if (fs.existsSync(dl.filePath)) fs.unlinkSync(dl.filePath); } catch {}
            if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
        } catch (err) {
            console.error(`[play-${type}] Erro:`, err.message);
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            await nazu.sendMessage(from, { 
                text: `❌ Erro no download (${type}): ${pending.title}` 
            }, { quoted: m });
        }
    })();

    return true; // Indica que o comando foi capturado e processado (em background)
}


// ==================== DOWNLOAD DIRETO (Sem Menu) ====================
export async function baixarDireto(nazu, from, m, url, type = 'video') {
    if (m.key) await nazu.sendMessage(from, { react: { text: '⏳', key: m.key } }).catch(() => {});
    
    (async () => {
        try {
            const dl = await downloadYT(url, type);
            let finalPath = dl.filePath;

            if (type === 'audio') {
                finalPath = await refinarAudio(finalPath);
                await nazu.sendMessage(from, { audio: { url: finalPath }, mimetype: 'audio/mpeg' }, { quoted: m });
                try { fs.unlinkSync(finalPath); } catch {}
            } else {
                finalPath = await verificarEConverterCodec(finalPath);
                await nazu.sendMessage(from, { video: { url: finalPath }, mimetype: 'video/mp4' }, { quoted: m });
                if (finalPath !== dl.filePath) try { fs.unlinkSync(finalPath); } catch {}
            }
            try { if (fs.existsSync(dl.filePath)) fs.unlinkSync(dl.filePath); } catch {}
            if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
        } catch (err) {
            console.error(`[baixarDireto-${type}] Erro:`, err.message);
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        }
    })();
}

// ==================== PLAYVID (ATALHO DIRETO PARA VÍDEO) ====================
export async function playVideo(nazu, from, m, q, reply) {
    if (!q) return reply('❌ Envie o link do vídeo.');
    await baixarDireto(nazu, from, m, q, 'video');
}


