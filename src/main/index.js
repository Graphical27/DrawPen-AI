import { GoogleGenAI } from "@google/genai";
import {
  app,
  Tray,
  Menu,
  BrowserWindow,
  screen,
  globalShortcut,
  shell,
  ipcMain,
  nativeTheme,
  systemPreferences,
  desktopCapturer,
} from "electron";
import { updateElectronApp } from "update-electron-app";
import Store from "electron-store";
import { randomUUID } from "crypto";
import { PostHog } from "posthog-node";
import fs from "fs";
import path from "path";
import os from "os";
import electronSquirrelStartup from "electron-squirrel-startup";

if (electronSquirrelStartup) {
  app.quit();
}

// GoogleGenAI is now initialized on demand in 'generate_ai_drawing' handler

const isDevelopment = process.env.NODE_ENV === "development";
const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWin = process.platform === "win32";

const KEY_SHOW_HIDE_APP = "CmdOrCtrl+Shift+A";
const KEY_SHOW_HIDE_TOOLBAR = "CmdOrCtrl+T";
const KEY_SHOW_HIDE_WHITEBOARD = "CmdOrCtrl+E";
const KEY_CLEAR_DESK = "CmdOrCtrl+K";
const KEY_SETTINGS = "CmdOrCtrl+,";
const KEY_MAKE_SCREENSHOT = "CmdOrCtrl+Shift+P";
const KEY_Q = "CmdOrCtrl+Q";
const KEY_NULL = "[NULL]";

let lastShortcutTime = 0;
const throttleDelay = 250;

const schema = {
  user_id: {
    type: "string",
    default: randomUUID(),
  },
  show_whiteboard: {
    type: "boolean",
    default: false,
  },
  show_tool_bar: {
    type: "boolean",
    default: true,
  },
  tool_bar_x: {
    type: "number",
    default: 5,
  },
  tool_bar_y: {
    type: "number",
    default: 5,
  },
  tool_bar_active_tool: {
    type: "string",
    default: "pen",
  },
  tool_bar_active_color_index: {
    type: "number",
    default: 1,
  },
  tool_bar_active_weight_index: {
    type: "number",
    default: 1,
  },
  tool_bar_default_brush: {
    type: "string",
    default: "pen",
  },
  tool_bar_default_figure: {
    type: "string",
    default: "arrow",
  },
  active_monitor_id: {
    type: "number",
  },
  show_drawing_border: {
    type: "boolean",
    default: true,
  },
  show_cute_cursor: {
    type: "boolean",
    default: true,
  },
  app_icon_color: {
    type: "string",
    default: "default",
  },
  launch_on_login: {
    type: "boolean",
    default: false,
  },
  key_binding_show_hide_app: {
    type: "string",
    default: KEY_SHOW_HIDE_APP,
  },
  key_binding_show_hide_toolbar: {
    type: "string",
    default: KEY_SHOW_HIDE_TOOLBAR,
  },
  key_binding_show_hide_whiteboard: {
    type: "string",
    default: KEY_SHOW_HIDE_WHITEBOARD,
  },
  key_binding_clear_desk: {
    type: "string",
    default: KEY_CLEAR_DESK,
  },
  fade_disappear_after_ms: {
    type: "number",
    default: 1500,
  },
  fade_out_duration_time_ms: {
    type: "number",
    default: 1000,
  },
  laser_time: {
    type: "number",
    default: 2000,
  },
  swap_colors_indexes: {
    type: "array",
    default: [1, 2],
  },
  starts_hidden: {
    type: "boolean",
    default: false,
  },
  drawing_monitor: {
    type: "object",
    default: {
      mode: "auto",
      display_id: null,
      label: null,
    },
  },
  gemini_api_key: {
    type: "string",
    default: "",
  },
};

const store = new Store({
  schema,
});

if (isDevelopment) {
  rawLog("Initial store: ", store.store);

  store.onDidAnyChange((newStore, _oldStore) => {
    rawLog("Updated store: ", newStore);
  });
}

let tray;
let mainWindow;
let aboutWindow;
let settingsWindow;

let foregroundMode = true;

const iconSrc = {
  WHITE: path.resolve(__dirname, "../renderer/assets/trayIconWhite.png"),
  BLACK: path.resolve(__dirname, "../renderer/assets/trayIconBlack.png"),
  DARWIN_TEMPLATE: path.resolve(
    __dirname,
    "../renderer/assets/trayIconTemplate@2x.png",
  ),
};

