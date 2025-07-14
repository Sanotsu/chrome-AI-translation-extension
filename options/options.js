// *********************************/
// 设置页面
// 设置页面中包含API密钥、模型选择、提示词配置等功能
// *********************************/

document.addEventListener("DOMContentLoaded", () => {
  const apiEndpoint = document.getElementById("apiEndpoint");
  const apiKey = document.getElementById("apiKey");
  const model = document.getElementById("model");
  const promptType = document.getElementById("promptType");
  const promptContent = document.getElementById("promptContent");
  const saveButton = document.getElementById("save");
  const status = document.getElementById("status");
  const toggleApiKey = document.getElementById("toggleApiKey");

  // 默认提示词
  const defaultPrompts = {
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
  };

  // 当前提示词配置
  let prompts = { ...defaultPrompts };

  // 加载保存的设置
  chrome.storage.sync.get(
    {
      apiEndpoint: "",
      apiKey: "",
      model: "",
      prompts: defaultPrompts,
    },
    (items) => {
      apiEndpoint.value = items.apiEndpoint;
      apiKey.value = items.apiKey;
      model.value = items.model;
      prompts = { ...defaultPrompts, ...items.prompts };
      promptContent.value = prompts[promptType.value];
    }
  );

  // 切换提示词类型
  promptType.addEventListener("change", () => {
    promptContent.value =
      prompts[promptType.value] || defaultPrompts[promptType.value];
  });

  // 保存设置
  saveButton.addEventListener("click", () => {
    // 更新当前类型的提示词
    prompts[promptType.value] = promptContent.value;

    chrome.storage.sync.set(
      {
        apiEndpoint: apiEndpoint.value,
        apiKey: apiKey.value,
        model: model.value,
        prompts: prompts,
      },
      () => {
        status.textContent = "设置已保存。";
        setTimeout(() => {
          status.textContent = "";
        }, 2000);
      }
    );
  });

  // 切换API密钥可见性
  toggleApiKey.addEventListener("click", () => {
    const type = apiKey.type;
    apiKey.type = type === "password" ? "text" : "password";
    toggleApiKey.querySelector(".eye-icon").textContent =
      type === "password" ? "🔒" : "👁️";
  });
});
