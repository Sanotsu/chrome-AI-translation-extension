let isTranslated = false;
let translatedNodes = new Map();

// 存储检测到的语言
let detectedLanguage = null;

// 检测文本语言
const detectLanguage = async (text) => {
  try {
    const hasChineseChars = /[\u4e00-\u9fa5]/.test(text);
    const hasJapaneseChars = /[\u3040-\u30ff]/.test(text);
    const hasKoreanChars = /[\uac00-\ud7af]/.test(text);
    
    if (hasChineseChars) return 'zh';
    if (hasJapaneseChars) return 'ja';
    if (hasKoreanChars) return 'ko';
    return 'en';
  } catch (error) {
    console.error('语言检测失败:', error);
    return 'unknown';
  }
};

// 判断是否是文本内容节点
const isTextContentNode = (node) => {
  // 检查节点是否有父元素
  if (!node.parentElement) {
    return false;
  }

  const textTags = ['p', 'article', 'section', 'li', 'dd', 'div'];
  const parent = node.parentElement;
  
  // 检查标签名
  if (textTags.includes(parent.tagName.toLowerCase())) {
    // 检查是否是列表项
    if (parent.tagName.toLowerCase() === 'li') return true;
    
    // 检查是否是主要文本内容
    const text = parent.textContent.trim();
    return text.length > 20 || text.includes('。') || text.includes('.');
  }
  
  return false;
};

// 创建翻译容器
const createTranslationContainer = (originalNode) => {
  // 检查节点是否有父元素
  if (!originalNode.parentElement) {
    return null;
  }

  const container = document.createElement('div');
  container.className = 'ai-translation-container';
  
  // 复制原始节点的样式
  const originalStyle = window.getComputedStyle(originalNode.parentElement);
  container.style.fontFamily = originalStyle.fontFamily;
  container.style.fontSize = originalStyle.fontSize;
  container.style.lineHeight = originalStyle.lineHeight;
  container.style.color = originalStyle.color;
  
  return container;
};

// 创建内联翻译元素
const createInlineTranslation = (originalNode) => {
  const span = document.createElement('span');
  span.className = 'ai-translation-inline';
  return span;
};

// 获取当前标签页ID
const getCurrentTabId = async () => {
  try {
    // 如果是在content script中运行
    if (chrome.runtime?.id) {
      const response = await chrome.runtime.sendMessage({ action: 'getCurrentTabId' });
      return response.tabId;
    }
    // 如果是在独立窗口中运行
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0].id;
  } catch (error) {
    console.error('获取标签页ID失败:', error);
    return null;
  }
};

// 检测页面主要语言
const detectPageLanguage = async () => {
  const mainContent = document.body.innerText.slice(0, 1000);
  detectedLanguage = await detectLanguage(mainContent);
  
  // 发送检测结果
  const tabId = await getCurrentTabId();
  if (tabId) {
    chrome.runtime.sendMessage({ 
      action: 'updateSourceLanguage',
      language: detectedLanguage,
      tabId: tabId
    });
  }
};

// 监听面板创建事件
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'panelCreated') {
    // 如果已经检测到语言，立即发送
    if (detectedLanguage) {
      chrome.runtime.sendMessage({ 
        action: 'updateSourceLanguage',
        language: detectedLanguage,
        tabId: request.tabId
      });
      sendResponse({}); // 立即发送响应
    } else {
      // 如果还没有检测结果，立即进行检测
      detectPageLanguage().then(() => {
        sendResponse({}); // 检测完成后发送响应
      });
      return true; // 表示将异步发送响应
    }
  } else if (request.action === 'translatePage') {
    translatePage().then(() => {
      sendResponse({}); // 翻译完成后发送响应
    });
    return true; // 表示将异步发送响应
  } else if (request.action === 'replaceTranslate') {
    replaceTranslate().then(() => {
      sendResponse({}); // 替换翻译完成后发送响应
    });
    return true; // 表示将异步发送响应
  } else if (request.action === 'restoreOriginal') {
    restoreOriginal();
    sendResponse({}); // 立即发送响应
  } else if (request.action === 'detectChineseVariant') {
    const isTraditional = detectChineseVariant(document.body.innerText);
    sendResponse({ isTraditional });
  }
});

// 在页面加载完成后立即开始检测
document.addEventListener('DOMContentLoaded', () => {
  detectPageLanguage();
});

