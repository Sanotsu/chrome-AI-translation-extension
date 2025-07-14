// *********************************/
// 整页翻译功能
// 在点击了插件图标后，显示出的流式对比/替换翻译按钮，该按钮对当前页面生效
// 对当前执行页面进行整页的翻译，结果会缓存一个小时，可以手动清除缓存重新翻译
// *********************************/

let isTranslated = false;

// 流式翻译页面（新方法）
const streamTranslatePage = async (type) => {
  try {
    // 先恢复原始内容
    restoreOriginal();

    // 显示停止按钮
    chrome.runtime.sendMessage({ action: "showStopButton" });

    // 重置进度
    updateProgress(0);

    // 获取目标语言
    const targetLang = await getCurrentTargetLang();

    // 获取可见文本节点
    const paragraphs = domProcessor.extractVisibleTextNodes();

    // 准备翻译
    const preparedParagraphs =
      domProcessor.prepareParagraphsForTranslation(paragraphs);

    // 执行流式翻译
    const success = await translationService.streamingPageTranslate(
      preparedParagraphs,
      type,
      targetLang
    );

    // 更新进度为100%
    updateProgress(100);

    // 翻译完成，隐藏停止按钮并通知完成
    chrome.runtime.sendMessage({
      action: "hideStopButton",
      completed: true,
    });

    return success;
  } catch (error) {
    console.error("流式整页翻译失败:", error);

    // 隐藏停止按钮
    chrome.runtime.sendMessage({
      action: "hideStopButton",
      completed: false,
    });

    // 更新进度
    updateProgress(0);

    throw error;
  }
};

// 更新进度
const updateProgress = (progress) => {
  // 确保进度不超过100%
  const safeProgress = Math.min(progress, 100);

  console.log(`发送进度更新: ${safeProgress}%`);

  // 发送进度更新消息到面板
  chrome.runtime.sendMessage({
    action: "updateProgressBar",
    progress: safeProgress,
  });

  // 不需要在这里发送翻译完成消息，已在translationService.updateProgress中处理
  // 避免重复发送完成消息
};

// 停止翻译
const stopTranslation = () => {
  translationService.stopAllTranslations();
};

// 恢复原始内容
const restoreOriginal = () => {
  // 调用翻译服务的恢复方法
  domProcessor.restoreOriginalWebPage();

  // 重置状态
  isTranslated = false;

  // 发送恢复完成消息
  chrome.runtime.sendMessage({
    action: "restorationComplete",
  });

  // 重置进度条
  updateProgress(0);
};

// 检查缓存状态
const checkCache = async () => {
  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();

  const compareCache = await CacheManager.hasCache(url, targetLang, "compare");
  const replaceCache = await CacheManager.hasCache(url, targetLang, "replace");

  return { compareCache, replaceCache };
};

// 清除缓存函数
const clearCache = async (type) => {
  // 检查是否正在翻译
  if (translationService.activeTasks.size > 0) {
    return { success: false, message: "翻译进行中，无法清除缓存" };
  }

  const url = window.location.href;
  const targetLang = await getCurrentTargetLang();
  return await CacheManager.clearTypeCache(url, targetLang, type);
};
