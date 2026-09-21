import NodeCache from 'node-cache';
import path from 'path';
import zlib from 'zlib';

class OptimizedCacheManager {
    constructor() {
        this.caches = new Map();
        this.memoryThreshold = 0.95;
        this.cleanupInterval = 5 * 60 * 1000;
        this.compressionEnabled = true;
        this.isOptimizing = false;
        this.lruOrder = new Map();
        this.accessCounts = new Map();

        this.initializeCaches();
        this.startMemoryMonitoring();
    }

    initializeCaches() {

        this.caches.set('msgRetry', new NodeCache({
            stdTTL: 2 * 60,
            checkperiod: 30,
            useClones: false,
            maxKeys: 1000,
            deleteOnExpire: true,
            forceString: false
        }));

        this.caches.set('groupMeta', new NodeCache({
            stdTTL: 10 * 60,
            checkperiod: 2 * 60,
            useClones: false,
            maxKeys: 500,
            deleteOnExpire: true,
            forceString: false
        }));

        this.caches.set('indexGroupMeta', new NodeCache({
            stdTTL: 10,
            checkperiod: 30,
            useClones: false,
            maxKeys: 500,
            deleteOnExpire: true,
            forceString: false
        }));

        this.caches.set('messages', new NodeCache({
            stdTTL: 60,
            checkperiod: 15,
            useClones: false,
            maxKeys: 2000,
            deleteOnExpire: true,
            forceString: false
        }));

        this.caches.set('userData', new NodeCache({
            stdTTL: 30 * 60,
            checkperiod: 5 * 60,
            useClones: false,
            maxKeys: 2000,
            deleteOnExpire: true,
            forceString: false
        }));

        this.caches.set('commands', new NodeCache({
            stdTTL: 5 * 60,
            checkperiod: 60,
            useClones: false,
            maxKeys: 5000,
            deleteOnExpire: true,
            forceString: false
        }));

        this.caches.set('media', new NodeCache({
            stdTTL: 30,
            checkperiod: 10,
            useClones: false,
            maxKeys: 100,
            deleteOnExpire: true,
            forceString: false
        }));

    }

    getCache(type) {
        return this.caches.get(type);
    }

    async getIndexGroupMeta(groupId) {
        return await this.get('indexGroupMeta', groupId);
    }

    async setIndexGroupMeta(groupId, value) {
        return await this.set('indexGroupMeta', groupId, value, 10);
    }

    async set(cacheType, key, value, ttl = null) {
        try {
            const cache = this.caches.get(cacheType);
            if (!cache) {
                return false;
            }

            let finalValue = value;

            if (this.compressionEnabled && this.shouldCompress(value)) {
                finalValue = await this.compressData(value);
            }

            this.accessCounts.set(key, (this.accessCounts.get(key) || 0) + 1);
            this.lruOrder.set(key, Date.now());

            const accessCount = this.accessCounts.get(key);
            let dynamicTtl = ttl;
            if (!ttl && accessCount > 5) {
                dynamicTtl = Math.min(60 * 60, accessCount * 60);
            }

            if (dynamicTtl) {
                return cache.set(key, finalValue, dynamicTtl);
            } else {
                return cache.set(key, finalValue);
            }
        } catch (error) {
            console.error(`❌ Erro ao definir cache ${cacheType}:`, error.message);
            return false;
        }
    }

    async get(cacheType, key) {
        try {
            const cache = this.caches.get(cacheType);
            if (!cache) {
                return undefined;
            }

            let value = cache.get(key);

            if (value !== undefined) {

                this.lruOrder.set(key, Date.now());
                this.accessCounts.set(key, (this.accessCounts.get(key) || 0) + 1);

                if (this.compressionEnabled && this.isCompressed(value)) {
                    value = await this.decompressData(value);
                }
            }

            return value;
        } catch (error) {
            console.error(`❌ Erro ao obter cache ${cacheType}:`, error.message);
            return undefined;
        }
    }

    del(cacheType, key) {
        try {
            const cache = this.caches.get(cacheType);
            if (cache) {
                const deleted = cache.del(key);
                if (deleted) {
                    this.lruOrder.delete(key);
                    this.accessCounts.delete(key);
                }
                return deleted;
            }
            return false;
        } catch (error) {
            console.error(`❌ Erro ao remover cache ${cacheType}:`, error.message);
            return false;
        }
    }

    clear(cacheType) {
        const cache = this.caches.get(cacheType);
        if (cache) {
            const keysCount = cache.keys().length;
            cache.flushAll();
            return true;
        }
        return false;
    }

    shouldCompress(data) {
        try {
            const dataString = JSON.stringify(data);
            return dataString.length > 1024;
        } catch {
            return false;
        }
    }