// 在页面内容变化时重新检测
const observer = new MutationObserver(() => {
  if (document.body) {
    detectPageLanguage();
    observer.disconnect();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

// 创建翻译按钮
const createTranslateButton = () => {
  const button = document.createElement('button');
  button.className = 'translate-button';
  button.textContent = '翻译';
  return button;
};

// 创建翻译弹窗
const createTranslationPopup = () => {
  const popup = document.createElement('div');
  popup.className = 'ai-translator-popup';
  popup.innerHTML = `
    <div class="ai-translator-content">
      <div class="ai-translator-text"></div>
      <div class="ai-translator-loading">翻译中...</div>
    </div>
  `;
  document.body.appendChild(popup);
  return popup;
};

// 获取选中的文本
const getSelectedText = () => {
  const selection = window.getSelection();
  return selection.toString().trim();
};

// 定位弹窗
const positionPopup = (element, rect) => {
  const top = rect.bottom + window.scrollY;
  const left = rect.left + window.scrollX;
  
  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
};

// 添加翻译缓存和控制变量
let translationCache = {
  compare: new Map(),
  replace: new Map()
};
let isTranslating = {
  compare: false,
  replace: false
};
let shouldStopTranslation = {
  compare: false,
  replace: false
};

// 缓存翻译结果
const cacheTranslation = (type, text, translation) => {
  const cacheKey = `${type}_${text}`;
  const cacheData = {
    translation,
    timestamp: Date.now()
  };
  translationCache[type].set(cacheKey, cacheData);
};

// 获取缓存的翻译
const getCachedTranslation = (type, text) => {
  const cacheKey = `${type}_${text}`;
  const cached = translationCache[type].get(cacheKey);
  if (!cached) return null;

  // 检查缓存是否过期（1小时）
  if (Date.now() - cached.timestamp > 3600000) {
    translationCache[type].delete(cacheKey);
    return null;
  }

  return cached.translation;
};

// 修改清除缓存函数
const clearCache = async (type) => {
  if (isTranslating[type]) {
    return { success: false, message: '翻译进行中，无法清除缓存' };
  }
  
  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();
  return await CacheManager.clearTypeCache(url, targetLang, type);
};

// 修改检查缓存状态函数
const checkCache = async () => {
  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();
  return {
    hasCompareCache: await CacheManager.hasCache(url, targetLang, 'compare'),
    hasReplaceCache: await CacheManager.hasCache(url, targetLang, 'replace')
  };
};

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'stopTranslation') {
    const type = request.translationType;
    if (type) {
      stopTranslation(type);
    }
    sendResponse({});
  } else if (request.action === 'clearCache') {
    // 修改为异步处理
    (async () => {
      const result = await clearCache(request.cacheType);
      sendResponse(result);
    })();
    return true; // 保持消息通道打开以等待异步响应
  } else if (request.action === 'checkCache') {
    // 修改为异步处理
    (async () => {
      const result = await checkCache();
      sendResponse(result);
    })();
    return true; // 保持消息通道打开以等待异步响应
  }
  // ... 其他消息处理保持不变 ...
});

