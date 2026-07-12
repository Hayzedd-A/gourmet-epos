import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";
import type { Api } from "../shared/types/ipc";

const api: Api = {
  auth: {
    loginPin: (pin) => ipcRenderer.invoke(IPC_CHANNELS.authLoginPin, pin),
    getSession: () => ipcRenderer.invoke(IPC_CHANNELS.authGetSession),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.authLogout),
    loginSuperAdmin: (email, password) =>
      ipcRenderer.invoke(IPC_CHANNELS.authLoginSuperAdmin, email, password),
  },
  shifts: {
    open: (openingFloat) => ipcRenderer.invoke(IPC_CHANNELS.shiftsOpen, openingFloat),
    close: (closingTotal) => ipcRenderer.invoke(IPC_CHANNELS.shiftsClose, closingTotal),
    current: () => ipcRenderer.invoke(IPC_CHANNELS.shiftsCurrent),
  },
  catalog: {
    listProducts: () => ipcRenderer.invoke(IPC_CHANNELS.catalogListProducts),
    listBaseProducts: () => ipcRenderer.invoke(IPC_CHANNELS.catalogListBaseProducts),
    listCategories: () => ipcRenderer.invoke(IPC_CHANNELS.catalogListCategories),
    listCategorySizes: () => ipcRenderer.invoke(IPC_CHANNELS.catalogListCategorySizes),
    updateProductLocal: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.catalogUpdateProductLocal, id, input),
  },
  sales: {
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.salesCreate, input),
    list: (params) => ipcRenderer.invoke(IPC_CHANNELS.salesList, params),
    void: (saleId, reason) => ipcRenderer.invoke(IPC_CHANNELS.salesVoid, saleId, reason),
  },
  sync: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.syncGetState),
    triggerNow: () => ipcRenderer.invoke(IPC_CHANNELS.syncTriggerNow),
  },
  printer: {
    printReceipt: (saleId) => ipcRenderer.invoke(IPC_CHANNELS.printerPrintReceipt, saleId),
  },
  staff: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.staffList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.staffCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.staffUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.staffDelete, id),
  },
};

contextBridge.exposeInMainWorld("api", api);
