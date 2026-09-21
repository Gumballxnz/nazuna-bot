import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

class MediaCleaner {
    constructor() {
        this.baseDir = path.join(__dirname, '../../../');
        this.mediaDirs = [
            path.join(this.baseDir, 'dados/midias'),
            path.join(this.baseDir, 'temp'),
            '/tmp/nazuna-media',
            '/tmp/baileys_media_cache'
        ];
        this.tempPrefixes = ['tmp_', 'temp_', 'download_', 'media_', 'baileys_'];
        this.maxFileAge = 2 * 60 * 60 * 1000;
        this.maxMediaAge = 24 * 60 * 60 * 1000;
        this.maxDirSize = 500 * 1024 * 1024;
        this.allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.webm', '.mp3', '.ogg', '.webp', '.pdf'];
    }

    async startMediaCleaning() {

        try {

            await this.ensureDirectories();

            for (const dir of this.mediaDirs) {
                await this.cleanDirectory(dir);
            }

            await this.cleanBaileysCache();

            await this.cleanOldDownloads();

        } catch (error) {
            console.error('❌ Erro na limpeza automática de mídia:', error.message);
        }
    }

    async ensureDirectories() {
        for (const dir of this.mediaDirs) {
            try {
                await fs.access(dir);
            } catch {
                try {
                    await fs.mkdir(dir, { recursive: true });
                } catch (error) {
                    console.warn(`⚠️ Não foi possível criar diretório ${dir}:`, error.message);
                }
            }
        }
    }

    async cleanDirectory(dirPath) {
        try {
            const exists = await fs.access(dirPath).then(() => true).catch(() => false);
            if (!exists) {
                return { deletedFiles: 0, freedSpace: 0 };
            }

            const files = await fs.readdir(dirPath);
            let deletedFiles = 0;
            let freedSpace = 0;

            for (const file of files) {
                const filePath = path.join(dirPath, file);

                try {
                    const stats = await fs.stat(filePath);

                    if (stats.isDirectory()) continue;

                    const shouldDelete = await this.shouldDeleteFile(filePath, stats);

                    if (shouldDelete) {
                        freedSpace += stats.size;
                        await fs.unlink(filePath);
                        deletedFiles++;
                    }
                } catch (error) {
                    console.warn(`⚠️ Erro ao processar arquivo ${file}:`, error.message);

                }
            }

            if (deletedFiles > 0) {
            }

            return { deletedFiles, freedSpace };
        } catch (error) {
            console.error(`❌ Erro ao limpar diretório ${dirPath}:`, error.message);
            return { deletedFiles: 0, freedSpace: 0 };
        }
    }

    async shouldDeleteFile(filePath, stats) {
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();
        const fileAge = Date.now() - stats.mtime.getTime();

        if (!this.allowedExtensions.includes(fileExt) && fileExt !== '') {
            return true;
        }

        const isTemp = this.tempPrefixes.some(prefix => fileName.startsWith(prefix));
        if (isTemp && fileAge > this.maxFileAge) {
            return true;
        }

        if (fileAge > this.maxMediaAge) {
            return true;
        }

        if (stats.size > 50 * 1024 * 1024) {
            return true;
        }

        if (await this.isFileCorrupted(filePath)) {
            return true;
        }

        return false;
    }

    async isFileCorrupted(filePath) {
        try {
            const fileExt = path.extname(filePath).toLowerCase();

            if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.avi', '.mkv'].includes(fileExt)) {
                try {
                    await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { timeout: 10000 });
                    return false;
                } catch {
                    return true;
                }
            }

