// 监听来自content script的消息
// 1 获取当前标签页ID (整页翻译会缓存网页编号等内容作为键)
// 2 打开单词本页面
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCurrentTabId") {
    sendResponse({ tabId: sender.tab?.id });
    return false;
  } else if (request.action === "openVocabularyPage") {
    openVocabularyPage();
    sendResponse({});
    return false;
  }
});

// 打开单词本页面
const openVocabularyPage = async () => {
  if (!vocabularyWindow) {
    // 创建新窗口
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL("vocabulary/vocabulary.html"),
      type: "popup",
      width: 800,
      height: 700,
    });
    vocabularyWindow = window.id;
  } else {
    // 更新已存在的窗口
    chrome.windows.update(vocabularyWindow, { focused: true });
  }
};

// 存储面板状态（使用对象而不是 Map）
let panelStates = {};
// 右键独立小窗的翻译窗口
let translateWindow = null;
// 单词本窗口
let vocabularyWindow = null;
// 高级划词翻译窗口
let advancedTranslateWindow = null;

// 面板切换事件
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;

  try {
    // 检查当前标签页是否已有面板
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: togglePanel,
      args: [tabId, !!panelStates[tabId]], // 转换为布尔值
    });

    // 更新面板状态
    panelStates[tabId] = result.result;
  } catch (error) {
    console.error("面板切换失败:", error);
  }
});

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  delete panelStates[tabId];
});

// 面板切换函数
function togglePanel(tabId, isVisible) {
  let panel = document.querySelector(
    `.translator-panel[data-tab-id="${tabId}"]`
  );

  if (panel) {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    return panel.style.display === "block";
  } else {
    const iframe = document.createElement("iframe");
    iframe.className = "translator-panel";
    iframe.setAttribute("data-tab-id", tabId);
    iframe.src = chrome.runtime.getURL("panel/panel.html");
    iframe.style.display = "block";
    document.body.appendChild(iframe);
    return true;
  }
}

// 创建右键独立小窗翻译的菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "AI极简翻译 - 翻译选中文本",
    contexts: ["selection"],
  });
});

// 处理右键菜单点击了独立小窗翻译菜单
// 后续有其他功能菜单应该也是放在这里
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translateSelection") {
    const selectedText = info.selectionText;

    if (!translateWindow) {
      // 创建新窗口
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL("isolated-translate/translate.html"),
        type: "popup",
        width: 800,
        height: 600,
      });
      translateWindow = window.id;

      // 等待窗口加载完成
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: "updateText",
          text: selectedText,
        });
      }, 1000);
    } else {
      // 更新已存在的窗口
      chrome.windows.update(translateWindow, { focused: true });
      chrome.runtime.sendMessage({
        action: "updateText",
        text: selectedText,
      });
    }
  }
});

// 监听窗口关闭
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === translateWindow) {
    translateWindow = null;
  } else if (windowId === vocabularyWindow) {
    vocabularyWindow = null;
  } else if (windowId === advancedTranslateWindow) {
    advancedTranslateWindow = null;
  }
});

// 监听来自content script的高级翻译窗口创建请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "createAdvancedTranslateWindow") {
    createAdvancedTranslateWindow(
      request.originalText,
      request.translationResult,
      request.errorMessage,
      request.isLoading
    );
    sendResponse({});
    return false;
  }
});

// 创建高级翻译窗口
const createAdvancedTranslateWindow = async (
  originalText,
  translationResult,
  errorMessage,
  isLoading = false
) => {
  try {
    if (!advancedTranslateWindow) {
      // 创建新窗口
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL(
          "advanced-translate/advanced-translate.html"
        ),
        type: "popup",
        width: 780,
        height: 500,
      });
      advancedTranslateWindow = window.id;

      // 等待窗口加载完成
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: "updateAdvancedTranslation",
          originalText: originalText,
          translationResult: translationResult,
          errorMessage: errorMessage,
          isLoading: isLoading,
        });
      }, 1000);
    } else {
      // 更新已存在的窗口
      chrome.windows.update(advancedTranslateWindow, { focused: true });
      chrome.runtime.sendMessage({
        action: "updateAdvancedTranslation",
        originalText: originalText,
        translationResult: translationResult,
        errorMessage: errorMessage,
        isLoading: isLoading,
      });
    }
  } catch (error) {
    console.error("创建高级翻译窗口失败:", error);
  }
};
