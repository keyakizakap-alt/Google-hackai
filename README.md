# 逆転コンシェルジュ（Reverse Concierge）

旅先で予定が崩れたとき、その状況だからこそ価値のある代替プランを提示するAIエージェント。
「ピンチをその日だけの思い出に変える」ことを狙う。

Google Cloud Agentic AI Hackathon 応募用プロトタイプ。

## 何を解くのか

旅行中に雨・運休・混雑・閉館・体調不良が起きると、ユーザーは混乱した状況下で
「代替案の検索」「営業時間の確認」「移動時間の計算」「予算の再計算」を同時に迫られる。
検索エンジンは候補を並べるだけで、**今の自分の残り時間・残予算・移動手段で実際に成立するか**は
自分で計算するしかない。この計算こそが、焦っている旅行者が最も苦手とする作業になっている。

## エージェントの構造

**LLMが担うのは1段目と3段目（と5段目）だけ**で、
候補の供給（2段目）と提案の検算（4段目）はコードで決定的に処理する。

```
[1] 状況把握   Gemini    トラブル+文脈 → 制約条件(屋内必須/徒歩上限/予算上限/優先タグ)
      ↓
[2] 候補探索   コード     カタログから制約を満たすスポットだけを抽出
      ↓
[3] プラン構成 Gemini    候補リストの中だけで、方向性の違う3案を組む
      ↓
[4] 自己検証   コード     LLMの出力を検算し、通らない提案をユーザーに出さない
      ↓
[5] 自己修正   Gemini    落ちた案を「落ちた理由」付きで作り直し、[4]へ戻す
```

5段目があるのは、検算で落ちた案を捨てるだけでは提案数が減るだけだから。
不合格の理由を添えて作り直させ、再検算を通ったものだけを採用する。
`残り時間` を30分など短く設定すると、初回の案が時間超過で全て落ち、
エージェントが滞在時間を詰めて成立させ直す様子が確認できる。

この形にしている理由は、生成AIに旅程を任せるときの最大のリスクが
**実在しない店を自信満々に勧めること**だから。
3段目のプロンプトで候補外の使用を禁じたうえで、4段目で機械的に検算し、
プロンプトが破られた場合でも提案が外に出ない二重構造にしている。

4段目が実際に弾くもの:

| 検出内容 | 挙動 |
|---|---|
| カタログに存在しないスポットID | 該当ステップを除外し、除外理由を記録 |
| 制約を通過していないスポット | 同上 |
| 到着予定時刻に営業時間外 | 同上 |
| 所要時間が残り時間を超過 | プラン全体を不採用 |
| 概算費用が予算を超過 | プラン全体を不採用 |

弾いた内容はUIの「検証で弾いた提案」に表示される。
エージェントが何を判断し何を却下したかを利用者が追えるようにしている。

## 構成

```
backend/
  main.py       FastAPI。SSEでエージェントの各段を逐次配信する
  agent.py      自律ループ本体（状況把握→候補探索→構成→検証→修正）
  catalog.py    スポットカタログと決定的な絞り込み
  schemas.py    リクエスト/LLM構造化出力のスキーマ
  obs.py        構造化ログ（Cloud Logging の jsonPayload 形式）
  ratelimit.py  IP単位の簡易レート制限
frontend/       スマホ前提の単一ページUI（依存ライブラリなし）
Dockerfile      Cloud Run 用
```

- 実行基盤: **Cloud Run**
- AI: **Gemini API**（`google-genai` SDK、構造化出力で `response_schema` にPydanticモデルを渡す）
- 進行表示: Server-Sent Events。生成完了まで待たせず、思考の各段をその場で出す

## 動かす

```bash
pip install -r requirements.txt
uvicorn main:app --app-dir backend --port 8080
```

http://localhost:8080 を開く。

### 環境変数

| 変数 | 既定 | 説明 |
|---|---|---|
| `GEMINI_API_KEY` | なし | 未設定でもデモモードで動作する（後述） |
| `GEMINI_MODEL` | `gemini-3.5-flash` | `gemini-2.5-flash` は提供終了済みのため使用しない |
| `DEMO_HOUR` | Dockerfileで`14` | 営業時間判定に使う時刻の固定値。空にすると実時刻 |
| `LLM_TIMEOUT_SEC` | `5` | Gemini 1呼び出しあたりの打ち切り時間。超過時はフォールバック |
| `RATE_MAX_CALLS` | `10` | 1IPあたりの上限回数 |
| `RATE_WINDOW_SEC` | `60` | レート制限の集計窓（秒） |

