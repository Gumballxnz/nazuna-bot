import axios from 'axios';
import http from 'http';
import https from 'https';

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 120000,
  scheduling: 'lifo'
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 120000,
  scheduling: 'lifo',
  rejectUnauthorized: true
});

const apiClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 120000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'NazunaBot/2.0'
  },

  validateStatus: (status) => status < 500
});

const mediaClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 120000,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': 'NazunaBot/2.0',
    'Accept': '*/*'
  }
});

const scrapingClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 120000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br'
  }
});

const addErrorInterceptor = (client, name) => {
  client.interceptors.response.use(
    response => response,
    error => {

      if (!error.response) {
        console.error(`[${name}] Network error:`, error.code || error.message);
      }
      return Promise.reject(error);
    }
  );
};

addErrorInterceptor(apiClient, 'API');
addErrorInterceptor(mediaClient, 'Media');
addErrorInterceptor(scrapingClient, 'Scraping');

const getConnectionStats = () => ({
  http: {
    sockets: Object.keys(httpAgent.sockets || {}).reduce((acc, key) => acc + (httpAgent.sockets[key]?.length || 0), 0),
    freeSockets: Object.keys(httpAgent.freeSockets || {}).reduce((acc, key) => acc + (httpAgent.freeSockets[key]?.length || 0), 0),
    requests: Object.keys(httpAgent.requests || {}).reduce((acc, key) => acc + (httpAgent.requests[key]?.length || 0), 0)
  },
  https: {
    sockets: Object.keys(httpsAgent.sockets || {}).reduce((acc, key) => acc + (httpsAgent.sockets[key]?.length || 0), 0),
    freeSockets: Object.keys(httpsAgent.freeSockets || {}).reduce((acc, key) => acc + (httpsAgent.freeSockets[key]?.length || 0), 0),
    requests: Object.keys(httpsAgent.requests || {}).reduce((acc, key) => acc + (httpsAgent.requests[key]?.length || 0), 0)
  }
});

const destroyIdleSockets = () => {
  httpAgent.destroy();
  httpsAgent.destroy();
};

const apiRequest = async (url, data, apiKey, options = {}) => {
  return apiClient.post(url, data, {
    ...options,
    headers: {
      ...options.headers,
      'X-API-Key': apiKey
    }
  });
};

const downloadMedia = async (url, options = {}) => {
  const response = await mediaClient.get(url, options);
  return response.data;
};

export {
  apiClient,
  mediaClient,
  scrapingClient,
  httpAgent,
  httpsAgent,
  getConnectionStats,
  destroyIdleSockets,
  apiRequest,
  downloadMedia
};

export default apiClient;
