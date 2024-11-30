// 缓存管理器
const CacheManager = {
  // 缓存有效期（1小时）
  CACHE_DURATION: 3600000,

  // 初始化缓存
  async init() {
    const result = await chrome.storage.local.get('translationCache');
    if (!result.translationCache) {
      await chrome.storage.local.set({ translationCache: {} });
    } else {
      // 清理过期缓存
      await this.cleanExpiredCache();
    }
  },

  // 清理过期缓存
  async cleanExpiredCache() {
    const result = await chrome.storage.local.get('translationCache');
    const translationCache = result.translationCache;
    let hasExpired = false;

    if (translationCache) {
      const now = Date.now();
      for (const key of Object.keys(translationCache)) {
        if (now - translationCache[key].timestamp > this.CACHE_DURATION) {
          delete translationCache[key];
          hasExpired = true;
        }
      }

      if (hasExpired) {
        await chrome.storage.local.set({ translationCache });
      }
    }
  },

  // 生成缓存键 - 简化缓存键的生成方式
  generateCacheKey(url, text, targetLang, type) {
    // 使用文本内容的哈希作为缓存键的一部分
    const textHash = this.hashString(text);
    return `${url}_${targetLang}_${type}_${textHash}`;
  },

  // 字符串哈希函数
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  },

  // 获取缓存
  async getCache(url, text, targetLang, type) {
    const cacheKey = this.generateCacheKey(url, text, targetLang, type);
    const result = await chrome.storage.local.get('translationCache');
    const cache = result.translationCache[cacheKey];

    if (!cache) {
      console.log(`[缓存未命中] ${text.slice(0, 30)}...`);
      return null;
    }

    // 检查缓存是否过期
    if (Date.now() - cache.timestamp > this.CACHE_DURATION) {
      console.log(`[缓存过期] ${text.slice(0, 30)}...`);
      await this.removeCache(cacheKey);
      return null;
    }

    console.log(`[缓存命中] ${text.slice(0, 30)}...`);
    return cache;
  },

  // 设置缓存
  async setCache(url, text, translation, targetLang, type) {
    const cacheKey = this.generateCacheKey(url, text, targetLang, type);
    const result = await chrome.storage.local.get('translationCache');
    const translationCache = result.translationCache || {};

    translationCache[cacheKey] = {
      url,
      text,
      translation,
      targetLang,
      type,
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ translationCache });
    console.log(`[缓存已保存] ${text.slice(0, 30)}...`);
  },

  // 移除缓存
  async removeCache(cacheKey) {
    const result = await chrome.storage.local.get('translationCache');
    const translationCache = result.translationCache;
    if (translationCache && translationCache[cacheKey]) {
      delete translationCache[cacheKey];
      await chrome.storage.local.set({ translationCache });
    }
  },

  // 清除特定网页和目标语言的缓存
  async clearTypeCache(url, targetLang, type) {
    const result = await chrome.storage.local.get('translationCache');
    const translationCache = result.translationCache;
    let hasCache = false;

    if (translationCache) {
      const prefix = `${url}_${targetLang}_${type}_`;
      for (const key of Object.keys(translationCache)) {
        if (key.startsWith(prefix)) {
          delete translationCache[key];
          hasCache = true;
        }
      }
      if (hasCache) {
        await chrome.storage.local.set({ translationCache });
        console.log(`[缓存已清除] ${url} ${type}`);
      }
    }

    return { success: hasCache, empty: !hasCache };
  },

  // 检查特定网页和目标语言是否有缓存
  async hasCache(url, targetLang, type) {
    const result = await chrome.storage.local.get('translationCache');
    const translationCache = result.translationCache;
    
    if (!translationCache) return false;

    const prefix = `${url}_${targetLang}_${type}_`;
    const now = Date.now();

    return Object.keys(translationCache).some(key => 
      key.startsWith(prefix) && 
      now - translationCache[key].timestamp <= this.CACHE_DURATION
    );
  },

  // 获取页面的所有缓存翻译
  async getPageCache(url, targetLang, type) {
    const result = await chrome.storage.local.get('translationCache');
    const translationCache = result.translationCache;
    const pageCache = {};

    if (translationCache) {
      const prefix = `${url}_${targetLang}_${type}_`;
      const now = Date.now();

      for (const [key, cache] of Object.entries(translationCache)) {
        if (key.startsWith(prefix) && 
            now - cache.timestamp <= this.CACHE_DURATION) {
          pageCache[cache.text] = cache.translation;
        }
      }
    }

    return pageCache;
  }
};

// 初始化缓存管理器
CacheManager.init(); 