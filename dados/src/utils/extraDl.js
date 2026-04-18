import axios from 'axios';
import fs from 'fs';
import path from 'path';
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
 * Download de APK via Aptoide API
 */
export async function downloadAPK(query) {
    const res = await axios.get(`https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(query)}&limit=1`).then(v => v.data).catch(() => null);
    if (!res || !res.datalist || res.datalist.list.length === 0) throw new Error('App não encontrado');

    const app = res.datalist.list[0];
    return {
        name: app.name,
        package: app.package,
        size: (app.size / 1024 / 1024).toFixed(2),
        dlUrl: app.file.path
    };
}
