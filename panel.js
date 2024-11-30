document.addEventListener('DOMContentLoaded', async () => {
  // ... 其他初始化代码 ...
  
  // 获取当前标签页ID
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs[0].id;

  // 为面板添加唯一标识
  document.body.setAttribute('data-tab-id', currentTabId);
  
  // 从存储中获取特定标签页的目标语言设置
  chrome.storage.sync.get({ [`targetLang_${currentTabId}`]: 'zh' }, (items) => {
    targetLangSelect.value = items[`targetLang_${currentTabId}`];
    targetLang = items[`targetLang_${currentTabId}`];
  });

  // 监听语言选择变化
  targetLangSelect.addEventListener('change', (e) => {
    targetLang = e.target.value;
    // 保存特定标签页的目标语言设置
    chrome.storage.sync.set({ [`targetLang_${currentTabId}`]: targetLang });
  });

  // 通知content script面板已创建
  chrome.tabs.sendMessage(currentTabId, { 
    action: 'panelCreated',
    tabId: currentTabId
  });
}); 