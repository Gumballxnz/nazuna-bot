export function memoize(fn, maxCacheSize = 100, ttl = 0) {
  const cache = new Map();
  let accessOrder = [];

  return function(...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      const cached = cache.get(key);
      if (ttl === 0 || Date.now() - cached.timestamp < ttl) {

        accessOrder = accessOrder.filter(k => k !== key);
        accessOrder.push(key);
        return cached.value;
      }
      cache.delete(key);
    }

    const result = fn.apply(this, args);

    if (cache.size >= maxCacheSize) {
      const oldest = accessOrder.shift();
      cache.delete(oldest);
    }

    cache.set(key, {
      value: result,
      timestamp: Date.now()
    });
    accessOrder.push(key);

    return result;
  };
}

export function debounce(fn, delay = 300) {
  let timeoutId;

  return function(...args) {
    clearTimeout(timeoutId);

    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(fn.apply(this, args));
      }, delay);
    });
  };
}

export function throttle(fn, interval = 1000) {
  let lastCall = 0;
  let timeoutId;

  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= interval) {
      lastCall = now;
      return fn.apply(this, args);
    }

    clearTimeout(timeoutId);
    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        resolve(fn.apply(this, args));
      }, interval - timeSinceLastCall);
    });
  };
}

export async function processBatch(array, processor, batchSize = 10, delay = 0) {
  const results = [];

  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (delay > 0 && i + batchSize < array.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

export async function parallelMap(array, asyncFn, concurrency = 5) {
  const results = [];
  const executing = [];

  for (const [index, item] of array.entries()) {
    const promise = asyncFn(item, index).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

class StringPool {
  constructor(maxSize = 1000) {
    this.pool = new Map();
    this.maxSize = maxSize;
    this.accessOrder = [];
  }

  intern(str) {
    if (typeof str !== 'string') return str;

    if (this.pool.has(str)) {

      this.accessOrder = this.accessOrder.filter(s => s !== str);
      this.accessOrder.push(str);
      return this.pool.get(str);
    }

    if (this.pool.size >= this.maxSize) {
      const oldest = this.accessOrder.shift();
      this.pool.delete(oldest);
    }

    this.pool.set(str, str);
    this.accessOrder.push(str);
    return str;
  }

  clear() {
    this.pool.clear();
    this.accessOrder = [];
  }
}

export const stringPool = new StringPool();

export function lazyLoad(modulePath) {
  let module = null;

  return async function(...args) {
    if (!module) {
      module = await import(modulePath);
    }
    return module.default || module;
  };
}

export class ExpiringCache {
  constructor(defaultTtl = 60000) {
    this.cache = new Map();
    this.defaultTtl = defaultTtl;

    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  set(key, value, ttl = this.defaultTtl) {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) return null;

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cache cleanup: ${removed} itens expirados removidos`);
    }
  }

  clear() {
    this.cache.clear();
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

export class ObjectPool {
  constructor(factory, reset, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;
    this.available = [];
    this.inUse = new Set();

    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.factory());
    }
  }

  acquire() {
    let obj;

    if (this.available.length > 0) {
      obj = this.available.pop();
    } else {
      obj = this.factory();
    }

    this.inUse.add(obj);
    return obj;
  }

  release(obj) {
    if (!this.inUse.has(obj)) return;

    this.inUse.delete(obj);
    this.reset(obj);
    this.available.push(obj);
  }

  clear() {
    this.available = [];
    this.inUse.clear();
  }
}

export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  start(name) {
    this.metrics.set(name, {
      start: Date.now(),
      end: null,
      duration: null
    });
  }

  end(name) {
    const metric = this.metrics.get(name);
    if (!metric) return;

    metric.end = Date.now();
    metric.duration = metric.end - metric.start;

    return metric.duration;
  }

  get(name) {
    return this.metrics.get(name);
  }

  getAll() {
    return Object.fromEntries(this.metrics);
  }

  clear() {
    this.metrics.clear();
  }
}

export const perfMonitor = new PerformanceMonitor();

export function uniqueArray(arr) {
  return [...new Set(arr)];
}

export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function flattenArray(arr) {
  return arr.reduce((acc, val) =>
    Array.isArray(val) ? acc.concat(flattenArray(val)) : acc.concat(val),
  []);
}
