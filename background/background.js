// 获取特定标签页的设置
const getTabSettings = async (tabId) => {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      {
        [`targetLang_${tabId}`]: 'zh'  // 获取特定标签页的目标语言
      },
      async (tabItems) => {
        // 获取全局API设置
        const globalSettings = await chrome.storage.sync.get({
          apiEndpoint: '',  // 移除默认值
          apiKey: '',
          model: ''
        });
        
        resolve({
          ...globalSettings,
          targetLang: tabItems[`targetLang_${tabId}`]
        });
      }
    );
  });
};

// 调用API进行翻译
const translateWithAPI = async (text, targetLang, apiKey, model, apiEndpoint) => {
  // 检查必要的API设置
  if (!apiEndpoint || !apiKey || !model) {
    throw new Error('请先在设置页面配置API信息');
  }

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: `你是一个翻译助手。请将用户输入的文本翻译成${targetLang}，只返回翻译结果，不需要解释。`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error('翻译请求失败');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
};

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    (async () => {
      try {
        let settings;
        if (request.isPopupWindow) {
          // 如果是独立窗口的请求，获取全局API设置
          settings = await chrome.storage.sync.get({
            apiEndpoint: '',
            apiKey: '',
            model: ''
          });
          settings.targetLang = request.targetLang;
        } else {
          // 否则使用标签页的设置
          settings = await getTabSettings(request.tabId);
        }

        const translation = await translateWithAPI(
          request.text,
          settings.targetLang,
          settings.apiKey,
          settings.model,
          settings.apiEndpoint
        );
        sendResponse({ translation });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  } else if (request.action === 'getCurrentTabId') {
    sendResponse({ tabId: sender.tab?.id });
    return false;
  }
});

// 存储面板状态（使用对象而不是 Map）
let panelStates = {};

// 添加新的消息处理
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  
  try {
    // 检查当前标签页是否已有面板
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: togglePanel,
      args: [tabId, !!panelStates[tabId]] // 转换为布尔值
    });

    // 更新面板状态
    panelStates[tabId] = result.result;
  } catch (error) {
    console.error('面板切换失败:', error);
  }
});

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  delete panelStates[tabId];
});

// 面板切换函数
function togglePanel(tabId, isVisible) {
  let panel = document.querySelector(`.translator-panel[data-tab-id="${tabId}"]`);
  
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    return panel.style.display === 'block';
  } else {
    const iframe = document.createElement('iframe');
    iframe.className = 'translator-panel';
    iframe.setAttribute('data-tab-id', tabId);
    iframe.src = chrome.runtime.getURL('content/panel.html');
    iframe.style.display = 'block';
    document.body.appendChild(iframe);
    return true;
  }
}

let translateWindow = null;

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translateSelection',
    title: 'AI翻译助手 - 翻译选中文本',
    contexts: ['selection']
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'translateSelection') {
    const selectedText = info.selectionText;
    
    if (!translateWindow) {
      // 创建新窗口
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('translate/translate.html'),
        type: 'popup',
        width: 800,
        height: 600
      });
      translateWindow = window.id;
      
      // 等待窗口加载完成
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'updateText',
          text: selectedText
        });
      }, 1000);
    } else {
      // 更新已存在的窗口
      chrome.windows.update(translateWindow, { focused: true });
      chrome.runtime.sendMessage({
        action: 'updateText',
        text: selectedText
      });
    }
  }
});

// 监听窗口关闭
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === translateWindow) {
    translateWindow = null;
  }
}); 