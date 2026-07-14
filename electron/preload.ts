import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";
import type { Api } from "../shared/types/ipc";

// Theme is applied directly to the DOM here, before the page's own scripts
// run, so there's no flash of the wrong theme on load. Not part of `Api` —
// the native View menu (electron/menu.ts) is the only way to change it.
// Deliberately isolated in a try/catch: nothing here should ever be able to
// stop `contextBridge.exposeInMainWorld` below from running.
try {
  const initialTheme = ipcRenderer.sendSync("theme:getSync") as "light" | "dark";
  document.documentElement.setAttribute("data-theme", initialTheme);
  ipcRenderer.on("theme:changed", (_event, theme: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", theme);
  });
} catch (cause) {
  console.error("[preload] failed to apply initial theme", cause);
}

const api: Api = {
  terminal: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.terminalGetStatus),
    activate: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.terminalActivate, apiKey),
  },
  auth: {
    loginPin: (pin) => ipcRenderer.invoke(IPC_CHANNELS.authLoginPin, pin),
    getSession: () => ipcRenderer.invoke(IPC_CHANNELS.authGetSession),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.authLogout),
    loginSuperAdmin: (email, password) =>
      ipcRenderer.invoke(IPC_CHANNELS.authLoginSuperAdmin, email, password),
  },
  shifts: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.shiftsOpen),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.shiftsClose),
    current: () => ipcRenderer.invoke(IPC_CHANNELS.shiftsCurrent),
  },
  catalog: {
    listProducts: () => ipcRenderer.invoke(IPC_CHANNELS.catalogListProducts),
    updateProductLocal: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.catalogUpdateProductLocal, id, input),
    listPaymentMethods: () => ipcRenderer.invoke(IPC_CHANNELS.catalogListPaymentMethods),
  },
  sales: {
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.salesCreate, input),
    list: (params) => ipcRenderer.invoke(IPC_CHANNELS.salesList, params),
    void: (saleId, reason) => ipcRenderer.invoke(IPC_CHANNELS.salesVoid, saleId, reason),
  },
  heldOrders: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.heldOrdersList),
    hold: (input) => ipcRenderer.invoke(IPC_CHANNELS.heldOrdersHold, input),
    discard: (id) => ipcRenderer.invoke(IPC_CHANNELS.heldOrdersDiscard, id),
    finalize: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.heldOrdersFinalize, id, input),
  },
  payments: {
    search: (params) => ipcRenderer.invoke(IPC_CHANNELS.paymentsSearch, params),
    match: (saleId, transactionRef) => ipcRenderer.invoke(IPC_CHANNELS.paymentsMatch, saleId, transactionRef),
    reconcileAll: () => ipcRenderer.invoke(IPC_CHANNELS.paymentsReconcileAll),
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