function getTrayIconPath() {
  if (isMac) return iconSrc.DARWIN_TEMPLATE;

  const appIconColor = store.get("app_icon_color");

  if (appIconColor === "white") return iconSrc.WHITE;
  if (appIconColor === "black") return iconSrc.BLACK;

  if (isWin && nativeTheme.shouldUseDarkColors) return iconSrc.WHITE;
  if (isWin) return iconSrc.BLACK;

  if (isLinux) return iconSrc.WHITE;

  return iconSrc.BLACK;
}

function updateContextMenu() {
  if (!tray) return;

  const show_tool_bar = store.get("show_tool_bar");
  const show_whiteboard = store.get("show_whiteboard");

  const key_show_hide_app = store.get("key_binding_show_hide_app");
  const key_show_hide_toolbar = store.get("key_binding_show_hide_toolbar");
  const key_show_hide_whiteboard = store.get(
    "key_binding_show_hide_whiteboard",
  );
  const key_clear_desk = store.get("key_binding_clear_desk");

  const accelForTray = (accel) => {
    if (!accel) return undefined;
    if (accel === KEY_NULL) return undefined;

    if (isLinux) return undefined;

    return accel;
  };

  const withAccelHint = (label, accel) => {
    if (!accel) return label;
    if (accel === KEY_NULL) return label;

    if (isLinux) {
      return `${label} (${normalizeAcceleratorForUI(accel)})`;
    }

    return label;
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: withAccelHint(
        foregroundMode ? "Hide DrawPen" : "Show DrawPen",
        key_show_hide_app,
      ),
      accelerator: accelForTray(key_show_hide_app),
      click: toggleDrawWindow,
    },
    {
      label: withAccelHint(
        show_tool_bar ? "Hide Toolbar" : "Show Toolbar",
        key_show_hide_toolbar,
      ),
      accelerator: accelForTray(key_show_hide_toolbar),
      click: toggleToolbar,
    },
    {
      label: withAccelHint(
        show_whiteboard ? "Hide Whiteboard" : "Show Whiteboard",
        key_show_hide_whiteboard,
      ),
      accelerator: accelForTray(key_show_hide_whiteboard),
      click: toggleWhiteboard,
    },
    {
      label: withAccelHint("Clear desk", key_clear_desk),
      accelerator: accelForTray(key_clear_desk),
      click: resetScreen,
    },
    { type: "separator" },
    {
      label: "Reset to original",
      click: resetApp,
    },
    {
      label: withAccelHint("Settings", KEY_SETTINGS),
      accelerator: accelForTray(KEY_SETTINGS),
      click: showSettingsWindow,
    },
    { type: "separator" },
    {
      label: "Capture Screen (Beta)",
      accelerator: accelForTray(KEY_MAKE_SCREENSHOT),
      click: makeScreenshot,
    },
    { type: "separator" },
    {
      label: "About DrawPen",
      click: showAboutWindow,
    },
    {
      label: withAccelHint("Quit", KEY_Q),
      accelerator: accelForTray(KEY_Q),
      click: quitApp,
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function registerTrayActions() {
  nativeTheme.on("updated", () => {
    if (!tray) return;

    tray.setImage(getTrayIconPath());
  });

  if (isWin || isLinux) {
    tray.on("click", () => {
      toggleDrawWindow();
    });
  }
}

function createMainWindow() {
  const currentDisplay = getDrawingDisplay();

  store.set("active_monitor_id", currentDisplay.id);

  let { x, y, width, height } = currentDisplay.workArea;
  let isResizable = false;
  let hasDevTools = false;

  if (isDevelopment) {
    width = 500;
    height = 500;
    isResizable = true;
    hasDevTools = true;
  }

  mainWindow = new BrowserWindow({
    show: false,
    x: x,
    y: y,
    width: width,
    height: height,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: isResizable,
    hasShadow: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    opacity: 0.9999999,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: hasDevTools,
      nodeIntegration: false,
      preload: APP_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(APP_WINDOW_WEBPACK_ENTRY);

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.on("close", function () {
    rawLog("Main window: on close");

    foregroundMode = false;
    updateContextMenu();
  });

  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (foregroundMode) {
      showWindowOnScreen();
    }
  });

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (
      (input.control || input.meta) &&
      ["+", "=", "-", "0", "numadd", "numsub"].includes(input.key.toLowerCase())
    ) {
      event.preventDefault();
    }
  });
}

function showAboutWindow() {
  withThrottle(() => {
    hideDrawWindow();

    if (aboutWindow) {
      aboutWindow.focus();
      return;
    }

    createAboutWindow();
  });
}

