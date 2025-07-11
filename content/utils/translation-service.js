// 翻译服务工具类
class TranslationService {
  constructor() {
    this.activeTasks = new Map(); // 存储活跃的翻译任务
    this.maxConcurrent = 10; // 最大并发数
    this.progress = { total: 0, completed: 0 }; // 翻译进度
    this.shouldStop = false; // 停止标志
    this.currentType = ""; // 当前翻译类型
    this.taskQueue = []; // 任务队列
    this.runningTasks = new Set(); // 正在运行的任务集合
    this.currentParagraphMap = new Map(); // 添加段落映射存储
  }

  // 重置状态
  _reset() {
    this.activeTasks.clear();
    this.progress = { total: 0, completed: 0 };
    this.shouldStop = false;
    this.taskQueue = [];
    this.runningTasks.clear();
    this.currentParagraphMap = new Map(); // 添加段落映射存储

    // 清除所有翻译标记
    document
      .querySelectorAll('[data-is-translated="true"]')
      .forEach((element) => {
        element.removeAttribute("data-translated-nodes");
        element.removeAttribute("data-original-content");
        element.removeAttribute("data-original-html");
        element.removeAttribute("data-is-translated");
      });

    // 移除所有翻译容器
    document
      .querySelectorAll(".ai-translation-container")
      .forEach((container) => {
        container.remove();
      });
  }