    async compressData(data) {
        try {
            const dataString = JSON.stringify(data);
            const compressed = zlib.gzipSync(dataString);
            return {
                __compressed: true,
                data: compressed,
                originalSize: dataString.length,
                compressedSize: compressed.length,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('❌ Erro na compressão:', error.message);
            return data;
        }
    }

    isCompressed(data) {
        return data && typeof data === 'object' && data.__compressed === true;
    }

    async decompressData(compressedData) {
        try {
            if (!this.isCompressed(compressedData)) {
                return compressedData;
            }
            const decompressed = zlib.gunzipSync(compressedData.data);
            return JSON.parse(decompressed.toString());
        } catch (error) {
            console.error('❌ Erro na descompressão:', error.message);
            return compressedData;
        }
    }

    startMemoryMonitoring() {
        setInterval(async () => {
            await this.checkMemoryUsage();
        }, this.cleanupInterval);

        setTimeout(() => {
            this.checkMemoryUsage();
        }, 10000);
    }

    async checkMemoryUsage() {
        try {
            const memUsage = process.memoryUsage();
            const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            const rssMB = Math.round(memUsage.rss / 1024 / 1024);

            const memoryPercentage = memUsage.heapUsed / memUsage.heapTotal;

            if (memoryPercentage > 0.9) {
                await this.optimizeMemory('high_memory_usage');
            } else if (memoryPercentage > 0.80 || usedMB > 300) {
                await this.optimizeMemory('moderate_memory_usage');
            }

            if (Date.now() % (30 * 60 * 1000) < this.cleanupInterval) {
                this.logCacheStatistics();
            }
        } catch (error) {
            console.error('❌ Erro ao verificar uso de memória:', error.message);
        }
    }

    async optimizeMemory(reason) {
        if (this.isOptimizing) return;
        this.isOptimizing = true;

        try {

            let freedMemory = 0;

            const cacheOrder = ['media', 'messages', 'commands', 'userData', 'indexGroupMeta', 'groupMeta', 'msgRetry'];

            for (const cacheType of cacheOrder) {
                const cache = this.caches.get(cacheType);
                if (cache) {
                    const beforeKeys = cache.keys().length;

                    if (reason === 'high_memory_usage') {
                        if (['media', 'messages'].includes(cacheType)) {
                            cache.flushAll();
                        } else {
                            await this.removeOldCacheItems(cache, 0.5);
                        }
                    } else {
                        cache.flushAll();
                        await this.removeOldCacheItems(cache, 0.2);
                    }
                }

                if (global.gc) {
                    global.gc();
                }
            }

            if (global.gc) {
                global.gc();
            }

            const newMemUsage = process.memoryUsage();
            const newUsedMB = Math.round(newMemUsage.heapUsed / 1024 / 1024);

        } catch (error) {
            console.error('❌ Erro durante otimização de memória:', error.message);
        } finally {
            this.isOptimizing = false;
        }
    }

    async removeOldCacheItems(cache, percentage) {
        try {
            const keys = cache.keys();
            const removeCount = Math.floor(keys.length * percentage);

            if (removeCount === 0) return;

            const sortedKeys = keys.sort((a, b) => (this.lruOrder.get(a) || 0) - (this.lruOrder.get(b) || 0));
            const keysToRemove = sortedKeys.slice(0, removeCount);

            for (const key of keysToRemove) {
                cache.del(key);
                this.lruOrder.delete(key);
                this.accessCounts.delete(key);
            }

        } catch (error) {
            console.error('❌ Erro ao remover itens antigos do cache:', error.message);
        }
    }

    logCacheStatistics() {

        for (const [type, cache] of this.caches) {
            const keys = cache.keys();
            const stats = cache.getStats();

        }
    }

    getStatistics() {
        const stats = {
            memory: process.memoryUsage(),
            caches: {},
            isOptimizing: this.isOptimizing,
            compressionEnabled: this.compressionEnabled
        };

        for (const [type, cache] of this.caches) {
            stats.caches[type] = {
                keys: cache.keys().length,
                stats: cache.getStats()
            };
        }

        return stats;
    }

    configure(options = {}) {
        if (options.memoryThreshold !== undefined) {
            this.memoryThreshold = Math.max(0.5, Math.min(0.95, options.memoryThreshold));
        }

        if (options.cleanupInterval !== undefined) {
            this.cleanupInterval = Math.max(60000, options.cleanupInterval);
        }

        if (options.compressionEnabled !== undefined) {
            this.compressionEnabled = options.compressionEnabled;
        }

    }

    forceCleanup() {

        for (const [type, cache] of this.caches) {
            const keysCount = cache.keys().length;
            cache.flushAll();
        }

        if (global.gc) {
            global.gc();
        }

    }

    stopMonitoring() {
        this.isOptimizing = false;
    }
}

export default OptimizedCacheManager;
