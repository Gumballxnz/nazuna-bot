/**
 * Pinterest Download e Pesquisa - 100% Gratuito 
 * Motor: Scraper nativo com resolvedores CORS (AllOrigins, Codetabs) e fallbacks resilientes
 * 
 * @author Hiudy & Antigravity (adaptado)
 * @version 5.0.0
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COBALT_INSTANCES = [
  'https://api.cobalt.tools/api/json',
  'https://cobalt-api.kwiatusheq.xyz/api/json',
  'https://api.cobalt.club/api/json'
];

async function tryCobaltDL(url) {
  const payload = {
    url: url,
    downloadMode: 'auto'
  };
  for (const api of COBALT_INSTANCES) {
    try {
      const response = await axios.post(api, payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 10000
      });
      if (response.data && response.data.url) {
        return response.data.url;
      }
    } catch (err) {
      console.error(`[Pinterest Cobalt] Instância ${api} falhou:`, err.message);
    }
  }
  return null;
}

/**
 * Busca via curl nativo (bypassa TLS fingerprint do Node.js)
 * Curl usa libcurl que tem fingerprint diferente do axios/node-fetch
 * @param {string} curlUrl - URL a buscar via curl
 * @param {string} userAgent - User-Agent a usar
 * @returns {Promise<string>} HTML/texto da resposta
 */
async function fetchViaCurl(curlUrl, userAgent = '') {
  const uaFlag = userAgent ? `-A '${userAgent}'` : '';
  const { stdout } = await execAsync(
    `curl -sL --max-time 15 ${uaFlag} '${curlUrl.replace(/'/g, "\'")}' 2>/dev/null`,
    { maxBuffer: 50 * 1024 * 1024 } // 50MB buffer
  );
  return stdout;
}

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

    // Tentativa 3: Direto via curl (contorna TLS fingerprint)
    if (!jsonResponse) {
      try {
        const rawRes = await fetchViaCurl(searchUrl, UA_CHROME);
        if (rawRes) {
          jsonResponse = JSON.parse(rawRes);
        }
      } catch (e) {
        console.error('[Pinterest Search] Busca direta via curl falhou:', e.message);
      }
    }

    // Tentativa 4: Direto via axios (legado)
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
        console.error('[Pinterest Search] Busca direta via axios falhou:', e.message);
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
    let oembedData = null; // guardamos o oEmbed para usar como fallback de imagem na FASE 3

    // Se for link curto (pin.it) ou qualquer URL do Pinterest, usa a API oEmbed oficial
    // oEmbed é uma API pública do Pinterest, funciona de qualquer IP sem bloqueio
    // Retorna: { html: '<a href="pinterest.com/pin/ID/">...', thumbnail_url, title, ... }
    try {
      const oembedRes = await axios.get(`https://www.pinterest.com/oembed/?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA_CHROME },
        timeout: 10000
      });
      if (oembedRes.data) {
        oembedData = oembedRes.data;
        // Extrai pin ID do campo html do oEmbed
        const pinMatch = (oembedRes.data.html || '').match(/pinterest\.com\/pin\/([0-9]+)/);
        if (pinMatch) {
          resolvedUrl = `https://www.pinterest.com/pin/${pinMatch[1]}/`;
          console.log('[Pinterest DL] oEmbed resolvido:', resolvedUrl);
        }
      }
    } catch (e) {
      console.error('[Pinterest DL] oEmbed falhou:', e.message);
      // Fallback: tentar via curl se axios falhar
      try {
        const oembedRaw = await fetchViaCurl(`https://www.pinterest.com/oembed/?url=${encodeURIComponent(url)}`);
        const data = JSON.parse(oembedRaw);
        if (data) {
          oembedData = data;
          const pinMatch = (data.html || '').match(/pinterest\.com\/pin\/([0-9]+)/);
          if (pinMatch) {
            resolvedUrl = `https://www.pinterest.com/pin/${pinMatch[1]}/`;
            console.log('[Pinterest DL] oEmbed (curl) resolvido:', resolvedUrl);
          }
        }
      } catch (e2) {
        console.error('[Pinterest DL] oEmbed curl falhou:', e2.message);
      }
    }


    // === FASE 2: Buscar HTML do pin com URL resolvida ===

    // Motor 1 (curl + Googlebot): comprovado 100% funcional na VPS via curl nativo
    // Googlebot UA faz o Pinterest servir HTML completo com __PWS_DATA__
    try {
      const htmlViaGooglebot = await fetchViaCurl(resolvedUrl, UA_GOOGLEBOT);
      if (htmlViaGooglebot && htmlViaGooglebot.includes('__PWS_DATA__')) {
        html = htmlViaGooglebot;
      }
    } catch (e) {
      console.error('[Pinterest DL] curl Googlebot falhou:', e.message);
    }

    // Motor 2 (axios Googlebot): fallback para quando curl não está disponível
    if (!html) {
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
        console.error('[Pinterest DL] axios Googlebot falhou:', e.message);
      }
    }

    // Motor 3 (AllOrigins via curl): proxy que funciona localmente
    if (!html) {
      try {
        const rawJson = await fetchViaCurl(`https://api.allorigins.win/get?url=${encodeURIComponent(resolvedUrl)}`);
        const data = JSON.parse(rawJson);
        if (data.contents && data.contents.includes('__PWS_DATA__')) {
          html = data.contents;
        }
      } catch (e) {
        console.error('[Pinterest DL] AllOrigins curl falhou:', e.message);
      }
    }

    // Motor 4 (axios AllOrigins): último recurso
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
        console.error('[Pinterest DL] axios AllOrigins falhou:', e.message);
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

    // Fallback final: thumbnail do oEmbed (sempre retorna pelo menos uma imagem)
    if (oembedData && oembedData.thumbnail_url) {
      const result = {
        ok: true,
        title: oembedData.title || '',
        type: 'image',
        mime: 'image/jpeg',
        urls: [oembedData.thumbnail_url]
      };
      cache.set(`download:${url}`, result);
      return result;
    }

    // Fallback absoluto via Cobalt API (excelente para vídeos e imagens que falharam no scraper local)
    try {
      console.log('[Pinterest DL] Tentando fallback absoluto via Cobalt...');
      const cobaltUrl = await tryCobaltDL(url);
      if (cobaltUrl) {
        const isVideo = cobaltUrl.includes('.mp4') || cobaltUrl.includes('video');
        const result = {
          ok: true,
          title: oembedData?.title || 'Pinterest Media',
          type: isVideo ? 'video' : 'image',
          mime: isVideo ? 'video/mp4' : 'image/jpeg',
          urls: [cobaltUrl]
        };
        cache.set(`download:${url}`, result);
        return result;
      }
    } catch (e) {
      console.error('[Pinterest DL] Fallback Cobalt falhou:', e.message);
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