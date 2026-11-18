// Az asztali program és a weboldal közti híd: csak a mentés-párbeszéd és a verziószám.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("lcaDesktop", {
  version: ipcRenderer.sendSync("lca:version"),
  saveFile: (filename, bytes) => ipcRenderer.invoke("lca:save", filename, bytes),
  retry: () => ipcRenderer.invoke("lca:retry")
});
