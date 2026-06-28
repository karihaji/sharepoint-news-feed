# 広報ニュースフィード

SharePoint埋め込み用の軽量ニュースフィードです。RSS / GoogleニュースRSSを取得して `data/news.json` を生成し、GitHub Pages上の `/compact/` と `/list/` で表示します。

## ローカル実行

```bash
npm install
npm run fetch-news
npm run serve
```

起動後、以下を確認します。

- compact版: `http://127.0.0.1:4173/compact/`
- list版: `http://127.0.0.1:4173/list/`

## SharePoint埋め込みパス

- トップページ用: `/compact/`
- 一覧ページ用: `/list/`

`config/site.json` の `moreLinkUrl` にSharePoint側の一覧ページURLを設定すると、compact版に「もっと見る ↗」が表示されます。

## GitHub Pages

1. このフォルダの内容をGitHubリポジトリへ配置します。
2. GitHub Pagesを有効化します。
3. Actionsの `Fetch News` を手動実行すると `data/news.json` が更新されます。
4. 以後はJST 09:00 / 15:00に自動更新されます。

## 設定

- ニュース取得元: `config/sources.json`
- カテゴリ: `config/categories.json`
- 表示件数やSharePoint側一覧URL: `config/site.json`
