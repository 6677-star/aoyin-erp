const { app, BrowserWindow, dialog, shell } = require('electron');

const ONLINE_URL = 'https://www.aoyinerp.xyz';
const APP_TITLE = '\u5965\u5370ERP\u7ba1\u7406\u7cfb\u7edf';
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 5000;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function loadERP(win) {
  if (!win.isDestroyed()) {
    win.loadURL(ONLINE_URL);
  }
}

function buildErrorDetail(errorCode, errorDescription) {
  return [
    `\u5f53\u524d\u8bbf\u95ee\u5730\u5740\uff1a ${ONLINE_URL}`,
    '',
    '\u8bf7\u68c0\u67e5\uff1a',
    '1. \u662f\u5426\u53ef\u4ee5\u6253\u5f00\u6d4f\u89c8\u5668\u8bbf\u95ee\u8be5\u7f51\u5740',
    '2. \u662f\u5426\u88ab\u9632\u706b\u5899\u62e6\u622a',
    '3. \u662f\u5426\u88ab\u4ee3\u7406/VPN\u5f71\u54cd',
    '',
    `\u9519\u8bef\u4fe1\u606f\uff1a${errorDescription || errorCode || 'ERR_CONNECTION_TIMED_OUT'}`,
  ].join('\n');
}

async function showNetworkError(win, errorCode, errorDescription) {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '\u7f51\u7edc\u8fde\u63a5\u5f02\u5e38',
    message: '\u65e0\u6cd5\u8fde\u63a5\u5230 ERP \u670d\u52a1',
    detail: buildErrorDetail(errorCode, errorDescription),
    buttons: ['\u91cd\u65b0\u8fde\u63a5', '\u5237\u65b0', '\u9000\u51fa'],
    defaultId: 0,
    cancelId: 2,
  });

  if (result.response === 0 || result.response === 1) {
    loadERP(win);
    return;
  }

  win.close();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: APP_TITLE,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  let retryCount = 0;
  let showingErrorDialog = false;

  win.maximize();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ONLINE_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-finish-load', () => {
    retryCount = 0;
  });

  win.webContents.on('did-fail-load', async (_event, errorCode, errorDescription) => {
    if (win.isDestroyed() || showingErrorDialog) return;

    if (retryCount < MAX_RETRY_COUNT) {
      retryCount += 1;
      await wait(RETRY_DELAY_MS);
      loadERP(win);
      return;
    }

    showingErrorDialog = true;
    try {
      await showNetworkError(win, errorCode, errorDescription);
    } finally {
      showingErrorDialog = false;
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  loadERP(win);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
