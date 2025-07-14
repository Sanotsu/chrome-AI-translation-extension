// *********************************/
// 高级划词翻译功能
// 选中文本后展示高级翻译按钮，在独立的翻译窗口中显示翻译对照和复杂单词简单解析
// 独立窗口在advanced-translate/中
// *********************************/

// 全局变量，用于保存按钮引用
let advancedTranslateButton = null;
let isAdvancedTranslating = false;
let vocabulary = new Set(); // 存储单词本内容
let advancedTranslateWindow = null; // 存储高级翻译窗口的引用

// 初始化高级划词翻译功能
function initAdvancedSelectionTranslator() {
  console.log("高级划词翻译功能已初始化");

  // 监听鼠标选择事件
  document.addEventListener("mouseup", handleAdvancedMouseUp);

  // 初始化单词本
  loadVocabulary();
}

// 加载单词本
async function loadVocabulary() {
  const result = await chrome.storage.local.get({ vocabulary: [] });
  if (result.vocabulary && Array.isArray(result.vocabulary)) {
    vocabulary = new Set(result.vocabulary);
    console.log(`单词本加载完成，共 ${vocabulary.size} 个单词`);
  }
}

// 保存单词本
async function saveVocabulary() {
  await chrome.storage.local.set({ vocabulary: Array.from(vocabulary) });
  console.log(`单词本已保存，共 ${vocabulary.size} 个单词`);
}

// 添加单词到单词本
async function addToVocabulary(word, definition, phonetic, partOfSpeech) {
  if (word && !vocabulary.has(word)) {
    vocabulary.add(word);
    await saveVocabulary();

    // 同时保存单词的详细信息
    const wordDetails = {
      phonetic: phonetic || "",
      definition: definition || "",
      part_of_speech: partOfSpeech || "",
    };

    const wordKey = `word_details_${word}`;
    await chrome.storage.local.set({ [wordKey]: wordDetails });
    console.log(`已将单词 "${word}" 的详细信息保存到缓存`);

    return true;
  }
  return false;
}

// 处理鼠标选择文本事件
async function handleAdvancedMouseUp(event) {
  // 获取选中的文本
  const selectedText = getSelectedText();
  if (!selectedText || selectedText.length < 2) {
    // 如果没有选中文本，隐藏按钮
    if (advancedTranslateButton) {
      advancedTranslateButton.style.display = "none";
    }
    return;
  }

  // 检查是否是PDF查看器，如果是则不显示翻译按钮（使用右键菜单翻译）
  if (isPDFViewer()) {
    return;
  }

  // 创建或显示翻译按钮
  if (!advancedTranslateButton) {
    advancedTranslateButton = createAdvancedTranslateButton();
    document.body.appendChild(advancedTranslateButton);
  }

  // 定位按钮
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  advancedTranslateButton.style.display = "block";
  advancedTranslateButton.style.top = `${rect.bottom + window.scrollY}px`;
  // +80 是快速翻译的按钮宽度，避免被遮挡
  advancedTranslateButton.style.left = `${rect.left + 80 + window.scrollX}px`;

  // 设置按钮点击事件
  advancedTranslateButton.onclick = async () => {
    console.log("高级翻译按钮被点击");

    try {
      // 防止重复翻译
      if (isAdvancedTranslating) return;
      isAdvancedTranslating = true;

      // 立即打开高级翻译窗口并显示"翻译中"状态
      await openAdvancedTranslateWindow(selectedText, null, null, true); // 添加loading参数

      // 获取翻译目标语言
      const targetLang = await getCurrentTargetLang();

      console.log("开始调用高级翻译API...");

      // 使用新的高级翻译API方法
      const translationResult = await callAdvancedTranslationAPI(
        selectedText,
        targetLang
      );

      // 更新高级翻译窗口显示结果
      await openAdvancedTranslateWindow(
        selectedText,
        translationResult,
        null,
        false
      );
    } catch (error) {
      console.error("高级划词翻译错误:", error);
      // 显示错误信息
      await openAdvancedTranslateWindow(
        selectedText,
        null,
        error.message,
        false
      );
    } finally {
      isAdvancedTranslating = false;
    }
  };
}

