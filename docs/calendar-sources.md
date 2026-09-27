# カレンダー連携先の追加・変更

OshiReady の連携先は「部品（アダプタ）」として差し替えられるようにしてあります。
連携先の提供が終わった場合（例：TimeTree の外部連携は 2023-12-22 に終了）や、新しい連携先を追加したい場合でも、部品を 1 つ足したり外したりするだけで対応できます。

## 仕組み

```
各連携先の部品（src/lib/sources/google.ts など）
        │  予定データ
        ▼
共通の安全チェック（src/lib/sources/gate.ts）   ← すべての連携先が必ず通る
  ・空き時間：時間帯以外の項目を捨てて作り直す
  ・ライブ検出：ライブ候補だけを残し、他の予定は即座に破棄／連絡先などを伏せる
        │
        ▼
アプリ（空き時間の計算・ライブ取り込み・プラン作成）
```

- 連携先の一覧: `src/lib/sources/index.ts` の `ALL_SOURCES`
- 有効化: 環境変数 `CALENDAR_SOURCES`（カンマ区切り、既定 `google`）
- 部品が守る約束: `src/lib/sources/types.ts` の `CalendarSourceAdapter`

## 連携先を外す（提供終了などのとき）

1. `CALENDAR_SOURCES` から該当の名前を消して再デプロイします。コードの変更は不要です。
2. 不要になった部品のファイルと、`ALL_SOURCES` の記述を削除します（任意）。

## 連携先を追加する（例：Outlook）

1. `src/lib/sources/outlook.ts` を作り、`CalendarSourceAdapter` を実装します。
   - 権限は**読み取り専用**だけを要求します（Outlook なら `Calendars.Read`）。
   - `fetchBusy` は時間帯だけを返します。`fetchItemsForDetection` はタイトル・場所・日時だけを返し、参加者や説明文は受け取りません。
   - トークンは `src/lib/session.ts` と同じく、暗号化 Cookie にだけ保存します。
2. OAuth の開始・戻り先の API（`src/app/api/auth/<名前>/...`）を追加します。state と PKCE を必ず使います。
3. `ALL_SOURCES` に追加し、`CALENDAR_SOURCES=google,outlook` のように有効化します。
4. `tests/sources.test.ts` と同じ観点（ライブ以外が残らない／時間帯以外が残らない）でテストを追加します。

画面の連携状態は `/api/session` の `sources` から自動で表示されます。

## カレンダーを使わない登録手段

どの連携先にも依存しない登録手段として、「スクショ・文章から追加」（`/api/events/scan`）と手入力があります。
連携先の仕様が変わっても、これらで登録を続けられます。