### デモモード

`GEMINI_API_KEY` が未設定でも、ルールベースのフォールバックで同じ4段ループが動く。
審査時に認証やAPIキーなしで挙動を確認できるようにするための措置で、
UI上部に「デモモード」と明示される。
APIキーを設定すると1段目と3段目がGeminiに切り替わる。

`DEMO_HOUR` を固定しているのは、深夜に開かれても営業時間フィルタで
候補が全滅してデモにならない事態を避けるため。

## Cloud Run へのデプロイ

APIキーは `--set-env-vars` で渡さないこと。シェル履歴とサービス設定に平文で残り、
プロジェクトの閲覧権限を持つ全員から見える。Secret Manager 経由で渡す。

```bash
# 1. キーをSecret Managerに登録
echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-

# 2. デプロイ（キーはシークレット参照、費用の上限として max-instances を必ず設定）
gcloud run deploy reverse-concierge \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --max-instances 3 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars GEMINI_MODEL=gemini-3.5-flash
```

### 公開時のコスト保護

`--allow-unauthenticated` で公開する以上、URLを知る第三者が Gemini 呼び出しを
発生させられる。以下を併用して費用の上限を作る。

- `--max-instances` でインスタンス数を固定する（上記で設定済み）
- Google Cloud コンソールで Gemini API 側のクォータ上限を設定する
- アプリ側の `RATE_MAX_CALLS` によるIP単位の制限（既定10回/分）

アプリ側のレート制限はインスタンスごとのメモリ上のカウンタなので、
複数インスタンスにスケールすると実効上限はインスタンス数倍になる。
`--max-instances` との併用が前提の設計で、厳密な制限が要る場合は
Cloud Armor か Memorystore に寄せる。

## 現時点の制約

プロトタイプとして、以下は意図的に未実装。

- **スポット情報は `catalog.py` のサンプルデータ**（京都・東山周辺、営業時間と料金は概算）。
  本番では Google Places API 等の実データに差し替える前提で、同じ形に揃えてある
- 気象・運行情報APIとの連携（F-01の自動検知）は未接続。現在はユーザーのワンタップ申告で起動する
- 予約・配車の実行（F-04）は未実装。提案までを対象範囲としている
- 移動時間はカタログ上の固定値で、経路探索は行っていない

## 可観測性とKPI計測

各段の所要時間と判定結果を、Cloud Logging がそのまま取り込める JSON で stdout に出す。

```json
{"severity":"INFO","message":"stage.verify","request_id":"559180923b70","stage":"verify","duration_ms":0.1,"passed":3,"failed":0}
{"severity":"INFO","message":"recover.done","request_id":"559180923b70","elapsed_ms":0.7,"plans_delivered":3,"repaired":0,"rejected":0}
```

要件定義書のKPIは以下のログから算出する。

| KPI | 算出元 |
|---|---|
| トラブル解決率（採用率） | `plan.adopted` の件数 ÷ `recover.done` の件数 |
| Time to Recovery | `recover.done` の `elapsed_ms`（提示まで）と `plan.adopted` の `time_to_recovery_ms`（採用まで） |

`plan.adopted` はプランカードの「このプランにする」から `POST /api/adopt` で記録される。
プロトタイプでは構造化ログに出すのみで、BigQuery 等への蓄積は未実装。

## 検証済みの動作

- 4種のトラブル（雨・運休・混雑・体調不良）で重複のない3案が生成される
- 自己検証が弾く4パターン（存在しないスポットID・制約外スポット・時間超過・営業時間外）
- 残り時間30分で初回3案が全て不合格になり、自己修正で3案とも成立する形に回復する
- `note` が200文字を超えると422で拒否される
- 同一IPから上限を超えると429を返す
- Gemini呼び出しのタイムアウト・応答不正時にルールベースへフォールバックする
  （`resp.parsed` が `None` のケースを含む）
