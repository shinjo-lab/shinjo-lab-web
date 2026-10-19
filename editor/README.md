# 研究室サイトの管理画面

デモと同じ、左のフォーム・右の即時プレビューで編集します。メンバー増減、写真、ニュースをGitHubに保存できます。

## 接続

1. RenderでこのリポジトリのWeb Serviceを作成します。Node 22、ビルド `node --version`、起動 `node editor/server.mjs`。初回は作業ブランチ `codex/member-news-cms` を使ってください。
2. 組織所有のGitHub Appを作成します。Homepage URLは管理画面のURL。Device flowを有効にします。Webhookは無効。Repository ContentsをRead and write、MetadataをRead-onlyに設定し、shinjo-lab-webだけにインストールします。他の権限は不要です。
3. Renderの環境変数 `GITHUB_CLIENT_ID` に、このGitHub Appの公開Client IDを設定します。秘密鍵やClient Secretは使いません。
4. `EDIT_BRANCH=codex/member-news-cms` で試用します。保存はこのブランチだけに反映され、本番を変更しません。
5. 本番への移行を確認したあとにPRをマージし、Renderのデプロイ対象ブランチと `EDIT_BRANCH` をmainへ切り替えます。

Renderでは `RENDER_EXTERNAL_URL` を送信元の検証に利用します。独自ドメインを使う場合は `APP_ORIGIN=https://管理画面のホスト名` を指定します。

## ログインと権限

「GitHubでログインする」→表示されたコードをGitHubに入力→アプリの権限を承認、の流れです。GitHub Appをインストールしている対象リポジトリに、ユーザー自身が書き込み権限を持つ場合だけ編集できます。

GitHubトークンはサーバーのメモリだけに保持し、ブラウザやlocalStorage、公開リポジトリに保存しません。CookieにはランダムなセッションIDのみを保存します。セッションは最大7時間で切れます。サーバー再起動・無料サービスの休止後にはログインし直します。1インスタンスで運用してください。

一般の閲覧者はログイン画面までアクセスできますが、記事データの管理APIや保存処理にはアクセスできません。保存のたびにGitHub側の編集権限を確認します。

## 保存

- 全一覧のJSON、写真、公開用HTMLを1つのGitコミットで保存します。
- 先に他の更新があった場合は409で拒否し、上書きしません。未保存の入力は画面に残ります。
- 名前とニュースのタイトル・掲載日・本文・カテゴリを検証します。
- 写真はJPEG/PNG/WebP/GIF、1枚3MB、1回12枚・合計12MBまでです。
- 写真を外したり人物を削除しても、過去のGit履歴と画像ファイル自体は残ります。個人情報の完全削除は別途対応してください。
- 保存中は操作を止め、重複送信を抑止します。通信失敗時には自動再送しません。結果が不明な場合、GitHubの履歴または再読み込みで確認してください。
- mainに保存した場合、GitHub Pagesのデプロイ完了後に公開サイトへ反映されます。専用の下書き・承認ワークフローではありません。

## 開発

`node --test editor/tests/*.test.mjs` と `node --test tests/content.test.cjs` をリポジトリルートで実行します。
ローカルは `node editor/server.mjs` でポート8770に起動します。`GITHUB_CLIENT_ID` が未設定ならログインを503で拒否し、保護を迂回するデモモードはありません。

認証方式: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
