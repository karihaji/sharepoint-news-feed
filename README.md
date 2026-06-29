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

## SharePoint埋め込みパーツ

SharePointの「埋め込み」Webパーツに、以下のiframeコードを貼り付けます。

### トップページ用 compact版

```html
<iframe
  title="広報ニュースフィード"
  src="https://karihaji.github.io/sharepoint-news-feed/compact/"
  width="100%"
  height="560"
  style="border:0; width:100%; max-width:100%;"
  loading="lazy">
</iframe>
```

### 一覧ページ用 list版

```html
<iframe
  title="広報ニュースフィード一覧"
  src="https://karihaji.github.io/sharepoint-news-feed/list/"
  width="100%"
  height="900"
  style="border:0; width:100%; max-width:100%;"
  loading="lazy">
</iframe>
```

スマホやSharePointの細いカラムでは、iframeの `width="100%"` を維持してください。高さは配置先のページに合わせて調整できます。

## GitHub Pages

1. このフォルダの内容をGitHubリポジトリへ配置します。
2. GitHub Pagesを有効化します。
3. Actionsの `Fetch News` を手動実行すると `data/news.json` が更新されます。
4. 以後はJST 09:00 / 15:00に自動更新されます。

## 設定

- ニュース取得元: `config/sources.json`
- カテゴリ: `config/categories.json`
- 表示件数やSharePoint側一覧URL: `config/site.json`
