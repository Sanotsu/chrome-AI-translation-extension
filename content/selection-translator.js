// *********************************/
// 基础划词翻译功能
// 选中文本后展示快速翻译按钮，直接在原网页插入显示一个弹窗，流式追加显示翻译结果，点击空白即关闭
// *********************************/

// 全局变量，用于保存按钮和弹窗引用
let translateButton = null;
let popup = null;
let isTranslating = false;

// 初始化划词翻译功能
function initSelectionTranslator() {
  console.log("划词翻译功能已初始化");

  // 监听鼠标选择事件
  document.addEventListener("mouseup", handleMouseUp);

  // 监听点击事件（用于关闭弹窗）
  document.addEventListener("mousedown", (event) => {
    if (
      popup &&
      !popup.contains(event.target) &&
      (!translateButton || !translateButton.contains(event.target))
    ) {
      popup.style.display = "none";
    }
  });
}

// 处理鼠标选择文本事件
async function handleMouseUp(event) {
  // 获取选中的文本
  const selectedText = getSelectedText();
  if (!selectedText || selectedText.length < 2) {
    // 如果没有选中文本，隐藏按钮和弹窗
    if (translateButton) {
      translateButton.style.display = "none";
    }
    if (popup) {
      popup.style.display = "none";
    }
    return;
  }

  // 检查是否是PDF查看器，如果是则不显示翻译按钮（使用右键菜单翻译）
  if (isPDFViewer()) {
    return;
  }

  // 创建或显示翻译按钮
  if (!translateButton) {
    translateButton = createTranslateButton();
    document.body.appendChild(translateButton);
  }

  // 定位按钮
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  translateButton.style.display = "block";
  translateButton.style.top = `${rect.bottom + window.scrollY}px`;
  translateButton.style.left = `${rect.left + window.scrollX}px`;

  // 设置按钮点击事件
  translateButton.onclick = async () => {
    console.log("翻译按钮被点击");

    // 创建或显示弹窗
    if (!popup) {
      popup = createTranslationPopup();
      document.body.appendChild(popup);
    }

    // 获取翻译目标语言
    const targetLang = await getCurrentTargetLang();

    // 显示加载状态
    const loadingElement = popup.querySelector(".ai-translator-loading");
    const textElement = popup.querySelector(".ai-translator-text");
    loadingElement.style.display = "block";
    textElement.textContent = "";

    // 调整弹窗宽度与选中文本宽度一致，但设置最小和最大宽度限制
    const selectionWidth = Math.max(rect.width, 200); // 最小宽度200px
    const maxWidth = Math.min(selectionWidth, window.innerWidth * 0.8); // 最大宽度为窗口的80%
    popup.style.width = `${maxWidth}px`;
    popup.style.maxWidth = `${maxWidth}px`;

    // 显示弹窗并定位
    popup.style.display = "block";
    positionPopup(popup, rect);

    try {
      // 防止重复翻译
      if (isTranslating) return;
      isTranslating = true;

      // 先检查缓存
      // 2025-07-10 划词翻译是否应该考虑不使用缓存，每次都是重新查询？？？
      const url = window.location.href;
      //   const cachedTranslation = await CacheManager.getCache(
      //     url,
      //     selectedText,
      //     targetLang,
      //     "selection"
      //   );

      //   // 如果有缓存，直接使用
      //   if (cachedTranslation) {
      //     console.log("使用缓存的翻译结果");
      //     loadingElement.style.display = "none"; // 隐藏加载提示
      //     textElement.textContent = cachedTranslation.translation;
      //     isTranslating = false;
      //     return;
      //   }

      console.log("开始调用翻译API...");
      console.log("translationService可用:", !!translationService);

      // 使用TranslationService进行翻译
      const response = await translationService.streamingSingleTranslate(
        selectedText,
        targetLang,
        "selection"
      );

      // 收到第一个响应就隐藏加载提示
      let firstChunk = true;

      let translatedText = "";

      // 使用通用的流式响应处理方法
      translatedText = await translationService.handleSingleTranslationResponse(
        response,
        (partialText) => {
          // 收到第一个内容时隐藏加载提示
          if (firstChunk) {
            loadingElement.style.display = "none";
            firstChunk = false;
          }
          // 更新翻译内容
          textElement.textContent = partialText;
        }
      );

      // 确保加载提示被隐藏
      loadingElement.style.display = "none";

      // // 缓存翻译结果
      // if (translatedText) {
      //   await CacheManager.setCache(
      //     url,
      //     selectedText,
      //     translatedText,
      //     targetLang,
      //     "selection"
      //   );
      // }
    } catch (error) {
      loadingElement.style.display = "none";
      textElement.textContent = "翻译请求失败，请重试";
      console.error("划词翻译错误:", error);
    } finally {
      isTranslating = false;
    }
  };
}

// 创建翻译按钮
function createTranslateButton() {
  const button = document.createElement("button");
  button.className = "translate-button";
  button.textContent = "快速翻译";
  return button;
}

// 创建翻译弹窗
function createTranslationPopup() {
  const popup = document.createElement("div");
  popup.className = "ai-translator-popup";
  popup.innerHTML = `
    <div class="ai-translator-content">
      <div class="ai-translator-text"></div>
      <div class="ai-translator-loading">翻译中...</div>
    </div>
  `;
  return popup;
}

// 获取选中的文本
function getSelectedText() {
  const selection = window.getSelection();
  return selection.toString().trim();
}

// 定位弹窗
function positionPopup(element, rect) {
  // 计算弹窗位置，避免超出视口
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // 计算顶部位置
  let top = rect.bottom + window.scrollY + 5; // 添加5px的间距
  const elementHeight = element.offsetHeight || 150; // 预估高度

  if (top + elementHeight > window.scrollY + viewportHeight) {
    // 如果弹窗会超出底部，则显示在选区上方
    top = rect.top + window.scrollY - elementHeight - 5;
  }

  // 计算左侧位置，尽量居中对齐选中文本
  let left = rect.left + window.scrollX;
  const elementWidth = element.offsetWidth || 200;

  // 调整水平位置，使弹窗居中对齐选中文本
  left = rect.left + rect.width / 2 - elementWidth / 2 + window.scrollX;

  // 确保不超出视口边界
  if (left < window.scrollX) {
    left = window.scrollX + 10;
  } else if (left + elementWidth > window.scrollX + viewportWidth) {
    left = window.scrollX + viewportWidth - elementWidth - 10;
  }

  element.style.top = `${top + 30}px`;
  element.style.left = `${left}px`;
}

// 检查是否是PDF查看器
function isPDFViewer() {
  return (
    window.location.href.includes("pdf.js") ||
    document.querySelector('embed[type="application/pdf"]') ||
    document.querySelector('object[type="application/pdf"]')
  );
}

// 初始化划词翻译功能
initSelectionTranslator();
