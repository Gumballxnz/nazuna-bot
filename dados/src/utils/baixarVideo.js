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
import fg from 'fg-senna';
import { pipeline } from 'stream/promises';
import { downloadYT, getYTInfo } from './ytHelper.js';

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
        // Motor 1: Siputzx (API Leve)
        let sip = await axios.get(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        let link1 = sip?.data?.data?.play || sip?.data?.data?.hdplay || sip?.data?.play;
        if (link1) return { type: 'video', url: link1, desc: sip?.data?.data?.title || sip?.data?.title || 'TikTok (API 1)' };
        let urls1 = sip?.data?.data?.images || sip?.data?.images;
        if (urls1 && urls1.length > 0) return { type: 'images', urls: urls1, desc: sip?.data?.data?.title || 'TikTok (API 1)' };

        // Motor 2: Ryzendesu Fallback
        let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/ttdl?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        let link2 = rz?.data?.play || rz?.data?.hdplay;
        if (link2) return { type: 'video', url: link2, desc: rz?.data?.title || 'TikTok (API 2)' };

        // Motor 3: fg-senna (Último recurso)
        const res = await fg.tiktok(url);
        if (res && res.result) {
            const d = res.result;
            if (d.type === 'image' && d.images) {
                return { type: 'images', urls: d.images, desc: d.title || 'TikTok (API 3)' };
            }
            if (d.play) {
                return { type: 'video', url: d.play, desc: d.title || 'TikTok (API 3)' };
            }
        }
    } catch (e) {
        console.error('[TikTok Cascade error]', e.message);
    }
    throw new Error('TikTok: Falha ao extrair mídia em todos os motores.');
}

// ==================== INSTAGRAM ====================
async function baixarInstagram(url) {
    try {
        // Motor 1: Siputzx (API Leve)
        let sip = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        if (sip && sip.data && sip.data.length > 0) {
           return { type: sip.data[0].url.includes('.mp4') ? 'video' : 'image', url: sip.data[0].url, desc: 'Instagram (API 1)' };
        }

        // Motor 2: Ryzendesu Fallback
        let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        if (rz && rz.data && rz.data.length > 0) {
           return { type: rz.data[0].url.includes('.mp4') ? 'video' : 'image', url: rz.data[0].url, desc: 'Instagram (API 2)' };
        }

        // Motor 3: fg-senna (Último recurso)
        const res = await fg.igdl(url).catch(() => null);
        if (res && res.dl_url) {
             return { type: 'video', url: res.dl_url, desc: 'Instagram (API 3)' };
        }
    } catch (e) {
        console.error('[Instagram Cascade Error]', e.message);
    }
    throw new Error('Instagram: Falha ao extrair mídia via APIs.');
}

// ==================== YOUTUBE ====================
async function baixarYoutube(url, formato = 'video') {
    try {
        const dl = await downloadYT(url, formato);
        if (dl && dl.filePath) {
            return { type: formato, url: dl.filePath, desc: 'YouTube', isFile: true };
        }
    } catch (e) {
        console.error('[YouTube ytHelper]', e.message);
    }
    throw new Error('YouTube bloqueado no Datacenter. Todos os métodos falharam.');
}

// ==================== FACEBOOK ====================
async function baixarFacebook(url) {
    try {
        // Fase 1: "A Tentativa de Alto Luxo" (O Motor yt-dlp)
        try {
            const ytRes = await ytdlpBaixar(url, 'video');
            if (ytRes && ytRes.filePath) {
                 return { type: 'video', url: ytRes.filePath, isFile: true, desc: 'Facebook (YT-DLP)' };
            }
        } catch (e) {
            // Secreção Silenciosa: se falhar (bloqueio), desliza furtivamente para a Fase 2
        }

        // Fase 2: "O Bypass de IP" (Fallback API Tripla)
        // Motor 1: Siputzx (API Leve)
        let res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        let link = res?.data?.url || res?.data?.hd || res?.data?.sd;
        
        if (link) return { type: 'video', url: link, desc: 'Facebook (API 1)' };

        // Motor 2: Ryzendesu Fallback
        let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        link = rz?.url || rz?.data?.url || rz?.result?.url_hd || rz?.result?.url_sd;

        if (link) return { type: 'video', url: link, desc: 'Facebook (API 2)' };

        // Motor 3: fg-senna (Último recurso)
        const fgRes = await fg.fbdl(url).catch(() => null);
        if (fgRes && (fgRes.HD || fgRes.SD)) {
             return { type: 'video', url: fgRes.HD || fgRes.SD, desc: 'Facebook (API 3)' };
        }

    } catch (e) {
        console.error('[Facebook Cascade Error]', e.message);
    }
    throw new Error('Facebook: Todos os motores de download falharam ou link privado.');
}



