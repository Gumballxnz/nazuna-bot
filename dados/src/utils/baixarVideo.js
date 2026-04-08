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
    return null;
}

// ==================== TIKTOK ====================
async function baixarTiktok(url) {
    // Método 1: TikWM API (mais estável)
    try {
        const { data } = await axios.post('https://tikwm.com/api/',
            `url=${encodeURIComponent(url)}&count=12&cursor=0&web=1&hd=1`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, timeout: 15000 }
        );
    if (data?.code === 0 && data?.data) {
            const d = data.data;
            // TikWM às vezes retorna URLs relativas, prefixar com base
            const fixUrl = (u) => u && u.startsWith('/') ? `https://tikwm.com${u}` : u;
            if (d.images && d.images.length > 0) {
                return { type: 'images', urls: d.images.map(fixUrl), desc: d.title || 'TikTok' };
            }
            const videoUrl = fixUrl(d.hdplay || d.play || d.wmplay);
            if (videoUrl) return { type: 'video', url: videoUrl, desc: d.title || 'TikTok' };
        }
    } catch (e) { console.error('[TikTok TikWM]', e.message); }

    // Método 2: @tobyg74/tiktok-api-dl
    try {
        const Tiktok = await import('@tobyg74/tiktok-api-dl');
        const TiktokDL = Tiktok.Downloader || Tiktok.default?.Downloader || Tiktok.default;
        for (const version of ['v2', 'v1', 'v3']) {
            try {
                const result = await TiktokDL(url, { version });
                if (result.status === 'success' && result.result) {
                    const r = result.result;
                    if (r.type === 'video' && r.video) {
                        const videoUrl = r.video.downloadAddr?.[0] || r.video.playAddr?.[0];
                        if (videoUrl) return { type: 'video', url: videoUrl, desc: r.desc || 'TikTok' };
                    }
                    if (r.type === 'image' && r.images) {
                        return { type: 'images', urls: r.images, desc: r.desc || 'TikTok' };
                    }
                }
            } catch {}
        }
    } catch (e) { console.error('[TikTok npm]', e.message); }

    throw new Error('TikTok: todos os métodos falharam');
}

// ==================== INSTAGRAM ====================
async function baixarInstagram(url) {
    // Método 1: Cobalt V11 API
    try {
        const { data } = await axios.post('https://api.cobalt.tools/', { url }, {
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA }, timeout: 15000
        });
        if (data?.url) return { type: 'video', url: data.url, desc: 'Instagram' };
    } catch {}

    // Método 2: instagram-url-direct
    try {
        const igMod = await import('instagram-url-direct');
        const igFn = igMod.instagramGetUrl || igMod.default;
        if (igFn) {
            const result = await igFn(url);
            if (result?.url_list?.length > 0) return { type: 'video', url: result.url_list[0], desc: 'Instagram' };
        }
    } catch {}

    // Método 3: yt-dlp 
    try {
        const result = await ytdlpBaixar(url);
        if (result) return result;
    } catch {}

    // Método 4: btch-downloader
    try {
        const btch = await import('btch-downloader');
        const res = await btch.igdl(url);
        if (res && res.status && res.result?.length > 0) {
            const urlItem = res.result[0].url || res.result[0].video || res.result[0].image || res.result[0];
            if (urlItem && typeof urlItem === 'string') {
                return { type: urlItem.includes('.mp4') ? 'video' : 'image', url: urlItem, desc: 'Instagram' };
            }
        }
    } catch {}

    throw new Error('Todos os métodos do Instagram falharam (possível bloqueio da AWS)');
}

