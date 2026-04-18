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
import fg from 'fg-senna';
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
        const res = await fg.tiktok(url);
        if (res && res.result) {
            const d = res.result;
            if (d.type === 'image' && d.images) {
                return { type: 'images', urls: d.images, desc: d.title || 'TikTok' };
            }
            if (d.play) {
                return { type: 'video', url: d.play, desc: d.title || 'TikTok' };
            }
        }
    } catch (e) {
        console.error('[TikTok fg-senna]', e.message);
    }
    throw new Error('TikTok: Falha ao extrair mídia via fg-senna');
}

// ==================== INSTAGRAM ====================
async function baixarInstagram(url) {
    try {
        const res = await fg.igdl(url);
        if (res && res.dl_url) {
             return { type: 'video', url: res.dl_url, desc: 'Instagram' };
        }
    } catch (e) {
        console.error('[Instagram fg-senna]', e.message);
    }
    throw new Error('Instagram: Falha ao extrair mídia via fg-senna');
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
        // Motor 1: Siputzx (API Leve)
        let res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        let link = res?.data?.url || res?.data?.hd || res?.data?.sd;
        
        if (link) return { type: 'video', url: link, desc: 'Facebook (API 1)' };

        // Motor 2: Ryzendesu Fallback
        let rz = await axios.get(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${encodeURIComponent(url)}`).then(v => v.data).catch(() => null);
        link = rz?.url || rz?.data?.url || rz?.result?.url_hd || rz?.result?.url_sd;

        if (link) return { type: 'video', url: link, desc: 'Facebook (API 2)' };

        // Motor 3: fg-senna (Último recurso, pode falhar em 1GB RAM se usar Puppeteer)
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
        const res = await fg.mediafire(url);
        if (res && res.url) {
             return { type: 'document', url: res.url, filename: res.filename, ext: res.ext, desc: 'Mediafire' };
        }
    } catch (e) {
        console.error('[Mediafire fg-senna]', e.message);
    }
    throw new Error('Mediafire: Falha ao extrair arquivo via fg-senna');
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

    // Método 1: btch-downloader proxy para Pinterest
    try {
        const btch = await import('btch-downloader');
        const bFn = btch.default || btch;
        const res = await bFn.pinterestdl(finalUrl);
        if (res && res.result) {
            return { type: res.result.includes('.mp4') ? 'video' : 'image', url: res.result, desc: 'Pinterest' };
        }
    } catch {}

    try {
        const { data: html } = await axios.get(finalUrl, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }, 
            timeout: 15000 
        });

        const regex = /i\.pinimg\.com[A-Za-z0-9\/_\.\-]+(?:\.jpg|\.png|\.mp4|\.m3u8)/gi;
        const matches = html.match(regex);
        if (matches && matches.length > 0) {
            // Procurar preferencialmente por vídeos, se houver
            const videoMatch = matches.find(m => m.endsWith('.mp4') || m.endsWith('.m3u8'));
            if (videoMatch) {
                return { type: 'video', url: 'https://' + videoMatch, desc: 'Pinterest' };
            }
            
            // Procurar por imagem de alta resolução (originals)
            const imgMatch = matches.find(m => m.includes('/originals/'));
            if (imgMatch) {
                return { type: 'image', url: 'https://' + imgMatch, desc: 'Pinterest' };
            }

            // Fallback para qualquer outro match
            return { type: matches[0].includes('.mp4') ? 'video' : 'image', url: 'https://' + matches[0], desc: 'Pinterest' };
        }
    } catch (e) {
        console.error('[Pinterest native scraper error]', e.message);
    }

    try { const r = await ytdlpBaixar(finalUrl); if (r) return r; } catch {}
    throw new Error('Pinterest: falhou ao extrair do código fonte');
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

        // Flags anti-bloqueio Oracle: extractor-args android, user-agent rotativo, sleep entre requests
        const cmd = `export PATH=/home/ubuntu/.deno/bin:/usr/bin:/usr/local/bin:$PATH && yt-dlp --no-playlist --no-warnings --no-check-certificate --extractor-args 'youtube:player_client=android,web' --user-agent '${UA}' --sleep-requests 1 --retries 3 --socket-timeout 30 -q ${formatArg} --max-filesize 100M -o '${filePath}' '${url}'`;
        
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
        if (resultado.filePath) {
            // Enviado de arquivo local (yt-dlp)
            await nazu.sendMessage(from, {
                video: { url: resultado.filePath },
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}${resultado.desc ? `\n📝 ${resultado.desc}` : ''}`,
                ...extraAttrs
            }, { quoted: m });
            try { fs.unlinkSync(resultado.filePath); } catch {}
        } else if (resultado.isStream) {
            // Stream do ytdl-core
            const filePath = path.join(tmpDir, `yt_${Date.now()}.mp4`);
            await new Promise((resolve, reject) => {
                const dl = resultado.ytdlCore.default || resultado.ytdlCore;
                const stream = dl(resultado.ytdlUrl, { quality: 'highest', filter: 'videoandaudio' });
                const ws = fs.createWriteStream(filePath);
                stream.pipe(ws);
                stream.on('error', reject);
                ws.on('finish', resolve);
                ws.on('error', reject);
            });
            await nazu.sendMessage(from, {
                video: { url: filePath },
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}${resultado.desc ? `\n📝 ${resultado.desc}` : ''}`,
                ...extraAttrs
            }, { quoted: m });
            try { fs.unlinkSync(filePath); } catch {}
        } else {
            // Buffer direto de URL
            const buffer = await baixarBuffer(resultado.url);
            await nazu.sendMessage(from, {
                video: buffer,
                mimetype: 'video/mp4',
                caption: `✅ ${plataforma}${resultado.desc ? `\n📝 ${resultado.desc}` : ''}`,
                ...extraAttrs
            }, { quoted: m });
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
            const buffer = await baixarBuffer(resultado.url);
            await nazu.sendMessage(from, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                ...extraAttrs
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

// ==================== PLAY (BUSCA + DOWNLOAD ÁUDIO) ====================
export async function playAudio(nazu, from, m, q, reply) {
    try {
        if (!q) return reply('❌ Digite o nome da música.\nEx: !play Imagine Dragons');

        if (m.key) await nazu.sendMessage(from, { react: { text: '🎵', key: m.key } }).catch(() => {});

        // Buscar no YouTube usando yt-search (mais rápido)
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
            return nazu.sendMessage(from, { text: '❌ Nenhum resultado encontrado.' }, { quoted: m });
        }

        const ytUrl = video.url;

        try {
            await nazu.sendMessage(from, { text: `📥 Baixando áudio: *${video.title}*...` }, { quoted: m });

            const dl = await downloadYT(ytUrl, 'audio');
            const resultado = {
                type: 'audio',
                url: dl.filePath,
                desc: video.title || 'Música',
                thumbnail: video.image || video.thumbnail,
                sourceUrl: ytUrl,
                isFile: true // Indicar que é um arquivo local
            };
            
            await enviarMidia(nazu, from, m, resultado, 'YouTube');
            if (m.key) await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
            
            // Limpar arquivo temporário
            if (fs.existsSync(dl.filePath)) fs.unlinkSync(dl.filePath);
        } catch (err) {
            console.error('Erro no downloadYT:', err.message);
            if (m.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            nazu.sendMessage(from, { text: `❌ Não consegui baixar: ${video.title}. Tente novamente mais tarde.` }, { quoted: m });
        }
    } catch (err) {
        console.error('Erro no play:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao processar o comando.');
    }
}

// ==================== PLAYVID (BUSCA + DOWNLOAD VÍDEO) ====================
export async function playVideo(nazu, from, m, q, reply) {
    try {
        if (!q) return reply('❌ Digite o nome do vídeo.\nEx: !playvid tutorial javascript');

        if (m.key) await nazu.sendMessage(from, { react: { text: '🎬', key: m.key } }).catch(() => {});

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
            return nazu.sendMessage(from, { text: '❌ Nenhum resultado encontrado.' }, { quoted: m });
        }

        const ytUrl = video.url;

        try {
            await nazu.sendMessage(from, { text: `📥 Baixando vídeo: *${video.title}*...` }, { quoted: m });

            const dl = await downloadYT(ytUrl, 'video');
            const resultado = {
                type: 'video',
                url: dl.filePath,
                desc: video.title || 'Vídeo',
                isFile: true
            };
            
            await enviarMidia(nazu, from, m, resultado, 'YouTube');
            if (m.key) nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
            
            // Limpar arquivo temporário
            if (fs.existsSync(dl.filePath)) fs.unlinkSync(dl.filePath);
        } catch (err) {
            console.error('Erro no downloadYT (video):', err.message);
            if (m.key) nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
            nazu.sendMessage(from, { text: `❌ Não consegui baixar: ${video.title}. Tente novamente mais tarde.` }, { quoted: m });
        }
    } catch (err) {
        console.error('Erro no playvid:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao buscar vídeo.');
    }
}
