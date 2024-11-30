import { LANGUAGES, getBrowserLanguage, formatLanguageDisplay, isValidLanguageCode } from '../content/languages.js';

let currentText = '';

// 历史记录管理
class TranslationHistory {
  constructor() {
    this.maxItems = 100; // 最大保存记录数
  }

  async getAll() {
    const result = await chrome.storage.local.get('translationHistory');
    return result.translationHistory || [];
  }

  async add(item) {
    const history = await this.getAll();
    history.unshift({
      ...item,
      id: Date.now(),
      time: new Date().toLocaleString()
    });

    // 限制最大记录数
    if (history.length > this.maxItems) {
      history.pop();
    }

    await chrome.storage.local.set({ translationHistory: history });
    return history;
  }

  async remove(id) {
    const history = await this.getAll();
    const newHistory = history.filter(item => item.id !== id);
    await chrome.storage.local.set({ translationHistory: newHistory });
    return newHistory;
  }

  async clear() {
    await chrome.storage.local.set({ translationHistory: [] });
    return [];
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const history = new TranslationHistory();
  const sourceContent = document.getElementById('sourceContent');
  const translatedContent = document.getElementById('translatedContent');
  const targetLangSelect = document.getElementById('targetLang');
  const translateBtn = document.getElementById('translateBtn');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const loading = translatedContent.querySelector('.loading');
  const result = translatedContent.querySelector('.result');

  // 填充语言选项
  const fillLanguageOptions = () => {
    // 常用语言组
    const commonGroup = document.createElement('optgroup');
    commonGroup.label = '常用语言';
    Object.entries(LANGUAGES.common).forEach(([code, lang]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      commonGroup.appendChild(option);
    });
    targetLangSelect.appendChild(commonGroup);

    // 其他语言组
    const othersGroup = document.createElement('optgroup');
    othersGroup.label = '其他语言';
    Object.entries(LANGUAGES.others).forEach(([code, lang]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${lang.name} (${lang.native})`;
      othersGroup.appendChild(option);
    });
    targetLangSelect.appendChild(othersGroup);
  };

  fillLanguageOptions();

  // 获取存储的目标语言
  chrome.storage.local.get({ 'translateWindow_targetLang': 'zh-CN' }, (items) => {
    targetLangSelect.value = items.translateWindow_targetLang;
  });

  // 监听语��选择变化
  targetLangSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ 'translateWindow_targetLang': e.target.value });
  });

  // 监听文本输入
  sourceContent.addEventListener('input', () => {
    currentText = sourceContent.value;
  });

  // 渲染历史记录
  const renderHistory = async () => {
    const records = await history.getAll();
    historyList.innerHTML = records.map(record => `
      <div class="history-item" data-id="${record.id}">
        <div class="time">${record.time}</div>
        <div class="source">${record.sourceText}</div>
        <div class="target-lang">翻译为：${formatLanguageDisplay(record.targetLang)}</div>
        <div class="translation">${record.translation}</div>
        <button class="delete-btn">删除</button>
      </div>
    `).join('');

    // 添加点击事件
    historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
          e.stopPropagation();
          const id = parseInt(item.dataset.id);
          history.remove(id).then(renderHistory);
        } else {
          const id = parseInt(item.dataset.id);
          const record = records.find(r => r.id === id);
          if (record) {
            sourceContent.value = record.sourceText;
            targetLangSelect.value = record.targetLang;
            result.textContent = record.translation;
            currentText = record.sourceText;
          }
        }
      });
    });
  };

  // 清除所有历史记录
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('确定要清除所有历史记录吗？')) {
      await history.clear();
      renderHistory();
    }
  });

  // 修改翻译按钮点击事件
  translateBtn.addEventListener('click', async () => {
    currentText = sourceContent.value.trim();
    if (!currentText) {
      result.textContent = '请输入要翻译的文本';
      return;
    }
    
    loading.style.display = 'block';
    result.textContent = '';

    try {
      const currentTargetLang = targetLangSelect.value;
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: currentText,
        targetLang: currentTargetLang,
        isPopupWindow: true
      });
      
      loading.style.display = 'none';
      const translation = response.translation || '翻译失败';
      result.textContent = translation;

      // 添加到历史记录
      await history.add({
        sourceText: currentText,
        targetLang: currentTargetLang,
        translation: translation
      });
      renderHistory();
    } catch (error) {
      loading.style.display = 'none';
      result.textContent = '翻译失败，请重试';
    }
  });

  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateText') {
      currentText = request.text;
      sourceContent.value = currentText;
      translateBtn.click(); // 自动开始翻译
    }
  });

  // 初始加载历史记录
  renderHistory();

  // 支持快捷键翻译
  sourceContent.addEventListener('keydown', (e) => {
    // Ctrl+Enter 或 Command+Enter 触发翻译
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      translateBtn.click();
    }
  });
}); 