// ==================== YOUTUBE ====================
async function baixarYoutube(url, formato = 'video') {
    // YouTube de IPs AWS é muito restritivo
    // Método 1: yt-dlp
    try {
        const result = await ytdlpBaixar(url, formato);
        if (result) return result;
    } catch (e) { console.error('[YouTube yt-dlp]', e.message); }

    // Método 2: btch-downloader (Contorna o block da AWS)
    try {
        const btch = await import('btch-downloader');
        const bFn = btch.default || btch;
        
        if (formato === 'audio') {
            const res = await bFn.ytmp3(url);
            if (res && res.status && res.result) {
                return { type: 'audio', url: res.result, desc: 'YouTube Áudio', isStream: false, formato };
            }
        } else {
            const res = await bFn.ytmp4(url);
            if (res && res.status && res.result) {
                return { type: 'video', url: res.result, desc: 'YouTube Vídeo', isStream: false, formato };
            }
        }
    } catch (e) { console.error('[YouTube btch-dl]', e.message); }

    // Método 3: ytdl-core como fallback
    try {
        const ytdl = await import('@distube/ytdl-core');
        const ytdlCore = ytdl.default || ytdl;
        const info = await ytdlCore.getInfo(url);
        
        if (formato === 'audio') {
            const format = ytdlCore.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
            if (format?.url) return { type: 'audio', url: format.url, desc: info.videoDetails?.title || 'YouTube', isStream: true, ytdlCore, ytdlUrl: url, formato };
        } else {
            const format = ytdlCore.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' });
            if (format?.url) return { type: 'video', url: format.url, desc: info.videoDetails?.title || 'YouTube', isStream: true, ytdlCore, ytdlUrl: url, formato };
        }
    } catch (e) { console.error('[YouTube ytdl-core]', e.message); }

    throw new Error('YouTube bloqueado no Datacenter. Todos os métodos falharam.');
}

// ==================== FACEBOOK ====================
async function baixarFacebook(url) {
    // Método 1: Scraping direto
    try {
        const { data: html } = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }
        });
        const hdMatch = html.match(/"hd_src":"([^"]+)"/) || html.match(/hd_src\s*:\s*"([^"]+)"/);
        const sdMatch = html.match(/"sd_src":"([^"]+)"/) || html.match(/sd_src\s*:\s*"([^"]+)"/);
        const videoUrl = (hdMatch || sdMatch)?.[1]?.replace(/\\/g, '');
        if (videoUrl) return { type: 'video', url: videoUrl, desc: 'Facebook' };
    } catch {}

    // Método 2: yt-dlp
    try {
        const result = await ytdlpBaixar(url);
        if (result) return result;
    } catch {}

    throw new Error('Facebook: todos os métodos falharam');
}

// ==================== TWITTER/X ====================
async function baixarTwitter(url) {
    // Método 1: fxtwitter
    try {
        // Extrair ID do tweet
        const idMatch = url.match(/status\/(\d+)/);
        if (idMatch) {
            const { data } = await axios.get(`https://api.fxtwitter.com/i/status/${idMatch[1]}`, { timeout: 10000 });
            if (data?.tweet?.media?.videos?.[0]) {
                const video = data.tweet.media.videos[0];
                const best = video.url || video.variants?.filter(v => v.content_type === 'video/mp4')
                    ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))?.[0]?.url;
                if (best) return { type: 'video', url: best, desc: 'Twitter/X' };
            }
            // Se tem imagens
            if (data?.tweet?.media?.photos?.length > 0) {
                return { type: 'images', urls: data.tweet.media.photos.map(p => p.url), desc: 'Twitter/X' };
            }
        }
    } catch (e) { console.error('[Twitter fxtwitter]', e.message); }

    // Método 2: vxtwitter 
    try {
        const idMatch = url.match(/status\/(\d+)/);
        if (idMatch) {
            const { data } = await axios.get(`https://api.vxtwitter.com/i/status/${idMatch[1]}`, { timeout: 10000 });
            if (data?.mediaURLs?.length > 0) {
                const videoUrl = data.mediaURLs.find(u => u.includes('.mp4') || u.includes('video'));
                if (videoUrl) return { type: 'video', url: videoUrl, desc: 'Twitter/X' };
                return { type: 'images', urls: data.mediaURLs, desc: 'Twitter/X' };
            }
        }
    } catch (e) { console.error('[Twitter vxtwitter]', e.message); }

    // Método 3: yt-dlp
    try {
        const result = await ytdlpBaixar(url);
        if (result) return result;
    } catch {}

    throw new Error('Twitter: todos os métodos falharam');
}