// ==================== TWITTER/X ====================
async function baixarTwitter(url) {
    try {
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
        // Motor 1: Siputzx
        let sip = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        let link1 = sip?.data?.url;
        if (link1) return { type: link1.includes('.mp4') ? 'video' : 'image', url: link1, desc: 'Pinterest (API 1)' };

        // Motor 2: Ryzendesu
        let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/pinterest?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        let link2 = rz?.data?.url || rz?.url;
        if (link2) return { type: link2.includes('.mp4') ? 'video' : 'image', url: link2, desc: 'Pinterest (API 2)' };

    } catch (e) {
        console.error('[Pinterest Cascade error]', e.message);
    }

    try { const r = await ytdlpBaixar(url); if (r) return r; } catch {}
    throw new Error('Pinterest: falhou ao extrair mídia em todas as APIs.');
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
        if (result) return result;
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
            await execPromise(`ffmpeg -i "${filePath}" -c copy -movflags +faststart "${finalPath}"`);
            try { fs.unlinkSync(filePath); } catch {}
            return finalPath;
        } else {
            // Se for VP9, AV1, HEVC, etc, o WhatsApp recusa! Tritramos pixels com libx264
            console.log(`[Codec Sniffer] Codec Incompatível (${codec}). Triturando formato para H.264...`);
            const finalPath = filePath.replace('.mp4', '_ready.mp4');
            // fast preset e crf 28 para conversão super leve no VPS de 1GB
            await execPromise(`ffmpeg -i "${filePath}" -c:v libx264 -preset fast -crf 28 -c:a aac -movflags +faststart "${finalPath}"`);
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
            finalFilePath = await verificarEConverterCodec(finalFilePath);
            
            await nazu.sendMessage(from, {
                video: { url: finalFilePath },
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}${resultado.desc ? `\n📝 ${resultado.desc}` : ''}`,
                ...extraAttrs
            }, { quoted: m });
            
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
        // Ex.: Mediafire
        if (resultado.filePath) {
            await nazu.sendMessage(from, {
                document: { url: resultado.filePath },
                mimetype: 'application/octet-stream',
                fileName: resultado.filename || `arquivo.${resultado.ext || 'bin'}`,
                ...extraAttrs
            }, { quoted: m });
            try { fs.unlinkSync(resultado.filePath); } catch {}
        } else {
            const filePath = await baixarStreamLocal(resultado.url, resultado.ext || 'bin');
            await nazu.sendMessage(from, {
                document: { url: filePath },
                mimetype: 'application/octet-stream',
                fileName: resultado.filename || `arquivo.${resultado.ext || 'bin'}`,
                ...extraAttrs
            }, { quoted: m });
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
            await nazu.sendMessage(from, {
                image: { url: thumb },
                caption: msg
            }, { quoted: m });
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
                // Vídeo passa pelo codec sniffer
                let finalPath = dl.filePath;
                finalPath = await verificarEConverterCodec(finalPath);
                
                await nazu.sendMessage(from, {
                    video: { url: finalPath },
                    mimetype: 'video/mp4',
                    caption: `✅ *${pending.title}*`
                }, { quoted: m });
                
                if (finalPath !== dl.filePath) {
                    try { fs.unlinkSync(finalPath); } catch {}
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


// ==================== PLAYVID (ATALHO DIRETO PARA VÍDEO) ====================
export async function playVideo(nazu, from, m, q, reply) {
    // playVideo agora redireciona para o mesmo play com escolha
    return playAudio(nazu, from, m, q, reply);
}

