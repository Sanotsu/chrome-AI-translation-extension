// 检测文本语言
const detectLanguage = async (text) => {
  try {
    const hasChineseChars = /[\u4e00-\u9fa5]/.test(text);
    const hasJapaneseChars = /[\u3040-\u30ff]/.test(text);
    const hasKoreanChars = /[\uac00-\ud7af]/.test(text);

    if (hasChineseChars) return "zh";
    if (hasJapaneseChars) return "ja";
    if (hasKoreanChars) return "ko";
    return "en";
  } catch (error) {
    console.error("语言检测失败:", error);
    return "unknown";
  }
};

// 获取当前标签页的目标语言
const getCurrentTargetLang = async () => {
  const tabId = await getCurrentTabId();
  const result = await chrome.storage.local.get({
    [`targetLang_${tabId}`]: "zh",
  });
  return result[`targetLang_${tabId}`];
};