// ==================== PINTEREST ====================
async function baixarPinterest(url) {
    // Resolver URL curta primeiro
    let finalUrl = url;
    if (url.includes('pin.it')) {
        try {
            const resp = await axios.head(url, { maxRedirects: 5, timeout: 10000 });
            finalUrl = resp.request?.res?.responseUrl || url;
        } catch {}
    }

    try {
        const { data: html } = await axios.get(finalUrl, { headers: { 'User-Agent': UA }, timeout: 15000 });
        const videoMatch = html.match(/"url":"(https:\/\/[^"]*\.mp4[^"]*)"/);
        // O Pinterest coloca vídeos e imagens no og:image se não logado
        if (videoMatch) return { type: 'video', url: videoMatch[1].replace(/\\/g, ''), desc: 'Pinterest' };
        
        const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
        if (imgMatch) return { type: 'image', url: imgMatch[1], desc: 'Pinterest' };
    } catch {}

    // btch-downloader fallback
    try {
        const btch = await import('btch-downloader');
        const res = await btch.pindl(finalUrl);
        if (res && res.result) {
            return { type: res.result.includes('.mp4') ? 'video' : 'image', url: res.result, desc: 'Pinterest' };
        }
    } catch {}

    try { const r = await ytdlpBaixar(finalUrl); if (r) return r; } catch {}
    throw new Error('Pinterest: falhou');
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
            formatArg = "-f 'best[ext=mp4][filesize<100M]/best[ext=mp4]/best'";
        }

        const cmd = `export PATH=/home/ubuntu/.deno/bin:/usr/bin:/usr/local/bin:$PATH && yt-dlp --no-playlist --no-warnings -q ${formatArg} --max-filesize 100M -o '${filePath}' '${url}'`;
        
        const proc = exec(cmd, { timeout: 45000 }, (error) => {
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

// ==================== DOWNLOAD DE BUFFER ====================
async function baixarBuffer(videoUrl) {
    const response = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024,
        headers: { 'User-Agent': UA }
    });
    return Buffer.from(response.data);
}

