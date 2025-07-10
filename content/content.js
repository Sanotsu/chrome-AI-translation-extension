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

    if (hasChineseChars) return "zh";
    if (hasJapaneseChars) return "ja";
    if (hasKoreanChars) return "ko";
    return "en";
  } catch (error) {
    console.error("语言检测失败:", error);
    return "unknown";
  }
};

// 获取当前标签页ID
const getCurrentTabId = async () => {
  try {
    // 如果是在content script中运行
    if (chrome.runtime?.id) {
      const response = await chrome.runtime.sendMessage({
        action: "getCurrentTabId",
      });
      return response.tabId;
    }
    // 如果是在独立窗口中运行
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0].id;
  } catch (error) {
    console.error("获取标签页ID失败:", error);
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
      action: "updateSourceLanguage",
      language: detectedLanguage,
      tabId: tabId,
    });
  }
};

// 监听面板创建事件
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "panelCreated") {
    // 如果已经检测到语言，立即发送
    if (detectedLanguage) {
      chrome.runtime.sendMessage({
        action: "updateSourceLanguage",
        language: detectedLanguage,
        tabId: request.tabId,
      });
      sendResponse({}); // 立即发送响应
    } else {
      // 如果还没有检测结果，立即进行检测
      detectPageLanguage().then(() => {
        sendResponse({}); // 检测完成后发送响应
      });
      return true; // 表示将异步发送响应
    }
  } else if (request.action === "streamTranslatePage") {
    console.log("开始流式对比翻译============");

    streamTranslatePage("compare").then(() => {
      sendResponse({}); // 翻译完成后发送响应
    });
    return true; // 表示将异步发送响应
  } else if (request.action === "streamReplaceTranslate") {
    streamTranslatePage("replace").then(() => {
      sendResponse({}); // 替换翻译完成后发送响应
    });
    return true; // 表示将异步发送响应
  } else if (request.action === "restoreOriginal") {
    restoreOriginal();
    sendResponse({}); // 立即发送响应
  } else if (request.action === "detectChineseVariant") {
    const isTraditional = detectChineseVariant(document.body.innerText);
    sendResponse({ isTraditional });
  } else if (request.action === "stopTranslation") {
    stopTranslation();
    sendResponse({}); // 立即发送响应
  } else if (request.action === "updateTranslationProgress") {
    updateProgress(request.progress);
    sendResponse({}); // 立即发送响应
  } else if (request.action === "clearCache") {
    clearCache(request.cacheType).then((result) => {
      sendResponse(result);
    });
    return true; // 表示将异步发送响应
  } else if (request.action === "checkCache") {
    checkCache().then((result) => {
      sendResponse(result);
    });
    return true; // 表示将异步发送响应
  }
});

// 在页面加载完成后立即开始检测
document.addEventListener("DOMContentLoaded", () => {
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
  subtree: true,
});

// 检查缓存状态
const checkCache = async () => {
  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();

  const compareCache = await CacheManager.hasCache(url, targetLang, "compare");
  const replaceCache = await CacheManager.hasCache(url, targetLang, "replace");

  return { compareCache, replaceCache };
};

// 获取当前标签页的目标语言
const getCurrentTargetLang = async () => {
  const tabId = await getCurrentTabId();
  const result = await chrome.storage.local.get({
    [`targetLang_${tabId}`]: "zh",
  });
  return result[`targetLang_${tabId}`];
};

// 更新进度
const updateProgress = (progress) => {
  // 确保进度不超过100%
  const safeProgress = Math.min(progress, 100);

  console.log(`发送进度更新: ${safeProgress}%`);

  // 发送进度更新消息到面板
  chrome.runtime.sendMessage({
    action: "updateProgressBar",
    progress: safeProgress,
  });

  // 不需要在这里发送翻译完成消息，已在translationService.updateProgress中处理
  // 避免重复发送完成消息
};

// 流式翻译页面（新方法）
const streamTranslatePage = async (type) => {
  try {
    // 先恢复原始内容
    restoreOriginal();

    // 显示停止按钮
    chrome.runtime.sendMessage({ action: "showStopButton" });

    // 重置进度
    updateProgress(0);

    // 获取目标语言
    const targetLang = await getCurrentTargetLang();

    // 获取可见文本节点
    const paragraphs = translationService.extractVisibleTextNodes();

    // 准备翻译
    const preparedParagraphs =
      translationService.prepareParagraphsForTranslation(paragraphs);

    // 执行流式翻译
    const success = await translationService.translateWithStreaming(
      preparedParagraphs,
      type,
      targetLang
    );

    // 更新进度为100%
    updateProgress(100);

    // 翻译完成，隐藏停止按钮并通知完成
    chrome.runtime.sendMessage({
      action: "hideStopButton",
      completed: true,
    });

    return success;
  } catch (error) {
    console.error("流式翻译失败:", error);

    // 隐藏停止按钮
    chrome.runtime.sendMessage({
      action: "hideStopButton",
      completed: false,
    });

    // 更新进度
    updateProgress(0);

    throw error;
  }
};

// 停止翻译
const stopTranslation = () => {
  translationService.stopAllTranslations();
};

// 恢复原始内容
const restoreOriginal = () => {
  // 调用翻译服务的恢复方法
  translationService.restoreOriginal();

  // 重置状态
  isTranslated = false;

  // 发送恢复完成消息
  chrome.runtime.sendMessage({
    action: "restorationComplete",
  });

  // 重置进度条
  updateProgress(0);
};

// 检测中文简繁体
const detectChineseVariant = (text) => {
  // 简单判断：如果含有繁体特有字符，则可能是繁体中文
  const traditionalChars = "魚機車個島後會長東買來紙風無紅電開關時實關";
  const simplifiedChars = "鱼机车个岛后会长东买来纸风无红电开关时实关";

  // 统计繁体和简体字符出现次数
  let traditionalCount = 0;
  let simplifiedCount = 0;

  for (let i = 0; i < Math.min(text.length, 1000); i++) {
    const char = text[i];
    if (traditionalChars.includes(char)) traditionalCount++;
    if (simplifiedChars.includes(char)) simplifiedCount++;
  }

  return traditionalCount > simplifiedCount;
};

// 清除缓存函数
const clearCache = async (type) => {
  // 检查是否正在翻译
  if (translationService.activeTasks.size > 0) {
    return { success: false, message: "翻译进行中，无法清除缓存" };
  }

  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();
  return await CacheManager.clearTypeCache(url, targetLang, type);
};
