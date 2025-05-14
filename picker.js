// Google Drive Picker 相关配置与功能
let CLIENT_ID = null;
let API_KEY = null;
let APP_ID = null;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// 从后端获取配置
async function loadGoogleConfig() {
    try {
        const response = await fetch('https://get-api-config-367536793395.us-central1.run.app');
        const config = await response.json();
        
        CLIENT_ID = config.client_id;
        API_KEY = config.api_key;
        APP_ID = config.app_id;
        
        // 初始化 Google API
        if (typeof gapiLoaded === 'function') {
            gapiLoaded();
        }
        if (typeof gisLoaded === 'function') {
            gisLoaded();
        }
    } catch (error) {
        console.error('Failed to load Google configuration:', error);
        if (typeof showDriveError === 'function') {
            showDriveError('Unable to load Google Drive configuration, please try again later');
        }
    }
}

// 在文档加载完成后获取配置
document.addEventListener('DOMContentLoaded', loadGoogleConfig);

// 全局变量
let tokenClient;
let accessToken = null;
let pickerInited = false;
let gisInited = false;
let gapiInited = false;
let selectedFiles = [];

// GAPI 加载完成的回调
function gapiLoaded() {
  gapi.load('client:picker', initializePicker);
}

// 初始化 Picker
async function initializePicker() {
  try {
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    pickerInited = true;
    gapiInited = true;
    console.log("GAPI and Picker initialized successfully");
    if (typeof maybeEnableButtons === 'function') {
      maybeEnableButtons();
    }
  } catch (error) {
    console.error("Error initializing GAPI:", error);
    if (typeof showDriveError === 'function') {
      showDriveError("Error initializing Google API: " + (error.message || "Unknown error"));
    }
  }
}

// GIS 加载完成的回调
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // 将在运行时定义
      error_callback: (err) => {
        console.error("Token client error:", err);
        if (typeof showDriveError === 'function') {
          showDriveError(`Authentication error: ${err.type} - ${err.message || "Unknown error"}`);
        }
      }
    });
    gisInited = true;
    console.log("GIS initialized successfully");
    if (typeof maybeEnableButtons === 'function') {
      maybeEnableButtons();
    }
}

// 检查API初始化状态并启用按钮
function maybeEnableButtons() {
  if (gapiInited && gisInited && pickerInited) {
    console.log("All Google APIs are initialized");
    const googleDriveButton = document.getElementById('google-drive-button');
    if (googleDriveButton) {
      googleDriveButton.style.opacity = '1';
      googleDriveButton.style.pointerEvents = 'auto';
    }
    
    const statusDiv = document.getElementById('google-drive-status');
    if (statusDiv && statusDiv.textContent && statusDiv.textContent.includes('Initializing')) {
      statusDiv.textContent = '';
      statusDiv.className = 'drive-status';
    }
  }
}

// 处理 Drive 认证点击
function handleDriveAuthClick() {
  console.log('Drive auth button clicked');
  
  if (!gapiInited || !gisInited || !pickerInited) {
    console.log('APIs not initialized yet, reinitializing...');
    showDriveStatus('Initializing Google API, please wait...');
    return;
  }
  
  showDriveStatus('Requesting authorization...');
  
  tokenClient.callback = async (response) => {
    if (response.error !== undefined) {
      console.error('Authorization error:', response.error);
      showDriveError(`Authorization failed: ${response.error}`);
      return;
    }
    
    accessToken = response.access_token;
    console.log('Authorization successful');
    showDriveSuccess('Successfully authorized! Please select the specific files or folders you want');
    
    // 创建并显示Google Picker
    await createPicker();
  };
  
  if (accessToken === null) {
    // 需要授权，请求同意
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // 已有token，可以直接打开选择器
    tokenClient.requestAccessToken({prompt: ''});
  }
}