// ==================== ENVIAR MÍDIA ====================
async function enviarMidia(nazu, from, m, resultado, plataforma) {
    if (resultado.type === 'video') {
        if (resultado.filePath) {
            // Enviado de arquivo local (yt-dlp)
            await nazu.sendMessage(from, {
                video: { url: resultado.filePath },
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}`
            }, { quoted: m });
            try { fs.unlinkSync(resultado.filePath); } catch {}
        } else if (resultado.isStream) {
            // YouTube stream
            const ytdlCore = resultado.ytdlCore;
            const filePath = path.join(tmpDir, `yt_${Date.now()}.mp4`);
            await new Promise((resolve, reject) => {
                const dl = resultado.ytdlCore.default || resultado.ytdlCore;
                const filter = resultado.formato === 'audio' ? 'audioonly' : 'videoandaudio';
                const quality = resultado.formato === 'audio' ? 'highestaudio' : 'highest';
                const stream = dl(resultado.ytdlUrl, { quality, filter });
                const ws = fs.createWriteStream(filePath);
                stream.pipe(ws);
                stream.on('error', reject);
                ws.on('finish', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('Timeout')), 120000);
            });
            await nazu.sendMessage(from, {
                video: { url: filePath },
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}`
            }, { quoted: m });
            try { fs.unlinkSync(filePath); } catch {}
        } else {
            // Buffer direto
            const buffer = await baixarBuffer(resultado.url);
            await nazu.sendMessage(from, {
                video: buffer,
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}`
            }, { quoted: m });
        }
    } else if (resultado.type === 'audio') {
        if (resultado.filePath) {
            await nazu.sendMessage(from, {
                audio: { url: resultado.filePath },
                mimetype: 'audio/mpeg'
            }, { quoted: m });
            try { fs.unlinkSync(resultado.filePath); } catch {}
        } else {
            const buffer = await baixarBuffer(resultado.url);
            await nazu.sendMessage(from, {
                audio: buffer,
                mimetype: 'audio/mpeg'
            }, { quoted: m });
        }
    } else if (resultado.type === 'image') {
        const buffer = await baixarBuffer(resultado.url);
        await nazu.sendMessage(from, {
            image: buffer,
            caption: `✅ ${plataforma}`
        }, { quoted: m });
    } else if (resultado.type === 'images') {
        for (const imgUrl of resultado.urls.slice(0, 10)) {
            try {
                const buffer = await baixarBuffer(imgUrl);
                await nazu.sendMessage(from, {
                    image: buffer,
                    caption: `✅ ${plataforma}`
                }, { quoted: m });
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

        // Mensagem de status progressiva para evitar que ele declare ser "vídeo" indiscriminadamente
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
                default:            resultado = await baixarGenerico(url, plataforma); break;
            }
        } catch (err) {
            console.error(`[Download ${plataforma}] Erro:`, err.message);
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply(`❌ Falha ao baixar do ${plataforma}.`);
        }

        if (!resultado) {
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply(`❌ Não foi possível extrair mídia do ${plataforma}.`);
        }

        // Enviar a mídia
        await enviarMidia(nazu, from, m, resultado, plataforma);

        // Reação de sucesso
        if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error('Erro fatal no downloader:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao processar download.');
    }
}

// ==================== PLAY (BUSCA + DOWNLOAD ÁUDIO) ====================
export async function playAudio(nazu, from, m, q, reply) {
    try {
        if (!q) return reply('❌ Digite o nome da música.\nEx: !play Imagine Dragons');

        if (m.key) await nazu.sendMessage(from, { react: { text: '🎵', key: m.key } }).catch(() => {});

        // Buscar no YouTube (tentando 2 métodos)
        let video = null;
        try {
            const yts = await import('yt-search');
            const searchFn = yts.default || yts;
            const res = await searchFn(q);
            if (res && res.videos && res.videos.length > 0) {
                video = res.videos[0];
                video.id = video.videoId; // Padronizar API
            }
        } catch (e) { console.error('[yt-search error]', e.message); }

        if (!video) {
            try {
                const btch = await import('btch-downloader');
                const bFn = btch.default || btch;
                const res = await bFn.yts(q);
                if (res && res.result && res.result.length > 0) {
                    video = res.result[0];
                }
            } catch (e) { console.error('[btch-yts error]', e.message); }
        }
        
        if (!video) {
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply('❌ Nenhum resultado encontrado.');
        }

        const ytUrl = video.url || `https://youtube.com/watch?v=${video.id}`;

        // Tentar baixar áudio
        try {
            const resultado = await baixarYoutube(ytUrl, 'audio');
            resultado.desc = video.title || 'Áudio';
            await enviarMidia(nazu, from, m, resultado, 'YouTube');
            if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
        } catch {
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            reply(`❌ Não consegui baixar: ${video.title}`);
        }
    } catch (err) {
        console.error('Erro no play:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao buscar música.');
    }
}

// ==================== PLAYVID (BUSCA + DOWNLOAD VÍDEO) ====================
export async function playVideo(nazu, from, m, q, reply) {
    try {
        if (!q) return reply('❌ Digite o nome do vídeo.\nEx: !playvid tutorial javascript');

        if (m.key) await nazu.sendMessage(from, { react: { text: '🎬', key: m.key } }).catch(() => {});

        // Buscar no YouTube (tentando 2 métodos)
        let video = null;
        try {
            const yts = await import('yt-search');
            const searchFn = yts.default || yts;
            const res = await searchFn(q);
            if (res && res.videos && res.videos.length > 0) {
                video = res.videos[0];
                video.id = video.videoId;
            }
        } catch (e) { console.error('[yt-search error]', e.message); }

        if (!video) {
            try {
                const btch = await import('btch-downloader');
                const bFn = btch.default || btch;
                const res = await bFn.yts(q);
                if (res && res.result && res.result.length > 0) {
                    video = res.result[0];
                }
            } catch (e) { console.error('[btch-yts error]', e.message); }
        }
        
        if (!video) {
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            return reply('❌ Nenhum resultado encontrado.');
        }

        const ytUrl = video.url || `https://youtube.com/watch?v=${video.id}`;

        try {
            const resultado = await baixarYoutube(ytUrl, 'video');
            resultado.desc = video.title || 'Vídeo';
            await enviarMidia(nazu, from, m, resultado, 'YouTube');
            if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
        } catch {
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            reply(`❌ Não consegui baixar: ${video.title}`);
        }
    } catch (err) {
        console.error('Erro no playvid:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao buscar vídeo.');
    }
}
