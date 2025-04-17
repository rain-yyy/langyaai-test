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
  
  showDriveStatus('Opening file picker...');
  
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
      showDriveStatus('No files selected');
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
        showDriveError('Authorization credentials lost, please click the "Connect Google Drive" button again.');
        return;
    }

    // 获取 User ID
    const userId = getUserId();
    if (!userId) {
        showDriveError('Unable to get user ID, please ensure you are logged in.');
        return;
    }

    showDriveStatus(`Selected ${selectedFiles.length} files, sending to server for processing...`);

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

        if (response.ok) {
            if (result.status === 'success') {
                showDriveSuccess(`Successfully processed ${result.files_processed?.length || 0} files. ${result.message || ''}`);
                displayProcessedFiles(result.files_processed, result.files_failed_processing);
                if (typeof addSystemMessage === 'function') {
                    addSystemMessage(`Successfully processed ${result.files_processed?.length || 0} Google Drive files.`);
                }
                // 刷新文件列表
                if (typeof fetchFileList === 'function') {
                    fetchFileList();
                }
            } else if (result.status === 'warning') {
                showDriveStatus(`Folder processing completed with warnings: ${result.message}`);
                displayProcessedFiles(result.files_processed, result.files_failed_processing);
            } else if (result.status === 'partial_success' || result.status === 'partial_failure') {
                showDriveError(`Some files failed to process: ${result.error || result.message || 'Some files failed to import'}`);
                displayProcessedFiles(result.files_processed, result.files_failed_processing);
            } else {
                showDriveError(`Unknown issue occurred while processing files: ${result.message || JSON.stringify(result)}`);
            }
        } else {
            const errorMsg = result.error || `Server error (status code: ${response.status})`;
            showDriveError(`Failed to process files: ${errorMsg}`);
            if (typeof addSystemMessage === 'function') {
                addSystemMessage(`Error processing Google Drive files: ${errorMsg}`);
            }
        }
    } catch (error) {
        console.error('Error calling backend API:', error);
        showDriveError(`Network error occurred while calling backend API: ${error.message}`);
        if (typeof addSystemMessage === 'function') {
            addSystemMessage(`Error calling backend API to process Google Drive files: ${error.message}`);
        }
    }
  } else if (data.action === google.picker.Action.CANCEL) {
    showDriveStatus('Selection cancelled, no files authorized');
  } else if (data.action === google.picker.Action.LOADED) {
    // 忽略加载完成事件
  } else {
    console.warn('Unknown picker action:', data.action);
  }
}

// (可选) 辅助函数，用于显示处理的文件列表
function displayProcessedFiles(processed, failed) {
    const statusDiv = document.getElementById('google-drive-status');
    if (!statusDiv) return;

    const fileListDiv = document.createElement('div');
    fileListDiv.className = 'drive-file-list';
    fileListDiv.style.marginTop = '10px';
    fileListDiv.style.fontSize = '12px';

    let content = '<h4>Processing Details:</h4>';

    if (processed && processed.length > 0) {
        content += `<h5>Successfully Processed (${processed.length}):</h5><ul>`;
        processed.forEach(f => {
            content += `<li>📄 ${f.name} (-> ${f.gcs_path ? 'GCS' : 'Unknown'})</li>`;
        });
        content += '</ul>';
    } else {
        content += '<div>No files successfully processed.</div>';
    }

    if (failed && failed.length > 0) {
        content += `<h5 style="color: red; margin-top: 8px;">Failed to Process (${failed.length}):</h5><ul>`;
        failed.forEach(f => {
            content += `<li>📄 ${f.name} (Reason: ${f.reason || 'Unknown'})</li>`;
        });
        content += '</ul>';
    }

    fileListDiv.innerHTML = content;
    // 将列表添加到状态区域，避免覆盖之前的消息
    const existingStatus = statusDiv.querySelector('.drive-status, .error-message');
    if (existingStatus) {
        existingStatus.insertAdjacentElement('afterend', fileListDiv);
    } else {
       statusDiv.appendChild(fileListDiv);
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
        <i>⚠️</i>
        <div>
          <div style="margin-bottom: 8px;">${message}</div>
          <div style="font-size: 12px; opacity: 0.8;">
            Current domain: ${window.location.origin}<br>
            Please ensure this domain is added to the authorized origins list in Google Cloud Console
          </div>
        </div>
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
