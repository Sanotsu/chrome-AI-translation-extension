// 语言代码和名称的映射
export const LANGUAGES = {
  // 常用语言
  'common': {
    'zh-CN': { name: '简体中文', native: '简体中文' },
    'en': { name: '英语', native: 'English' },
  },
  // 其他语言
  'others': {
    'zh-TW': { name: '繁体中文', native: '繁體中文' },
    'ja': { name: '日语', native: '日本語' },
    'ko': { name: '韩语', native: '한국어' },
    'es': { name: '西班牙语', native: 'Español' },
    'fr': { name: '法语', native: 'Français' },
    'de': { name: '德语', native: 'Deutsch' },
    'ru': { name: '俄语', native: 'Русский' },
    'it': { name: '意大利语', native: 'Italiano' },
    'pt': { name: '葡萄牙语', native: 'Português' },
    'vi': { name: '越南语', native: 'Tiếng Việt' },
    'th': { name: '泰语', native: 'ไทย' },
    'ar': { name: '阿拉伯语', native: 'العربية' },
    // ... 可以继续添加更多语言
  }
};

// 获取浏览器语言
export const getBrowserLanguage = () => {
  const lang = navigator.language || navigator.userLanguage;
  // 处理类似 'zh-CN' 或 'en-US' 的格式
  const baseLang = lang.split('-')[0];
  const region = lang.split('-')[1];
  
  // 特殊处理中文
  if (baseLang === 'zh') {
    return region === 'TW' || region === 'HK' ? 'zh-TW' : 'zh-CN';
  }
  
  // 检查是否支持该语言
  const allLanguages = { ...LANGUAGES.common, ...LANGUAGES.others };
  return allLanguages[baseLang] ? baseLang : 'en';
};

// 使用 Google Cloud Translation API 进行语言检测
export const detectLanguage = async (text, apiKey) => {
  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2/detect?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text
        })
      }
    );

    if (!response.ok) {
      throw new Error('Language detection failed');
    }

    const data = await response.json();
    return data.data.detections[0][0].language;
  } catch (error) {
    console.error('Language detection error:', error);
    // 降级到基本检测
    return fallbackDetectLanguage(text);
  }
};

// 更完善的语言检测规则
const LANGUAGE_PATTERNS = {
  // 东亚语言
  'zh-CN': {
    pattern: /[\u4e00-\u9fa5]/,
    threshold: 0.1,
    excludePatterns: [/[ぁ-んァ-ン]/, /[가-힣]/] // 排除日文和韩文
  },
  'zh-TW': {
    pattern: /[[\u4e00-\u9fa5][\u3105-\u312F]]/,
    threshold: 0.1,
    traditionalChars: /[錒-鎛]/
  },
  'ja': {
    pattern: /[ぁ-んァ-ン]/,
    threshold: 0.05,
    extraPatterns: [/[\u4e00-\u9fa5]/, /[\u30A0-\u30FF]/] // 日文中可能包含汉字和片假名
  },
  'ko': {
    pattern: /[가-힣]/,
    threshold: 0.1
  },
  
  // 欧洲语言
  'en': {
    pattern: /[a-zA-Z]/,
    threshold: 0.5,
    wordPatterns: [/\b(the|and|is|in|to|of)\b/i]
  },
  'fr': {
    pattern: /[a-zA-Z]/,
    threshold: 0.5,
    wordPatterns: [/\b(le|la|les|et|est|dans|pour)\b/]
  },
  'de': {
    pattern: /[a-zA-Z]/,
    threshold: 0.5,
    wordPatterns: [/\b(der|die|das|und|ist|in|zu)\b/]
  },
  'es': {
    pattern: /[a-zA-Z]/,
    threshold: 0.5,
    wordPatterns: [/\b(el|la|los|las|es|en|por)\b/]
  },
  'it': {
    pattern: /[a-zA-Z]/,
    threshold: 0.5,
    wordPatterns: [/\b(il|la|le|è|in|per|con)\b/]
  },
  'pt': {
    pattern: /[a-zA-Z]/,
    threshold: 0.5,
    wordPatterns: [/\b(o|a|os|as|é|em|para)\b/]
  },
  'ru': {
    pattern: /[а-яА-Я]/,
    threshold: 0.3
  },
  
  // 其他语系
  'ar': {
    pattern: /[\u0600-\u06FF]/,
    threshold: 0.2,
    rtl: true
  },
  'hi': {
    pattern: /[\u0900-\u097F]/,
    threshold: 0.2
  },
  'th': {
    pattern: /[\u0E00-\u0E7F]/,
    threshold: 0.2
  },
  'vi': {
    pattern: /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/,
    threshold: 0.1
  }
};

// 改进的语言检测函数
const fallbackDetectLanguage = (text) => {
  const results = {};
  const totalLength = text.length;
  
  // 计算每种语言的匹配度
  for (const [lang, config] of Object.entries(LANGUAGE_PATTERNS)) {
    let matches = 0;
    let isExcluded = false;
    
    // 检查排除模式
    if (config.excludePatterns) {
      for (const excludePattern of config.excludePatterns) {
        if (excludePattern.test(text)) {
          isExcluded = true;
          break;
        }
      }
    }
    
    if (isExcluded) continue;
    
    // 基本字符匹配
    matches = (text.match(config.pattern) || []).length;
    
    // 检查额外模式
    if (config.extraPatterns) {
      for (const pattern of config.extraPatterns) {
        matches += (text.match(pattern) || []).length;
      }
    }
    
    // 检查特定词汇模式
    if (config.wordPatterns) {
      const wordMatches = config.wordPatterns.reduce((acc, pattern) => {
        return acc + (text.match(pattern) || []).length;
      }, 0);
      matches += wordMatches * 2; // 给词汇匹配更高的权重
    }
    
    // 特殊处理繁体中文
    if (lang === 'zh-TW' && config.traditionalChars.test(text)) {
      matches *= 1.5; // 增加繁体字的权重
    }
    
    const ratio = matches / totalLength;
    if (ratio >= config.threshold) {
      results[lang] = ratio;
    }
  }
  
  // 如果没有匹配结果，返回英语
  if (Object.keys(results).length === 0) {
    return 'en';
  }
  
  // 返回匹配度最高的语言
  return Object.entries(results).reduce((a, b) => a[1] > b[1] ? a : b)[0];
};

// 格式化语言显示
export const formatLanguageDisplay = (langCode) => {
  const allLanguages = { ...LANGUAGES.common, ...LANGUAGES.others };
  const lang = allLanguages[langCode];
  return lang ? `${lang.name} (${lang.native})` : langCode;
};

// 验证语言代码
export const isValidLanguageCode = (code) => {
  // 检查是否符合 ISO 639-1 或 ISO 639-2 格式
  return /^[a-z]{2,3}(-[A-Z]{2,3})?$/.test(code);
}; 