// 创建高级翻译按钮
function createAdvancedTranslateButton() {
  const button = document.createElement("button");
  button.className = "advanced-translate-button";
  button.textContent = "高级翻译";
  return button;
}

// 打开高级翻译窗口
async function openAdvancedTranslateWindow(
  originalText,
  translationResult,
  errorMessage = null,
  isLoading = false
) {
  try {
    // 通过background script创建窗口
    chrome.runtime.sendMessage({
      action: "createAdvancedTranslateWindow",
      originalText: originalText,
      translationResult: translationResult,
      errorMessage: errorMessage,
      isLoading: isLoading,
    });
  } catch (error) {
    console.error("打开高级翻译窗口失败:", error);
  }
}

// 获取选中的文本
function getSelectedText() {
  const selection = window.getSelection();
  return selection.toString().trim();
}

// 检查是否是PDF查看器
function isPDFViewer() {
  return (
    window.location.href.includes("pdf.js") ||
    document.querySelector('embed[type="application/pdf"]') ||
    document.querySelector('object[type="application/pdf"]')
  );
}

// 调用高级翻译API (非流式)
async function callAdvancedTranslationAPI(text, targetLang) {
  try {
    // 获取API设置
    const settings = await getAPISettings();

    if (!settings.apiEndpoint || !settings.apiKey || !settings.model) {
      throw new Error("请先在设置页面配置API信息");
    }

    // 使用专门的高级划词翻译提示词
    const advancedPrompt =
      settings.prompts?.advancedSelection ||
      `你是一个高级翻译助手。请将用户输入的文本翻译成{LANG}，并提供更多信息。
      返回JSON格式，包含以下字段:
      - text: 原文
      - translation: 翻译结果
      - complex_words: 复杂单词列表，每个单词包含word(单词)、phonetic(音标)、part_of_speech(词性)、definition(定义)字段
      不要返回多余内容，确保返回的是有效的JSON格式。`;

    // 替换提示词中的语言标记
    const prompt = advancedPrompt.replace("{LANG}", targetLang);

    // 构建请求体
    const requestBody = {
      model: settings.model,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      stream: false, // 非流式请求
    };

    // 发送请求
    const response = await fetch(settings.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log("高级翻译API响应:", data);

    // 解析响应内容
    const content = data.choices[0].message.content;

    // 提取JSON内容 (处理可能的```json包裹)
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
      content.match(/```\s*([\s\S]*?)\s*```/) || [null, content];

    const jsonContent = jsonMatch[1].trim();

    try {
      return JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("JSON解析失败，尝试清理内容后再解析", parseError);
      // 尝试清理和修复JSON
      const cleanedJson = jsonContent
        .replace(/\\"/g, '"')
        .replace(/"{/g, "{")
        .replace(/}"/g, "}")
        .replace(/\\n/g, " ");
      return JSON.parse(cleanedJson);
    }
  } catch (error) {
    console.error("高级翻译API调用失败:", error);
    throw error;
  }
}

// 获取API设置
async function getAPISettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        apiEndpoint: "",
        apiKey: "",
        model: "",
        prompts: {
          selection:
            "你是一个翻译助手。请将用户输入的文本翻译成{LANG}，只返回翻译结果，不需要解释。",
          advancedSelection: `你是一个高级翻译助手。请将用户输入的文本翻译成{LANG}，并提供更多信息。
            返回JSON格式，包含以下字段:
            - text: 原文
            - translation: 翻译结果
            - complex_words: 复杂单词列表，每个单词包含word(单词)、phonetic(音标)、part_of_speech(词性)、definition(定义)字段
            不要返回多余内容，确保返回的是有效的JSON格式。`,
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

// 初始化高级划词翻译功能
initAdvancedSelectionTranslator();
