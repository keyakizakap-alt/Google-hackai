/**
 * 推し画像をこの端末のブラウザ内（IndexedDB）にだけ保存する小さなストア。
 * サーバーには一切送らない。プライベートブラウズ等で使えない場合は静かに何もしない。
 */
const DB = "oshiready";
const STORE = "oshiImages";
const PREF_KEY = "oshiready.persistImages";

/** 画像はアーティストごとに保存（イベントを取り込み直しても同じ推しなら表示される） */
export const artistKey = (artist: string) => artist.normalize("NFKC").trim().toLowerCase();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      if (!req.result.objectStoreNames.contains("workspace")) req.result.createObjectStore("workspace");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      t.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

export async function loadAllImages(): Promise<Record<string, Blob>> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const out: Record<string, Blob> = {};
      const req = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) {
          db.close();
          return resolve(out);
        }
        if (c.value instanceof Blob) out[String(c.key)] = c.value;
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return {};
  }
}

export const saveImage = (key: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, key));
export const deleteImage = (key: string) => tx("readwrite", (s) => s.delete(key));
export const clearImages = () => tx("readwrite", (s) => s.clear());

export function readPersistPref(): boolean {
  try {
    // 共用端末への配慮で、既定はオフ（利用者がオンにしたときだけ保存）
    return localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}
export function writePersistPref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* 保存できない環境では毎回メモリのみ */
  }
}

/** 保存容量を抑えるため長辺 1600px の WebP に縮小する（失敗時は元画像） */
export async function downscale(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.88));
    return out ?? file;
  } catch {
    return file;
  }
}
