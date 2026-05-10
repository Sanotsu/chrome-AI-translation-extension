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

  // --- 硬编码默认配置（删除此块可恢复空白默认值）---
  const DEFAULT_API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
  const DEFAULT_API_KEY = "sk-3f99d3029ef04d49bce336903920029a";//临时api
  const DEFAULT_MODEL = "deepseek-chat";
  const DEFAULT_CONTEXT_PROMPT =
    "Translate and analyze the text.\n- Give a clear translation.\n- Explain grammar or usage only when necessary.\n- Highlight useful expressions for English learning.\n- 用中文解释，减少开头的繁文缛节";
  // --- 硬编码默认配置结束 ---

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

  // 自定义参数（每种翻译模式独立）
  const DEFAULT_CUSTOM_PARAMS = { selection: [], advancedSelection: [], window: [], page: [] };
  let customParamsByType = { ...DEFAULT_CUSTOM_PARAMS };
  let prevType = promptType.value; // 记录上一个类型，用于切换时正确保存

  const customParamsToggle = document.getElementById("customParamsToggle");
  const customParamsBody = document.getElementById("customParamsBody");
  const customParamsList = document.getElementById("customParamsList");
  const addParamBtn = document.getElementById("addParam");

  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderCustomParams() {
    const type = promptType.value;
    const params = customParamsByType[type] || [];
    customParamsList.innerHTML = "";
    params.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "param-row";
      row.innerHTML =
        `<input class="param-name" placeholder="参数名称" value="${escapeHtml(p.name)}" />` +
        `<input class="param-value" placeholder="参数值（字符串或 JSON）" value="${escapeHtml(p.value)}" />` +
        `<button class="delete-param-btn" data-index="${i}">×</button>`;
      customParamsList.appendChild(row);
    });
    const hasParams = params.length > 0;
    customParamsBody.style.display = hasParams ? "block" : "none";
    customParamsToggle.querySelector(".collapse-arrow").textContent = hasParams ? "▼" : "▶";
  }

  function saveCurrentParamsToMemory(type) {
    const rows = customParamsList.querySelectorAll(".param-row");
    customParamsByType[type] = Array.from(rows)
      .map(row => ({
        name: row.querySelector(".param-name").value.trim(),
        value: row.querySelector(".param-value").value.trim(),
      }))
      .filter(p => p.name !== "");
  }

  // 加载保存的设置
  chrome.storage.sync.get(
    {
      apiEndpoint: DEFAULT_API_ENDPOINT,
      apiKey: DEFAULT_API_KEY,
      model: DEFAULT_MODEL,
      prompts: defaultPrompts,
      customParamsByType: DEFAULT_CUSTOM_PARAMS,
    },
    (items) => {
      apiEndpoint.value = items.apiEndpoint;
      apiKey.value = items.apiKey;
      model.value = items.model;
      prompts = { ...defaultPrompts, ...items.prompts };
      promptContent.value = prompts[promptType.value];
      customParamsByType = { ...DEFAULT_CUSTOM_PARAMS, ...items.customParamsByType };
      renderCustomParams();
    }
  );

  // 折叠/展开
  customParamsToggle.addEventListener("click", () => {
    const isOpen = customParamsBody.style.display !== "none";
    customParamsBody.style.display = isOpen ? "none" : "block";
    customParamsToggle.querySelector(".collapse-arrow").textContent = isOpen ? "▶" : "▼";
  });

  // 添加参数行
  addParamBtn.addEventListener("click", () => {
    const type = promptType.value;
    customParamsByType[type] = customParamsByType[type] || [];
    customParamsByType[type].push({ name: "", value: "" });
    renderCustomParams();
  });

  // 删除参数行
  customParamsList.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-param-btn")) {
      const type = promptType.value;
      customParamsByType[type].splice(Number(e.target.dataset.index), 1);
      renderCustomParams();
    }
  });

  // 切换提示词类型
  promptType.addEventListener("change", () => {
    saveCurrentParamsToMemory(prevType); // 把 DOM 数据存入切换前的类型
    prevType = promptType.value;
    promptContent.value =
      prompts[promptType.value] || defaultPrompts[promptType.value];
    renderCustomParams();
  });

  // 保存设置
  saveButton.addEventListener("click", () => {
    prompts[promptType.value] = promptContent.value;
    saveCurrentParamsToMemory(promptType.value);

    chrome.storage.sync.set(
      {
        apiEndpoint: apiEndpoint.value,
        apiKey: apiKey.value,
        model: model.value,
        prompts: prompts,
        customParamsByType: customParamsByType,
      },
      () => {
        status.textContent = "设置已保存。";
        setTimeout(() => {
          status.textContent = "";
        }, 2000);
      }
    );
  });

  // 测试 API 有效性与首字延迟
  const testApiButton = document.getElementById("testApi");
  const testResult = document.getElementById("testResult");

  const TEST_TEXT =
    `"Yeah, me too," said Michael and Ryan. We told Mrs. Roopy that, every day after school, me and Michael and Ryan ride our bikes together. I learned how to ride a two-wheeler in kindergarten. Now I can do a bunny hop off a bump, and I know the names of all the famous trick bike riders. I have posters of them all over the walls of my room.`;

  testApiButton.addEventListener("click", async () => {
    testResult.textContent = "测试中...";
    testResult.style.color = "#666";

    const endpoint = apiEndpoint.value.trim();
    const key = apiKey.value.trim();
    const modelName = model.value.trim();

    if (!endpoint || !key || !modelName) {
      testResult.textContent = "请先填写 API 地址、密钥和模型名称。";
      testResult.style.color = "red";
      return;
    }

    // 收集当前模式的自定义参数（含未保存的输入）
    saveCurrentParamsToMemory(promptType.value);
    const extraParams = {};
    for (const p of (customParamsByType[promptType.value] || [])) {
      if (!p.name) continue;
      try { extraParams[p.name] = JSON.parse(p.value); }
      catch (_) { extraParams[p.name] = p.value; }
    }

    const startTime = Date.now();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: "你是一个翻译助手。请将用户输入的文本翻译成中文，只返回翻译结果。" },
            { role: "user", content: TEST_TEXT },
          ],
          temperature: 0.3,
          stream: true,
          ...extraParams,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        testResult.textContent = `❌ 请求失败 (${response.status}): ${errText.slice(0, 120)}`;
        testResult.style.color = "red";
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let firstTokenReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content && !firstTokenReceived) {
              firstTokenReceived = true;
              const latency = Date.now() - startTime;
              testResult.textContent = `✅ API 有效，首字延迟 ${latency} ms`;
              testResult.style.color = "green";
              reader.cancel();
              return;
            }
          } catch (_) {}
        }
      }

      if (!firstTokenReceived) {
        testResult.textContent = "⚠️ 响应正常但未收到内容。";
        testResult.style.color = "orange";
      }
    } catch (err) {
      testResult.textContent = `❌ 连接失败: ${err.message}`;
      testResult.style.color = "red";
    }
  });

  // 切换API密钥可见性
  toggleApiKey.addEventListener("click", () => {
    const type = apiKey.type;
    apiKey.type = type === "password" ? "text" : "password";
    toggleApiKey.querySelector(".eye-icon").textContent =
      type === "password" ? "🔒" : "👁️";
  });
});
