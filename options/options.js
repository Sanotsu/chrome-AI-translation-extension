document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的设置
  chrome.storage.sync.get(
    {
      apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
      apiKey: 'sk-giizgegutggzuhelpcwgqsbfpvmlpjfdxszikbmdzwtpuovu',
      model: 'Qwen/Qwen2.5-7B-Instruct'
    },
    (items) => {
      document.getElementById('apiEndpoint').value = items.apiEndpoint;
      document.getElementById('apiKey').value = items.apiKey;
      document.getElementById('model').value = items.model;
    }
  );

  // 保存设置
  document.getElementById('save').addEventListener('click', () => {
    const apiEndpoint = document.getElementById('apiEndpoint').value;
    const apiKey = document.getElementById('apiKey').value;
    const model = document.getElementById('model').value;

    chrome.storage.sync.set(
      {
        apiEndpoint,
        apiKey,
        model
      },
      () => {
        const status = document.getElementById('status');
        status.textContent = '设置已保存';
        status.style.color = 'green';
        setTimeout(() => {
          status.textContent = '';
        }, 2000);
      }
    );
  });
}); 