// *********************************/
// 单词本JavaScript
// 单词本相关操作
// *********************************/

// 单词本页面
document.addEventListener("DOMContentLoaded", () => {
  // DOM元素
  const vocabularyList = document.getElementById("vocabularyList");
  const emptyMessage = document.getElementById("emptyMessage");
  const wordCount = document.getElementById("wordCount");
  const searchInput = document.getElementById("searchInput");
  const clearAllBtn = document.getElementById("clearAll");

  // 词汇列表数据
  let vocabularyData = [];

  // 加载词汇数据
  const loadVocabulary = async () => {
    try {
      const result = await chrome.storage.local.get({ vocabulary: [] });
      if (Array.isArray(result.vocabulary)) {
        vocabularyData = result.vocabulary;
        renderVocabularyList(vocabularyData);
        updateWordCount();
      }
    } catch (error) {
      console.error("加载单词本失败:", error);
      showError("加载单词本失败，请刷新页面重试");
    }
  };

  // 渲染词汇列表
  const renderVocabularyList = (words) => {
    // 清空列表
    vocabularyList.innerHTML = "";

    // 显示或隐藏空消息
    if (words.length === 0) {
      emptyMessage.style.display = "block";
      return;
    } else {
      emptyMessage.style.display = "none";
    }

    // 创建单词卡片
    words.forEach((word) => {
      const wordCard = document.createElement("div");
      wordCard.className = "word-card";
      wordCard.dataset.word = word;

      // 构建单词卡片内容
      wordCard.innerHTML = `
        <div class="word-header">
          <div class="word-title">
            <span class="word-text">${word}</span>
            <span class="word-phonetic" id="phonetic-${word}"></span>
          </div>
          <div class="word-actions">
            <button class="delete-word" data-word="${word}" title="删除单词">
              ✕
            </button>
          </div>
        </div>
        <div class="word-info" id="info-${word}">
          <div class="word-loading">加载单词信息中...</div>
        </div>
      `;

      vocabularyList.appendChild(wordCard);

      // 加载单词详细信息
      loadWordDetails(word);
    });

    // 绑定删除按钮事件
    document.querySelectorAll(".delete-word").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const word = e.currentTarget.dataset.word;
        removeWordFromVocabulary(word);
      });
    });
  };

  // 加载单词详细信息
  const loadWordDetails = async (word) => {
    try {
      // 首先尝试从存储中获取详细信息
      const wordKey = `word_details_${word}`;
      const result = await chrome.storage.local.get({ [wordKey]: null });

      const infoContainer = document.getElementById(`info-${word}`);
      const phoneticElement = document.getElementById(`phonetic-${word}`);

      if (result[wordKey]) {
        // 如果有缓存的详细信息，使用缓存数据
        const details = result[wordKey];
        renderWordDetails(infoContainer, phoneticElement, details);
      } else {
        // 否则显示基本信息
        infoContainer.innerHTML = `
          <div class="word-definition">暂无详细释义</div>
        `;
      }
    } catch (error) {
      console.error(`加载单词"${word}"详细信息失败:`, error);
      const infoContainer = document.getElementById(`info-${word}`);
      infoContainer.innerHTML = `<div class="word-error">加载单词信息失败</div>`;
    }
  };

  // 渲染单词详细信息
  const renderWordDetails = (container, phoneticEl, details) => {
    if (details.phonetic) {
      phoneticEl.textContent = details.phonetic;
    }

    let html = "";

    if (details.part_of_speech) {
      html += `<span class="word-pos">${details.part_of_speech}</span>`;
    }

    if (details.definition) {
      html += `<div class="word-definition">${details.definition}</div>`;
    }

    container.innerHTML =
      html || '<div class="word-definition">暂无详细释义</div>';
  };

  // 从单词本中移除单词
  const removeWordFromVocabulary = async (word) => {
    try {
      // 从数据中移除
      vocabularyData = vocabularyData.filter((w) => w !== word);

      // 更新存储
      await chrome.storage.local.set({ vocabulary: vocabularyData });

      // 同时删除单词详细信息缓存
      const wordKey = `word_details_${word}`;
      await chrome.storage.local.remove(wordKey);
      console.log(`已从缓存中移除单词 "${word}" 的详细信息`);

      // 重新渲染列表
      renderVocabularyList(vocabularyData);
      updateWordCount();

      showToast(`单词 "${word}" 已从单词本中移除`);
    } catch (error) {
      console.error(`删除单词"${word}"失败:`, error);
      showError("删除单词失败，请重试");
    }
  };

  // 更新单词计数
  const updateWordCount = () => {
    wordCount.textContent = vocabularyData.length;
  };

  // 清空单词本
  const clearVocabulary = async () => {
    if (vocabularyData.length === 0) {
      showToast("单词本已经是空的");
      return;
    }

    if (confirm("确定要清空单词本吗？此操作不可撤销。")) {
      try {
        // 获取所有单词的详细信息键
        const wordDetailsKeys = vocabularyData.map(
          (word) => `word_details_${word}`
        );

        // 清空数据
        vocabularyData = [];

        // 更新存储 - 清除单词列表
        await chrome.storage.local.set({ vocabulary: [] });

        // 清除所有单词详细信息
        if (wordDetailsKeys.length > 0) {
          await chrome.storage.local.remove(wordDetailsKeys);
          console.log(`已清除 ${wordDetailsKeys.length} 个单词的详细信息缓存`);
        }

        // 重新渲染列表
        renderVocabularyList(vocabularyData);
        updateWordCount();

        showToast("单词本已清空");
      } catch (error) {
        console.error("清空单词本失败:", error);
        showError("清空单词本失败，请重试");
      }
    }
  };

  // 搜索单词
  const searchVocabulary = (query) => {
    if (!query) {
      renderVocabularyList(vocabularyData);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = vocabularyData.filter((word) =>
      word.toLowerCase().includes(lowerQuery)
    );

    renderVocabularyList(filtered);
  };

  // 显示错误消息
  const showError = (message) => {
    const errorElement = document.createElement("div");
    errorElement.className = "error-message";
    errorElement.textContent = message;

    vocabularyList.innerHTML = "";
    vocabularyList.appendChild(errorElement);
  };

  // 显示toast消息
  const showToast = (message) => {
    // 创建toast元素
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    // 添加到页面
    document.body.appendChild(toast);

    // 添加显示类
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    // 3秒后移除
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  };

  // 绑定事件
  clearAllBtn.addEventListener("click", clearVocabulary);

  searchInput.addEventListener("input", (e) => {
    searchVocabulary(e.target.value.trim());
  });

  // 初始加载
  loadVocabulary();

  // 添加CSS
  const style = document.createElement("style");
  style.textContent = `
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background-color: #333;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 10000;
      opacity: 0;
      transition: transform 0.3s, opacity 0.3s;
    }
    
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    
    .error-message {
      background-color: #ffebee;
      color: #d32f2f;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
      text-align: center;
    }
    
    .word-loading, .word-error {
      color: #888;
      font-style: italic;
      font-size: 14px;
    }
    
    .word-error {
      color: #d32f2f;
    }
  `;
  document.head.appendChild(style);
});