function createAboutWindow() {
  let hasDevTools = false;

  if (isDevelopment) {
    hasDevTools = true;
  }

  aboutWindow = new BrowserWindow({
    show: false,
    width: 250,
    height: 250,
    resizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: hasDevTools,
      nodeIntegration: false,
      preload: ABOUT_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  aboutWindow.center();

  aboutWindow.loadURL(ABOUT_WINDOW_WEBPACK_ENTRY);

  aboutWindow.on("minimize", (event) => {
    event.preventDefault();
  });

  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });

  aboutWindow.webContents.on("did-finish-load", () => {
    aboutWindow.show();
  });

  aboutWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);

    return { action: "deny" };
  });

  aboutWindow.webContents.setVisualZoomLevelLimits(1, 1);
  aboutWindow.webContents.on("before-input-event", (event, input) => {
    if (
      (input.control || input.meta) &&
      ["+", "=", "-", "0", "numadd", "numsub"].includes(input.key.toLowerCase())
    ) {
      event.preventDefault();
    }
  });
}

function showSettingsWindow() {
  withThrottle(() => {
    hideDrawWindow();

    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }

    createSettingsWindow();
  });
}

function createSettingsWindow() {
  rawLog("Creating settings window...");

  let hasDevTools = false;

  if (isDevelopment) {
    hasDevTools = true;
  }

  settingsWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 500,
    resizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: hasDevTools,
      nodeIntegration: false,
      preload: SETTINGS_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  settingsWindow.center();

  settingsWindow.loadURL(SETTINGS_WINDOW_WEBPACK_ENTRY);

  settingsWindow.on("minimize", (event) => {
    event.preventDefault();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  settingsWindow.webContents.on("did-finish-load", () => {
    settingsWindow.show();
  });

  settingsWindow.webContents.setVisualZoomLevelLimits(1, 1);
  settingsWindow.webContents.on("before-input-event", (event, input) => {
    if (
      (input.control || input.meta) &&
      ["+", "=", "-", "0", "numadd", "numsub"].includes(input.key.toLowerCase())
    ) {
      event.preventDefault();
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  showDrawWindow();
});

app.commandLine.appendSwitch("disable-pinch");
app.whenReady().then(() => {
  launchTracker();

  preCheck();

  hideDock();
  createMainWindow();

  tray = new Tray(getTrayIconPath());
  updateContextMenu();
  registerTrayActions();

  registerGlobalShortcuts();

  updateApp();
  setApplicationName();

  // First Run / Missing API Key Check
  if (!store.get("gemini_api_key")) {
    setTimeout(() => {
      showSettingsWindow();
    }, 1500); // 1.5s delay to let main window load and show
  }
});

app.on("will-quit", () => {
  rawLog("Will quit app... (Unregister all shortcuts)");

  unRegisterGlobalShortcuts();
});

app.on("window-all-closed", () => {
  rawLog("All windows closed.");
});

function preCheck() {
  if (safeWasOpenedAtLogin()) {
    foregroundMode = false;
    return;
  }

  foregroundMode = !store.get("starts_hidden");
}

function hideDock() {
  if (isMac) {
    app.dock.hide();
  }
}

function updateApp() {
  if (isLinux) return;

  updateElectronApp();
}

ipcMain.handle("get_app_version", () => {
  return app.getVersion();
});

ipcMain.handle("get_settings", () => {
  return {
    show_whiteboard: store.get("show_whiteboard"),
    show_tool_bar: store.get("show_tool_bar"),
    show_drawing_border: store.get("show_drawing_border"),
    show_cute_cursor: store.get("show_cute_cursor"),
    tool_bar_x: store.get("tool_bar_x"),
    tool_bar_y: store.get("tool_bar_y"),
    tool_bar_active_tool: store.get("tool_bar_active_tool"),
    tool_bar_active_color_index: store.get("tool_bar_active_color_index"),
    tool_bar_active_weight_index: store.get("tool_bar_active_weight_index"),
    tool_bar_default_brush: store.get("tool_bar_default_brush"),
    tool_bar_default_figure: store.get("tool_bar_default_figure"),
    swap_colors_indexes: store.get("swap_colors_indexes"),
    fade_disappear_after_ms: store.get("fade_disappear_after_ms"),
    fade_out_duration_time_ms: store.get("fade_out_duration_time_ms"),
    laser_time: store.get("laser_time"),

    key_binding_show_hide_toolbar: normalizeAcceleratorForUI(
      store.get("key_binding_show_hide_toolbar"),
    ),
    key_binding_show_hide_whiteboard: normalizeAcceleratorForUI(
      store.get("key_binding_show_hide_whiteboard"),
    ),
    key_binding_clear_desk: normalizeAcceleratorForUI(
      store.get("key_binding_clear_desk"),
    ),
    key_binding_open_settings: normalizeAcceleratorForUI(KEY_SETTINGS),
    key_binding_make_screenshot: normalizeAcceleratorForUI(KEY_MAKE_SCREENSHOT),
  };
});

ipcMain.handle("set_settings", (_event, newSettings) => {
  const needUpdateMenu = shouldUpdateMenu(newSettings);

  store.set({ ...store.store, ...newSettings });

  if (needUpdateMenu) {
    rawLog("Update Menu (settings changed)...");
    updateContextMenu();
  }

  return null;
});

ipcMain.handle("hide_app", () => {
  hideDrawWindow();

  return null;
});

ipcMain.handle("open_settings", () => {
  showSettingsWindow();

  return null;
});

ipcMain.handle("make_screenshot", () => {
  makeScreenshot();

  return null;
});

ipcMain.handle("open_notification", (_event, info) => {
  if (info.action === "open_screenshot") {
    const desktop = app.getPath("desktop");
    const filePath = path.join(desktop, info.data);

    hideDrawWindow();

    if (typeof filePath === "string" && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(desktop);
    }

    return null;
  }

  if (info.action === "open_security_preferences") {
    hideDrawWindow();

    if (isMac) {
      shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
    }

    return null;
  }

  if (info.action === "open_settings") {
    showSettingsWindow();
    return null;
  }
});

ipcMain.handle("reset_to_originals", () => {
  resetApp();

  return null;
});

ipcMain.handle("get_configuration", () => {
  rawLog("Getting configuration...");

  return {
    app_version: app.getVersion(),

    show_drawing_border: store.get("show_drawing_border"),
    show_cute_cursor: store.get("show_cute_cursor"),
    swap_colors_indexes: store.get("swap_colors_indexes"),
    fade_disappear_after_ms: store.get("fade_disappear_after_ms"),
    fade_out_duration_time_ms: store.get("fade_out_duration_time_ms"),
    laser_time: store.get("laser_time"),

    displays: getAllDisplaysInfo(),
    drawing_monitor: store.get("drawing_monitor"),
    app_icon_color: store.get("app_icon_color"),
    launch_on_login: store.get("launch_on_login"),
    starts_hidden: store.get("starts_hidden"),

    key_binding_show_hide_app: normalizeAcceleratorForUI(
      store.get("key_binding_show_hide_app"),
    ),
    key_binding_show_hide_app_default: normalizeAcceleratorForUI(
      schema.key_binding_show_hide_app.default,
    ),

    key_binding_show_hide_toolbar: normalizeAcceleratorForUI(
      store.get("key_binding_show_hide_toolbar"),
    ),
    key_binding_show_hide_toolbar_default: normalizeAcceleratorForUI(
      schema.key_binding_show_hide_toolbar.default,
    ),

    key_binding_show_hide_whiteboard: normalizeAcceleratorForUI(
      store.get("key_binding_show_hide_whiteboard"),
    ),
    key_binding_show_hide_whiteboard_default: normalizeAcceleratorForUI(
      schema.key_binding_show_hide_whiteboard.default,
    ),

    key_binding_clear_desk: normalizeAcceleratorForUI(
      store.get("key_binding_clear_desk"),
    ),
    key_binding_clear_desk_default: normalizeAcceleratorForUI(
      schema.key_binding_clear_desk.default,
    ),

    gemini_api_key: store.get("gemini_api_key"),
  };
});

ipcMain.handle("can_register_shortcut", async (_event, value) => {
  rawLog("Checking shortcut registration:", value);

  const accelerator = deNormalizeAcceleratorFromUI(value);

  const shortcutsInUse = [
    store.get("key_binding_show_hide_app"),
    store.get("key_binding_show_hide_toolbar"),
    store.get("key_binding_show_hide_whiteboard"),
    store.get("key_binding_clear_desk"),
  ].filter((s) => s && s !== KEY_NULL);

  if (shortcutsInUse.includes(accelerator)) {
    return false;
  }

  if (globalShortcut.isRegistered(accelerator)) {
    return false;
  }

  try {
    const success = globalShortcut.register(accelerator, () => {});
    if (success) {
      globalShortcut.unregister(accelerator);
    }

    return success;
  } catch {
    return false;
  }
});

ipcMain.handle("set_shortcut", (_event, key, value) => {
  rawLog("Setting shortcut:", key, value);
  const accelerator = deNormalizeAcceleratorFromUI(value);

  unRegisterGlobalShortcuts();

  if (accelerator) {
    store.set(key, accelerator);
  } else {
    store.delete(key);
  }

  registerGlobalShortcuts();
  updateContextMenu();

  if (mainWindow) {
    mainWindow.reload();
  }

  return null;
});

ipcMain.handle("set_launch_on_login", (_event, value) => {
  rawLog("Setting launch on login:", value);

  safeSetLoginItemSettings({ openAtLogin: value });

  store.set("launch_on_login", value);

  return null;
});

ipcMain.handle("set_starts_hidden", (_event, value) => {
  rawLog("Setting starts hidden:", value);

  store.set("starts_hidden", value);

  return null;
});

ipcMain.handle("set_show_drawing_border", (_event, value) => {
  rawLog("Setting drawing border:", value);

  store.set("show_drawing_border", value);

  refreshSettingsInRenderer();

  return null;
});

ipcMain.handle("set_show_cute_cursor", (_event, value) => {
  rawLog("Setting cute cursor:", value);

  store.set("show_cute_cursor", value);

  refreshSettingsInRenderer();

  return null;
});

ipcMain.handle("set_swap_colors", (_event, value) => {
  rawLog("Setting swap colors:", value);

  store.set("swap_colors_indexes", value);

  refreshSettingsInRenderer();

  return null;
});

ipcMain.handle("set_fade_disappear_after_ms", (_event, value) => {
  rawLog("Setting fade disappear after:", value);

  store.set("fade_disappear_after_ms", value);

  if (mainWindow) {
    mainWindow.reload();
  }

  return null;
});

ipcMain.handle("set_fade_out_duration_time_ms", (_event, value) => {
  rawLog("Setting fade out duration time:", value);

  store.set("fade_out_duration_time_ms", value);

  if (mainWindow) {
    mainWindow.reload();
  }

  return null;
});

ipcMain.handle("set_laser_time", (_event, value) => {
  rawLog("Setting laser time:", value);

  store.set("laser_time", value);

  if (mainWindow) {
    mainWindow.reload();
  }

  return null;
});

ipcMain.handle("set_app_icon_color", (_event, value) => {
  rawLog("Setting app icon color:", value);

  store.set("app_icon_color", value);

  tray.setImage(getTrayIconPath());
  return null;
  tray.setImage(getTrayIconPath());
  return null;
});

ipcMain.handle("set_gemini_api_key", (_event, key) => {
  rawLog("Setting Gemini API Key:", key ? "***" : "(empty)");
  store.set("gemini_api_key", key);
  return null;
});

const aiCacheStore = new Store({
  name: "ai-cache",
  clearInvalidConfig: true,
});

ipcMain.handle("generate_ai_drawing", async (_event, prompt) => {
  try {
    const apiKey = store.get("gemini_api_key") || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("NO_API_KEY");
    }

    const aiInstance = new GoogleGenAI({
      apiKey: apiKey,
    });

    rawLog("Generating drawing for prompt:", prompt);

    // 1. Check Cache
    if (aiCacheStore.has(prompt)) {
      rawLog("AI Cache hit for prompt:", prompt);
      const cachedFigures = aiCacheStore.get(prompt);

      // Apply new IDs/Colors to cached figures so they feel "fresh"
      const figuresWithIds = cachedFigures.map((f, i) => ({
        ...f,
        id: Date.now() + i,
        rainbowColorDeg: Math.random() * 360,
      }));
      return figuresWithIds;
    }

    rawLog("AI Cache miss. Calling Gemini...");

    let width = 1920;
    let height = 1080;

    if (mainWindow) {
      const bounds = mainWindow.getContentBounds();
      width = bounds.width;
      height = bounds.height;
    }

    const modelId = "gemini-3-flash-preview";
    const systemInstruction = `
    You are an expert drawing assistant for a whiteboard app.
    Your goal is to output JSON instructions to draw figures on the canvas based on the user's prompt.
    The canvas size is ${width}x${height}. Please ensure all coordinates are strictly within this range.
    
    The available figures and their schema are:
    
    1. **Line** (drawLine):
       - \`type\`: 'line'
       - \`points\`: [[x1, y1], [x2, y2]]
       - \`colorIndex\`: 
            0: Rainbow (multi-color)
            1: Blue
            2: Red
            3: Green
            4: Orange
            5: White
            6: Black (Default)
       - \`widthIndex\`: 1 (medium), 2 (thick)
       
    2. **Rectangle** (drawRectangle):
       - \`type\`: 'rectangle'
       - \`points\`: [[x1, y1], [x2, y2]] (top-left, bottom-right)
       - \`colorIndex\`: integer (see above)
       - \`widthIndex\`: integer
       
    3. **Oval/Circle** (drawOval):
       - \`type\`: 'oval'
       - \`points\`: [[x1, y1], [x2, y2]] (bounding box)
       - \`colorIndex\`: integer (see above)
       - \`widthIndex\`: integer
       
    4. **Text** (drawText):
       - \`type\`: 'text'
       - \`points\`: [[x, y]] (top-left position)
       - \`text\`: "The text content"
       - \`colorIndex\`: integer (see above, default 1 for blue)
       - \`widthIndex\`: integer (affects font size)
       - \`width\`: approx width in px (e.g. 200)
       - \`height\`: approx height in px (e.g. 50)
       - \`scale\`: 1

    5. **Arrow** (drawArrow):
       - \`type\`: 'arrow'
       - \`points\`: [[x1, y1], [x2, y2]] (tail to head)
       - \`colorIndex\`: integer (see above)
       - \`widthIndex\`: integer

    IMPORTANT:
    - Respond ONLY with valid JSON.
    - The JSON should be an array of figure objects.
    - Example prompt: "Draw a red line" -> [{"type":"line", "points":[[10,10],[100,100]], "colorIndex":2, "widthIndex":2, "id": 1234567890}]
    - Ensure IDs are unique (use timestamp-like integers).
    - For math questions like "8 + 2 = ?", write the result e.g. "8 + 2 = 10" using the 'text' tool.
    - KEEP COORDINATES VISIBLE: x between 0 and ${width}, y between 0 and ${height}.
    `;

    const response = await aiInstance.models.generateContent({
      model: modelId,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    rawLog("Gemini response keys:", Object.keys(response));

    let text;
    if (typeof response.text === "function") {
      text = response.text();
    } else if (
      response.response &&
      typeof response.response.text === "function"
    ) {
      text = response.response.text();
    } else {
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts?.[0]?.text) {
        text = candidate.content.parts[0].text;
      } else {
        throw new Error(
          "Unexpected response structure: " +
            JSON.stringify(Object.keys(response)),
        );
      }
    }

    rawLog("Gemini response:", text);

    const cleanText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const figures = JSON.parse(cleanText);

    // 2. Save to Cache (store raw figures without IDs/Layouts that might change)
    aiCacheStore.set(prompt, figures);

    const figuresWithIds = figures.map((f, i) => ({
      ...f,
      id: Date.now() + i,
      rainbowColorDeg: Math.random() * 360,
    }));

    rawLog("Returning figures:", JSON.stringify(figuresWithIds));

    return figuresWithIds;
  } catch (error) {
    console.error("Error generating AI drawing:", error);
    return [];
  }
});

ipcMain.handle("set_drawing_monitor", (_event, value) => {
  rawLog("Setting drawing monitor:", value);

  store.set("drawing_monitor", value);

  return null;
});

function refreshSettingsInRenderer() {
  if (mainWindow) {
    mainWindow.webContents.send("refresh_settings", {
      show_drawing_border: store.get("show_drawing_border"),
      show_cute_cursor: store.get("show_cute_cursor"),
      swap_colors_indexes: store.get("swap_colors_indexes"),
    });
  }
}

function registerGlobalShortcuts() {
  rawLog("REGISTER global shortcuts...");

  const keyApp = store.get("key_binding_show_hide_app");
  safeRegisterGlobalShortcut(keyApp, toggleDrawWindow);
}

function unRegisterGlobalShortcuts() {
  rawLog("UNREGISTER global shortcuts...");

  globalShortcut.unregisterAll();
}

function withThrottle(callback) {
  rawLog("withThrottle called...");

  const now = Date.now();
  if (now < lastShortcutTime + throttleDelay) return;
  lastShortcutTime = now;

  callback();
}

function toggleDrawWindow() {
  withThrottle(() => {
    rawLog("Toggling draw window...");

    if (foregroundMode) {
      hideDrawWindow();
    } else {
      showDrawWindow();
    }
  });
}

function showDrawWindow() {
  rawLog("Showing draw window...");

  if (!mainWindow) {
    rawLog("Main window not found, creating...");
    createMainWindow();
  }

  showWindowOnScreen();

  foregroundMode = true;
  updateContextMenu();
}

function hideDrawWindow() {
  if (!mainWindow) return;

  rawLog("Hiding draw window...");

  mainWindow.hide();
  foregroundMode = false;
  updateContextMenu();
}

function toggleToolbar() {
  withThrottle(() => {
    rawLog("Toggling toolbar...");

    if (mainWindow) {
      mainWindow.webContents.send("toggle_toolbar");
    } else {
      store.set("show_tool_bar", !store.get("show_tool_bar"));
      updateContextMenu();
    }
  });
}

function toggleWhiteboard() {
  withThrottle(() => {
    rawLog("Toggling whiteboard...");

    if (mainWindow) {
      mainWindow.webContents.send("toggle_whiteboard");
    } else {
      store.set("show_whiteboard", !store.get("show_whiteboard"));
      updateContextMenu();
    }
  });
}

function resetApp() {
  withThrottle(() => {
    rawLog("Resetting app to original settings...");

    unRegisterGlobalShortcuts();

    const preservedUserId = store.get("user_id");

    store.clear();

    if (preservedUserId) {
      store.set("user_id", preservedUserId);
    }

    registerGlobalShortcuts();

    if (safeIsOpenAtLogin()) {
      safeSetLoginItemSettings({ openAtLogin: false });
    }

    tray.setImage(getTrayIconPath());

    showDrawWindow();

    if (settingsWindow) {
      settingsWindow.reload();
    }
  });
}

function resetScreen() {
  withThrottle(() => {
    rawLog("Resetting screen...");

    if (mainWindow) {
      mainWindow.webContents.send("reset_screen");
    }
  });
}

function quitApp() {
  withThrottle(() => {
    rawLog("Quitting app...");

    app.quit();
  });
}

function screenshotTimecode4(date) {
  let value =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

  let code = "";
  for (let i = 0; i < 4; i++) {
    code = String.fromCharCode(97 + (value % 26)) + code;
    value = Math.floor(value / 26);
  }

  return code;
}

function screenshotFilename(withUniqSuffix = false) {
  const date = new Date();

  const yyyy = date.getFullYear();
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");

  const code = screenshotTimecode4(date);
  const suffix = withUniqSuffix ? `-${Date.now()}` : "";

  return `DRWPN-${yyyy}${mm}${dd}-${code}${suffix}.png`;
}

async function makeScreenshot() {
  if (!mainWindow) return;

  if (!foregroundMode) {
    showDrawWindow();
  }

  try {
    rawLog("Exporting as PNG...");

    if (isMac) {
      const status = systemPreferences.getMediaAccessStatus("screen");
      if (status !== "granted") {
        try {
          await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1, height: 1 },
          });
        } catch (_) {}

        throw new Error("Screen Recording permission is not granted.");
      }
    }

    const activeMonitor = getActiveDisplay();

    const thumbnailSize = {
      width: Math.round(
        activeMonitor.size.width * (activeMonitor.scaleFactor || 1),
      ),
      height: Math.round(
        activeMonitor.size.height * (activeMonitor.scaleFactor || 1),
      ),
    };

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
    });

    if (sources.length === 0) {
      throw new Error("No screen sources available for capture.");
    }

    const source =
      sources.find(
        (s) =>
          String(s.display_id ?? s.displayId ?? "") ===
          String(activeMonitor.id),
      ) ||
      sources.find((source) => {
        const { width, height } = source.thumbnail.getSize();
        return width === thumbnailSize.width && height === thumbnailSize.height;
      }) ||
      sources[0];

    const image = source.thumbnail;

    if (!image || image.isEmpty()) {
      throw new Error("Could not capture the screen.");
    }

    let savePath = path.join(app.getPath("desktop"), screenshotFilename());
    if (typeof savePath === "string" && fs.existsSync(savePath)) {
      savePath = path.join(app.getPath("desktop"), screenshotFilename(true));
    }

    await fs.promises.writeFile(savePath, image.toPNG());

    sendNotification({
      title: `Click to open ${isMac ? "in Finder" : "folder"}`,
      body: savePath,
      button_label: "Open",
      button_action: "open_screenshot",
      button_data: path.basename(savePath),
    });
  } catch (error) {
    sendNotification({
      title: "Image export failed",
      body: error.message,
      button_label: isMac ? "Settings" : null,
      button_action: isMac ? "open_security_preferences" : null,
      button_data: null,
    });
  }
}

