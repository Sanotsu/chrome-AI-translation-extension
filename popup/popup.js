document.addEventListener('DOMContentLoaded', () => {
  // 打开设置页面
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 翻译整个页面
  document.getElementById('translatePage').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'translatePage'});
    });
  });
}); 