  // 获取API设置
  async _getAPISettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          apiEndpoint: "",
          apiKey: "",
          model: "",
          prompts: {
            selection:
              "你是一个翻译助手。请将用户输入的文本翻译成{LANG}，只返回翻译结果，不需要解释。",
            window:
              "你是一个翻译助手。请将用户输入的文本翻译成{LANG}，保持原文的格式和风格。只返回翻译结果，不需要解释。",
            page: "你是一个翻译助手。请将用户输入的文本翻译成{LANG}，保持原文的格式和风格。翻译时要考虑上下文的连贯性。只返回翻译结果，不需要解释。",
          },
        },
        (items) => {
          resolve(items);
        }
      );
    });
  }

  // 过滤并去重段落
  _filterAndDeduplicateParagraphs(paragraphs) {
    const seen = new Set();
    const uniqueParagraphs = [];

    paragraphs.forEach((paragraph) => {
      // 生成段落的唯一标识
      const key = this._generateParagraphKey(paragraph);

      // 如果这个段落还没有处理过，添加到结果中
      if (!seen.has(key)) {
        seen.add(key);
        uniqueParagraphs.push(paragraph);
      }
    });

    return uniqueParagraphs;
  }

  // 生成段落的唯一标识
  _generateParagraphKey(paragraph) {
    if (!paragraph || !paragraph.nodes || paragraph.nodes.length === 0) {
      return "";
    }

    return paragraph.nodes
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return `text:${node.textContent.trim()}`;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          return `${node.tagName}:${node.textContent.trim()}`;
        }
        return "";
      })
      .join("|");
  }

  // 启动单个翻译任务
  async _startTranslationTask(task) {
    if (this.shouldStop) return;

    this.runningTasks.add(task.id);

    try {
      // 检查缓存
      const url = window.location.href;
      const cachedTranslation = await CacheManager.getCache(
        url,
        task.paragraph.originalText,
        task.targetLang,
        this.currentType
      );

      if (cachedTranslation) {
        task.paragraph.translatedText = cachedTranslation.translation;
        this._applyTranslation(task.paragraph);
        this._updateProgress();
        this.runningTasks.delete(task.id);
        this._startNextTask();
        return;
      }

      // 创建AbortController
      const controller = new AbortController();
      const signal = controller.signal;
      this.activeTasks.set(task.id, controller);

      // 使用通用的API调用方法
      const response = await this._callTranslationAPI(
        task.paragraph.originalText,
        task.targetLang,
        "page",
        signal
      );

      // 处理流式响应
      const translatedText = await this._handleStreamingResponse(
        response,
        (partialText) => {
          // 实时更新翻译结果的回调
          if (!this.shouldStop) {
            task.paragraph.translatedText = partialText;
            this._applyTranslation(task.paragraph);
          }
        }
      );

      // 流式响应完全结束后，才保存到缓存
      if (!this.shouldStop && translatedText.trim()) {
        await CacheManager.setCache(
          url,
          task.paragraph.originalText,
          translatedText.trim(),
          task.targetLang,
          this.currentType
        );
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("翻译请求被取消，这是正常现象");
      } else {
        console.log("流式翻译错误:", error);
      }
    } finally {
      // 清理任务状态
      this.activeTasks.delete(task.id);
      this.runningTasks.delete(task.id);
      this._updateProgress();

      // 启动下一个任务
      this._startNextTask();
    }
  }

  // 启动下一个任务
  _startNextTask() {
    if (this.shouldStop) return;

    if (
      this.taskQueue.length > 0 &&
      this.runningTasks.size < this.maxConcurrent
    ) {
      const nextTask = this.taskQueue.shift();
      if (nextTask) {
        this._startTranslationTask(nextTask);
      }
    }
  }

  // 应用翻译结果
  _applyTranslation(paragraph) {
    if (this.currentType === "compare") {
      domProcessor.applyCompareTranslation(paragraph);
    } else if (this.currentType === "replace") {
      domProcessor.applyReplaceTranslation(paragraph);
    }
  }

  // 更新进度
  _updateProgress() {
    this.progress.completed += 1;
    const percent = Math.min(
      Math.floor((this.progress.completed / this.progress.total) * 100),
      100
    );

    console.log(
      `翻译进度: ${this.progress.completed}/${this.progress.total} (${percent}%) [缓存命中: ${this.progress.cached}]`
    );

    // 发送进度更新消息
    chrome.runtime.sendMessage({
      action: "updateProgressBar",
      progress: percent,
    });

    // 如果翻译已完成（全部或已停止），发送翻译完成消息
    if (this.progress.completed >= this.progress.total || this.shouldStop) {
      chrome.runtime.sendMessage({
        action: "translationComplete",
      });
    }
  }

  // ================================
  // 新增通用方法，用于API调用和流式响应处理
  // ================================

  // 通用API调用方法
  async _callTranslationAPI(
    text,
    targetLang,
    type = "selection",
    signal = null
  ) {
    // 获取API设置
    const settings = await this._getAPISettings();
    if (!settings.apiEndpoint || !settings.apiKey || !settings.model) {
      throw new Error("请先在设置页面配置API信息");
    }

    // 获取对应类型的prompt
    const prompt = settings.prompts?.[type] || settings.prompts?.selection;
    if (!prompt) {
      throw new Error("未配置翻译提示词");
    }

    // 构建请求选项
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "system",
            content: prompt.replace("{LANG}", targetLang),
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.3,
        stream: true,
      }),
    };

    // 如果提供了signal，添加到请求选项中
    if (signal) {
      requestOptions.signal = signal;
    }

    // 发起API请求
    const response = await fetch(settings.apiEndpoint, requestOptions);

    if (!response.ok) {
      throw new Error(`翻译请求失败: ${response.status}`);
    }

    return response;
  }

  // 通用流式响应处理方法
  async _handleStreamingResponse(response, onPartialContent = null) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let translatedText = "";
    let isDone = false;

    try {
      while (!isDone) {
        if (this.shouldStop) {
          try {
            await reader.cancel();
          } catch (error) {
            console.log("取消读取流时出现错误，这是正常现象");
          }
          break;
        }

        let readResult;
        try {
          readResult = await reader.read();
        } catch (error) {
          if (error.name === "AbortError") {
            console.log("读取被中止，这是正常现象");
            break;
          }
          throw error;
        }

        const { done, value } = readResult;
        if (done) {
          isDone = true;
          break;
        }

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
                const content = json.choices[0].delta.content;
                translatedText += content;

                // 如果提供了回调函数，调用它
                if (typeof onPartialContent === "function") {
                  onPartialContent(translatedText);
                }
              }
            } catch (e) {
              console.log("解析流式响应出错:", e, line);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("翻译请求被取消，这是正常现象");
      } else {
        console.log("处理流式响应出错:", error);
      }
    } finally {
      try {
        reader.cancel().catch(() => {});
      } catch (error) {
        // 忽略取消读取器时的错误
      }
    }

    return translatedText;
  }

  // ================================
  // 上面都是私有方法，这几个外部有用到
  // ================================

  // 停止所有翻译任务
  stopAllTranslations() {
    this.shouldStop = true;
    // 中止所有活跃的请求
    for (const controller of this.activeTasks.values()) {
      if (controller && controller.abort) {
        try {
          controller.abort();
        } catch (error) {
          // 忽略AbortError，这是预期的行为
          if (error.name !== "AbortError") {
            console.log("取消请求时出现错误:", error);
          }
        }
      }
    }
    this.activeTasks.clear();
    this.taskQueue = [];
    this.runningTasks.clear();
    this.progress = { total: 0, completed: 0 }; // 重置进度
  }

  // 整页流式翻译(整页翻译使用，一次性多个翻译任务)
  async streamingPageTranslate(paragraphs, type, targetLang) {
    // 在开始新的翻译任务前，先恢复原文
    domProcessor.restoreOriginalWebPage();

    // 重置状态
    this._reset();
    this.currentType = type;

    // 过滤并去重段落
    const uniqueParagraphs = this._filterAndDeduplicateParagraphs(paragraphs);

    // 初始化进度
    this.progress = {
      total: uniqueParagraphs.length,
      completed: 0,
      cached: 0,
    };

    // 检查缓存命中情况
    const url = window.location.href;
    const cacheChecks = await Promise.all(
      uniqueParagraphs.map(async (paragraph) => {
        const cache = await CacheManager.getCache(
          url,
          paragraph.originalText,
          targetLang,
          this.currentType
        );
        return { paragraph, cache };
      })
    );

    // 分离缓存命中和未命中的段落
    const { cachedParagraphs, uncachedParagraphs } = cacheChecks.reduce(
      (acc, { paragraph, cache }) => {
        if (cache) {
          acc.cachedParagraphs.push({
            ...paragraph,
            translatedText: cache.translation,
          });
        } else {
          acc.uncachedParagraphs.push(paragraph);
        }
        return acc;
      },
      { cachedParagraphs: [], uncachedParagraphs: [] }
    );

    // 更新缓存命中的进度
    this.progress.cached = cachedParagraphs.length;
    this.progress.completed = cachedParagraphs.length;

    // 应用缓存的翻译
    for (const paragraph of cachedParagraphs) {
      this._applyTranslation(paragraph);
    }

    // 更新进度条
    if (this.progress.cached > 0) {
      const percent = Math.floor(
        (this.progress.completed / this.progress.total) * 100
      );
      chrome.runtime.sendMessage({
        action: "updateProgressBar",
        progress: percent,
      });
    }

    // 准备未缓存的任务队列
    this.taskQueue = uncachedParagraphs.map((paragraph, index) => ({
      id: `task_${index}`,
      paragraph,
      targetLang,
    }));

    // 如果所有段落都已缓存，直接返回
    if (this.taskQueue.length === 0) {
      console.log(
        `翻译任务全部完成！(${this.progress.completed}/${this.progress.total})`
      );
      chrome.runtime.sendMessage({
        action: "updateProgressBar",
        progress: 100,
      });
      chrome.runtime.sendMessage({
        action: "translationComplete",
      });
      return true;
    }

    // 启动初始的并发任务
    const initialTasks = this.taskQueue.splice(0, this.maxConcurrent);
    await Promise.all(
      initialTasks.map((task) => this._startTranslationTask(task))
    );

    // 等待所有任务完成
    while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
      if (this.shouldStop) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 确保最终进度正确
    if (!this.shouldStop) {
      // 确保进度显示为100%
      chrome.runtime.sendMessage({
        action: "updateProgressBar",
        progress: 100,
      });

      // 通知翻译完成
      chrome.runtime.sendMessage({
        action: "translationComplete",
      });

      console.log(
        `翻译任务全部完成！(${this.progress.completed}/${this.progress.total})`
      );
    } else {
      console.log("翻译任务被用户中止");
    }

    return this.progress.completed === this.progress.total;
  }

  // 调用API进行翻译(单个翻译任务，划词翻译和小窗翻译)
  // type: selection, window
  async streamingSingleTranslate(
    text,
    targetLang,
    type = "selection",
    signal = null
  ) {
    try {
      // 使用通用的API调用方法
      return await this._callTranslationAPI(text, targetLang, type, signal);
    } catch (error) {
      console.error("API调用失败:", error);
      throw error;
    }
  }

  // 处理单个翻译的流式响应（供外部使用）
  async handleSingleTranslationResponse(response, onUpdate, onComplete) {
    try {
      const translatedText = await this._handleStreamingResponse(
        response,
        onUpdate
      );
      if (typeof onComplete === "function") {
        onComplete(translatedText);
      }
      return translatedText;
    } catch (error) {
      console.error("处理翻译响应失败:", error);
      throw error;
    }
  }
}

// 导出翻译服务实例
const translationService = new TranslationService();
