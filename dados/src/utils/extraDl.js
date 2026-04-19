import axios from 'axios';
import fs from 'fs';
import path from 'path';
import fg from 'fg-senna';
import { pipeline } from 'stream/promises';

/**
 * Download de Twitter via VxTwitter API
 */
export async function downloadTwitter(url) {
    const tweetId = url.match(/\/status\/(\d+)/)?.[1];
    if (!tweetId) throw new Error('Link do Twitter inválido');

    const res = await axios.get(`https://api.vxtwitter.com/status/${tweetId}`).then(v => v.data).catch(() => null);
    if (!res || (!res.media_extended && !res.media_urls)) throw new Error('Mídia não encontrada');

    const mediaList = res.media_extended || res.media_urls.map(u => ({ url: u, type: u.includes('.mp4') ? 'video' : 'image' }));
    
    return {
        author: res.user_name,
        text: res.text,
        media: mediaList
    };
}

/**
 * Download de APK via APKPure (Motor Senna Bot)
 */
export async function downloadAPK(query) {
    // Fase 1: Pesquisa no APKPure (Motor de Confiança do Senna)
    const searchRes = await fg.apks(query).catch(() => null);
    if (!searchRes || searchRes.length === 0) throw new Error('App não encontrado no Google Play/APKPure.');

    const app = searchRes[0];
    
    // Fase 2: Extrair link de download real
    const appDl = await fg.apkdl(app.pkg).catch(() => null);
    if (!appDl || !appDl.download) {
        // Fallback Aptoide se APKPure falhar
        const resAptoide = await axios.get(`https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(query)}&limit=1`).then(v => v.data).catch(() => null);
        if (resAptoide && resAptoide.datalist?.list?.length > 0) {
            const apt = resAptoide.datalist.list[0];
            return {
                name: apt.name,
                package: apt.package,
                size: (apt.size / 1024 / 1024).toFixed(2),
                icon: apt.icon,
                developer: apt.developer?.name || 'N/A',
                version: apt.file?.vername || 'N/A',
                downloads: apt.stats?.downloads?.toLocaleString() || 'N/A',
                dlUrl: apt.file.path,
                engine: 'Aptoide'
            };
        }
        throw new Error('Falha ao extrair link de download.');
    }

    return {
        name: appDl.name || app.name,
        package: app.pkg,
        size: appDl.size || 'N/A',
        icon: appDl.icon || app.icon,
        developer: appDl.developer || 'N/A',
        version: appDl.version || 'N/A',
        downloads: 'N/A',
        dlUrl: appDl.download,
        engine: 'APKPure'
    };
}

/**
 * Download de GDrive via fg-senna
 */
export async function downloadGDrive(url) {
    const res = await fg.gdrive(url).catch(() => null);
    if (!res || !res.downloadUrl) throw new Error('Falha ao obter link do GDrive');
    return res; 
    // retorna { fileName, mimetype, size, downloadUrl }
}

/**
 * Download de MediaFire via fg-senna
 */
export async function downloadMediafire(url) {
    const res = await fg.mediafire(url).catch(() => null);
    if (!res || !res.url) throw new Error('Falha ao extrair do Mediafire');
    return res;
    // retorna { url, type, filename, ext, aploud, size }
}

/**
 * Download de Spotify via Siputzx (Motor Secundário Senna)
 */
export async function downloadSpotify(url) {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(url)}`, { timeout: 20000 }).then(v => v.data).catch(() => null);
    if (!res || !res.data || !res.data.download) {
        throw new Error('Música não encontrada ou API indisponível');
    }
    return {
        title: res.data.title,
        artist: res.data.artist,
        album: res.data.album,
        thumbnail: res.data.thumbnail,
        url: res.data.download
    };
}
