import { LANGUAGES, getBrowserLanguage, formatLanguageDisplay, isValidLanguageCode } from './languages.js';

let targetLang = 'zh-CN';
let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const translateButton = document.getElementById('translatePage');
  const replaceButton = document.getElementById('replaceTranslate');
  const targetLangSelect = document.getElementById('targetLang');
  const customLangInput = document.getElementById('customLang');
  const sourceLanguageSpan = document.getElementById('sourceLanguage');
  const clearCompareCache = document.getElementById('clearCompareCache');
  const clearReplaceCache = document.getElementById('clearReplaceCache');
  
  // 填充语言选项
  const fillLanguageOptions = () => {
    // 添加常用语言组
    const commonGroup = document.createElement('optgroup');
    commonGroup.label = '常用语言';
    Object.entries(LANGUAGES.common).forEach(([code, lang]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      commonGroup.appendChild(option);
    });
    targetLangSelect.appendChild(commonGroup);

    // 添加其他语言组
    const othersGroup = document.createElement('optgroup');
    othersGroup.label = '其他语言';
    Object.entries(LANGUAGES.others).forEach(([code, lang]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      othersGroup.appendChild(option);
    });
    targetLangSelect.appendChild(othersGroup);

    // 添加自定义语言选项
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = '自定义语言...';
    targetLangSelect.appendChild(customOption);
  };

  fillLanguageOptions();

  // 获取当前标签页ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0].id;

  // 为面板添加唯一标识
  document.body.setAttribute('data-tab-id', currentTabId);
  
  // 设置默认目标语言为浏览器语言
  const browserLang = getBrowserLanguage();
  
  // 加载当前标签页的目标语言设置
  chrome.storage.local.get({ [`targetLang_${currentTabId}`]: browserLang }, (items) => {
    const savedLang = items[`targetLang_${currentTabId}`];
    if (Object.keys({ ...LANGUAGES.common, ...LANGUAGES.others }).includes(savedLang)) {
      targetLangSelect.value = savedLang;
    } else {
      targetLangSelect.value = 'custom';
      customLangInput.style.display = 'block';
      customLangInput.value = savedLang;
    }
    targetLang = savedLang;
  });

  // 监听自定义语言输入
  customLangInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (isValidLanguageCode(value)) {
      targetLang = value;
      customLangInput.classList.remove('invalid');
      chrome.storage.local.set({ [`targetLang_${currentTabId}`]: value });
    } else {
      customLangInput.classList.add('invalid');
    }
  });

  // 添加自定义语言输入提示
  customLangInput.placeholder = '输入语言代码 (如: en, zh-CN, ja)';
  customLangInput.title = '请输入符合 ISO 639-1 或 ISO 639-2 标准的语言代码';

  // 监听语言选择变化
  targetLangSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      customLangInput.style.display = 'block';
      targetLang = customLangInput.value;
    } else {
      customLangInput.style.display = 'none';
      targetLang = e.target.value;
    }
    chrome.storage.local.set({ [`targetLang_${currentTabId}`]: targetLang });
  });

  // 监听源语言更新
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.tabId !== currentTabId) return;

    if (request.action === 'updateSourceLanguage' && request.language) {
      // 处理中文显示
      let displayLanguage = request.language;
      if (displayLanguage === 'zh') {
        // 检测是否为繁体中文
        chrome.tabs.sendMessage(currentTabId, { 
          action: 'detectChineseVariant' 
        }, (response) => {
          const isTraditional = response && response.isTraditional;
          displayLanguage = isTraditional ? 'zh-TW' : 'zh-CN';
          sourceLanguageSpan.textContent = formatLanguageDisplay(displayLanguage);
        });
      } else {
        sourceLanguageSpan.textContent = formatLanguageDisplay(displayLanguage);
      }
      
      // 自动选择目标语言
      if (request.language === targetLang) {
        const defaultTarget = request.language.startsWith('zh') ? 'en' : 'zh-CN';
        if (Object.keys(LANGUAGES).includes(defaultTarget)) {
          targetLangSelect.value = defaultTarget;
          customLangInput.style.display = 'none';
        }
        targetLang = defaultTarget;
        chrome.storage.local.set({ [`targetLang_${currentTabId}`]: defaultTarget });
      }
    }
  });

  // 禁用另一个按钮的函数
  const disableOtherButton = (activeButton) => {
    const otherButton = activeButton === translateButton ? replaceButton : translateButton;
    otherButton.disabled = true;
  };

  // 启用所有按钮的函数
  const enableAllButtons = () => {
    translateButton.disabled = false;
    replaceButton.disabled = false;
  };

  // 禁用缓存清除按钮的函数
  const disableCacheButtons = () => {
    clearCompareCache.disabled = true;
    clearReplaceCache.disabled = true;
  };

  // 启用缓存清除按钮的函数
  const enableCacheButtons = () => {
    clearCompareCache.disabled = false;
    clearReplaceCache.disabled = false;
  };

  // 修改翻译按钮点击事件
  translateButton.addEventListener('click', () => {
    if (translateButton.textContent === '对比翻译') {
      translateButton.textContent = '停止翻译';
      translateButton.classList.add('stop-translate');
      translateButton.disabled = false;
      replaceButton.disabled = true;
      disableCacheButtons();
      chrome.tabs.sendMessage(currentTabId, {
        action: 'translatePage',
        targetLang: targetLang
      }).catch(error => {
        console.error('翻译请求失败:', error);
        translateButton.textContent = '对比翻译';
        translateButton.classList.remove('stop-translate');
        enableAllButtons();
        enableCacheButtons();
      });
    } else if (translateButton.textContent === '停止翻译') {
      chrome.tabs.sendMessage(currentTabId, { 
        action: 'stopTranslation',
        translationType: 'compare'
      });
    } else if (translateButton.textContent === '显示原文') {
      translateButton.textContent = '对比翻译';
      replaceButton.textContent = '替换翻译';
      enableAllButtons();
      enableCacheButtons();
      chrome.tabs.sendMessage(currentTabId, {
        action: 'restoreOriginal'
      });
    }
  });

  // 替换翻译按钮点击事件
  replaceButton.addEventListener('click', () => {
    if (replaceButton.textContent === '替换翻译') {
      replaceButton.textContent = '停止翻译';
      replaceButton.classList.add('stop-translate');
      replaceButton.disabled = false;
      translateButton.disabled = true;
      disableCacheButtons();
      chrome.tabs.sendMessage(currentTabId, {
        action: 'replaceTranslate',
        targetLang: targetLang
      }).catch(error => {
        console.error('替换翻译失败:', error);
        replaceButton.textContent = '替换翻译';
        replaceButton.classList.remove('stop-translate');
        enableAllButtons();
        enableCacheButtons();
      });
    } else if (replaceButton.textContent === '停止翻译') {
      chrome.tabs.sendMessage(currentTabId, { 
        action: 'stopTranslation',
        translationType: 'replace'
      });
    } else if (replaceButton.textContent === '显示原文') {
      replaceButton.textContent = '替换翻译';
      translateButton.textContent = '对比翻译';
      enableAllButtons();
      enableCacheButtons();
      chrome.tabs.sendMessage(currentTabId, {
        action: 'restoreOriginal'
      });
    }
  });

  // 清除缓存按钮点击事件
  clearCompareCache.addEventListener('click', () => {
    chrome.tabs.sendMessage(currentTabId, {
      action: 'clearCache',
      cacheType: 'compare'
    }, (response) => {
      if (response.success) {
        showCacheClearMessage('对比翻译缓存已清除');
        clearCompareCache.disabled = true;
      } else if (response.empty) {
        showCacheClearMessage('没有可清除的对比翻译缓存');
        clearCompareCache.disabled = true;
      }
    });
  });

  clearReplaceCache.addEventListener('click', () => {
    chrome.tabs.sendMessage(currentTabId, {
      action: 'clearCache',
      cacheType: 'replace'
    }, (response) => {
      if (response.success) {
        showCacheClearMessage('替换翻译缓存已清除');
        clearReplaceCache.disabled = true;
      } else if (response.empty) {
        showCacheClearMessage('没有可清除的替换翻译缓存');
        clearReplaceCache.disabled = true;
      }
    });
  });

  // 显示缓存清除消息
  const showCacheClearMessage = (message) => {
    const progressText = document.querySelector('.progress-text');
    progressText.textContent = message;
    setTimeout(() => {
      progressText.textContent = '';
    }, 2000);
  };

  // 检查缓存状态并更新按钮
  const updateCacheButtons = () => {
    chrome.tabs.sendMessage(currentTabId, { action: 'checkCache' }, (response) => {
      clearCompareCache.disabled = !response.hasCompareCache;
      clearReplaceCache.disabled = !response.hasReplaceCache;
    });
  };

  // 在面板创建和翻译完成时检查缓存状态
  document.addEventListener('DOMContentLoaded', () => {
    updateCacheButtons();
  });

  // 修改消息监听器
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender.tab && sender.tab.id !== currentTabId) return;

    const progressBar = document.querySelector('.progress');
    const progressText = document.querySelector('.progress-text');

    if (request.action === 'updateProgress') {
      progressBar.style.width = `${request.progress}%`;
      progressText.textContent = `${request.progress}%`;
    } else if (request.action === 'translationComplete') {
      const translationType = request.translationType;
      const activeButton = translationType === 'compare' ? translateButton : replaceButton;
      const inactiveButton = translationType === 'compare' ? replaceButton : translateButton;
      
      activeButton.textContent = '显示原文';
      activeButton.classList.remove('stop-translate');
      activeButton.disabled = false;
      
      inactiveButton.disabled = true;
      inactiveButton.textContent = translationType === 'compare' ? '替换翻译' : '对比翻译';
      inactiveButton.classList.remove('stop-translate');
      
      progressBar.style.width = '100%';
      progressText.textContent = '100%';
      enableCacheButtons();
    } else if (request.action === 'translationStopped') {
      const translationType = request.translationType;
      const activeButton = translationType === 'compare' ? translateButton : replaceButton;
      const inactiveButton = translationType === 'compare' ? replaceButton : translateButton;
      
      activeButton.textContent = translationType === 'compare' ? '对比翻译' : '替换翻译';
      activeButton.classList.remove('stop-translate');
      inactiveButton.textContent = translationType === 'compare' ? '替换翻译' : '对比翻译';
      inactiveButton.classList.remove('stop-translate');
      
      progressBar.style.width = '0%';
      progressText.textContent = '已停止';
      enableAllButtons();
      enableCacheButtons();
    }
  });

  // 通知 content script 面板已创建，请求语言检测结果
  chrome.tabs.sendMessage(currentTabId, { 
    action: 'panelCreated',
    tabId: currentTabId
  });

  // 添加设置按钮点击事件
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 只处理当前标签页的消息
  if (sender.tab && sender.tab.id !== currentTabId) return;

  const translateButton = document.getElementById('translatePage');
  const progressBar = document.querySelector('.progress');
  const progressText = document.querySelector('.progress-text');

  if (request.action === 'updateProgress') {
    progressBar.style.width = `${request.progress}%`;
    progressText.textContent = `${request.progress}%`;
  } else if (request.action === 'translationComplete') {
    translateButton.textContent = '显示原文';
    translateButton.disabled = false;
    progressBar.style.width = '100%';
    progressText.textContent = '100%';
  } else if (request.action === 'restorationComplete') {
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
  }
});

// 监听标签页关闭事件，清理存储
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    chrome.storage.local.remove(`targetLang_${tabId}`);
  }
}); 