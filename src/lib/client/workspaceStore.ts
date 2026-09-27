import type { OshiEvent, PlanEnvelope } from "../agent/types";
import type { Reservation } from "@/components/store";

export interface SavedWorkspace {
  events: OshiEvent[];
  activeId: string | null;
  profile: { homeStation: string; beautyServices: OshiEvent["beautyServices"]; arriveEarlyForGoods: boolean };
  reservations: Reservation[];
  envelope: PlanEnvelope | null;
  /** 削除したカレンダー取り込みイベント（次の取り込みで復活させない） */
  dismissed?: string[];
}

const DB = "oshiready";
const STORE = "workspace";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("oshiImages")) req.result.createObjectStore("oshiImages");
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function operate<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

export const loadWorkspace = () => operate<SavedWorkspace | undefined>("readonly", (s) => s.get("current"));
export const saveWorkspace = (state: SavedWorkspace) => operate<IDBValidKey>("readwrite", (s) => s.put(state, "current"));
export const clearWorkspace = () => operate<undefined>("readwrite", (s) => s.delete("current"));