// 创建Google Picker
function createPicker() {
  if (!pickerInited || !gapiInited) {
    showDriveError('Google Picker not initialized, please refresh the page and try again');
    return;
  }
  
  if (!accessToken) {
    showDriveError('Not authorized to access. Please click the "Connect Google Drive" button to try again');
    return;
  }
  
//   showDriveStatus('Opening file picker...');
  
  try {
    // 使用 DocsView 允许用户看到文件和文件夹，并导航
    const docsView = new google.picker.DocsView() // 默认为 ViewId.DOCS
      .setIncludeFolders(true) // 显示文件夹以便导航
      // .setSelectFolderEnabled(false) // 不需要显式选择文件夹本身
      .setMimeTypes("application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document") // 可选：限制可选的文件类型
      .setMode(google.picker.DocsViewMode.LIST); // 或 GRID

    // 更新 Picker 标题，指导用户操作
    const picker = new google.picker.PickerBuilder()
      .setTitle('Please navigate to the folder and select the files to authorize') // <--- Modified title
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      // .addView(folderView) // <--- 移除旧的 folderView
      .addView(docsView)   // <--- 添加新的 docsView
      .setCallback(pickerCallback)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED) // 允许多选文件
      // 可选：确保导航栏可见
      .enableFeature(google.picker.Feature.NAV_HIDDEN, false)
      .build();

    picker.setVisible(true);
  } catch (error) {
    console.error("Error creating Picker:", error);
    showDriveError(`Error creating file picker: ${error.message || "Unknown error"}`);
  }
}

// Google Picker 回调
async function pickerCallback(data) {
  if (data.action === google.picker.Action.PICKED) {
    const documents = data[google.picker.Response.DOCUMENTS];

    if (!documents || documents.length === 0) {
      return;
    }

    // 提取所有选定文件的 ID 和名称
    const selectedFiles = documents.map(doc => ({
        id: doc[google.picker.Document.ID],
        name: doc[google.picker.Document.NAME]
    }));
    const fileIds = selectedFiles.map(f => f.id);
    const fileNames = selectedFiles.map(f => f.name).join(', '); // 用于显示

    // 确保我们有 access token
    if (!accessToken) {
        if (typeof addSystemMessage === 'function') {
            addSystemMessage('授权凭证丢失，请重新点击"Connect Google Drive"按钮。');
        }
        return;
    }

    // 获取 User ID
    const userId = getUserId();
    if (!userId) {
        if (typeof addSystemMessage === 'function') {
            addSystemMessage('无法获取用户ID，请确保您已登录。');
        }
        return;
    }

    // 显示上传进度条（与普通文件上传相同）
    const uploadProgress = document.querySelector('.upload-progress');
    const progressBarFill = document.querySelector('.progress-bar-fill');
    const progressText = document.querySelector('.progress-text');
    
    uploadProgress.classList.add('active');
    progressBarFill.style.width = '0%';
    progressText.textContent = '准备上传...';
    
    // 模拟上传进度
    let progress = 0;
    let lastIncrease = 0;
    
    const progressInterval = setInterval(() => {
        // 生成随机增长量(0.5-2之间的随机数)
        const mintime = 1/selectedFiles.length;
        const randomIncrease = Math.random() * 1.5 + mintime;
        
        // 根据当前进度调整增长速度
        let adjustedIncrease = randomIncrease;
        if (progress < 40) {
            // 开始阶段快速增长
            adjustedIncrease *= 1;
        } else if (progress > 70) {
            // 接近完成时增长变慢
            adjustedIncrease *= 0.5;
        }
        
        // 确保进度不会超过90%
        progress = Math.min(99, progress + adjustedIncrease);
        
        // 更新显示的进度
        const displayProgress = Math.floor(progress);
        progressBarFill.style.width = `${displayProgress}%`;
        
        // 根据进度阶段显示不同的消息
        progressText.textContent = `processing the files... ${displayProgress}%`;
        
        // 记录本次增长
        lastIncrease = adjustedIncrease;
    }, Math.random() * 300 + 200); // 随机间隔200-500ms

    // 调用后端 API
    try {
        const response = await fetch('https://rag-files-upload-367536793395.us-central1.run.app/api/process-google-drive-files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                file_ids: fileIds,
                access_token: accessToken
            })
        });

        const result = await response.json();
        
        // 清除进度条动画
        clearInterval(progressInterval);
        progressBarFill.style.width = '100%';
        progressText.textContent = '上传完成！';

        if (response.ok) {
            if (result.status === 'success') {
                if (typeof addSystemMessage === 'function') {
                    addSystemMessage(`成功处理了 ${result.files_processed?.length || 0} 个Google Drive文件`);
                }
                // 刷新文件列表
                if (typeof fetchFileList === 'function') {
                    fetchFileList();
                }
            } else if (result.status === 'warning' || result.status === 'partial_success' || result.status === 'partial_failure') {
                if (typeof addSystemMessage === 'function') {
                    addSystemMessage(`部分文件处理成功：${result.files_processed?.length || 0} 个文件已处理，${result.files_failed_processing?.length || 0} 个文件失败`);
                }
                // 刷新文件列表
                if (typeof fetchFileList === 'function') {
                    fetchFileList();
                }
            } else {
                if (typeof addSystemMessage === 'function') {
                    addSystemMessage(`文件处理时发生未知问题：${result.message || '未知错误'}`);
                }
            }
        } else {
            const errorMsg = result.error || `服务器错误 (状态码: ${response.status})`;
            if (typeof addSystemMessage === 'function') {
                addSystemMessage(`处理Google Drive文件失败: ${errorMsg}`);
            }
        }
        
        // 延迟隐藏进度条
        setTimeout(() => {
            uploadProgress.classList.remove('active');
            progressBarFill.style.width = '0%';
            progressText.textContent = '上传中...';
        }, 1000);
    } catch (error) {
        console.error('调用后端API时出错:', error);
        clearInterval(progressInterval);
        
        if (typeof addSystemMessage === 'function') {
            addSystemMessage(`调用后端API处理Google Drive文件时发生错误: ${error.message}`);
        }
        
        // 隐藏进度条
        uploadProgress.classList.remove('active');
        progressBarFill.style.width = '0%';
        progressText.textContent = '上传中...';
    }
  } else if (data.action === google.picker.Action.CANCEL) {
    // 用户取消选择时不显示任何内容
  }
}

