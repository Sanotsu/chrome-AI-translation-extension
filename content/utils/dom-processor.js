class DOMProcessor {
  constructor() {}

  // 提取可见文本节点
  extractVisibleTextNodes() {
    const allNodes = [];

    // 递归获取节点
    const traverseNode = (node, depth = 0) => {
      if (!this._isNodeVisible(node)) {
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
          const priority = this._getNodePriority(parentTag);
          allNodes.push({ node, priority });
        }
        return;
      }

      if (this._shouldSkipNode(node)) {
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
    return this._groupNodesByParagraphs(allNodes.map((item) => item.node));
  }

  // 检查节点是否可见
  _isNodeVisible(node) {
    // 文本节点，检查其父元素
    if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
      return this._isElementVisible(node.parentElement);
    }
    // 元素节点
    else if (node.nodeType === Node.ELEMENT_NODE) {
      return this._isElementVisible(node);
    }
    return false;
  }

  // 获取节点优先级
  _getNodePriority(tagName) {
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

  // 检查元素是否可见
  _isElementVisible(element) {
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
  _shouldSkipNode(node) {
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
  _groupNodesByParagraphs(nodes) {
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

  // 恢复原始内容
  restoreOriginalWebPage() {
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
}

// 导出翻译服务实例
const domProcessor = new DOMProcessor();
