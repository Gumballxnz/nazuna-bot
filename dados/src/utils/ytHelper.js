import path from 'path'
import fs from 'fs'
import fetch from 'node-fetch'
import fg from 'fg-senna'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajustar para a pasta tmp da Nazuna
const TEMP_DIR = path.join(__dirname, '..', 'tmp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

/**
 * Download from YouTube using fg-senna bypass
 * @param {string} url YouTube URL
 * @param {string} type 'audio' or 'video'
 * @returns {Promise<{filePath: string, title: string, size: number}>}
 */
export async function downloadYT(url, type = 'audio') {
    const filename = `yt_${Date.now()}.${type === 'audio' ? 'mp3' : 'mp4'}`
    const filePath = path.join(TEMP_DIR, filename)

    try {
        let res = type === 'audio' ? await fg.yta(url).catch(() => null) : await fg.ytv(url).catch(() => null)
        let dl_url = res?.dl_url

        if (!dl_url) {
            // Fallback 1: Ryzendesu
            let rz = await fetch(`https://api.ryzendesu.vip/api/downloader/${type === 'audio' ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`).then(v=>v.json()).catch(()=>null)
            dl_url = rz?.url || rz?.data?.url
        }

        if (!dl_url) {
            // Fallback 2: Siputzx (mesma API do FB)
            let sp = await fetch(`https://api.siputzx.my.id/api/d/youtube?url=${encodeURIComponent(url)}`).then(v=>v.json()).catch(()=>null)
            dl_url = sp?.data?.dl || sp?.data?.url
        }

        if (!dl_url) throw new Error('Não foi possível gerar link de download em nenhum motor.')

        let dl = await fetch(dl_url)
        if (!dl.ok) throw new Error(`HTTP ${dl.status}`)
        
        await pipeline(dl.body, fs.createWriteStream(filePath))
        
        let stats = fs.statSync(filePath)
        if (stats.size < 100) throw new Error('Arquivo baixado é muito pequeno ou vazio.')

        return {
            filePath,
            title: res?.title || filename,
            size: stats.size
        }
    } catch (e) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        console.error(`[YouTube Helper] ${e.message}`)
        throw e
    }
}

/**
 * Get video info
 */
export async function getYTInfo(url) {
    try {
        let res = await fg.yta(url)
        return res
    } catch (e) {
        return { title: 'video' }
    }
}
