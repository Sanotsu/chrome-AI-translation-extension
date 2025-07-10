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
  reset() {
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

  // 提取可见文本节点
  extractVisibleTextNodes() {
    const allNodes = [];

    // 递归获取节点
    const traverseNode = (node, depth = 0) => {
      if (!this.isNodeVisible(node)) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text && text.length > 1) {
          // 获取父元素的标签名
          const parentTag = node.parentElement
            ? node.parentElement.tagName.toLowerCase()
            : "";
          // 设置优先级
          const priority = this.getNodePriority(parentTag);
          allNodes.push({ node, priority });
        }
        return;
      }

      if (this.shouldSkipNode(node)) {
        return;
      }

      for (const child of node.childNodes) {
        traverseNode(child, depth + 1);
      }
    };

    traverseNode(document.body);

    // 按优先级排序节点
    allNodes.sort((a, b) => a.priority - b.priority);

    // 按段落分组并保持优先级顺序
    return this.groupNodesByParagraphs(allNodes.map((item) => item.node));
  }

  // 检查节点是否可见
  isNodeVisible(node) {
    // 文本节点，检查其父元素
    if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
      return this.isElementVisible(node.parentElement);
    }
    // 元素节点
    else if (node.nodeType === Node.ELEMENT_NODE) {
      return this.isElementVisible(node);
    }
    return false;
  }

  // 检查元素是否可见
  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);

    return !(
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      style.height === "0px" ||
      style.width === "0px" ||
      element.hasAttribute("hidden")
    );
  }

  // 是否应该跳过节点
  shouldSkipNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

    const tagName = node.tagName.toLowerCase();

    // 跳过脚本、样式、非交互元素
    const skipTags = [
      "script",
      "style",
      "noscript",
      "svg",
      "path",
      "meta",
      "link",
      "br",
      "hr",
      "iframe",
    ];
    if (skipTags.includes(tagName)) return true;

    // 跳过图片和其他媒体元素
    if (tagName === "img" || tagName === "video" || tagName === "audio")
      return true;

    // 跳过已添加翻译的元素
    if (
      node.classList.contains("ai-translation-container") ||
      node.classList.contains("ai-translation-inline")
    ) {
      return true;
    }

    return false;
  }

  // 将节点按段落或语义单元分组
  groupNodesByParagraphs(nodes) {
    const paragraphs = [];
    let currentParagraph = [];
    let previousNode = null;

    // 找到节点的最近共同块级父元素
    const findCommonBlockParent = (node) => {
      let current = node;
      while (
        current &&
        current.parentElement &&
        current.parentElement !== document.body
      ) {
        const parent = current.parentElement;
        const style = window.getComputedStyle(parent);
        if (
          style.display === "block" ||
          style.display === "flex" ||
          style.display === "grid" ||
          parent.tagName.toLowerCase() === "p" ||
          parent.tagName.toLowerCase().match(/^h[1-6]$/)
        ) {
          return parent;
        }
        current = parent;
      }
      return current.parentElement || document.body;
    };

    // 获取节点所有的父元素
    const getParentChain = (node) => {
      const parents = [];
      let current = node.parentElement;
      while (current && current !== document.body) {
        parents.push(current);
        current = current.parentElement;
      }
      return parents;
    };

    // 预处理：按块级父元素分组
    const blockGroups = new Map();

    nodes.forEach((node) => {
      const blockParent = findCommonBlockParent(node);
      if (!blockGroups.has(blockParent)) {
        blockGroups.set(blockParent, []);
      }
      blockGroups.get(blockParent).push(node);
    });

    // 将每个块级元素内的节点作为一个段落
    for (const [_, groupNodes] of blockGroups) {
      if (groupNodes.length > 0) {
        paragraphs.push(groupNodes);
      }
    }

    return paragraphs;
  }

  // 检查两个节点是否属于同一段落
  areNodesInSameParagraph(node1, node2) {
    // 获取最近的块级父元素
    const getBlockParent = (node) => {
      let current = node;
      while (
        current &&
        current.parentElement &&
        current.parentElement !== document.body
      ) {
        const parent = current.parentElement;
        const style = window.getComputedStyle(parent);
        if (
          style.display === "block" ||
          style.display === "flex" ||
          style.display === "grid" ||
          parent.tagName.toLowerCase() === "p" ||
          parent.tagName.toLowerCase().match(/^h[1-6]$/)
        ) {
          return parent;
        }
        current = parent;
      }
      return current.parentElement || document;
    };

    const block1 = getBlockParent(node1);
    const block2 = getBlockParent(node2);

    // 如果两个节点有相同的块级父元素，认为是同一段落
    return block1 === block2;
  }

  // 准备段落文本和元素映射
  prepareParagraphsForTranslation(paragraphs) {
    const result = [];

    paragraphs.forEach((nodes) => {
      // 如果段落中只有一个文本节点，作为整体翻译
      if (nodes.length === 1 && nodes[0].nodeType === Node.TEXT_NODE) {
        const text = nodes[0].textContent.trim();
        if (text) {
          result.push({
          nodes: nodes,
            originalText: text,
          translatedText: "",
            isInline: false,
          });
        }
        return;
      }

      // 处理段落中的每个节点
      let currentNodes = [];
      let currentText = "";

      nodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) {
            // 如果当前有累积的节点和文本，先添加到结果中
            if (currentNodes.length > 0 && currentText) {
              result.push({
                nodes: [...currentNodes],
                originalText: currentText,
                translatedText: "",
                isInline:
                  currentNodes.length === 1 &&
                  currentNodes[0].nodeType === Node.ELEMENT_NODE,
              });
              currentNodes = [];
              currentText = "";
            }

            // 添加当前文本节点
            result.push({
              nodes: [node],
              originalText: text,
              translatedText: "",
              isInline: false,
            });
          }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
          // 如果是内联元素
          if (
            /^(strong|em|b|i|span|a|code|mark|sub|sup)$/i.test(node.tagName)
          ) {
            const text = node.textContent.trim();
            if (text) {
              // 如果当前有累积的节点和文本，先添加到结果中
              if (currentNodes.length > 0 && currentText) {
                result.push({
                  nodes: [...currentNodes],
                  originalText: currentText,
                  translatedText: "",
                  isInline:
                    currentNodes.length === 1 &&
                    currentNodes[0].nodeType === Node.ELEMENT_NODE,
                });
                currentNodes = [];
                currentText = "";
              }

              // 添加内联元素
              result.push({
                nodes: [node],
                originalText: text,
                translatedText: "",
                isInline: true,
                element: node.cloneNode(true),
              });
            }
          } else {
            // 非内联元素，将其文本内容添加到当前累积中
            const text = node.textContent.trim();
            if (text) {
              currentNodes.push(node);
              currentText += (currentText ? " " : "") + text;
            }
          }
        }
      });

      // 处理最后剩余的累积内容
      if (currentNodes.length > 0 && currentText) {
        result.push({
          nodes: currentNodes,
          originalText: currentText,
          translatedText: "",
          isInline:
            currentNodes.length === 1 &&
            currentNodes[0].nodeType === Node.ELEMENT_NODE,
        });
      }
    });

    return result.filter((info) => info.originalText.length > 0);
  }

  // 从HTML中提取纯文本
  extractTextFromHTML(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent;
  }

  // 执行流式翻译
  async translateWithStreaming(paragraphs, type, targetLang) {
    // 在开始新的翻译任务前，先恢复原文
    this.restoreOriginal();

    // 重置状态
    this.reset();
    this.currentType = type;

    // 过滤并去重段落
    const uniqueParagraphs = this.filterAndDeduplicateParagraphs(paragraphs);

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
      this.applyTranslation(paragraph);
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
      initialTasks.map((task) => this.startTranslationTask(task))
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

  // 过滤并去重段落
  filterAndDeduplicateParagraphs(paragraphs) {
    const seen = new Set();
    const uniqueParagraphs = [];

    paragraphs.forEach((paragraph) => {
      // 生成段落的唯一标识
      const key = this.generateParagraphKey(paragraph);

      // 如果这个段落还没有处理过，添加到结果中
      if (!seen.has(key)) {
        seen.add(key);
        uniqueParagraphs.push(paragraph);
      }
    });

    return uniqueParagraphs;
  }

  // 生成段落的唯一标识
  generateParagraphKey(paragraph) {
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
  async startTranslationTask(task) {
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
        this.applyTranslation(task.paragraph);
        this.updateProgress();
        this.runningTasks.delete(task.id);
        this.startNextTask();
        return;
      }

      // 创建AbortController
      const controller = new AbortController();
      const signal = controller.signal;
      this.activeTasks.set(task.id, controller);

      // 获取API设置
      const settings = await this.getAPISettings();
      if (!settings.apiEndpoint || !settings.apiKey || !settings.model) {
        throw new Error("请先在设置页面配置API信息");
      }

      // 发起API请求
      const response = await fetch(settings.apiEndpoint, {
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
              content: `你是一个翻译助手。请将用户输入的文本翻译成${task.targetLang}，只返回翻译结果，不需要解释。保持原文的格式和风格。`,
            },
            {
              role: "user",
              content: task.paragraph.originalText,
            },
          ],
          temperature: 0.3,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`翻译请求失败: ${response.status}`);
      }

      // 处理流式响应
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
              // 忽略取消读取器时的错误，这是预期的行为
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

                  // 立即更新到页面，不等待下一个chunk
                  if (!this.shouldStop) {
                    task.paragraph.translatedText = translatedText;
                    this.applyTranslation(task.paragraph);
                  }
                }
              } catch (e) {
                console.log("解析流式响应出错:", e, line);
              }
            }
          }
        }

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
          console.log("处理流式响应出错:", error);
        }
      } finally {
        try {
          reader.cancel().catch(() => {});
        } catch (error) {
          // 忽略取消读取器时的错误
        }
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
      this.updateProgress();

      // 启动下一个任务
      this.startNextTask();
    }
  }

  // 启动下一个任务
  startNextTask() {
    if (this.shouldStop) return;

    if (
      this.taskQueue.length > 0 &&
      this.runningTasks.size < this.maxConcurrent
    ) {
      const nextTask = this.taskQueue.shift();
      if (nextTask) {
        this.startTranslationTask(nextTask);
      }
    }
  }

  // 应用翻译结果
  applyTranslation(paragraph) {
    if (this.currentType === "compare") {
      this.applyCompareTranslation(paragraph);
    } else if (this.currentType === "replace") {
      this.applyReplaceTranslation(paragraph);
    }
  }

  // 应用对比翻译
  applyCompareTranslation(paragraph) {
    // 找到段落的共同父元素
    const findRootParent = () => {
      if (paragraph.nodes.length === 0) return null;

      // 获取所有节点的父元素链
      const parentChains = paragraph.nodes.map((node) => {
        const chain = [];
        let current = node;
        while (current && current.parentElement) {
          current = current.parentElement;
          // 如果遇到块级元素或特定标签，就停止
          if (
            current.tagName &&
            /^(p|div|article|section|h[1-6]|blockquote)$/i.test(current.tagName)
          ) {
            chain.unshift(current);
            break;
          }
          chain.unshift(current);
        }
        return chain;
      });

      // 返回第一个块级父元素
      return parentChains[0][0] || paragraph.nodes[0].parentElement;
    };

    const rootParent = findRootParent();
    if (!rootParent) return;

    // 查找或创建翻译容器
    let container = rootParent.nextElementSibling;
    if (
      !container ||
      !container.classList.contains("ai-translation-container")
    ) {
      container = document.createElement("div");
      container.className = "ai-translation-container";
      rootParent.parentElement.insertBefore(container, rootParent.nextSibling);
    }

    // 创建或获取翻译内容容器
    let translationContent = container.querySelector(".translation-content");
    if (!translationContent) {
      // 克隆原始段落元素以保持结构
      translationContent = rootParent.cloneNode(true);
      translationContent.className = "translation-content";
      // 清除所有子节点但保留结构
      const clearContent = (element) => {
        Array.from(element.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            child.textContent = "";
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            clearContent(child);
          }
        });
      };
      clearContent(translationContent);
      container.innerHTML = "";
      container.appendChild(translationContent);
    }

    // 复制原始元素的样式
    const style = window.getComputedStyle(rootParent);
    container.style.fontFamily = style.fontFamily;
    container.style.fontSize = style.fontSize;
    container.style.lineHeight = style.lineHeight;
    container.style.color = style.color;
    container.style.borderLeft = "2px solid #4a8af4";
    container.style.paddingLeft = "10px";
    container.style.marginTop = "10px";
    container.style.marginBottom = "10px";

    // 在翻译内容中找到对应的位置并插入翻译文本
    const findCorrespondingNode = (originalNode, translatedRoot) => {
      if (originalNode.nodeType === Node.TEXT_NODE) {
        // 找到父元素中对应位置的文本节点
        const originalParent = originalNode.parentElement;
        const translatedParent = findCorrespondingElement(
          originalParent,
          translatedRoot
        );
        if (translatedParent) {
          const index = Array.from(originalParent.childNodes).indexOf(
            originalNode
          );
          let targetNode = translatedParent.childNodes[index];
          if (!targetNode || targetNode.nodeType !== Node.TEXT_NODE) {
            targetNode = document.createTextNode("");
            translatedParent.insertBefore(
              targetNode,
              translatedParent.childNodes[index] || null
            );
          }
          return targetNode;
        }
      } else if (originalNode.nodeType === Node.ELEMENT_NODE) {
        return findCorrespondingElement(originalNode, translatedRoot);
      }
      return null;
    };

    const findCorrespondingElement = (originalElement, translatedRoot) => {
      if (!originalElement || !translatedRoot) return null;

      // 构建从根到目标元素的路径
      const buildPath = (element, root) => {
        const path = [];
        let current = element;
        while (current && current !== root && current.parentElement) {
          const parent = current.parentElement;
          const index = Array.from(parent.children).indexOf(current);
          path.unshift(index);
          current = parent;
        }
        return path;
      };

      // 根据路径找到对应元素
      const path = buildPath(originalElement, rootParent);
      let current = translatedRoot;
      for (const index of path) {
        if (!current.children[index]) return null;
        current = current.children[index];
      }
      return current;
    };

    // 更新翻译内容
    paragraph.nodes.forEach((node) => {
      const correspondingNode = findCorrespondingNode(node, translationContent);
      if (correspondingNode) {
        if (correspondingNode.nodeType === Node.TEXT_NODE) {
          correspondingNode.textContent = paragraph.translatedText;
        } else if (correspondingNode.nodeType === Node.ELEMENT_NODE) {
          correspondingNode.textContent = paragraph.translatedText;
        }
      }
    });
  }

  // 生成节点唯一标识
  generateNodeId(nodes) {
    return nodes
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return `t_${node.textContent.slice(0, 20).replace(/\s+/g, "_")}`;
        } else {
          return `e_${node.tagName}_${node.textContent
            .slice(0, 20)
            .replace(/\s+/g, "_")}`;
        }
      })
      .join("_");
  }

  // 设置格式化的翻译内容
  setFormattedTranslation(container, paragraph) {
    // 清空容器
    container.innerHTML = "";

    // 处理内联元素
    if (paragraph.isInline && paragraph.element) {
      const clone = paragraph.element.cloneNode(true);
      clone.textContent = paragraph.translatedText;
      container.appendChild(clone);
      return;
    }

    // 处理普通文本节点
    if (
      paragraph.nodes.length === 1 &&
      paragraph.nodes[0].nodeType === Node.TEXT_NODE
    ) {
      const parent = paragraph.nodes[0].parentElement;
      if (parent) {
        const clone = parent.cloneNode(true);
        clone.textContent = paragraph.translatedText;
        container.appendChild(clone);
        return;
      }
    }

    // 处理多节点段落
    const translationElement = document.createElement("div");
    translationElement.textContent = paragraph.translatedText;
    container.appendChild(translationElement);
  }

  // 应用替换翻译
  applyReplaceTranslation(paragraph) {
    if (!paragraph || !paragraph.nodes || paragraph.nodes.length === 0) return;

    // 应用翻译内容
    const translatedContent = paragraph.translatedText;
    if (!translatedContent || translatedContent.trim() === "") return; // 避免空内容替换

    // 处理内联元素
    if (paragraph.isInline && paragraph.nodes.length === 1) {
      const node = paragraph.nodes[0];
      if (node.nodeType === Node.ELEMENT_NODE) {
        // 保存原始HTML
        if (!node.hasAttribute("data-original-html")) {
          node.setAttribute("data-original-html", node.outerHTML);
          node.setAttribute("data-original-content", node.innerHTML);
          node.setAttribute("data-is-translated", "true");
        }
        // 直接更新内联元素的内容
        node.textContent = translatedContent;
      } else if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = translatedContent;
      }
      return;
    }

    // 处理单个文本节点
    if (
      paragraph.nodes.length === 1 &&
      paragraph.nodes[0].nodeType === Node.TEXT_NODE
    ) {
      const node = paragraph.nodes[0];
          const parentElement = node.parentElement;

      // 保存原始内容
          if (
            parentElement &&
            !parentElement.hasAttribute("data-translated-nodes")
          ) {
        const nodeIndex = Array.from(parentElement.childNodes).indexOf(node);
            const translatedNodes = [
              {
                index: nodeIndex,
                content: node.textContent,
                isText: true,
              },
            ];
            parentElement.setAttribute(
              "data-translated-nodes",
              JSON.stringify(translatedNodes)
            );
            parentElement.setAttribute("data-is-translated", "true");
          }

      // 更新文本内容
      node.textContent = translatedContent;
      return;
    }

    // 处理多节点段落
    const findCommonParent = () => {
      if (paragraph.nodes.length === 1) {
        return paragraph.nodes[0].nodeType === Node.TEXT_NODE
          ? paragraph.nodes[0].parentElement
          : paragraph.nodes[0];
      }

      // 获取所有节点的父元素链
      const parentChains = paragraph.nodes.map((node) => {
        const chain = [];
        let current =
          node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        while (current) {
          chain.unshift(current);
          current = current.parentElement;
        }
        return chain;
      });

      // 找到最深的共同父元素
      const firstChain = parentChains[0];
      let commonParent = null;

      for (let i = 0; i < firstChain.length; i++) {
        const currentParent = firstChain[i];
        const allHaveSameParent = parentChains.every(
          (chain) => i < chain.length && chain[i] === currentParent
        );

        if (allHaveSameParent) {
          commonParent = currentParent;
        } else {
          break;
        }
      }

      return commonParent;
    };

    const commonParent = findCommonParent();
    if (!commonParent) return;

    // 保存原始HTML结构
    if (!commonParent.hasAttribute("data-original-html")) {
      commonParent.setAttribute("data-original-html", commonParent.outerHTML);
      commonParent.setAttribute(
        "data-original-content",
        commonParent.innerHTML
      );
      commonParent.setAttribute("data-is-translated", "true");
    }

    // 更新每个节点的内容
    paragraph.nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
            const parentElement = node.parentElement;
        if (parentElement) {
          // 保存原始内容
          if (!parentElement.hasAttribute("data-translated-nodes")) {
              const nodeIndex = Array.from(parentElement.childNodes).indexOf(
                node
              );
              const translatedNodes = [
                {
                  index: nodeIndex,
                  content: node.textContent,
                  isText: true,
                },
              ];
              parentElement.setAttribute(
                "data-translated-nodes",
                JSON.stringify(translatedNodes)
              );
              parentElement.setAttribute("data-is-translated", "true");
            }
          // 更新文本内容
          node.textContent = translatedContent;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // 保存原始HTML
        if (!node.hasAttribute("data-original-html")) {
          node.setAttribute("data-original-html", node.outerHTML);
          node.setAttribute("data-original-content", node.innerHTML);
          node.setAttribute("data-is-translated", "true");
        }
        // 更新内联元素的内容
        node.textContent = translatedContent;
      }
    });
  }

  // 保存原始内容
  saveOriginalContent(paragraph) {
    paragraph.nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parentElement = node.parentElement;
        if (
          parentElement &&
          !parentElement.hasAttribute("data-translated-nodes")
        ) {
          const nodeIndex = Array.from(parentElement.childNodes).indexOf(node);
          const translatedNodes = [
            {
              index: nodeIndex,
              content: node.textContent,
              isText: true,
            },
          ];
          parentElement.setAttribute(
            "data-translated-nodes",
            JSON.stringify(translatedNodes)
          );
          parentElement.setAttribute("data-is-translated", "true");
        }
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !node.hasAttribute("data-original-html")
      ) {
        node.setAttribute("data-original-html", node.outerHTML);
        node.setAttribute("data-original-content", node.innerHTML);
        node.setAttribute("data-is-translated", "true");
      }
    });
  }

  // 恢复原始内容
  restoreOriginal() {
    try {
    // 恢复所有被翻译过的元素
    document
      .querySelectorAll('[data-is-translated="true"]')
      .forEach((element) => {
          try {
        if (element.hasAttribute("data-translated-nodes")) {
          // 恢复文本节点
            const translatedNodes = JSON.parse(
              element.getAttribute("data-translated-nodes")
            );
            translatedNodes.forEach((nodeInfo) => {
              if (nodeInfo.isText && nodeInfo.index >= 0) {
                const textNode = element.childNodes[nodeInfo.index];
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                  textNode.textContent = nodeInfo.content;
                }
              }
            });
          element.removeAttribute("data-translated-nodes");
        } else if (element.hasAttribute("data-original-html")) {
          // 恢复元素节点
            const originalHtml = element.getAttribute("data-original-html");
              if (originalHtml) {
            const temp = document.createElement("div");
            temp.innerHTML = originalHtml;
            const originalElement = temp.firstElementChild;
            if (originalElement) {
                  // 保留原始元素的事件监听器和引用
                  const parent = element.parentNode;
                  if (parent) {
                    parent.replaceChild(originalElement, element);
            }
                } else {
                  // 如果无法完全替换，至少恢复内容
            if (element.hasAttribute("data-original-content")) {
                    element.innerHTML = element.getAttribute(
                      "data-original-content"
                    );
                  }
            }
          }
        }

        // 移除所有标记属性
        element.removeAttribute("data-original-content");
        element.removeAttribute("data-original-html");
        element.removeAttribute("data-is-translated");
          } catch (elementError) {
            console.warn("恢复单个元素时出错:", elementError);
            // 继续处理其他元素
          }
      });

    // 移除所有翻译容器
    document
      .querySelectorAll(".ai-translation-container")
      .forEach((container) => {
          try {
        container.remove();
          } catch (containerError) {
            console.warn("移除翻译容器时出错:", containerError);
          }
      });
    } catch (error) {
      console.error("恢复原始内容时出错:", error);
    }
  }

  // 更新进度
  updateProgress() {
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

  // 调用API进行翻译
  async translateWithAPI(text, targetLang, type = "selection") {
    try {
      // 获取API设置
      const settings = await this.getAPISettings();
      if (!settings.apiEndpoint || !settings.apiKey || !settings.model) {
        throw new Error("请先在设置页面配置API信息");
      }

      // 获取对应类型的prompt
      const prompt = settings.prompts?.[type] || settings.prompts?.selection;
      if (!prompt) {
        throw new Error("未配置翻译提示词");
      }

      const response = await fetch(settings.apiEndpoint, {
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
      });

      if (!response.ok) {
        throw new Error("翻译请求失败");
      }

      return response;
    } catch (error) {
      console.error("API调用失败:", error);
      throw error;
    }
  }

  // 获取API设置
  async getAPISettings() {
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

  // 获取当前标签页的目标语言
  async getCurrentTargetLang() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0].id;
        chrome.storage.local.get({ [`targetLang_${tabId}`]: "zh" }, (items) => {
          resolve(items[`targetLang_${tabId}`]);
        });
      });
    });
  }

  // 获取节点优先级
  getNodePriority(tagName) {
    const priorityMap = {
      p: 1,
      title: 2,
      h1: 3,
      h2: 4,
      h3: 5,
      h4: 6,
      h5: 7,
      h6: 8,
      div: 9,
      span: 10,
      default: 100,
    };

    return priorityMap[tagName] || priorityMap.default;
  }
}

// 导出翻译服务实例
const translationService = new TranslationService();
