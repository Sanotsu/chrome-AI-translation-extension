// 高级翻译窗口JavaScript
document.addEventListener("DOMContentLoaded", () => {
  // DOM元素
  const originalText = document.getElementById("originalText");
  const translatedText = document.getElementById("translatedText");
  const wordsSection = document.getElementById("wordsSection");
  const wordsList = document.getElementById("wordsList");
  const loadingSection = document.getElementById("loadingSection");
  const errorSection = document.getElementById("errorSection");
  const errorMessage = document.getElementById("errorMessage");
  const clearContentBtn = document.getElementById("clearContent");
  const openVocabularyBtn = document.getElementById("openVocabulary");

  // 词汇列表数据
  let vocabulary = new Set();

  // 加载词汇数据
  const loadVocabulary = async () => {
    try {
      const result = await chrome.storage.local.get({ vocabulary: [] });
      if (Array.isArray(result.vocabulary)) {
        vocabulary = new Set(result.vocabulary);
        console.log(`单词本加载完成，共 ${vocabulary.size} 个单词`);
      }
    } catch (error) {
      console.error("加载单词本失败:", error);
    }
  };

  // 保存单词本
  const saveVocabulary = async () => {
    await chrome.storage.local.set({ vocabulary: Array.from(vocabulary) });
    console.log(`单词本已保存，共 ${vocabulary.size} 个单词`);
  };

  // 添加单词到单词本
  const addToVocabulary = async (word, definition, phonetic, partOfSpeech) => {
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
  };

  // 显示加载状态
  const showLoading = () => {
    loadingSection.style.display = "flex";
    errorSection.style.display = "none";
    wordsSection.style.display = "none";
  };

  // 隐藏加载状态
  const hideLoading = () => {
    loadingSection.style.display = "none";
  };

  // 显示错误信息
  const showError = (message) => {
    errorMessage.textContent = message;
    errorSection.style.display = "block";
    loadingSection.style.display = "none";
    wordsSection.style.display = "none";
  };

  // 隐藏错误信息
  const hideError = () => {
    errorSection.style.display = "none";
  };

  // 渲染翻译结果
  const renderTranslation = (originalTextContent, translationResult) => {
    // 显示原文
    originalText.textContent = originalTextContent || "";

    // 显示翻译结果
    if (translationResult && translationResult.translation) {
      translatedText.textContent = translationResult.translation;
    } else {
      translatedText.textContent = "翻译失败";
    }

    // 渲染单词列表
    if (
      translationResult &&
      translationResult.complex_words &&
      translationResult.complex_words.length > 0
    ) {
      renderWordsList(translationResult.complex_words);
      wordsSection.style.display = "block";
    } else {
      wordsSection.style.display = "none";
    }

    hideLoading();
    hideError();
  };

  // 渲染单词列表
  const renderWordsList = (words) => {
    wordsList.innerHTML = "";

    words.forEach((word) => {
      const wordItem = document.createElement("div");
      wordItem.className = "word-item";

      // 单词和音标
      const wordHeader = document.createElement("div");
      wordHeader.className = "word-header";

      const wordText = document.createElement("span");
      wordText.className = "word-text";
      wordText.textContent = word.word || "";
      wordHeader.appendChild(wordText);

      if (word.phonetic) {
        const phonetic = document.createElement("span");
        phonetic.className = "word-phonetic";
        phonetic.textContent = word.phonetic || "";
        wordHeader.appendChild(phonetic);
      }

      // 添加到单词本按钮
      const addButton = document.createElement("button");
      addButton.className = "add-to-vocabulary";
      addButton.textContent = "加入单词本";
      addButton.title = "将单词加入生词本";

      // 检查单词是否已在单词本中
      if (vocabulary.has(word.word)) {
        addButton.disabled = true;
        addButton.textContent = "已在单词本";
        addButton.className += " in-vocabulary";
      }

      addButton.addEventListener("click", async function () {
        const added = await addToVocabulary(
          word.word,
          word.definition,
          word.phonetic,
          word.part_of_speech
        );

        if (added) {
          this.disabled = true;
          this.textContent = "已加入单词本";
          this.className += " in-vocabulary";
        }
      });

      wordHeader.appendChild(addButton);
      wordItem.appendChild(wordHeader);

      // 词性和定义
      if (word.part_of_speech || word.definition) {
        const wordDetails = document.createElement("div");
        wordDetails.className = "word-details";

        if (word.part_of_speech) {
          const partOfSpeech = document.createElement("span");
          partOfSpeech.className = "word-pos";
          partOfSpeech.textContent = word.part_of_speech;
          wordDetails.appendChild(partOfSpeech);
        }

        if (word.definition) {
          const definition = document.createElement("span");
          definition.className = "word-definition";
          definition.textContent = word.definition;
          wordDetails.appendChild(definition);
        }

        wordItem.appendChild(wordDetails);
      }

      wordsList.appendChild(wordItem);
    });
  };

  // 清空内容
  const clearContent = () => {
    originalText.textContent = "";
    translatedText.textContent = "";
    wordsSection.style.display = "none";
    errorSection.style.display = "none";
    loadingSection.style.display = "none";
  };

  // 打开单词本
  const openVocabulary = () => {
    chrome.runtime.sendMessage({ action: "openVocabularyPage" });
  };

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateAdvancedTranslation") {
      console.log("收到高级翻译更新:", request);

      if (request.isLoading) {
        // 显示加载状态
        showLoading();
        // 显示原文
        originalText.textContent = request.originalText || "";
        // 清空翻译结果
        translatedText.textContent = "";
        // 隐藏单词部分
        wordsSection.style.display = "none";
        // 隐藏错误信息
        hideError();
      } else if (request.errorMessage) {
        showError(request.errorMessage);
      } else {
        // 显示翻译结果
        renderTranslation(request.originalText, request.translationResult);
      }

      sendResponse({});
      return true;
    }
  });

  // 绑定事件
  clearContentBtn.addEventListener("click", clearContent);
  openVocabularyBtn.addEventListener("click", openVocabulary);

  // 初始加载
  loadVocabulary();

  // 显示初始状态
  clearContent();
});
