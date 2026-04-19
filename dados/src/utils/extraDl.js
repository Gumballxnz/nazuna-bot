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
