/**
 * Pinterest Download e Pesquisa - 100% Gratuito 
 * Motor: Scraper nativo com resolvedores CORS (AllOrigins, Codetabs) e fallbacks resilientes
 * 
 * @author Hiudy & Antigravity (adaptado)
 * @version 5.0.0
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

// User-Agents testados: Googlebot funciona em data center, Chrome para uso local
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Pesquisa imagens no Pinterest usando API nativa do Pinterest via proxy CORS
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

    const dataObj = {
      options: {
        isPrefetch: false,
        query: query,
        scope: 'pins',
        no_meta: true,
        page_size: 25
      },
      context: {}
    };

    const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent('/search/pins/?q=' + query)}&data=${encodeURIComponent(JSON.stringify(dataObj))}`;

    let jsonResponse = null;

    // Tentativa 1: AllOrigins
    try {
      const res = await axios.get(`https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`, {
        headers: { 'User-Agent': UA_CHROME },
        timeout: 15000
      });
      if (res.data && res.data.contents) {
        jsonResponse = JSON.parse(res.data.contents);
      }
    } catch (e) {
      console.error('[Pinterest Search] AllOrigins falhou:', e.message);
    }

    // Tentativa 2: Codetabs
    if (!jsonResponse) {
      try {
        const res = await axios.get(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(searchUrl)}`, {
          headers: { 'User-Agent': UA_CHROME },
          timeout: 10000
        });
        if (res.data && typeof res.data === 'object') {
          jsonResponse = res.data;
        } else if (res.data && typeof res.data === 'string') {
          jsonResponse = JSON.parse(res.data);
        }
      } catch (e) {
        console.error('[Pinterest Search] Codetabs falhou:', e.message);
      }
    }

    // Tentativa 3: Direto
    if (!jsonResponse) {
      try {
        const res = await axios.get(searchUrl, {
          headers: { 'User-Agent': UA_CHROME },
          timeout: 10000
        });
        if (res.data) {
          jsonResponse = res.data;
        }
      } catch (e) {
        console.error('[Pinterest Search] Busca direta falhou:', e.message);
      }
    }

    const results = jsonResponse?.resource_response?.data?.results || [];
    if (Array.isArray(results) && results.length > 0) {
      const urls = results
        .map(pin => pin.images?.orig?.url || pin.images?.['736x']?.url || pin.images?.['564x']?.url)
        .filter(Boolean);

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

    // Fallback rápido usando um scraper alternativo de imagem se necessário
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

    let html = null;

    // === FASE 1: Resolver URL (converter links curtos pin.it em URL longa) ===
    let resolvedUrl = url;

    // Se for link curto (pin.it), precisa resolver para a URL completa do pin
    if (url.includes('pin.it/')) {
      // AllOrigins consegue resolver pin.it mesmo na VPS (retorna HTML com link canônico)
      try {
        const res = await axios.get(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
          headers: { 'User-Agent': UA_CHROME },
          timeout: 15000
        });
        const contents = res.data?.contents || '';
        // Extrai pin ID do link canônico ou de qualquer URL de pin
        const pinMatch = contents.match(/pinterest\.com\/pin\/([0-9]+)/);
        if (pinMatch) {
          resolvedUrl = `https://www.pinterest.com/pin/${pinMatch[1]}/`;
          console.log('[Pinterest DL] Short link resolvido para:', resolvedUrl);
        }
      } catch (e) {
        console.error('[Pinterest DL] Falha ao resolver short link:', e.message);
      }
    }

    // === FASE 2: Buscar HTML do pin com URL resolvida ===

    // Motor 1: Acesso direto com Googlebot UA — funciona em data center (VPS)
    // O Pinterest serve HTML completo com __PWS_DATA__ para Googlebot em links diretos
    try {
      const res = await axios.get(resolvedUrl, {
        headers: {
          'User-Agent': UA_GOOGLEBOT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        },
        timeout: 12000,
        maxRedirects: 5
      });
      if (res.data && typeof res.data === 'string' && res.data.includes('__PWS_DATA__')) {
        html = res.data;
      }
    } catch (e) {
      console.error('[Pinterest DL] Acesso Googlebot direto falhou:', e.message);
    }

    // Motor 2: AllOrigins com URL resolvida (funciona localmente)
    if (!html) {
      try {
        const res = await axios.get(`https://api.allorigins.win/get?url=${encodeURIComponent(resolvedUrl)}`, {
          headers: { 'User-Agent': UA_CHROME },
          timeout: 15000
        });
        if (res.data && res.data.contents && res.data.contents.includes('__PWS_DATA__')) {
          html = res.data.contents;
        }
      } catch (e) {
        console.error('[Pinterest DL] AllOrigins falhou:', e.message);
      }
    }

    // Motor 3: Codetabs com URL resolvida (proxy alternativo)
    if (!html) {
      try {
        const res = await axios.get(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(resolvedUrl)}`, {
          headers: { 'User-Agent': UA_CHROME },
          timeout: 15000,
          maxRedirects: 5
        });
        if (res.data && typeof res.data === 'string' && res.data.includes('__PWS_DATA__')) {
          html = res.data;
        }
      } catch (e) {
        console.error('[Pinterest DL] Codetabs falhou:', e.message);
      }
    }

    if (!html) {
      return { ok: false, msg: 'Não foi possível carregar a página do Pinterest.' };
    }


    // 2. Tenta parsear dados do __PWS_DATA__
    const pwsMatch = html.match(/<script id="__PWS_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (pwsMatch) {
      try {
        const json = JSON.parse(pwsMatch[1]);
        const pins = json.props?.initialReduxState?.pins;
        if (pins) {
          const pinIds = Object.keys(pins);
          if (pinIds.length > 0) {
            const pinData = pins[pinIds[0]];
            const title = pinData.title || pinData.grid_title || '';

            // Caso A: É um vídeo
            if (pinData.videos && pinData.videos.video_list) {
              const videoList = pinData.videos.video_list;
              const bestVideo = videoList.V_720P || videoList.V_HLSV4 || Object.values(videoList)[0];
              if (bestVideo && bestVideo.url) {
                const result = {
                  ok: true,
                  title: title,
                  type: 'video',
                  mime: 'video/mp4',
                  urls: [bestVideo.url]
                };
                cache.set(`download:${url}`, result);
                return result;
              }
            }

            // Caso B: Story Pin Data (carrosséis / coleções)
            if (pinData.story_pin_data?.pages) {
              const pages = pinData.story_pin_data.pages;
              const urls = [];
              let hasVideo = false;

              for (const page of pages) {
                if (page.blocks && page.blocks.length > 0) {
                  const videoBlock = page.blocks.find(b => b.type === 'VIDEO' && b.video_data?.video_list);
                  if (videoBlock) {
                    const vList = videoBlock.video_data.video_list;
                    const vUrl = vList.V_720P?.url || Object.values(vList)[0]?.url;
                    if (vUrl) {
                      urls.push(vUrl);
                      hasVideo = true;
                      continue;
                    }
                  }
                  
                  const imgBlock = page.blocks.find(b => b.type === 'IMAGE');
                  if (imgBlock && imgBlock.image_spec) {
                    const bestImg = imgBlock.image_spec.orig?.url || imgBlock.image_spec['736x']?.url || imgBlock.image_spec['564x']?.url;
                    if (bestImg) {
                      urls.push(bestImg);
                    }
                  }
                }
              }

              if (urls.length > 0) {
                const result = {
                  ok: true,
                  title: title,
                  type: hasVideo ? 'video' : 'image',
                  mime: hasVideo ? 'video/mp4' : 'image/jpeg',
                  urls: urls
                };
                cache.set(`download:${url}`, result);
                return result;
              }
            }

            // Caso C: É uma imagem normal
            if (pinData.images) {
              const images = pinData.images;
              const orig = images.orig || images['736x'] || images['564x'];
              if (orig && orig.url) {
                const result = {
                  ok: true,
                  title: title,
                  type: 'image',
                  mime: 'image/jpeg',
                  urls: [orig.url]
                };
                cache.set(`download:${url}`, result);
                return result;
              }
            }
          }
        }
      } catch (err) {
        console.error('[Pinterest DL] Erro ao parsear __PWS_DATA__:', err.message);
      }
    }

    // 3. Fallback de Metatags OG se __PWS_DATA__ não for encontrado ou falhar
    const ogVideo = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<meta\s+name=["']twitter:player["']\s+content=["']([^"']+)["']/i);
    const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
    const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<title>([^<]+)<\/title>/i);

    const title = ogTitle ? ogTitle[1].replace(' | Pinterest', '').trim() : '';

    if (ogVideo && ogVideo[1]) {
      const videoUrl = ogVideo[1].replace(/&amp;/g, '&');
      const result = {
        ok: true,
        title: title,
        type: 'video',
        mime: 'video/mp4',
        urls: [videoUrl]
      };
      cache.set(`download:${url}`, result);
      return result;
    }

    if (ogImage && ogImage[1]) {
      const imageUrl = ogImage[1].replace(/&amp;/g, '&');
      const result = {
        ok: true,
        title: title,
        type: 'image',
        mime: 'image/jpeg',
        urls: [imageUrl]
      };
      cache.set(`download:${url}`, result);
      return result;
    }

    return { ok: false, msg: 'Não foi possível extrair a mídia deste Pin.' };
  } catch (error) {
    console.error('Erro no download Pinterest:', error);
    return { ok: false, msg: 'Ocorreu um erro ao processar o download do Pinterest.' };
  }
}

export {
  pinterestSearch as search,
  pinterestDL as dl
};