// *********************************/
// 默认的内容脚本
// 负责处理页面加载、语言检测等功能
// 主体的样式和基础操作也可以在这里加载或处理
// *********************************/

// 存储检测到的语言
let detectedLanguage = null;

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
  } else if (request.action === "openVocabulary") {
    // 打开单词本
    chrome.runtime.sendMessage({
      action: "openVocabularyPage",
    });
    sendResponse({});
  }
});

// 在页面加载完成后立即开始检测
document.addEventListener("DOMContentLoaded", () => {
  detectPageLanguage();

  // 有需要可以在这里动态加载CSS文件
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
