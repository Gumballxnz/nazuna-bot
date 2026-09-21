import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OptimizedCacheManager from './optimizedCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceOptimizer {
  constructor() {
    this.cache = new OptimizedCacheManager();

    this.staticCache = new Map();

    this.compiledRegex = new Map();

    this.fileCache = new Map();

    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      regexCompiled: 0,
      filesCached: 0
    };

    this.precompileCommonRegex();

    this.cleanupIntervalId = setInterval(() => this.cleanupFileCache(), 5 * 60 * 1000);
  }

  async initialize() {

    return Promise.resolve();
  }

  get modules() {
    return {
      cacheManager: this.cache
    };
  }

  precompileCommonRegex() {
    const commonPatterns = {

      commandSplit: /\s+/,
      commandPrefix: /^[!\.\/#\$\%\&\*\+\-\.\:\;\<\=\>\?\@\[\]\^\_\{\}\|\\]/,
      mentionRegex: /@(\d+)/g,
      urlRegex: /https?:\/\/[^\s]+/g,
      phoneRegex: /\d{10,15}/g,

      whitespace: /\s+/g,
      specialChars: /[^\w\s]/g,
      numbers: /\d+/g,

      jidRegex: /^\d+@[sgl]\.whatsapp\.net$/,
      groupIdRegex: /\d+@g\.us$/,
      userIdRegex: /\d+@[sl]\.whatsapp\.net$/,

      jsonParse: /^[\s\S]*$/,
      base64: /^[A-Za-z0-9+/=]+$/,

      trim: /^\s+|\s+$/g,
      multipleSpaces: /\s{2,}/g
    };

    for (const [name, pattern] of Object.entries(commonPatterns)) {
      this.compiledRegex.set(name, pattern);
      this.stats.regexCompiled++;
    }
  }

  getRegex(name) {
    return this.compiledRegex.get(name);
  }

  compileRegex(name, pattern, flags = '') {
    if (this.compiledRegex.has(name)) {
      return this.compiledRegex.get(name);
    }

    try {
      const regex = new RegExp(pattern, flags);
      this.compiledRegex.set(name, regex);
      this.stats.regexCompiled++;
      return regex;
    } catch (error) {
      console.error(`❌ Erro ao compilar regex ${name}:`, error.message);
      return null;
    }
  }

  setStatic(key, value) {
    this.staticCache.set(key, value);
    return true;
  }

  getStatic(key) {
    return this.staticCache.get(key);
  }

  clearStatic(key = null) {
    if (key) {
      return this.staticCache.delete(key);
    }
    this.staticCache.clear();
    return true;
  }

  async getCachedFile(filePath, ttl = 60000, loader = null) {
    const cacheKey = `file:${filePath}`;
    const cached = this.fileCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.stats.cacheHits++;
      return cached.data;
    }

    this.stats.cacheMisses++;

    try {
      let data;
      if (loader) {
        data = await loader(filePath);
      } else {

        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          data = JSON.parse(content);
        } else {
          data = {};
        }
      }

      this.fileCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl
      });

      this.stats.filesCached++;
      return data;
    } catch (error) {
      console.error(`❌ Erro ao carregar arquivo ${filePath}:`, error.message);
      return cached?.data || {};
    }
  }

  invalidateFile(filePath) {
    const cacheKey = `file:${filePath}`;
    return this.fileCache.delete(cacheKey);
  }

  cleanupFileCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.fileCache.entries()) {
      if (now - cached.timestamp >= cached.ttl) {
        this.fileCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {

    }
  }

  async memoize(key, fn, ttl = 60000) {
    const cached = await this.cache.get('memoize', key);
    if (cached !== undefined) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;
    const result = await fn();
    await this.cache.set('memoize', key, result, ttl);
    return result;
  }

  optimizeString(str) {
    if (typeof str !== 'string') return str;

    const multipleSpaces = this.getRegex('multipleSpaces');
    if (multipleSpaces) {
      str = str.replace(multipleSpaces, ' ');
    }

    return str.trim();
  }

  normalizeCommand(cmd) {
    if (!cmd || typeof cmd !== 'string') return '';

    const prefixRegex = this.getRegex('commandPrefix');
    if (prefixRegex && prefixRegex.test(cmd)) {
      cmd = cmd.substring(1);
    }

    return cmd.toLowerCase().trim();
  }

  splitCommand(text) {
    const splitRegex = this.getRegex('commandSplit');
    if (splitRegex) {
      return text.split(splitRegex);
    }
    return text.split(/\s+/);
  }

  async getGroupDataCached(groupId, loader, ttl = 5000) {
    const cacheKey = `group:${groupId}`;

    const cached = await this.cache.get('indexGroupMeta', cacheKey);
    if (cached !== undefined) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;
    const data = await loader();

    if (data && !data.economy && !data.leveling) {
      await this.cache.set('indexGroupMeta', cacheKey, data, ttl);
    }

    return data;
  }

  invalidateGroup(groupId) {
    const cacheKey = `group:${groupId}`;
    this.cache.del('indexGroupMeta', cacheKey);
  }

  async batchGetGroupData(groupIds, loader, ttl = 5000) {
    const results = {};
    const toLoad = [];

    for (const groupId of groupIds) {
      const cacheKey = `group:${groupId}`;
      const cached = await this.cache.get('indexGroupMeta', cacheKey);
      if (cached !== undefined) {
        results[groupId] = cached;
        this.stats.cacheHits++;
      } else {
        toLoad.push(groupId);
      }
    }

    if (toLoad.length > 0) {
      const loaded = await loader(toLoad);
      for (const groupId of toLoad) {
        const data = loaded[groupId];
        if (data) {
          results[groupId] = data;

          if (!data.economy && !data.leveling) {
            const cacheKey = `group:${groupId}`;
            await this.cache.set('indexGroupMeta', cacheKey, data, ttl);
          }
        }
      }
      this.stats.cacheMisses += toLoad.length;
    }

    return results;
  }

  getStats() {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      staticCacheSize: this.staticCache.size,
      fileCacheSize: this.fileCache.size,
      regexCacheSize: this.compiledRegex.size,
      cacheStats: this.cache.getStatistics()
    };
  }

  resetStats() {
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      regexCompiled: this.compiledRegex.size,
      filesCached: 0
    };
  }

  async fileExists(filePath) {
    const cacheKey = `exists:${filePath}`;
    const cached = this.fileCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.data;
    }

    const exists = fs.existsSync(filePath);
    this.fileCache.set(cacheKey, {
      data: exists,
      timestamp: Date.now(),
      ttl: 5000
    });
    return exists;
  }

  async loadJsonWithCache(filePath, defaultValue = {}) {
    const cacheKey = `json:${filePath}`;
    const cached = this.fileCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.stats.cacheHits++;
      return cached.data;
    }

    this.stats.cacheMisses++;

    try {
      let data;
      if (await this.fileExists(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(content);
      } else {
        data = defaultValue;
      }

      this.fileCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 10000
      });

      this.stats.filesCached++;
      return data;
    } catch (error) {
      console.error(`❌ Erro ao carregar JSON ${filePath}:`, error.message);
      return cached?.data || defaultValue;
    }
  }

  invalidateJson(filePath) {
    const cacheKey = `json:${filePath}`;
    const existsKey = `exists:${filePath}`;
    this.fileCache.delete(cacheKey);
    this.fileCache.delete(existsKey);
  }

  cacheGet(cacheType, key) {
    try {
      const cache = this.cache.getCache(cacheType);
      if (!cache) {
        return undefined;
      }
      return cache.get(key);
    } catch (error) {
      console.error(`❌ Erro ao obter cache ${cacheType}:`, error.message);
      return undefined;
    }
  }

  cacheSet(cacheType, key, value, ttl = null) {
    try {
      const cache = this.cache.getCache(cacheType);
      if (!cache) {
        return false;
      }
      if (ttl) {
        return cache.set(key, value, ttl);
      } else {
        return cache.set(key, value);
      }
    } catch (error) {
      console.error(`❌ Erro ao definir cache ${cacheType}:`, error.message);
      return false;
    }
  }

  async emergencyCleanup() {
    try {

      this.cache.clear('media');
      this.cache.clear('messages');

      if (global.gc) {
        global.gc();
      }
      return true;
    } catch (error) {
      console.error('❌ Erro em emergencyCleanup:', error.message);
      return false;
    }
  }

  async shutdown() {
    try {

      this.clearAll();
      this.stopMonitoring();
      return true;
    } catch (error) {
      console.error('❌ Erro em shutdown:', error.message);
      return false;
    }
  }

  clearAll() {
    this.staticCache.clear();
    this.fileCache.clear();
    this.cache.forceCleanup();
  }

  stopMonitoring() {

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
  }
}

export default PerformanceOptimizer;

export { PerformanceOptimizer };

let optimizerInstance = null;

export function getPerformanceOptimizer() {
  if (!optimizerInstance) {
    optimizerInstance = new PerformanceOptimizer();
  }
  return optimizerInstance;
}
