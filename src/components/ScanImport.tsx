"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ClipboardPaste, LoaderCircle, ScanLine, X } from "lucide-react";
import { formatJst } from "@/lib/time";
import { useStore, type DetectedLiveEvent } from "./store";

/** 文字が読めるサイズ（長辺 2000px）の JPEG に縮小して data URL にする */
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * 「スクショ・文章から追加」ダイアログ。
 * どのカレンダーアプリ（TimeTree・iPhone・手帳アプリ等）やチケットでも、画面を撮るか文章を貼るだけで登録できる。
 * 読み取り結果は必ずユーザーが確認してから登録する。
 */
function ScanDialog({ onClose }: { onClose: () => void }) {
  const { addScannedEvents, selectEvent, session, autoPlan, notify } = useStore();
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"input" | "reading" | "result">("input");
  const [found, setFound] = useState<DetectedLiveEvent[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 画像の読み取りには AI が必要。使えないときは文章の貼り付けだけを受け付ける
  const imageOnlyUnavailable = Boolean(session && !session.gemini.configured && image && !text.trim());

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const read = async () => {
    setErr(null);
    setState("reading");
    try {
      const res = await fetch("/api/events/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: image ?? undefined, text: text.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { events?: DetectedLiveEvent[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "読み取りに失敗しました");
      const list = json.events ?? [];
      setFound(list);
      setChecked(new Set(list.map((e) => e.key)));
      setState("result");
      // 画像は読み取りに使ったら端末のメモリからも消す
      setImage(null);
    } catch (e) {
      setErr((e as Error).message);
      setState("input");
    }
  };

  const register = () => {
    const chosen = found.filter((e) => checked.has(e.key));
    const added = addScannedEvents(chosen);
    notify(added > 0 ? `${added} 件のライブを登録しました` : "選んだライブはすでに登録されています");
    if (chosen[0]) setTimeout(() => selectEvent(`scan-${chosen[0].key}`), 0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        onClick={(e) => e.stopPropagation()}
        className="pop-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-float outline-none sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm italic text-mute">Quick add</p>
            <h2 id="scan-title" className="text-xl font-bold text-ink">スクショ・文章から追加</h2>
          </div>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-mute hover:bg-lav-50" aria-label="閉じる">
            <X className="h-5 w-5" />
          </button>
        </div>

        {state !== "result" && (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              カレンダーやチケット画面のスクリーンショット、当選メールの文章から、ライブの日時・会場を読み取ります。TimeTree や iPhone のカレンダーでも使えます。
            </p>

            <label className="mt-5 flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lav-200 bg-cloud p-4 text-center transition hover:border-rose-300">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- 端末内の一時画像
                <img src={image} alt="読み取る画像" className="max-h-44 rounded-xl object-contain" />
              ) : (
                <>
                  <Camera className="h-7 w-7 text-lav-500" strokeWidth={1.6} />
                  <span className="text-sm font-bold text-ink">スクショ・写真を選ぶ</span>
                  <span className="text-[11px] text-mute">カレンダー画面／電子チケット／当選メール など</span>
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setImage(await toDataUrl(f));
                }}
              />
            </label>

            <div className="my-4 flex items-center gap-3 text-[11px] text-mute">
              <span className="h-px flex-1 bg-line" />
              または
              <span className="h-px flex-1 bg-line" />
            </div>

            <label className="block text-xs font-bold text-ink-soft">
              <span className="flex items-center gap-1.5">
                <ClipboardPaste className="h-4 w-4" /> 文章を貼り付け
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={3000}
                rows={4}
                placeholder={"例）公演名：IVE WORLD TOUR\n日時：2026年10月30日 開演18:00\n会場：京セラドーム大阪"}
                className="mt-1.5 w-full rounded-xl border border-line bg-cloud px-3 py-2.5 text-sm font-normal outline-none focus:border-lav-400 focus:bg-white"
              />
            </label>

            {imageOnlyUnavailable && (
              <p className="mt-2 text-[11px] text-rose-500">いまは画像の読み取りを使えません。当選メールなどの文章を貼り付けてください。</p>
            )}
            {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-500" role="alert">{err}</p>}

            <button
              onClick={() => void read()}
              disabled={state === "reading" || (!image && !text.trim()) || imageOnlyUnavailable}
              className="btn-primary mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold"
            >
              {state === "reading" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
              {state === "reading" ? "読み取り中…" : "読み取る"}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-mute">画像や文章は読み取りにだけ使い、保存しません。</p>
          </>
        )}

        {state === "result" && (
          <>
            {found.length === 0 ? (
              <div className="mt-5 rounded-2xl bg-cloud p-6 text-center">
                <p className="font-bold text-ink">ライブの予定が見つかりませんでした</p>
                <p className="mt-1 text-xs text-mute">日付と公演名が写っている画像か、文章でもう一度お試しください。</p>
                <button onClick={() => setState("input")} className="mt-4 min-h-[44px] rounded-xl border border-line bg-white px-5 text-sm font-bold text-ink">
                  やり直す
                </button>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-soft">{found.length} 件見つかりました。内容を確認して登録してください（あとから編集もできます）。</p>
                <ul className="mt-4 space-y-2">
                  {found.map((e) => {
                    const on = checked.has(e.key);
                    return (
                      <li key={e.key}>
                        <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${on ? "border-rose-300 bg-rose-50/50" : "border-line"}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setChecked((prev) => {
                                const n = new Set(prev);
                                if (n.has(e.key)) n.delete(e.key);
                                else n.add(e.key);
                                return n;
                              })
                            }
                            className="mt-1 h-5 w-5 accent-[#655da3]"
                          />
                          <span className="min-w-0">
                            <span className="block font-bold text-ink">{e.title}</span>
                            <span className="mt-0.5 block text-xs text-ink-soft">
                              {e.artist} ・ {formatJst(e.startAt)}
                              {e.timeUnknown && "（時刻未定）"}
                            </span>
                            <span className="block text-xs text-mute">
                              {e.venue}（{e.venueStation}）
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => setState("input")} className="min-h-[48px] rounded-xl border border-line text-sm font-bold text-ink-soft">
                    やり直す
                  </button>
                  <button onClick={register} disabled={checked.size === 0} className="btn-primary flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl text-sm font-bold">
                    <CheckCircle2 className="h-4 w-4" /> {checked.size} 件を登録
                  </button>
                </div>
                <p className="mt-3 text-center text-[11px] text-mute">{autoPlan ? "登録すると、準備プランを自動で作ります。" : "登録後、プラン画面から準備プランを作れます。"}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ScanImportButton({ className = "", label = "スクショ・文章から追加" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <ScanLine className="h-4 w-4" />
        {label}
      </button>
      {open && <ScanDialog onClose={() => setOpen(false)} />}
    </>
  );
}