function sendNotification(data) {
  if (mainWindow) {
    mainWindow.webContents.send("show_notification", data);
  }
}

function showWindowOnScreen() {
  const currentDisplay = getDrawingDisplay();

  if (store.get("active_monitor_id") === currentDisplay.id) {
    mainWindow.show();
    return;
  }

  mainWindow.setBounds(currentDisplay.workArea);

  if (isDevelopment) {
    mainWindow.setBounds({
      width: 500,
      height: 500,
    });
  }

  store.set("active_monitor_id", currentDisplay.id);
  store.reset("tool_bar_x");
  store.reset("tool_bar_y");
  mainWindow.reload();
  mainWindow.show();
}

function getActiveDisplay() {
  const activeMonitorId = store.get("active_monitor_id");

  const matchedMonitor = screen
    .getAllDisplays()
    .find((display) => display.id === activeMonitorId);
  if (matchedMonitor) {
    return matchedMonitor;
  }

  return getDrawingDisplay();
}

function getDrawingDisplay() {
  const drawingMonitor = store.get("drawing_monitor");

  if (drawingMonitor.mode === "fixed") {
    const fixedDisplay = screen
      .getAllDisplays()
      .find((display) => String(display.id) === drawingMonitor.display_id);

    if (fixedDisplay) {
      return fixedDisplay;
    }
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getAllDisplaysInfo() {
  const allDisplays = screen.getAllDisplays();

  return allDisplays.map((display) => {
    const displayName = display.label || `Display ${display.id}`;
    const resolution = `${display.size.width}x${display.size.height}`;

    return {
      id: String(display.id),
      label: `${displayName} (${resolution})`,
    };
  });
}

function normalizeAcceleratorForUI(value) {
  if (!value) return value;

  const target = isMac ? "Meta" : "Control";
  return value.replace("CmdOrCtrl", target);
}

function deNormalizeAcceleratorFromUI(value) {
  if (!value) return value;

  const target = isMac ? "Meta" : "Control";
  return value.replace(target, "CmdOrCtrl");
}

function shouldUpdateMenu(newSettings) {
  function valueChanged(key) {
    return (
      key in store.store &&
      key in newSettings &&
      store.store[key] !== newSettings[key]
    );
  }

  if (valueChanged("show_whiteboard") || valueChanged("show_tool_bar")) {
    return true;
  }

  return false;
}

function safeRegisterGlobalShortcut(accelerator, callback) {
  if (!accelerator || accelerator === KEY_NULL) {
    return;
  }

  try {
    if (globalShortcut.isRegistered(accelerator)) {
      rawLog("Global shortcut already registered:", accelerator);
      return;
    }

    const success = globalShortcut.register(accelerator, callback);
    if (!success) {
      rawLog("Failed to register global shortcut:", accelerator);
    }
  } catch (error) {
    rawLog("Error registering global shortcut:", accelerator, error);
  }
}

function setApplicationName() {
  if (isWin) {
    app.setAppUserModelId("com.squirrel.DrawPen.DrawPen");
  }
}

function safeWasOpenedAtLogin() {
  if (isLinux) return false; // Linux не підтримує login items

  try {
    return !!app.getLoginItemSettings().wasOpenedAtLogin;
  } catch (error) {
    return false;
  }
}

function safeIsOpenAtLogin() {
  if (isLinux) return false;

  try {
    return !!app.getLoginItemSettings().openAtLogin;
  } catch (error) {
    return false;
  }
}

function safeSetLoginItemSettings(settings) {
  if (isLinux) return;

  try {
    app.setLoginItemSettings(settings);
  } catch (error) {}
}

function launchTracker() {
  if (isDevelopment) {
    return;
  }

  try {
    const key = process.env.PUBLIC_POSTHOG_KEY;

    if (!key || key === "undefined" || key === "") {
      return;
    }

    const posthog = new PostHog(key, {
      host: "https://us.i.posthog.com",
      flushAt: 1,
    });

    posthog.capture({
      distinctId: store.get("user_id") || "anonymous",
      event: "app_launch",
      properties: {
        platform: "app",

        app_version: app.getVersion(),

        os_platform: os.platform(),
        os_release: os.release(),
        arch: os.arch(),

        config: store.store,
      },
    });
  } catch (_) {}
}

function rawLog(message, ...args) {
  if (!isDevelopment) {
    return;
  }

  console.log(message, ...args);
}
