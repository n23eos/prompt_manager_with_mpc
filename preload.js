"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  listPrompts: () => ipcRenderer.invoke("prompts:list"),
  searchPrompts: (opts) => ipcRenderer.invoke("prompts:search", opts),
  addPrompt: (data) => ipcRenderer.invoke("prompts:add", data),
  updatePrompt: (id, patch) => ipcRenderer.invoke("prompts:update", id, patch),
  deletePrompt: (id) => ipcRenderer.invoke("prompts:delete", id),
  allTags: () => ipcRenderer.invoke("prompts:tags"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: (name) => ipcRenderer.invoke("projects:add", name),
  updateProject: (id, patch) => ipcRenderer.invoke("projects:update", id, patch),
  deleteProject: (id) => ipcRenderer.invoke("projects:delete", id),
  copyText: (text, promptId) => ipcRenderer.invoke("clipboard:copy", text, promptId),
  hidePalette: () => ipcRenderer.invoke("palette:hide"),
  openMain: () => ipcRenderer.invoke("window:openMain"),
  dataFile: () => ipcRenderer.invoke("app:dataFile"),
  mcpPath: () => ipcRenderer.invoke("app:mcpPath"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  onRefresh: (cb) => ipcRenderer.on("data:refresh", cb),
});