// 获取节点的唯一标识
const getNodeIdentifier = (node) => {
  // 获取节点在其父元素中的索引
  const getNodeIndex = (node) => {
    let index = 0;
    let sibling = node;
    while (sibling.previousSibling) {
      if (sibling.previousSibling.nodeType === Node.TEXT_NODE) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    return index;
  };

  // 安全地获取类名
  const getClassNames = (element) => {
    if (!element) return '';
    if (typeof element.className === 'string') {
      return element.className;
    }
    if (element.className && element.className.baseVal) {
      // 处理 SVG 元素的类名
      return element.className.baseVal;
    }
    // 如果都不是，返回空字符串
    return '';
  };

  // 构建节点路径
  const buildNodePath = (node) => {
    const path = [];
    let current = node;
    
    while (current && current.parentElement) {
      const parent = current.parentElement;
      const index = getNodeIndex(current);
      const tag = parent.tagName.toLowerCase();
      const className = getClassNames(parent);
      const classes = className ? `.${className.split(' ').join('.')}` : '';
      const id = parent.id ? `#${parent.id}` : '';
      path.unshift(`${tag}${id}${classes}:nth-text(${index})`);
      current = parent;
    }
    
    return path.join(' > ');
  };

  try {
    // 返回节点的唯一标识
    return `${buildNodePath(node)}_${node.textContent.trim().length}`;
  } catch (error) {
    console.error('生成节点标识失败:', error);
    // 返回一个基于时间戳的备用标识
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

// 修改翻译函数，添加节点标识
const translateText = async (text, type = 'compare', nodeId = '') => {
  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();

  // 生成缓存键时包含节点标识
  const cacheKey = `${url}_${targetLang}_${type}_${nodeId}`;

  // 检查缓存
  const cached = await CacheManager.getCache(url, text, targetLang, type, nodeId);
  if (cached) {
    console.log(`[缓存] 使用缓存的翻译结果: ${text.slice(0, 30)}...`);
    return cached.translation;
  }

  // 如果没有缓存，调用API翻译
  console.log(`[API] 调用API翻译: ${text.slice(0, 30)}...`);

  const response = await chrome.runtime.sendMessage({
    action: 'translate',
    text: text,
    tabId: await getCurrentTabId()
  });
  
  // 缓存翻译结果时包含节点标识
  if (response.translation) {
    await CacheManager.setCache(url, text, response.translation, targetLang, type, nodeId);
  }
  
  return response.translation;
};

// 获取当前目标语言
const getCurrentTargetLang = async () => {
  const tabId = await getCurrentTabId();
  const result = await chrome.storage.local.get(`targetLang_${tabId}`);
  return result[`targetLang_${tabId}`] || 'zh-CN';
};

// 检查是否是PDF查看器
const isPDFViewer = () => {
  return window.location.pathname.endsWith('.pdf') || 
         document.querySelector('embed[type="application/pdf"]') !== null;
};

// 处理选中文本事件
let translateButton = null;
let popup = null;

document.addEventListener('mouseup', async () => {
  const selectedText = getSelectedText();
  
  if (!selectedText) {
    if (translateButton) {
      translateButton.style.display = 'none';
    }
    if (popup) {
      popup.style.display = 'none';
    }
    return;
  }

  // 特殊处理PDF查看器
  if (isPDFViewer()) {
    if (!popup) {
      popup = createTranslationPopup();
    }

    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    popup.style.display = 'block';
    popup.querySelector('.ai-translator-text').textContent = '';
    popup.querySelector('.ai-translator-loading').style.display = 'block';
    positionPopup(popup, rect);

    try {
      const translation = await translateText(selectedText);
      popup.querySelector('.ai-translator-loading').style.display = 'none';
      popup.querySelector('.ai-translator-text').textContent = translation;
    } catch (error) {
      popup.querySelector('.ai-translator-loading').style.display = 'none';
      popup.querySelector('.ai-translator-text').textContent = '翻译失败，请重试';
    }
    return;
  }

  // 普通网页的理逻辑保持不变
  if (!translateButton) {
    translateButton = createTranslateButton();
    document.body.appendChild(translateButton);
  }

  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  translateButton.style.display = 'block';
  positionPopup(translateButton, rect);

  translateButton.onclick = async () => {
    if (!popup) {
      popup = createTranslationPopup();
    }

    popup.style.display = 'block';
    popup.querySelector('.ai-translator-text').textContent = '';
    popup.querySelector('.ai-translator-loading').style.display = 'block';
    positionPopup(popup, rect);

    try {
      const translation = await translateText(selectedText);
      popup.querySelector('.ai-translator-loading').style.display = 'none';
      popup.querySelector('.ai-translator-text').textContent = translation;
    } catch (error) {
      popup.querySelector('.ai-translator-loading').style.display = 'none';
      popup.querySelector('.ai-translator-text').textContent = '翻译失败，请重试';
    }
  };
});

// 更新翻译进度
const updateProgress = (progress) => {
  chrome.runtime.sendMessage({
    action: 'updateProgress',
    progress: progress
  });
};

// 判断是否是有效的文本内容
const isValidText = (text, node) => {
  // 移除空白字符
  text = text.trim();
  if (!text || text.length < 2) return false;

  // 检查父元素是否是需要排除的元素
  const invalidParents = ['script', 'style', 'noscript', 'code', 'pre'];
  let current = node.parentElement;
  while (current) {
    if (invalidParents.includes(current.tagName.toLowerCase())) {
      return false;
    }
    current = current.parentElement;
  }

  // 检查是否是代码或脚本内容
  const codePatterns = [
    /^[{(\[`].*[})\]`]$/,                    // 代码块
    /^(function|class|const|let|var)\s/,      // 代码声明
    /^[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$]/, // 对象属性访问
    /^self\./,                                // self引用
    /^window\./,                              // window引用
    /^document\./,                            // document引用
    /^[0-9a-f]{32,}$/,                       // 哈希值
    /^data:/,                                 // Data URLs
    /^https?:\/\//,                          // URLs
    /^[0-9.]+$/,                             // 纯数字
    /^#[0-9a-f]{3,8}$/,                      // 颜色代码
  ];

  if (codePatterns.some(pattern => pattern.test(text))) {
    return false;
  }

  // 检查是否包含有效的文本特征
  const validFeatures = [
    // 标点符号
    /[，。！？；：""''（）【】《》、]/,
    // 中文字符
    /[\u4e00-\u9fa5]/,
    // 英文单词（包括常见缩写）
    /[A-Za-z]{2,}/,
    // 日文假名
    /[\u3040-\u309F\u30A0-\u30FF]/,
    // 韩文
    /[\uAC00-\uD7AF]/,
    // 阿拉伯文
    /[\u0600-\u06FF]/,
    // 泰文
    /[\u0E00-\u0E7F]/,
    // 越南文
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/,
    // 常见标点
    /[.!?;:]/
  ];

  // 如果包含任何有效特征，就认为是有效文本
  if (validFeatures.some(pattern => pattern.test(text))) {
    return true;
  }

  // 检查父元素标签
  const validTags = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'article', 'section', 'div', 'span', 'a',
    'li', 'td', 'th', 'dd', 'dt', 'label',
    'blockquote', 'cite', 'figcaption', 'time',
    'mark', 'strong', 'em', 'b', 'i', 'small',
    'caption', 'title', 'button'
  ];

  const parentTag = node.parentElement?.tagName.toLowerCase();
  if (parentTag && validTags.includes(parentTag)) {
    return true;
  }

  // 检查节点的角色
  const validRoles = [
    'heading', 'article', 'paragraph', 'text',
    'contentinfo', 'button', 'link', 'label',
    'listitem', 'cell', 'gridcell', 'tooltip',
    'alert', 'status', 'log', 'note'
  ];

  const role = node.parentElement?.getAttribute('role');
  if (role && validRoles.includes(role)) {
    return true;
  }

  // 检查是否是列表项或表格单元格的内容
  const isListOrTableContent = node.parentElement?.closest('li, td, th, dt, dd');
  if (isListOrTableContent) {
    return true;
  }

  // 检查是否是链接文本
  const isLinkText = node.parentElement?.closest('a');
  if (isLinkText) {
    return true;
  }

  // 检查是否是按钮文本
  const isButtonText = node.parentElement?.closest('button');
  if (isButtonText) {
    return true;
  }

  // 检查是否是表单标签文本
  const isLabelText = node.parentElement?.closest('label');
  if (isLabelText) {
    return true;
  }

  return false;
};

// 获取节点的XPath
const getXPath = (node) => {
  if (!node) return '';
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return getXPath(node.parentNode);
  }

  let nodeCount = 0;
  let hasFollowingSibling = false;
  const siblings = node.parentNode.childNodes;

  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === node) {
      hasFollowingSibling = true;
    } else if (hasFollowingSibling && sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === node.tagName) {
      nodeCount++;
    }
  }

  const prefix = getXPath(node.parentNode);
  const tagName = node.tagName.toLowerCase();
  const position = nodeCount > 0 ? `[${nodeCount + 1}]` : '';

  return `${prefix}/${tagName}${position}`;
};

// 修改文本节点遍历逻辑
const getTextNodes = (root) => {
  const nodes = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // 基本检查
        if (!node || !node.parentElement) {
          return NodeFilter.FILTER_REJECT;
        }

        // 检查是否是已翻译的内容
        if (node.parentElement.classList.contains('ai-translation-container') ||
            node.parentElement.classList.contains('ai-translation-inline')) {
          return NodeFilter.FILTER_REJECT;
        }

        // 检查文本内容
        const text = node.textContent.trim();
        if (!text || !isValidText(text, node)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  return nodes;
};

// 修改整页翻译功能
const translatePage = async () => {
  isTranslating.compare = true;
  shouldStopTranslation.compare = false;
  
  if (translatedNodes.size > 0) {
    restoreOriginal();
  }

  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();
  const pageCache = await CacheManager.getPageCache(url, targetLang, 'compare');

  const textNodes = getTextNodes(document.body);
  const totalNodes = textNodes.length;
  let processedNodes = 0;

  // 批量处理大小
  const BATCH_SIZE = 10;
  // 批处理延迟（毫秒）
  const BATCH_DELAY = 50;

  // 分批处理函数
  const processBatch = async (nodes, startIndex) => {
    const batch = nodes.slice(startIndex, startIndex + BATCH_SIZE);
    
    for (const node of batch) {
      if (shouldStopTranslation.compare) {
        isTranslating.compare = false;
        chrome.runtime.sendMessage({ 
          action: 'translationStopped',
          translationType: 'compare'
        });
        return;
      }

      const text = node.textContent.trim();
      if (!text) continue;

      try {
        // 首先检查缓存
        const nodeId = getNodeIdentifier(node);
        let translation;
        
        // 如果有缓存，立即使用
        if (pageCache[text]) {
          translation = pageCache[text];
        } else {
          // 否则调用API翻译
          translation = await translateText(text, 'compare', nodeId);
        }

        if (isTextContentNode(node)) {
          const container = createTranslationContainer(node);
          if (container) {
            container.textContent = translation;
            container.setAttribute('data-node-id', nodeId);
            
            const parent = node.parentElement;
            if (parent && parent.parentNode) {
              if (parent.nextSibling) {
                parent.parentNode.insertBefore(container, parent.nextSibling);
              } else {
                parent.parentNode.appendChild(container);
              }
              translatedNodes.set(node, container);
            }
          }
        } else {
          const span = createInlineTranslation(node);
          if (span && node.parentNode) {
            span.textContent = ` (${translation})`;
            span.setAttribute('data-node-id', nodeId);
            if (node.nextSibling) {
              node.parentNode.insertBefore(span, node.nextSibling);
            } else {
              node.parentNode.appendChild(span);
            }
            translatedNodes.set(node, span);
          }
        }
        
        processedNodes++;
        updateProgress(Math.round((processedNodes / totalNodes) * 100));
      } catch (error) {
        console.error('翻译失败:', error);
      }
    }

    // 如果还有未处理的节点，延迟处理下一批
    if (startIndex + BATCH_SIZE < nodes.length && !shouldStopTranslation.compare) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      await processBatch(nodes, startIndex + BATCH_SIZE);
    } else if (!shouldStopTranslation.compare) {
      // 所有节点处理完成
      isTranslating.compare = false;
      chrome.runtime.sendMessage({ 
        action: 'translationComplete',
        translationType: 'compare'
      });
    }
  };

  // 开始批量处理
  await processBatch(textNodes, 0);
};

// 修改替换翻译功能，使用类似的批处理逻辑
const replaceTranslate = async () => {
  isTranslating.replace = true;
  shouldStopTranslation.replace = false;

  if (translatedNodes.size > 0) {
    restoreOriginal();
  }

  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();
  const pageCache = await CacheManager.getPageCache(url, targetLang, 'replace');

  const textNodes = getTextNodes(document.body);
  const totalNodes = textNodes.length;
  let processedNodes = 0;

  const BATCH_SIZE = 10;
  const BATCH_DELAY = 50;

  const processBatch = async (nodes, startIndex) => {
    const batch = nodes.slice(startIndex, startIndex + BATCH_SIZE);
    
    for (const node of batch) {
      if (shouldStopTranslation.replace) {
        isTranslating.replace = false;
        chrome.runtime.sendMessage({ 
          action: 'translationStopped',
          translationType: 'replace'
        });
        return;
      }

      const text = node.textContent.trim();
      if (!text) continue;

      try {
        const nodeId = getNodeIdentifier(node);
        let translation;
        
        // 优先使用缓存
        if (pageCache[text]) {
          translation = pageCache[text];
        } else {
          translation = await translateText(text, 'replace', nodeId);
        }

        // 保存原始文本
        translatedNodes.set(node, node.textContent);
        // 替换文本内容
        node.textContent = translation;
        
        processedNodes++;
        updateProgress(Math.round((processedNodes / totalNodes) * 100));
      } catch (error) {
        console.error('翻译失败:', error);
      }
    }

    if (startIndex + BATCH_SIZE < nodes.length && !shouldStopTranslation.replace) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      await processBatch(nodes, startIndex + BATCH_SIZE);
    } else if (!shouldStopTranslation.replace) {
      isTranslating.replace = false;
      chrome.runtime.sendMessage({ 
        action: 'translationComplete',
        translationType: 'replace'
      });
    }
  };

  await processBatch(textNodes, 0);
};

// 修改恢复原文函数
const restoreOriginal = () => {
  for (const [node, originalText] of translatedNodes) {
    // 检查节点是否仍然存在于文档中
    if (node && node.parentElement && document.contains(node)) {
      if (originalText instanceof Node) {
        // 如果是注入式翻译，检查节点是否仍然存在于文档中
        if (originalText.parentElement && document.contains(originalText)) {
          originalText.remove();
        }
      } else {
        // 如果是替换式翻译，恢复原文
        node.textContent = originalText;
      }
    }
  }
  translatedNodes.clear();
  isTranslated = false;
  chrome.runtime.sendMessage({ action: 'restorationComplete' });
};

// 检测中文变体
const detectChineseVariant = (text) => {
  const traditionalChars = /[錒-鎛]/;
  return traditionalChars.test(text);
};

// 修改停止翻译函数
const stopTranslation = (type) => {
  shouldStopTranslation[type] = true;
};
  