const getUserId = () => {
  // 如果在测试模式下，返回测试ID
  if (window.testmode) {
    return window.testid;
  }
  
  // 直接使用全局变量中的用户ID
  if (window.currentUserId) {
    return window.currentUserId;
  }
  
  // 如果全局变量中没有用户ID，尝试从其他来源获取
  if (window.Shopify && window.Shopify.userToken) {
    return window.Shopify.userToken;
  }
  
  if (typeof window.customerId !== 'undefined' && window.customerId) {
    return window.customerId;
  }
  
  try {
    if (ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.page && ShopifyAnalytics.meta.page.customerId) {
      return ShopifyAnalytics.meta.page.customerId;
    }
  } catch (e) {}
  
  try {
    if (ShopifyAnalytics && ShopifyAnalytics.lib && ShopifyAnalytics.lib.user()) {
      return ShopifyAnalytics.lib.user().id();
    }
  } catch (e) {}
  
  try {
    if (ShopifyAnalytics && ShopifyAnalytics.lib && ShopifyAnalytics.lib.user() && ShopifyAnalytics.lib.user().traits) {
      return ShopifyAnalytics.lib.user().traits().uniqToken;
    }
  } catch (e) {}
  
  if (typeof __st !== 'undefined' && __st.cid) {
    return __st.cid;
  }
  
  return null;
}

// 状态显示函数
function showDriveStatus(message) {
  const statusDiv = document.getElementById('google-drive-status');
  if (statusDiv) {
    statusDiv.className = 'drive-status';
    statusDiv.textContent = message;
  }
}

function showDriveError(message) {
  const statusDiv = document.getElementById('google-drive-status');
  if (statusDiv) {
    statusDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <div>${message}</div>
      </div>
    `;
    statusDiv.className = 'drive-status error';
  }
}

function showDriveSuccess(message) {
  const statusDiv = document.getElementById('google-drive-status');
  if (statusDiv) {
    statusDiv.className = 'drive-status success';
    statusDiv.textContent = message;
  }
}

// 初始化函数 - 在DOMContentLoaded事件中调用
function initGoogleDrivePicker() {
  const googleDriveButton = document.getElementById('google-drive-button');
  if (googleDriveButton) {
    // 初始禁用按钮，直到API加载完成
    googleDriveButton.style.opacity = '0.5';
    googleDriveButton.style.pointerEvents = 'none';
    
    // 添加点击事件
    googleDriveButton.addEventListener('click', handleDriveAuthClick);
  }
  
  // 如果API已经初始化，启用按钮
  maybeEnableButtons();
}

// 导出函数供外部使用
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
window.initGoogleDrivePicker = initGoogleDrivePicker;
window.pickerCallback = pickerCallback;
window.createPicker = createPicker;
window.handleDriveAuthClick = handleDriveAuthClick;
