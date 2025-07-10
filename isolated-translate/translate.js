import {
  LANGUAGES,
  getBrowserLanguage,
  formatLanguageDisplay,
  isValidLanguageCode,
} from "../content/languages.js";

let currentText = "";
// 不在模块顶层初始化translationService，而是在DOMContentLoaded中获取

// 历史记录管理
class TranslationHistory {
  constructor() {
    this.maxItems = 100; // 最大保存记录数
  }

  async getAll() {
    const result = await chrome.storage.local.get("translationHistory");
    return result.translationHistory || [];
  }

  async add(item) {
    const history = await this.getAll();
    history.unshift({
      ...item,
      id: Date.now(),
      time: new Date().toLocaleString(),
    });

    // 限制最大记录数
    if (history.length > this.maxItems) {
      history.pop();
    }

    await chrome.storage.local.set({ translationHistory: history });
    return history;
  }

  async remove(id) {
    const history = await this.getAll();
    const newHistory = history.filter((item) => item.id !== id);
    await chrome.storage.local.set({ translationHistory: newHistory });
    return newHistory;
  }

  async clear() {
    await chrome.storage.local.set({ translationHistory: [] });
    return [];
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const history = new TranslationHistory();
  const sourceContent = document.getElementById("sourceContent");
  const translatedContent = document.getElementById("translatedContent");
  const targetLangSelect = document.getElementById("targetLang");
  const translateBtn = document.getElementById("translateBtn");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistory");
  const loading = translatedContent.querySelector(".loading");
  const result = translatedContent.querySelector(".result");
  const historyContainer = document.querySelector(".history-container");
  const toggleHistoryBtn = document.getElementById("toggleHistory");

  // 初始化历史记录面板状态
  const initHistoryPanel = () => {
    chrome.storage.local.get({ historyPanelExpanded: true }, (items) => {
      if (items.historyPanelExpanded) {
        historyContainer.classList.add("expanded");
        historyContainer.classList.remove("collapsed");
      } else {
        historyContainer.classList.add("collapsed");
        historyContainer.classList.remove("expanded");
      }
    });
  };

  // 切换历史记录面板
  const toggleHistoryPanel = () => {
    const isExpanded = historyContainer.classList.contains("expanded");
    if (isExpanded) {
      historyContainer.classList.remove("expanded");
      historyContainer.classList.add("collapsed");
    } else {
      historyContainer.classList.remove("collapsed");
      historyContainer.classList.add("expanded");
    }
    // 保存状态
    chrome.storage.local.set({ historyPanelExpanded: !isExpanded });
  };

  // 监听切换按钮点击
  toggleHistoryBtn.addEventListener("click", toggleHistoryPanel);

  // 初始化历史记录面板状态
  initHistoryPanel();

  // 获取translationService实例
  const getTranslationService = () => {
    // 尝试从window对象获取
    if (window.translationService) {
      return window.translationService;
    }

    // 如果不存在，检查TranslationService类是否可用
    if (typeof TranslationService === "function") {
      window.translationService = new TranslationService();
      return window.translationService;
    }

    throw new Error("无法初始化翻译服务，TranslationService类不可用");
  };

  // 确保translationService已初始化
  try {
    const translationService = getTranslationService();
    console.log("翻译服务检查完成:", !!translationService);
  } catch (error) {
    console.error("初始化翻译服务失败:", error);
    result.textContent = "初始化翻译服务失败，请重新加载页面";
  }

  // 填充语言选项
  const fillLanguageOptions = () => {
    // 常用语言组
    const commonGroup = document.createElement("optgroup");
    commonGroup.label = "常用语言";
    Object.entries(LANGUAGES.common).forEach(([code, lang]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      commonGroup.appendChild(option);
    });
    targetLangSelect.appendChild(commonGroup);

    // 其他语言组
    const othersGroup = document.createElement("optgroup");
    othersGroup.label = "其他语言";
    Object.entries(LANGUAGES.others).forEach(([code, lang]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      othersGroup.appendChild(option);
    });
    targetLangSelect.appendChild(othersGroup);
  };

  fillLanguageOptions();

  // 获取存储的目标语言
  chrome.storage.local.get({ translateWindow_targetLang: "zh-CN" }, (items) => {
    targetLangSelect.value = items.translateWindow_targetLang;
  });

  // 监听语言选择变化
  targetLangSelect.addEventListener("change", (e) => {
    chrome.storage.local.set({ translateWindow_targetLang: e.target.value });
  });

  // 监听文本输入
  sourceContent.addEventListener("input", () => {
    currentText = sourceContent.value;
  });

  // 渲染历史记录
  const renderHistory = async () => {
    const records = await history.getAll();
    historyList.innerHTML = records
      .map(
        (record) => `
      <div class="history-item" data-id="${record.id}">
        <div class="time">${record.time}</div>
        <div class="source">${record.sourceText}</div>
        <div class="target-lang">翻译为：${formatLanguageDisplay(
          record.targetLang
        )}</div>
        <div class="translation">${record.translation}</div>
        <button class="delete-btn">删除</button>
      </div>
    `
      )
      .join("");

    // 添加点击事件
    historyList.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("delete-btn")) {
          e.stopPropagation();
          const id = parseInt(item.dataset.id);
          history.remove(id).then(renderHistory);
        } else {
          const id = parseInt(item.dataset.id);
          const record = records.find((r) => r.id === id);
          if (record) {
            sourceContent.value = record.sourceText;
            targetLangSelect.value = record.targetLang;
            result.textContent = record.translation;
            currentText = record.sourceText;
          }
        }
      });
    });
  };

  // 清除所有历史记录
  clearHistoryBtn.addEventListener("click", async () => {
    if (confirm("确定要清除所有历史记录吗？")) {
      await history.clear();
      renderHistory();
    }
  });

  // 修改翻译按钮点击事件
  translateBtn.addEventListener("click", async () => {
    currentText = sourceContent.value.trim();
    if (!currentText) {
      result.textContent = "请输入要翻译的文本";
      return;
    }

    loading.style.display = "block";
    result.textContent = "";

    try {
      const currentTargetLang = targetLangSelect.value;

      // 获取翻译服务实例
      const translationService = getTranslationService();
      console.log("开始调用翻译API...");
      console.log("translationService可用:", !!translationService);

      // 使用TranslationService进行翻译
      const response = await translationService.translateWithAPI(
        currentText,
        currentTargetLang,
        "window"
      );

      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let translatedText = "";
      // 收到第一个响应就隐藏加载提示
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim() || line.includes("[DONE]")) continue;

          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;

              const json = JSON.parse(jsonStr);
              if (json.choices?.[0]?.delta?.content) {
                // 收到第一个内容时隐藏加载提示
                if (firstChunk) {
                  loading.style.display = "none";
                  firstChunk = false;
                }
                const content = json.choices[0].delta.content;
                translatedText += content;
                result.textContent = translatedText;
              }
            } catch (e) {
              console.log("解析流式响应出错:", e, line);
            }
          }
        }
      }

      loading.style.display = "none";

      // 添加到历史记录
      await history.add({
        sourceText: currentText,
        targetLang: currentTargetLang,
        translation: translatedText,
      });
      renderHistory();
    } catch (error) {
      loading.style.display = "none";
      result.textContent = "翻译失败，请重试: " + error.message;
      console.error("翻译错误:", error);
      console.error("详细错误信息:", error.message);
    }
  });

  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateText") {
      currentText = request.text;
      sourceContent.value = currentText;
      translateBtn.click(); // 自动开始翻译
    }
  });

  // 初始加载历史记录
  renderHistory();

  // 支持快捷键翻译
  sourceContent.addEventListener("keydown", (e) => {
    // Ctrl+Enter 或 Command+Enter 触发翻译
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      translateBtn.click();
    }
  });
});
