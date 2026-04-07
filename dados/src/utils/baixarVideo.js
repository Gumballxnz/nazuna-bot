/**
 * Módulo de Download Universal - Sem APIs pagas
 * Usa pacotes npm nativos (JavaScript puro) para máxima velocidade
 * TikTok: @tobyg74/tiktok-api-dl
 * YouTube: @distube/ytdl-core
 * Instagram/Facebook/Twitter: scraping via axios
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta temporária
const tmpDir = path.join(__dirname, '..', '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Limpeza automática a cada 30 min
setInterval(() => {
    try {
        const now = Date.now();
        for (const f of fs.readdirSync(tmpDir)) {
            const fp = path.join(tmpDir, f);
            if (now - fs.statSync(fp).mtimeMs > 1800000) fs.unlinkSync(fp);
        }
    } catch {}
}, 1800000);

// ==================== DETECTAR PLATAFORMA ====================
function detectarPlataforma(url) {
    const u = url.toLowerCase();
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('instagram.com') || u.includes('instagr.am')) return 'Instagram';
    if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'Facebook';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
    return null;
}

// ==================== TIKTOK ====================
async function baixarTiktok(url) {
    const Tiktok = await import('@tobyg74/tiktok-api-dl');
    const TiktokDL = Tiktok.Downloader || Tiktok.default?.Downloader || Tiktok.default;
    
    // Tentar v1 primeiro, depois v2, depois v3
    for (const version of ['v1', 'v2', 'v3']) {
        try {
            const result = await TiktokDL(url, { version });
            if (result.status === 'success' && result.result) {
                const r = result.result;
                // Para vídeo
                if (r.type === 'video' && r.video) {
                    const videoUrl = r.video.downloadAddr?.[0] || r.video.playAddr?.[0];
                    if (videoUrl) return { type: 'video', url: videoUrl, desc: r.desc };
                }
                // Para imagens/slides
                if (r.type === 'image' && r.images) {
                    return { type: 'images', urls: r.images, desc: r.desc };
                }
            }
        } catch (e) {
            console.error(`[TikTok v${version}] erro:`, e.message);
        }
    }
    throw new Error('Falha em todas as versões do TikTok');
}

// ==================== YOUTUBE ====================
async function baixarYoutube(url) {
    const ytdl = await import('@distube/ytdl-core');
    const ytdlCore = ytdl.default || ytdl;
    
    const info = await ytdlCore.getInfo(url);
    const format = ytdlCore.chooseFormat(info.formats, { 
        quality: 'highest',
        filter: 'videoandaudio' 
    });

    if (!format || !format.url) throw new Error('Formato não encontrado');

    const title = info.videoDetails?.title || 'Vídeo';
    return { type: 'video', url: format.url, desc: title, isStream: true, ytdlCore, ytdlUrl: url };
}

// ==================== INSTAGRAM ====================
async function baixarInstagram(url) {
    // Método 1: API pública gratuita
    try {
        const { data } = await axios.get(`https://igdownloader.app/api/v1/media?url=${encodeURIComponent(url)}`, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (data && data.items && data.items.length > 0) {
            const item = data.items[0];
            return { type: 'video', url: item.url, desc: 'Instagram' };
        }
    } catch {}

    // Método 2: Scraping direto
    try {
        const { data: html } = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });
        const videoMatch = html.match(/"video_url":"([^"]+)"/);
        if (videoMatch) {
            const videoUrl = videoMatch[1].replace(/\\u0026/g, '&');
            return { type: 'video', url: videoUrl, desc: 'Instagram' };
        }
    } catch {}

    throw new Error('Instagram bloqueou a solicitação');
}

// ==================== FACEBOOK ====================
async function baixarFacebook(url) {
    try {
        const { data: html } = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });
        // Procurar URL HD
        const hdMatch = html.match(/"hd_src":"([^"]+)"/) || html.match(/hd_src\s*:\s*"([^"]+)"/);
        const sdMatch = html.match(/"sd_src":"([^"]+)"/) || html.match(/sd_src\s*:\s*"([^"]+)"/);
        const videoUrl = (hdMatch || sdMatch)?.[1]?.replace(/\\/g, '');
        if (videoUrl) return { type: 'video', url: videoUrl, desc: 'Facebook' };
    } catch {}
    throw new Error('Facebook bloqueou a solicitação');
}

// ==================== TWITTER/X ====================
async function baixarTwitter(url) {
    // Usar API fxtwitter (gratuita)
    try {
        const tweetUrl = url.replace('twitter.com', 'api.fxtwitter.com').replace('x.com', 'api.fxtwitter.com');
        const { data } = await axios.get(tweetUrl, { timeout: 15000 });
        if (data?.tweet?.media?.videos?.[0]) {
            const video = data.tweet.media.videos[0];
            const bestVariant = video.variants?.filter(v => v.content_type === 'video/mp4')
                ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))?.[0];
            if (bestVariant) return { type: 'video', url: bestVariant.url, desc: 'Twitter/X' };
            if (video.url) return { type: 'video', url: video.url, desc: 'Twitter/X' };
        }
    } catch {}
    throw new Error('Twitter/X bloqueou a solicitação');
}

// ==================== DOWNLOAD DO BUFFER ====================
async function baixarBuffer(videoUrl) {
    const response = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024, // 100MB
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    return Buffer.from(response.data);
}

// ==================== FUNÇÃO PRINCIPAL (COMANDO) ====================
export default async function baixarVideoLocal(nazu, from, m, q, reply) {
    try {
        if (!q) {
            return reply('❌ Envie um link válido.\n\n📌 *Sites suportados:*\n• TikTok\n• YouTube\n• Instagram\n• Facebook\n• Twitter/X');
        }

        const url = q.trim().split(' ')[0];
        const plataforma = detectarPlataforma(url);

        if (!plataforma) {
            return reply('❌ Link não suportado.\n\n📌 *Sites suportados:*\n• TikTok\n• YouTube\n• Instagram\n• Facebook\n• Twitter/X');
        }

        // Reagir com loading
        if (m.key) {
            await nazu.sendMessage(from, { react: { text: '⏳', key: m.key } }).catch(() => {});
        }

        // Baixar conforme plataforma
        let resultado;
        try {
            switch (plataforma) {
                case 'TikTok': resultado = await baixarTiktok(url); break;
                case 'YouTube': resultado = await baixarYoutube(url); break;
                case 'Instagram': resultado = await baixarInstagram(url); break;
                case 'Facebook': resultado = await baixarFacebook(url); break;
                case 'Twitter/X': resultado = await baixarTwitter(url); break;
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

        // Enviar conforme tipo
        if (resultado.type === 'video') {
            // YouTube com stream especial
            if (resultado.isStream) {
                const ytdlCore = resultado.ytdlCore;
                const filePath = path.join(tmpDir, `yt_${Date.now()}.mp4`);
                
                await new Promise((resolve, reject) => {
                    const stream = ytdlCore.default
                        ? ytdlCore.default(resultado.ytdlUrl, { quality: 'highest', filter: 'videoandaudio' })
                        : ytdlCore(resultado.ytdlUrl, { quality: 'highest', filter: 'videoandaudio' });
                    const writeStream = fs.createWriteStream(filePath);
                    stream.pipe(writeStream);
                    stream.on('error', reject);
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                    // Timeout de 2 minutos
                    setTimeout(() => reject(new Error('Timeout YouTube')), 120000);
                });

                const stats = fs.statSync(filePath);
                if (stats.size > 100 * 1024 * 1024) {
                    fs.unlinkSync(filePath);
                    return reply('❌ Vídeo muito grande (>100MB).');
                }

                await nazu.sendMessage(from, {
                    video: { url: filePath },
                    mimetype: 'video/mp4',
                    caption: `✅ Download automático do ${plataforma}!`
                }, { quoted: m });

                fs.unlinkSync(filePath);
            } else {
                // Download direto via buffer (TikTok, Instagram, etc.)
                const buffer = await baixarBuffer(resultado.url);
                
                await nazu.sendMessage(from, {
                    video: buffer,
                    mimetype: 'video/mp4',
                    caption: `✅ Download automático do ${plataforma}!`
                }, { quoted: m });
            }
        } else if (resultado.type === 'images') {
            // TikTok slides
            for (const imgUrl of resultado.urls.slice(0, 10)) {
                try {
                    const buffer = await baixarBuffer(imgUrl);
                    await nazu.sendMessage(from, {
                        image: buffer,
                        caption: `✅ Download automático do ${plataforma}!`
                    }, { quoted: m });
                } catch {}
            }
        }

        // Reagir com sucesso
        if (m.key) {
            await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});
        }

    } catch (err) {
        console.error('Erro fatal no downloader:', err);
        if (m?.key) await nazu.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        reply('❌ Erro ao processar download.');
    }
}
