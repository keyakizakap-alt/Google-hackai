# Cloud Build の設定（main への push で、検査を通った版だけを Cloud Run に出す）

リポジトリ直下の `cloudbuild.yaml` を使うように、Cloud Build のトリガーを設定する手順。すべてコンソール（ブラウザ）で行える。
**権限（IAM）の作成・付与と課金に関わる操作なので、実行する人が判断すること。**

## 何が良くなるか

| 観点 | 内容 |
|---|---|
| 完全性 | 脆弱性・lint・型・テストの検査を通ったものだけをデプロイする。トリガーは main だけで動き、PR では動かない |
| 機密性 | ビルドは専用のサービスアカウントで、必要最小限の権限だけで動く。秘密の値はビルドで扱わない |
| 可用性・信頼性 | 新しい版はまず「候補」として起動し、起動確認（`/api/health` と署名用の秘密の有無）に通ってから利用者のアクセスを切り替える。失敗しても今の版が動き続ける |
| 保守性 | 手順はファイルで管理し、PR でレビューできる。イメージにコミット ID を付けるので、どの版が動いているか分かり、正確に戻せる |

## 1. Artifact Registry のリポジトリ名を確かめる

コンソール →「Artifact Registry」→ リージョン `asia-northeast1` のリポジトリ一覧を見る。

- `cloud-run-source-deploy` があれば、そのままでよい（Cloud Run のソースデプロイや継続的デプロイが作るリポジトリ）
- 別の名前なら、手順 3 のトリガーの「代入変数」で `_AR_REPO` にその名前を入れる

## 2. ビルド専用のサービスアカウントを作る

1. 「IAM と管理」→「サービス アカウント」→「サービス アカウントを作成」
   - 名前: `oshiready-builder`（説明: 「Cloud Build で OshiReady をビルド・デプロイする」）
   - この画面ではロールを付けずに「完了」
2. 権限は、**必要な場所にだけ**付ける

| 付ける場所 | ロール | 理由 |
|---|---|---|
| Cloud Run →「oshiready」→「権限」（または「セキュリティ」）→「プリンシパルを追加」 | **Cloud Run デベロッパー** | このサービスだけをデプロイ・切り替えできる |
| 「IAM と管理」→「サービス アカウント」→ `oshiready-runtime` →「アクセス権を持つプリンシパル」（権限）→「アクセス権を付与」 | **サービス アカウント ユーザー** | デプロイ時に、実行用アカウントをそのまま使えるようにする（プロジェクト全体には付けない） |
| 「Artifact Registry」→ 手順 1 のリポジトリ →「権限」→「プリンシパルを追加」 | **Artifact Registry 書き込み** | このリポジトリにだけイメージを置ける |
| 「IAM と管理」→「IAM」→「アクセス権を付与」 | **ログ書き込み** | ビルドのログを Cloud Logging に書く |

サービスアカウントの「鍵」は作らない（Cloud Build は鍵なしで使える）。

## 3. トリガーを `cloudbuild.yaml` に切り替える

「Cloud Build」→「トリガー」→（継続的デプロイで作られたトリガー、または新規作成）→「編集」

| 項目 | 値 |
|---|---|
| リージョン | `asia-northeast1`（制限で使えない場合は `global`） |
| イベント | ブランチに push する |
| ブランチ | `^main$` |
| 構成 | **Cloud Build 構成ファイル（YAML または JSON）**、場所はリポジトリ、ファイルの場所 `/cloudbuild.yaml` |
| 代入変数 | 既定のままでよい（手順 1 で名前が違った場合だけ `_AR_REPO`） |
| 承認 | 提出前はオフ。**提出後はオン**（承認するまでビルドが始まらない） |
| サービス アカウント | `oshiready-builder` |

- **PR で動くトリガーは作らない。** 公開リポジトリでは誰でも PR を出せるため、他人のコードがビルド用の権限で動いてしまう。PR の検査は GitHub Actions の CI が行う。
- 保存したら、トリガーの「実行」で main を一度ビルドして確かめる。

## 4. 動作を確かめる

- 「Cloud Build」→「履歴」で、10 のステップ（install〜promote）がすべて緑になる
- 「Cloud Run」→「oshiready」→「リビジョン」で、新しいリビジョン（タグ `candidate`）にトラフィックが 100% 向いている
- アプリを開いて動くこと

## 5. 古いイメージを自動で整理する

「Artifact Registry」→ 手順 1 のリポジトリ →「編集」→「クリーンアップ ポリシー」

- 種類「**最新バージョンを保持**」、保持する数 `10`
- 反映には約 1 日かかる。不安なら先に「ドライラン」で対象を確かめる

脆弱性スキャン（任意）は、新しいイメージごとに 1 回 $0.26（同じイメージの再スキャンは無料）。

## 6. 問題が起きたときに戻す

「Cloud Run」→「oshiready」→「リビジョン」→ 1 つ前のリビジョンの「︙」→「トラフィックを管理」で 100% にする。
イメージにはコミット ID のタグが付いているので、どの版に戻したかが分かる。

次のビルドが成功すると、最新の版にアクセスが戻る（`promote` が最新に切り替えるため）。戻したまま固定したいときは、トリガーの「承認」をオンにする。

## 7. 審査期間（提出後〜12/1）

- 審査は、提出時点のデフォルトブランチ（main）が対象。**main にマージしない**
- トリガーの「承認」をオンにする（またはトリガーを無効にする）
- 詳しくは [審査期間の運用](judging-period.md)

## うまくいかないとき

| 症状 | 確かめること |
|---|---|
| `PERMISSION_DENIED` | 手順 2 のロールが付いているか（反映に数分かかることがある） |
| ログの保存先に関するエラー | `cloudbuild.yaml` の `options.logging` が `CLOUD_LOGGING_ONLY` か |
| リポジトリが見つからない（`push` で失敗） | 手順 1 の名前と `_AR_REPO` |
| `smoke-test` で「設定が足りない」 | Cloud Run に `SESSION_SECRET` が渡っているか（[初回公開手順](cloud-run-launch.md) の「うまく動かないとき」） |
| `audit` で失敗 | 本番に入る部品に重大な脆弱性がある。Dependabot の提案、または `npm audit` の内容を確認して部品を更新する |

参考（公式）: [ユーザー指定のサービスアカウントでビルドする](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)、[Cloud Run の IAM ロール](https://docs.cloud.google.com/run/docs/reference/iam/roles)、[トリガーの作成と管理](https://cloud.google.com/build/docs/automating-builds/create-manage-triggers)、[クリーンアップ ポリシー](https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)、[Artifact Analysis の料金](https://cloud.google.com/artifact-analysis/pricing)