            const stats = await fs.stat(filePath);
            return stats.size === 0;
        } catch {
            return true;
        }
    }

    async cleanBaileysCache() {
        const cacheLocations = [
            '/tmp/baileys_media_cache',
            path.join(this.baseDir, 'node_modules/@cognima/walib/cache'),
            path.join(this.baseDir, 'dados/database/baileys_cache')
        ];

        for (const location of cacheLocations) {
            try {
                const exists = await fs.access(location).then(() => true).catch(() => false);
                if (exists) {
                    await this.cleanDirectory(location);
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao limpar cache Baileys em ${location}:`, error.message);
            }
        }
    }

    async cleanOldDownloads() {
        const downloadPaths = [
            path.join(process.env.HOME || '/tmp', 'Downloads/nazuna_*'),
            '/tmp/nazuna_downloads',
            path.join(this.baseDir, 'downloads')
        ];

        for (const downloadPath of downloadPaths) {
            try {
                if (downloadPath.includes('*')) {

                    const { stdout } = await execAsync(`find ${path.dirname(downloadPath)} -name "${path.basename(downloadPath)}" -type f 2>/dev/null || true`);
                    const files = stdout.trim().split('\n').filter(f => f);

                    for (const file of files) {
                        try {
                            const stats = await fs.stat(file);
                            const age = Date.now() - stats.mtime.getTime();

                            if (age > this.maxMediaAge) {
                                await fs.unlink(file);
                            }
                        } catch (error) {
                            console.warn(`⚠️ Erro ao processar download ${file}:`, error.message);
                        }
                    }
                } else {
                    const exists = await fs.access(downloadPath).then(() => true).catch(() => false);
                    if (exists) {
                        await this.cleanDirectory(downloadPath);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao limpar downloads em ${downloadPath}:`, error.message);
            }
        }
    }

    async getDirectorySize(dirPath) {
        try {
            const { stdout } = await execAsync(`du -sb "${dirPath}" 2>/dev/null || echo "0"`);
            return parseInt(stdout.split('\t')[0]) || 0;
        } catch {
            return 0;
        }
    }

    async enforceDirectoryLimit(dirPath) {
        try {
            const currentSize = await this.getDirectorySize(dirPath);

            if (currentSize <= this.maxDirSize) {
                return { success: true, freedSpace: 0 };
            }

            const files = await fs.readdir(dirPath);
            const fileStats = [];

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const stats = await fs.stat(filePath);
                    if (!stats.isDirectory()) {
                        fileStats.push({
                            path: filePath,
                            name: file,
                            size: stats.size,
                            mtime: stats.mtime.getTime()
                        });
                    }
                } catch (error) {
                    console.warn(`⚠️ Erro ao obter stats do arquivo ${file}:`, error.message);
                }
            }

            fileStats.sort((a, b) => a.mtime - b.mtime);

            let deletedFiles = 0;
            let freedSpace = 0;
            let remainingSize = currentSize;

            for (const file of fileStats) {
                if (remainingSize <= this.maxDirSize) break;

                try {
                    await fs.unlink(file.path);
                    remainingSize -= file.size;
                    freedSpace += file.size;
                    deletedFiles++;
                } catch (error) {
                    console.warn(`⚠️ Erro ao remover arquivo ${file.name}:`, error.message);
                }
            }

            return { success: true, deletedFiles, freedSpace };
        } catch (error) {
            console.error(`❌ Erro ao aplicar limite do diretório ${dirPath}:`, error.message);
            return { success: false };
        }
    }

    async compressLargeMedia() {

        for (const dir of this.mediaDirs) {
            try {
                const exists = await fs.access(dir).then(() => true).catch(() => false);
                if (!exists) continue;

                await this.compressMediaInDirectory(dir);
            } catch (error) {
                console.warn(`⚠️ Erro ao comprimir mídia em ${dir}:`, error.message);
            }
        }
    }

    async compressMediaInDirectory(dirPath) {
        try {
            const files = await fs.readdir(dirPath);
            let compressedCount = 0;
            let spaceSaved = 0;

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const fileExt = path.extname(file).toLowerCase();

                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isDirectory()) continue;

                    if (['.jpg', '.jpeg', '.png'].includes(fileExt) && stats.size > 2 * 1024 * 1024) {
                        const result = await this.compressImage(filePath);
                        if (result.success) {
                            spaceSaved += result.spaceSaved;
                            compressedCount++;
                        }
                    }

                    if (['.mp4', '.webm'].includes(fileExt) && stats.size > 10 * 1024 * 1024) {
                        const result = await this.compressVideo(filePath);
                        if (result.success) {
                            spaceSaved += result.spaceSaved;
                            compressedCount++;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Erro ao comprimir ${file}:`, error.message);
                }
            }

            if (compressedCount > 0) {
                console.log(`📦 ${dirPath}: ${compressedCount} arquivos comprimidos, ${this.formatBytes(spaceSaved)} economizados`);
            }
        } catch (error) {
            console.error(`❌ Erro na compressão do diretório ${dirPath}:`, error.message);
        }
    }

    async compressImage(filePath) {
        try {
            const originalStats = await fs.stat(filePath);
            const fileExt = path.extname(filePath) || '.jpg';
            const tempPath = path.join(path.dirname(filePath), `${path.basename(filePath, fileExt)}.compressed${fileExt}`);

            await execAsync(`ffmpeg -hide_banner -loglevel error -i "${filePath}" -vf "scale=min(1920\\,iw):min(1920\\,ih):force_original_aspect_ratio=decrease" -q:v 8 -map_metadata -1 -y "${tempPath}"`, { timeout: 30000 });

            const compressedStats = await fs.stat(tempPath);

            if (compressedStats.size < originalStats.size * 0.8) {
                await fs.rename(tempPath, filePath);
                return {
                    success: true,
                    spaceSaved: originalStats.size - compressedStats.size
                };
            } else {
                await fs.unlink(tempPath);
                return { success: false };
            }
        } catch (error) {
            console.warn(`⚠️ Erro ao comprimir imagem ${filePath}:`, error.message);
            return { success: false };
        }
    }

    async compressVideo(filePath) {
        try {
            const originalStats = await fs.stat(filePath);
            const tempPath = filePath + '.compressed.mp4';

            await execAsync(`ffmpeg -i "${filePath}" -c:v libx264 -preset medium -crf 25 -c:a aac -b:a 128k -movflags +faststart -y "${tempPath}"`, { timeout: 60000 });

            const compressedStats = await fs.stat(tempPath);

            if (compressedStats.size < originalStats.size * 0.7) {
                await fs.unlink(filePath);
                await fs.rename(tempPath, filePath);
                return {
                    success: true,
                    spaceSaved: originalStats.size - compressedStats.size
                };
            } else {
                await fs.unlink(tempPath);
                return { success: false };
            }
        } catch (error) {
            console.warn(`⚠️ Erro ao comprimir vídeo ${filePath}:`, error.message);
            return { success: false };
        }
    }

    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    startScheduledCleaning() {

        setInterval(async () => {
            await this.startMediaCleaning();
        }, 10 * 60 * 1000);

        setInterval(async () => {
            await this.compressLargeMedia();
            for (const dir of this.mediaDirs) {
                await this.enforceDirectoryLimit(dir);
            }
        }, 60 * 60 * 1000);

        setTimeout(() => {
            this.startMediaCleaning();
        }, 30000);
    }
}

export default MediaCleaner;
