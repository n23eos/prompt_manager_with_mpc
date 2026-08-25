"use strict";
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  nativeImage,
  screen,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const store = require("./store");

const HOTKEY = "CommandOrControl+Shift+Space";

const TRAY_I18N = {
  en: {
    open: "Open Prompt Manager",
    palette: "Quick Palette  (⌘⇧Space)",
    favorites: "Favorites — click to copy",
    dataFolder: "Open Data Folder",
    quit: "Quit",
  },
  ru: {
    open: "Открыть Prompt Manager",
    palette: "Быстрая палитра  (⌘⇧Space)",
    favorites: "Избранное — клик для копирования",
    dataFolder: "Открыть папку данных",
    quit: "Выйти",
  },
};

let mainWindow = null;
let paletteWindow = null;
let tray = null;

// 16x16 template tray icon ("> _" prompt symbol)
const TRAY_ICON_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAG0lEQVR4nGNgGAXo4P+oIdQ1ZJhp/o8FDxcAAIuvDfOzHP/VAAAAAElFTkSuQmCC";

function broadcastRefresh() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("data:refresh");
  }
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    title: "Prompt Manager",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1a1b1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => (mainWindow = null));
}

function createPaletteWindow() {
  paletteWindow = new BrowserWindow({
    width: 640,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  paletteWindow.loadFile(path.join(__dirname, "renderer", "palette.html"));
  paletteWindow.on("blur", () => hidePalette());
}

function showPalette() {
  if (!paletteWindow || paletteWindow.isDestroyed()) createPaletteWindow();
  const { workArea } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint()
  );
  const x = Math.round(workArea.x + (workArea.width - 640) / 2);
  const y = Math.round(workArea.y + workArea.height * 0.2);
  paletteWindow.setPosition(x, y);
  paletteWindow.show();
  paletteWindow.focus();
  paletteWindow.webContents.send("data:refresh");
}

function hidePalette() {
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    paletteWindow.hide();
    if (app.hide) app.hide(); // return focus to previous app on macOS
  }
}

function togglePalette() {
  if (paletteWindow && !paletteWindow.isDestroyed() && paletteWindow.isVisible()) {
    hidePalette();
  } else {
    showPalette();
  }
}

function createTray() {
  const icon = nativeImage.createFromBuffer(
    Buffer.from(TRAY_ICON_B64, "base64")
  );
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Prompt Manager");
  const rebuildMenu = () => {
    const t = TRAY_I18N[store.getSettings().language] || TRAY_I18N.en;
    const favorites = store
      .listPrompts()
      .filter((p) => p.favorite)
      .slice(0, 10);
    const favItems = favorites.map((p) => ({
      label: p.title.length > 40 ? p.title.slice(0, 40) + "…" : p.title,
      click: () => {
        const vars = store.extractVariables(p.content);
        if (vars.length) {
          showPalette(); // needs variable input — open palette
        } else {
          clipboard.writeText(p.content);
          store.bumpUsage(p.id);
          broadcastRefresh();
        }
      },
    }));
    const menu = Menu.buildFromTemplate([
      { label: t.open, click: () => createMainWindow() },
      { label: t.palette, click: () => showPalette() },
      { type: "separator" },
      ...(favItems.length
        ? [
            { label: t.favorites, enabled: false },
            ...favItems,
            { type: "separator" },
          ]
        : []),
      {
        label: t.dataFolder,
        click: () => shell.showItemInFolder(store.DATA_FILE),
      },
      { type: "separator" },
      { label: t.quit, role: "quit" },
    ]);
    tray.setContextMenu(menu);
  };
  rebuildMenu();
  tray._rebuildMenu = rebuildMenu;
  // Rebuild favorites when data changes
  fs.watchFile(store.DATA_FILE, { interval: 2000 }, rebuildMenu);
}

// ---------- IPC ----------
ipcMain.handle("prompts:list", () => store.listPrompts());
ipcMain.handle("prompts:search", (e, opts) => store.searchPrompts(opts || {}));
ipcMain.handle("prompts:add", (e, data) => {
  const p = store.addPrompt(data);
  broadcastRefresh();
  return p;
});
ipcMain.handle("prompts:update", (e, id, patch) => {
  const p = store.updatePrompt(id, patch);
  broadcastRefresh();
  return p;
});
ipcMain.handle("prompts:delete", (e, id) => {
  store.deletePrompt(id);
  broadcastRefresh();
  return true;
});
ipcMain.handle("prompts:tags", () => store.allTags());
ipcMain.handle("clipboard:copy", (e, text, promptId) => {
  clipboard.writeText(String(text));
  if (promptId) store.bumpUsage(promptId);
  broadcastRefresh();
  return true;
});
ipcMain.handle("palette:hide", () => hidePalette());
ipcMain.handle("window:openMain", () => {
  hidePalette();
  createMainWindow();
});
ipcMain.handle("app:dataFile", () => store.DATA_FILE);
ipcMain.handle("app:mcpPath", () => path.join(__dirname, "mcp-server", "server.js"));
ipcMain.handle("projects:list", () => store.listProjects());
ipcMain.handle("projects:add", (e, name) => {
  const pr = store.addProject(name);
  broadcastRefresh();
  return pr;
});
ipcMain.handle("projects:update", (e, id, patch) => {
  const pr = store.updateProject(id, patch);
  broadcastRefresh();
  return pr;
});
ipcMain.handle("projects:delete", (e, id) => {
  store.deleteProject(id);
  broadcastRefresh();
  return true;
});
ipcMain.handle("settings:get", () => store.getSettings());
ipcMain.handle("settings:set", (e, patch) => {
  const next = store.setSettings(patch);
  if (tray && tray._rebuildMenu) tray._rebuildMenu();
  broadcastRefresh();
  return next;
});

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  // Seed the bundled prompt library on first run (locked, so a concurrent
  // MCP server write is never overwritten)
  if (!fs.existsSync(store.DATA_FILE)) {
    const seedFile = path.join(__dirname, "seed", "prompts.json");
    if (fs.existsSync(seedFile)) {
      try {
        const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
        store.seedIfEmpty(seed);
      } catch (err) {
        console.error("Failed to load seed:", err);
      }
    }
  }

  createTray();
  createPaletteWindow();
  createMainWindow();

  const ok = globalShortcut.register(HOTKEY, togglePalette);
  if (!ok) console.warn("Failed to register global hotkey", HOTKEY);

  app.on("activate", () => createMainWindow());

  // React to external changes (e.g. MCP server adding prompts)
  fs.watchFile(store.DATA_FILE, { interval: 2000 }, broadcastRefresh);
});

// Keep running in the menu bar when all windows are closed
app.on("window-all-closed", (e) => {
  // no-op: stay alive in tray
});

app.on("will-quit", () => globalShortcut.unregisterAll());
