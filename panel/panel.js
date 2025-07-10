import {
  LANGUAGES,
  getBrowserLanguage,
  formatLanguageDisplay,
  isValidLanguageCode,
} from "../content/languages.js";

let targetLang = "zh-CN";
let currentTabId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const streamTranslateButton = document.getElementById("streamTranslatePage");
  const streamReplaceButton = document.getElementById("streamReplaceTranslate");
  const targetLangSelect = document.getElementById("targetLang");
  const customLangInput = document.getElementById("customLang");
  const sourceLanguageSpan = document.getElementById("sourceLanguage");
  const clearCompareCache = document.getElementById("clearCompareCache");
  const clearReplaceCache = document.getElementById("clearReplaceCache");
  const progressBar = document.querySelector(".progress");
  const progressText = document.querySelector(".progress-text");

  // 显示进度条并初始化
  progressBar.style.display = "block";
  progressText.style.display = "block";
  progressBar.parentElement.style.display = "block";
  progressBar.style.width = "0%";
  progressText.textContent = "0%";

  // 添加进度条样式以确保可见
  progressBar.style.backgroundColor = "#4a8af4";
  progressBar.style.transition = "width 0.3s ease-in-out";
  progressBar.parentElement.style.border = "1px solid #ccc";
  progressBar.parentElement.style.borderRadius = "4px";
  progressBar.parentElement.style.height = "20px";
  progressBar.parentElement.style.margin = "10px 0";

  // 填充语言选项
  const fillLanguageOptions = () => {
    // 添加常用语言组
    const commonGroup = document.createElement("optgroup");
    commonGroup.label = "常用语言";
    Object.entries(LANGUAGES.common).forEach(([code, lang]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      commonGroup.appendChild(option);
    });
    targetLangSelect.appendChild(commonGroup);

    // 添加其他语言组
    const othersGroup = document.createElement("optgroup");
    othersGroup.label = "其他语言";
    Object.entries(LANGUAGES.others).forEach(([code, lang]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      othersGroup.appendChild(option);
    });
    targetLangSelect.appendChild(othersGroup);

    // 添加自定义语言选项
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "自定义语言...";
    targetLangSelect.appendChild(customOption);
  };

  fillLanguageOptions();

  // 获取当前标签页ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0].id;

  // 为面板添加唯一标识
  document.body.setAttribute("data-tab-id", currentTabId);

  // 设置默认目标语言为浏览器语言
  const browserLang = getBrowserLanguage();

  // 加载当前标签页的目标语言设置
  chrome.storage.local.get(
    { [`targetLang_${currentTabId}`]: browserLang },
    (items) => {
      const savedLang = items[`targetLang_${currentTabId}`];
      if (
        Object.keys({ ...LANGUAGES.common, ...LANGUAGES.others }).includes(
          savedLang
        )
      ) {
        targetLangSelect.value = savedLang;
      } else {
        targetLangSelect.value = "custom";
        customLangInput.style.display = "block";
        customLangInput.value = savedLang;
      }
      targetLang = savedLang;
    }
  );

  // 监听自定义语言输入
  customLangInput.addEventListener("input", (e) => {
    const value = e.target.value.trim();
    if (isValidLanguageCode(value)) {
      targetLang = value;
      customLangInput.classList.remove("invalid");
      chrome.storage.local.set({ [`targetLang_${currentTabId}`]: value });
    } else {
      customLangInput.classList.add("invalid");
    }
  });

  // 添加自定义语言输入提示
  customLangInput.placeholder = "输入语言代码 (如: en, zh-CN, ja)";
  customLangInput.title = "请输入符合 ISO 639-1 或 ISO 639-2 标准的语言代码";

  // 监听语言选择变化
  targetLangSelect.addEventListener("change", (e) => {
    if (e.target.value === "custom") {
      customLangInput.style.display = "block";
      targetLang = customLangInput.value;
    } else {
      customLangInput.style.display = "none";
      targetLang = e.target.value;
    }
    chrome.storage.local.set({ [`targetLang_${currentTabId}`]: targetLang });
  });

  // 监听源语言更新
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateSourceLanguage" && request.language) {
      if (request.tabId !== currentTabId) return;

      // 处理中文显示
      let displayLanguage = request.language;
      if (displayLanguage === "zh") {
        // 检测是否为繁体中文
        chrome.tabs.sendMessage(
          currentTabId,
          {
            action: "detectChineseVariant",
          },
          (response) => {
            const isTraditional = response && response.isTraditional;
            displayLanguage = isTraditional ? "zh-TW" : "zh-CN";
            sourceLanguageSpan.textContent =
              formatLanguageDisplay(displayLanguage);
          }
        );
      } else {
        sourceLanguageSpan.textContent = formatLanguageDisplay(displayLanguage);
      }

      // 自动选择目标语言
      if (request.language === targetLang) {
        const defaultTarget = request.language.startsWith("zh")
          ? "en"
          : "zh-CN";
        if (Object.keys(LANGUAGES).includes(defaultTarget)) {
          targetLangSelect.value = defaultTarget;
          customLangInput.style.display = "none";
        }
        targetLang = defaultTarget;
        chrome.storage.local.set({
          [`targetLang_${currentTabId}`]: defaultTarget,
        });
      }
    } else if (request.action === "updateProgressBar") {
      // 确保进度条是可见的
      progressBar.parentElement.style.display = "block";
      progressBar.style.display = "block";
      progressText.style.display = "block";

      // 更新进度条
      const progress = Math.min(request.progress, 100);
      console.log(`面板收到进度更新: ${progress}%`); // 添加调试日志
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `${progress}%`;

      // 如果翻译完成，更新按钮状态
      if (progress >= 100) {
        if (streamTranslateButton.textContent.trim() === "停止翻译") {
          streamTranslateButton.textContent = "显示原文";
          streamTranslateButton.classList.remove("stop-translate");
          streamTranslateButton.classList.add("restore-button");
        }
        if (streamReplaceButton.textContent.trim() === "停止翻译") {
          streamReplaceButton.textContent = "显示原文";
          streamReplaceButton.classList.remove("stop-translate");
          streamReplaceButton.classList.add("restore-button");
        }
        enableAllButtons();
      }
    } else if (request.action === "showStopButton") {
      // 改变当前活动翻译按钮为停止状态
      if (streamTranslateButton.disabled === false) {
        streamTranslateButton.textContent = "停止翻译";
        streamTranslateButton.classList.add("stop-translate");
      }
      if (streamReplaceButton.disabled === false) {
        streamReplaceButton.textContent = "停止翻译";
        streamReplaceButton.classList.add("stop-translate");
      }
      disableButtons();

      // 保持当前按钮可用，以便可以停止翻译
      if (streamTranslateButton.textContent.trim() === "停止翻译") {
        streamTranslateButton.disabled = false;
      }
      if (streamReplaceButton.textContent.trim() === "停止翻译") {
        streamReplaceButton.disabled = false;
      }
    } else if (request.action === "hideStopButton") {
      // 如果翻译没有完成（如被用户主动停止），恢复按钮状态
      if (request.completed === false) {
        if (streamTranslateButton.textContent.trim() === "停止翻译") {
          streamTranslateButton.textContent = "流式对比翻译";
          streamTranslateButton.classList.remove("stop-translate");
        }
        if (streamReplaceButton.textContent.trim() === "停止翻译") {
          streamReplaceButton.textContent = "流式替换翻译";
          streamReplaceButton.classList.remove("stop-translate");
        }
        enableAllButtons();
      }
    } else if (request.action === "translationComplete") {
      console.log("收到翻译完成消息");
      // 更新翻译按钮状态
      if (streamTranslateButton.textContent.trim() === "停止翻译") {
        streamTranslateButton.textContent = "显示原文";
        streamTranslateButton.classList.remove("stop-translate");
        streamTranslateButton.classList.add("restore-button");
      }
      if (streamReplaceButton.textContent.trim() === "停止翻译") {
        streamReplaceButton.textContent = "显示原文";
        streamReplaceButton.classList.remove("stop-translate");
        streamReplaceButton.classList.add("restore-button");
      }

      // 确保进度显示为100%
      progressBar.style.width = "100%";
      progressText.textContent = "100%";

      // 启用所有按钮
      enableAllButtons();
    } else if (request.action === "restorationComplete") {
      // 重置进度条
      progressBar.style.width = "0%";
      progressText.textContent = "0%";
    }
  });

  // 禁用所有按钮
  const disableButtons = () => {
    streamTranslateButton.disabled = true;
    streamReplaceButton.disabled = true;
    clearCompareCache.disabled = true;
    clearReplaceCache.disabled = true;
  };

  // 启用所有按钮
  const enableAllButtons = () => {
    streamTranslateButton.disabled = false;
    streamReplaceButton.disabled = false;
    enableCacheButtons();
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

  // 通知内容脚本面板已创建
  chrome.tabs.sendMessage(currentTabId, {
    action: "panelCreated",
    tabId: currentTabId,
  });

  // 流式对比翻译按钮事件
  streamTranslateButton.addEventListener("click", () => {
    if (streamTranslateButton.textContent.trim() === "流式对比翻译") {
      streamTranslateButton.textContent = "停止翻译";
      streamTranslateButton.classList.add("stop-translate");
      streamTranslateButton.disabled = false;
      streamReplaceButton.disabled = true;
      disableCacheButtons();

      // 重置进度条
      progressBar.style.width = "0%";
      progressText.textContent = "0%";

      console.log("开始流式对比翻译");

      chrome.tabs
        .sendMessage(currentTabId, {
          action: "streamTranslatePage",
          targetLang: targetLang,
        })
        .catch((error) => {
          console.error("流式对比翻译请求失败:", error);
          streamTranslateButton.textContent = "流式对比翻译";
          streamTranslateButton.classList.remove("stop-translate");
          enableAllButtons();
        });
    } else if (streamTranslateButton.textContent.trim() === "停止翻译") {
      chrome.tabs.sendMessage(currentTabId, {
        action: "stopTranslation",
      });
      streamTranslateButton.textContent = "显示原文";
      streamTranslateButton.classList.remove("stop-translate");
      streamTranslateButton.classList.add("restore-button");
      enableAllButtons();
    } else if (streamTranslateButton.textContent.trim() === "显示原文") {
      streamTranslateButton.textContent = "流式对比翻译";
      streamTranslateButton.classList.remove("restore-button");
      streamReplaceButton.textContent = "流式替换翻译";
      streamReplaceButton.classList.remove("restore-button");
      enableAllButtons();

      // 重置进度条
      progressBar.style.width = "0%";
      progressText.textContent = "0%";

      chrome.tabs.sendMessage(currentTabId, {
        action: "restoreOriginal",
      });
    } else {
      console.log("【流式对比翻译按钮文字异常】", streamTranslateButton.textContent)
    }
  });

  // 流式替换翻译按钮事件
  streamReplaceButton.addEventListener("click", () => {
    if (streamReplaceButton.textContent.trim() === "流式替换翻译") {
      streamReplaceButton.textContent = "停止翻译";
      streamReplaceButton.classList.add("stop-translate");
      streamReplaceButton.disabled = false;
      streamTranslateButton.disabled = true;
      disableCacheButtons();

      // 重置进度条
      progressBar.style.width = "0%";
      progressText.textContent = "0%";

      chrome.tabs
        .sendMessage(currentTabId, {
          action: "streamReplaceTranslate",
          targetLang: targetLang,
        })
        .catch((error) => {
          console.error("流式替换翻译请求失败:", error);
          streamReplaceButton.textContent = "流式替换翻译";
          streamReplaceButton.classList.remove("stop-translate");
          enableAllButtons();
        });
    } else if (streamReplaceButton.textContent.trim() === "停止翻译") {
      chrome.tabs.sendMessage(currentTabId, {
        action: "stopTranslation",
      });
      streamReplaceButton.textContent = "显示原文";
      streamReplaceButton.classList.remove("stop-translate");
      streamReplaceButton.classList.add("restore-button");
      enableAllButtons();
    } else if (streamReplaceButton.textContent.trim() === "显示原文") {
      streamReplaceButton.textContent = "流式替换翻译";
      streamReplaceButton.classList.remove("restore-button");
      streamTranslateButton.textContent = "流式对比翻译";
      streamTranslateButton.classList.remove("restore-button");
      enableAllButtons();

      // 重置进度条
      progressBar.style.width = "0%";
      progressText.textContent = "0%";

      chrome.tabs.sendMessage(currentTabId, {
        action: "restoreOriginal",
      });
    } else {
      console.log("【流式替换翻译按钮文字异常】", streamReplaceButton.textContent)
    }
  });

  // 清除缓存按钮点击事件
  clearCompareCache.addEventListener("click", () => {
    chrome.tabs.sendMessage(
      currentTabId,
      {
        action: "clearCache",
        cacheType: "compare",
      },
      (response) => {
        if (response.success) {
          showCacheClearMessage("对比翻译缓存已清除");
          clearCompareCache.disabled = true;
        } else if (response.empty) {
          showCacheClearMessage("没有可清除的对比翻译缓存");
          clearCompareCache.disabled = true;
        }
      }
    );
  });

  clearReplaceCache.addEventListener("click", () => {
    chrome.tabs.sendMessage(
      currentTabId,
      {
        action: "clearCache",
        cacheType: "replace",
      },
      (response) => {
        if (response.success) {
          showCacheClearMessage("替换翻译缓存已清除");
          clearReplaceCache.disabled = true;
        } else if (response.empty) {
          showCacheClearMessage("没有可清除的替换翻译缓存");
          clearReplaceCache.disabled = true;
        }
      }
    );
  });

  // 显示缓存清除消息
  const showCacheClearMessage = (message) => {
    const messageElement = document.createElement("div");
    messageElement.className = "cache-clear-message";
    messageElement.textContent = message;
    document.querySelector(".cache-controls").appendChild(messageElement);

    setTimeout(() => {
      messageElement.remove();
    }, 3000);
  };

  // 检查缓存状态更新按钮状态
  const updateCacheButtons = () => {
    chrome.tabs.sendMessage(
      currentTabId,
      { action: "checkCache" },
      (response) => {
        if (response) {
          clearCompareCache.disabled = !response.compareCache;
          clearReplaceCache.disabled = !response.replaceCache;
        }
      }
    );
  };

  // 初始化检查缓存状态
  updateCacheButtons();

  // 打开设置页面
  document.getElementById("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

// 监听标签页关闭事件，清理存储
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    chrome.storage.local.remove(`targetLang_${tabId}`);
  }
});
