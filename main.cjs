const { app, BrowserWindow, dialog, shell } = require('electron');

const ONLINE_URL = 'https://aoyin-erp.vercel.app';
const APP_TITLE = '\u5965\u5370ERP\u7ba1\u7406\u7cfb\u7edf';

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

  win.maximize();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ONLINE_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', async (_event, errorCode, errorDescription) => {
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      title: '\u7f51\u7edc\u8fde\u63a5\u5f02\u5e38',
      message: '\u65e0\u6cd5\u8fde\u63a5\u5230\u5965\u5370ERP\u7ba1\u7406\u7cfb\u7edf\u7ebf\u4e0a\u670d\u52a1\u3002',
      detail: `\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\u540e\u91cd\u65b0\u6253\u5f00\u8f6f\u4ef6\u3002\n\n\u9519\u8bef\u4fe1\u606f\uff1a${errorDescription || errorCode}`,
      buttons: ['\u91cd\u8bd5', '\u5173\u95ed'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      win.loadURL(ONLINE_URL);
    } else {
      win.close();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadURL(ONLINE_URL);
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
