/**
 * Pinterest Download e Pesquisa - 100% Gratuito 
 * Motor: APIs públicas (Siputzx, Ryzendesu)
 * 
 * @author Hiudy (adaptado)
 * @version 4.0.0
 */

import axios from 'axios';

// Cache LRU simples para evitar requisições repetidas
class SimpleCache {
  constructor(maxEntries = 500, ttl = 30 * 60 * 1000) {
    this.map = new Map();
    this.maxEntries = maxEntries;
    this.ttl = ttl;
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (Date.now() - item.ts > this.ttl) {
      this.map.delete(key);
      return null;
    }
    return item.val;
  }

  set(key, val) {
    if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    this.map.set(key, { val, ts: Date.now() });
  }
}

const cache = new SimpleCache(500, 30 * 60 * 1000);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Pesquisa imagens no Pinterest usando APIs gratuitas
 * @param {string} query - Termo de pesquisa
 * @returns {Promise<Object>} - { ok: true, urls: [...], type, count, query }
 */
async function pinterestSearch(query) {
  try {
    if (!query || typeof query !== 'string') {
      return { ok: false, msg: 'Termo de pesquisa inválido' };
    }

    const cached = cache.get(`search:${query.toLowerCase()}`);
    if (cached) return cached;

    // Motor 1: Siputzx
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
      }).then(v => v.data).catch(() => null);

      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const urls = res.data.map(item => typeof item === 'string' ? item : item.url || item.pin || '').filter(Boolean);
        if (urls.length > 0) {
          const result = {
            ok: true,
            type: 'image',
            mime: 'image/jpeg',
            query: query,
            count: urls.length,
            urls: urls
          };
          cache.set(`search:${query.toLowerCase()}`, result);
          return result;
        }
      }
    } catch (e) {
      console.error('[Pinterest Search] Motor 1 (Siputzx) falhou:', e.message);
    }

    // Motor 2: Ryzendesu
    try {
      const res = await axios.get(`https://api.ryzendesu.vip/api/search/pinterest?query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
      }).then(v => v.data).catch(() => null);

      const urls = res?.data || res?.result || (Array.isArray(res) ? res : []);
      const validUrls = (Array.isArray(urls) ? urls : []).map(u => typeof u === 'string' ? u : u?.url || u?.pin || '').filter(Boolean);

      if (validUrls.length > 0) {
        const result = {
          ok: true,
          type: 'image',
          mime: 'image/jpeg',
          query: query,
          count: validUrls.length,
          urls: validUrls
        };
        cache.set(`search:${query.toLowerCase()}`, result);
        return result;
      }
    } catch (e) {
      console.error('[Pinterest Search] Motor 2 (Ryzendesu) falhou:', e.message);
    }

    return { ok: false, msg: 'Nenhuma imagem encontrada. Tente outro termo.' };
  } catch (error) {
    console.error('Erro na pesquisa Pinterest:', error);
    return { ok: false, msg: 'Ocorreu um erro ao buscar imagens.' };
  }
}

/**
 * Download de conteúdo do Pinterest via URL
 * @param {string} url - URL do pin
 * @returns {Promise<Object>} - { ok: true, urls: [...], type, title }
 */
async function pinterestDL(url) {
  try {
    if (!url || typeof url !== 'string') {
      return { ok: false, msg: 'URL inválida' };
    }

    const cached = cache.get(`download:${url}`);
    if (cached) return cached;

    // Motor 1: Siputzx
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
      }).then(v => v.data).catch(() => null);

      const link = res?.data?.url || res?.data?.hd || res?.data?.sd;
      if (link) {
        const isVideo = link.includes('.mp4');
        const result = {
          ok: true,
          title: res?.data?.title || '',
          type: isVideo ? 'video' : 'image',
          mime: isVideo ? 'video/mp4' : 'image/jpeg',
          urls: [link]
        };
        cache.set(`download:${url}`, result);
        return result;
      }
    } catch (e) {
      console.error('[Pinterest DL] Motor 1 (Siputzx) falhou:', e.message);
    }

    // Motor 2: Ryzendesu
    try {
      const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/pinterest?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
      }).then(v => v.data).catch(() => null);

      const link = res?.data?.url || res?.url || res?.result?.url;
      if (link) {
        const isVideo = link.includes('.mp4');
        const result = {
          ok: true,
          title: res?.data?.title || res?.title || '',
          type: isVideo ? 'video' : 'image',
          mime: isVideo ? 'video/mp4' : 'image/jpeg',
          urls: [link]
        };
        cache.set(`download:${url}`, result);
        return result;
      }
    } catch (e) {
      console.error('[Pinterest DL] Motor 2 (Ryzendesu) falhou:', e.message);
    }

    return { ok: false, msg: 'Não foi possível baixar este conteúdo.' };
  } catch (error) {
    console.error('Erro no download Pinterest:', error);
    return { ok: false, msg: 'Ocorreu um erro ao baixar o conteúdo.' };
  }
}

export {
  pinterestSearch as search,
  pinterestDL as dl
};