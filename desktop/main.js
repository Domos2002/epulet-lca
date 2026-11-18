// Épület-LCA – asztali program (Electron).
// A program felülete a weben fut (GitHub Pages), ezért minden indításkor a legfrissebb változat töltődik be;
// maga az .exe ritkán változik, és azt is automatikusan frissíti az electron-updater (GitHub Releases).
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require("electron");
const path = require("path");
const fs = require("fs");

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const APP_URL = process.env.LCA_URL || CFG.appUrl;
const APP_ORIGIN = new URL(APP_URL).origin;
app.setAppUserModelId("hu.hegyidomonkos.epuletlca");

if (!app.requestSingleInstanceLock()) { app.quit(); }
let win = null;

// ablakméret megjegyzése
const stateFile = () => path.join(app.getPath("userData"), "window.json");
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch (e) { return { width: 1400, height: 900 }; } }
function saveState() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch (e) { }
}

function loadApp() {
  // a HTML-t mindig újraellenőrizteti a szerverrel (ETag), így az új változat azonnal betöltődik
  win.loadURL(APP_URL, { extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n" });
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1400, height: st.height || 900, x: st.x, y: st.y, minWidth: 380, minHeight: 500,
    title: "Épület-LCA", icon: path.join(__dirname, "build", "icon.png"), backgroundColor: "#0b1a17", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", saveState);

  // más webhelyre mutató linkek a rendes böngészőben nyílnak meg
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file:") || new URL(url).origin === APP_ORIGIN) return;
    e.preventDefault(); shell.openExternal(url);
  });
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html"));
  });
  loadApp();
}

ipcMain.on("lca:version", e => { e.returnValue = app.getVersion(); });
ipcMain.handle("lca:retry", () => { loadApp(); });
ipcMain.handle("lca:save", async (e, filename, bytes) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath("documents"), filename) });
  if (r.canceled || !r.filePath) return "cancel";
  await fs.promises.writeFile(r.filePath, Buffer.from(bytes));
  shell.showItemInFolder(r.filePath);
  return "ok";
});

function buildMenu() {
  const tpl = [
    { label: "Fájl", submenu: [{ label: "Kezdőlap (projektjeim)", accelerator: "CmdOrCtrl+H", click: () => win.loadURL(APP_URL + "#projektek") }, { type: "separator" }, { role: "quit", label: "Kilépés" }] },
    { label: "Szerkesztés", submenu: [{ role: "undo", label: "Visszavonás" }, { role: "redo", label: "Mégis" }, { type: "separator" }, { role: "cut", label: "Kivágás" }, { role: "copy", label: "Másolás" }, { role: "paste", label: "Beillesztés" }, { role: "selectAll", label: "Az összes kijelölése" }] },
    { label: "Nézet", submenu: [{ label: "Újratöltés (frissítés)", accelerator: "F5", click: () => loadApp() }, { type: "separator" }, { role: "zoomIn", label: "Nagyítás" }, { role: "zoomOut", label: "Kicsinyítés" }, { role: "resetZoom", label: "Eredeti méret" }, { type: "separator" }, { role: "togglefullscreen", label: "Teljes képernyő" }, { role: "toggleDevTools", label: "Fejlesztői eszközök" }] },
    { label: "Súgó", submenu: [{ label: "Adatforrások és módszertan", click: () => win.loadURL(APP_URL + "#modszertan") }, { label: "Megnyitás böngészőben", click: () => shell.openExternal(APP_URL) }, { label: `Verzió: ${app.getVersion()}`, enabled: false }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  buildMenu(); createWindow();
  // az .exe saját frissítése (csak telepített változatban)
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoDownload = true;
      autoUpdater.on("update-downloaded", async () => {
        const r = await dialog.showMessageBox(win, { type: "info", buttons: ["Újraindítás most", "Később"], defaultId: 0, title: "Frissítés", message: "Letöltődött az asztali program új változata.", detail: "Újraindítás után az új változat fut. Ha a „Később”-et választod, a következő kilépéskor települ." });
        if (r.response === 0) autoUpdater.quitAndInstall();
      });
      autoUpdater.checkForUpdates().catch(() => { });
      setInterval(() => autoUpdater.checkForUpdates().catch(() => { }), 6 * 60 * 60 * 1000);
    } catch (e) { }
  }
});
app.on("window-all-closed", () => app.quit());
