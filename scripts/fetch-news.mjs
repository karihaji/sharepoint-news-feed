import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = path.join(ROOT, "config");
const DATA_DIR = path.join(ROOT, "data");
const NEWS_PATH = path.join(DATA_DIR, "news.json");
const MUST_READ_PATH = path.join(DATA_DIR, "must-read-today.json");
const MUST_READ_TRENDS_URL =
  "https://karihaji.github.io/sns-trend-buzzfeed/data/latest-trends.json";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "yclid",
  "mc_cid",
  "mc_eid"
]);

const DECORATION_WORDS = [
  "速報",
  "NEW",
  "New",
  "new",
  "ニュース",
  "News"
];

const MUST_READ_CATEGORY = {
  id: "must_read_today",
  label: "ピックアップ"
};

const MUST_READ_LIMIT = 18;
const MUST_READ_LOCAL_MIN = 10;
const MUST_READ_LOCAL_MAX = 13;
const MUST_READ_OTHER_MIN = 5;
const MUST_READ_OTHER_MAX = 8;
const MUST_READ_MIN_SCORE = 55;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const SOURCE_RANKS = [
  { pattern: /pref\.kagoshima|city\.|go\.jp|nhk|国土交通省|厚生労働省|デジタル庁|鹿児島県|鹿児島市/, rank: 1 },
  { pattern: /南日本新聞|南海日日|奄美新聞|MBC|KKB|KYT|KTS|NHKニュース|TBS NEWS DIG|373news|nankainn|amamishimbun|mbc\.co\.jp|kts-tv|kkb\.co\.jp|kyt-tv/, rank: 2 },
  { pattern: /Yahoo!ニュース|読売新聞|朝日新聞|産経ニュース|日テレNEWS|FNN|47NEWS/, rank: 3 },
  { pattern: /日本海事新聞|海事プレス|LOGISTICS TODAY|観光経済新聞|トラベルボイス|Funeco|窓の杜|INTERNET Watch|GIGAZINE/, rank: 4 },
  { pattern: /PR TIMES|prtimes/i, rank: 5 }
];

const SOURCE_NAME_ALIASES = [
  { pattern: /mbc\.co\.jp|MBC南日本放送|南日本放送|TBS NEWS DIG/, name: "MBC南日本放送" },
  { pattern: /373news\.com|南日本新聞/, name: "南日本新聞" },
  { pattern: /kts-tv\.co\.jp|KTS鹿児島テレビ|鹿児島テレビ/, name: "KTS鹿児島テレビ" },
  { pattern: /kkb\.co\.jp|KKB鹿児島放送|鹿児島放送/, name: "KKB鹿児島放送" },
  { pattern: /kyt-tv\.com|KYT鹿児島読売テレビ|鹿児島読売テレビ/, name: "KYT鹿児島読売テレビ" },
  { pattern: /amamishimbun\.co\.jp|奄美新聞/, name: "奄美新聞" },
  { pattern: /nankainn\.com|南海日日新聞|南海日日/, name: "南海日日新聞" },
  { pattern: /www3\.nhk\.or\.jp\/lnews\/kagoshima|NHK鹿児島放送局/, name: "NHK鹿児島放送局" }
];

const OFF_TARGET_PREFECTURE_PATTERN =
  /北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|沖縄/;

const EXCLUDE_PATTERNS = [
  /逮捕|犯罪|裁判|殺人|詐欺|窃盗|強盗|送検|起訴|有罪|容疑/,
  /無断|盗難|盗ん|停職|懲戒|戒告|減給|処分|摘発/,
  /死亡|遺体|重体|意識不明/,
  /ゴシップ|炎上|不倫|熱愛|離婚/,
  /選挙ドットコム|市議活動報告|活動報告/,
  /秋田犬新聞|東奥日報|山陰中央新報|新宮営業所|熊野第一交通|和歌山|消費減税|政党支持率|参院選|衆院選|東証|日経平均|南阿蘇|Fukuoka|Growth Next/,
  /メッシュルーター|ゲーミング|ヘッドセット|ノイズキャンセリング|生パスタ|石焼き|グルメ|ランチ|スイーツ|カフェ|ケーキ|チーズケーキ/,
  /Vietnam\.vn|マイ・トゥイ/,
  /試合結果|勝敗|サヨナラ勝ち|高校野球|高校総体|県下一周駅伝|駅伝|インターハイ|大リーグ|メジャーリーグ|MLB/,
  /募金|寄付/,
  /収支|実戦|打ってみた|スペック紹介|新台スケジュールだけ|設定差/,
  /映画|ドラマ|アニメ|漫画|感想|レビュー|占い|小説|連載|福袋/,
  /グラビア|アイドル|芸能|タレント|女優|俳優|熱愛|結婚発表/,
  /広告を募集|広告募集/
];

const EXCLUDE_EXCEPTIONS = [
  /通行止め|運休|欠航|遅延|復旧|規制解除|警報|避難|注意喚起|インフラ|燃料|運賃|病害虫|サイバー|業務停止|航路|物流|港湾|空港/
];

const REGIONS = [
  { id: "tanegashima", pattern: /種子島|西之表|中種子|南種子|種子島空港|西之表港|種子島宇宙センター/ },
  { id: "yakushima", pattern: /屋久島|屋久島町|宮之浦|安房|屋久島空港|種子屋久/ },
  { id: "amami", pattern: /奄美|奄美大島|名瀬|喜界|喜界町|徳之島|天城町|伊仙|和泊|知名|沖永良部|与論|大和村|宇検|瀬戸内町|龍郷|笠利/ },
  { id: "kagoshima_city", pattern: /鹿児島市|小山田|照国|仙巌園|アミュ|鹿児島空港|谷山|天文館|桜島/ },
  { id: "kagoshima", pattern: /鹿児島|薩摩|大隅|南九州|鹿児島県|薩摩川内|川内|霧島|鹿屋|肝付|指宿|枕崎|南さつま|南九州|日置|いちき串木野|阿久根|出水|伊佐|姶良|垂水|曽於|志布志|大崎町|東串良|錦江|南大隅|さつま町|湧水|長島町|山形屋/ }
];

const BUSINESS_CATEGORIES = [
  { id: "shipping", pattern: /フェリー|航路|海運|港湾|船舶|旅客船|内航|港|船員|車両航送/ },
  { id: "transport", pattern: /タクシー|配車|ライドシェア|地域交通|交通空白|MaaS|デマンド交通|乗合|通行止め|交通規制|道路/ },
  { id: "tourism", pattern: /観光|旅行|ホテル|宿泊|インバウンド|世界自然遺産|誘客|周遊|イベント/ },
  { id: "bowling", pattern: /ボウリング|プロボウリング|JPBA|JBC/ },
  { id: "pachinko", pattern: /パチンコ|パチスロ|遊技|ホール|スマパチ|スマスロ/ },
  { id: "care", pattern: /介護|福祉|高齢者|認知症|見守り|ケアマネ/ },
  { id: "energy", pattern: /ガソリン|燃料|エネルギー|電気料金|石油|給油/ },
  { id: "real_estate", pattern: /不動産|施設運営|商業施設|店舗|出店|開業/ },
  { id: "recruiting", pattern: /採用|人材|雇用|賃上げ|労務|人手不足|後継者|事業承継/ },
  { id: "dx", pattern: /DX|AI|生成AI|ChatGPT|システム|アプリ|SaaS|クラウド|セキュリティ|サイバー|デジタル/ },
  { id: "marketing", pattern: /広報|マーケティング|SNS|販促|ブランド|PR|キャンペーン/ },
  { id: "management", pattern: /制度|法改正|補助金|行政施策|経営|料金体系|手数料|運賃|価格改定/ },
  { id: "safety", pattern: /安全|防災|BCP|警報|避難|熱中症|災害|地震|震度|インフラ障害|病害虫/ }
];

const IMPACT_RULES = [
  { pattern: /運休|欠航|通行止め|交通規制|警報|避難|規制解除|復旧|インフラ障害/, score: 30, tag: "traffic_or_alert" },
  { pattern: /運賃|料金|手数料|価格改定|燃料/, score: 25, tag: "fare_or_fee_change" },
  { pattern: /開始|提供開始|新サービス|新制度|導入|開業|実証/, score: 18, tag: "new_service_or_policy" },
  { pattern: /人材|採用|雇用|労務|人手不足|後継者|事業承継/, score: 15, tag: "workforce" },
  { pattern: /安全|防災|BCP|熱中症|地震|震度|病害虫|注意喚起/, score: 18, tag: "safety" },
  { pattern: /DX|AI|システム|アプリ|省人化|業務改善|効率化|セキュリティ/, score: 15, tag: "dx" },
  { pattern: /観光|商品造成|世界自然遺産|誘客|周遊|地域ブランド/, score: 12, tag: "tourism_or_brand" },
  { pattern: /連携|協働|共同|包括協定|地域連携|企業連携/, score: 10, tag: "partnership" }
];

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; SharePointNewsFeed/1.0)"
  }
});

async function main() {
  const [sources, site] = await Promise.all([
    readJson(path.join(CONFIG_DIR, "sources.json")),
    readJson(path.join(CONFIG_DIR, "site.json"))
  ]);

  const capturedAt = formatJstDateTime(new Date());
  const activeSources = sources.filter((source) => source.active !== false);
  const rawItems = [];
  let successfulSources = 0;

  for (const source of activeSources) {
    try {
      const feedUrl = getFeedUrl(source);
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items ?? [])
        .map((item) => toNewsItem(item, source, feed, capturedAt))
        .filter(Boolean);

      rawItems.push(...items);
      successfulSources += 1;
      console.log(`[ok] ${source.id}: ${items.length} items`);
    } catch (error) {
      console.error(`[error] ${source.id}: ${error.message}`);
    }
  }

  const merged = mergeDuplicates(rawItems);
  const limited = applyLimits(merged, site).map(stripInternalFields);

  if (successfulSources === 0 || limited.length === 0) {
    console.error("No news items were fetched. Existing data/news.json was left untouched.");
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    NEWS_PATH,
    `${JSON.stringify({ updatedAt: capturedAt, items: limited }, null, 2)}\n`,
    "utf8"
  );

  const trends = await loadTrendItems();
  const mustRead = buildMustReadToday(limited, capturedAt, trends);
  await fs.writeFile(MUST_READ_PATH, `${JSON.stringify(mustRead, null, 2)}\n`, "utf8");

  console.log(`Wrote ${limited.length} items to ${path.relative(ROOT, NEWS_PATH)}`);
  console.log(`Wrote ${mustRead.items.length} items to ${path.relative(ROOT, MUST_READ_PATH)}`);
}

function getFeedUrl(source) {
  if (source.type === "google_news_search") {
    return buildGoogleNewsRssUrl(source.query ?? "");
  }

  if (source.type === "rss" && source.url) {
    return source.url;
  }

  throw new Error(`Unsupported source type or missing URL: ${source.type}`);
}

function buildGoogleNewsRssUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
}

function toNewsItem(item, source, feed, capturedAt) {
  const titleParts = splitTitleAndSource(cleanText(item.title), source.type);
  const title = titleParts.title;
  const link = cleanText(item.link ?? item.guid);
  const url = normalizeUrl(link);

  if (!title || !url) {
    return null;
  }

  const publishedDate = parseDate(item.isoDate ?? item.pubDate ?? item.published ?? item.updated);
  const publishedAt = formatDateOnly(publishedDate);
  const rawSourceName = cleanText(
    item.source?.title ||
      item.source ||
      titleParts.source ||
      source.source ||
      feed.title ||
      ""
  );
  const sourceName = normalizeSourceName(rawSourceName, url, source);
  const groupKey = normalizeTitle(title);
  const searchText = normalizeSearchText(`${title} ${sourceName} ${url}`);

  if (!passesSourceFilters(searchText, source)) {
    return null;
  }

  return {
    id: createId(url || groupKey),
    category: source.category,
    title,
    source: sourceName,
    publishedAt,
    url,
    capturedAt,
    groupKey,
    relatedSources: [],
    _date: publishedDate,
    _priority: Number(source.priority ?? 0),
    _sourceId: source.id
  };
}

function passesSourceFilters(searchText, source) {
  const includeKeywords = source.includeKeywords ?? [];
  const excludeKeywords = source.excludeKeywords ?? [];

  if (isOffTargetLocalEarthquake(searchText, source)) {
    return false;
  }

  if (excludeKeywords.some((keyword) => searchText.includes(normalizeSearchText(keyword)))) {
    return false;
  }

  if (includeKeywords.length === 0) {
    return true;
  }

  return includeKeywords.some((keyword) => searchText.includes(normalizeSearchText(keyword)));
}

function normalizeSourceName(sourceName, url, source) {
  const sourceText = `${sourceName} ${url} ${source.source ?? ""}`;
  const alias = SOURCE_NAME_ALIASES.find((entry) => entry.pattern.test(sourceText));
  return alias?.name ?? sourceName;
}

function isOffTargetLocalEarthquake(searchText, source) {
  if (source.category !== "local" || !/地震|震度/.test(searchText)) {
    return false;
  }

  const isLocalRegion = REGIONS.some((region) => region.pattern.test(searchText));
  return !isLocalRegion && OFF_TARGET_PREFECTURE_PATTERN.test(searchText);
}

function splitTitleAndSource(title, sourceType) {
  if (sourceType !== "google_news_search") {
    return { title, source: "" };
  }

  const parts = title.split(/\s+-\s+/);
  if (parts.length < 2) {
    return { title, source: "" };
  }

  const source = parts.at(-1);
  const cleanedTitle = parts.slice(0, -1).join(" - ").trim();
  return {
    title: cleanedTitle || title,
    source: source || ""
  };
}

function mergeDuplicates(items) {
  const byUrl = new Map();

  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing) {
      byUrl.set(item.url, item);
      continue;
    }

    const winner = chooseRepresentative(existing, item);
    const loser = winner === existing ? item : existing;
    addRelatedSource(winner, loser.source);
    byUrl.set(item.url, winner);
  }

  const sorted = [...byUrl.values()].sort(compareNews);
  const merged = [];

  for (const item of sorted) {
    const duplicate = merged.find((candidate) => isSameTopic(candidate, item));
    if (duplicate) {
      const winner = chooseRepresentative(duplicate, item);
      const loser = winner === duplicate ? item : duplicate;
      addRelatedSource(winner, loser.source);

      if (winner !== duplicate) {
        const index = merged.indexOf(duplicate);
        merged[index] = winner;
      }
      continue;
    }

    merged.push(item);
  }

  return merged.sort(compareNews);
}

function chooseRepresentative(a, b) {
  if (a._priority !== b._priority) {
    return a._priority > b._priority ? a : b;
  }

  const dateDiff = b._date.getTime() - a._date.getTime();
  if (dateDiff !== 0) {
    return dateDiff > 0 ? b : a;
  }

  const aUsefulTitle = a.title.length >= 12;
  const bUsefulTitle = b.title.length >= 12;
  if (aUsefulTitle !== bUsefulTitle) {
    return aUsefulTitle ? a : b;
  }

  return a.title.length <= b.title.length ? a : b;
}

function isSameTopic(a, b) {
  if (a.category !== b.category) {
    return false;
  }

  const hours = Math.abs(b._date.getTime() - a._date.getTime()) / 36e5;
  if (hours > 72) {
    return false;
  }

  if (a.groupKey && a.groupKey === b.groupKey) {
    return true;
  }

  return jaccard(tokenize(a.groupKey), tokenize(b.groupKey)) >= 0.62;
}

function applyLimits(items, site) {
  const categoryLimit = Number(site.categoryLimit ?? 20);
  const listLimit = Number(site.listLimit ?? 80);
  const minPerCategory = Number(site.minPerCategory ?? 0);
  const localRecentLimit = Number(site.localRecentLimit ?? Math.min(20, categoryLimit));
  const perCategoryCounts = new Map();
  const selectedIds = new Set();
  const selected = [];
  const sorted = items.sort(compareNews);
  const categoryIds = [...new Set(sorted.map((item) => item.category))];
  const localItemsByDate = sorted
    .filter((item) => item.category === "local")
    .sort(compareNewsDateFirst);

  const localMinimums = [
    { pattern: /屋久島|屋久島町|宮之浦|安房/, limit: 8 },
    { pattern: /種子島|西之表|中種子|南種子/, limit: 8 }
  ];

  for (const item of localItemsByDate.slice(0, localRecentLimit)) {
    addSelectedItem(item, {
      selected,
      selectedIds,
      perCategoryCounts,
      categoryLimit,
      listLimit
    });
  }

  for (const group of localMinimums) {
    const candidates = localItemsByDate.filter((item) => group.pattern.test(item.title));

    for (const item of candidates.slice(0, group.limit)) {
      addSelectedItem(item, {
        selected,
        selectedIds,
        perCategoryCounts,
        categoryLimit,
        listLimit
      });
    }
  }

  for (const categoryId of categoryIds) {
    const categoryItems =
      categoryId === "local"
        ? localItemsByDate
        : sorted.filter((item) => item.category === categoryId);

    for (const item of categoryItems.slice(0, Math.min(minPerCategory, categoryLimit))) {
      addSelectedItem(item, {
        selected,
        selectedIds,
        perCategoryCounts,
        categoryLimit,
        listLimit
      });
    }
  }

  for (const item of sorted) {
    if (selected.length >= listLimit) {
      break;
    }

    if (selectedIds.has(item.id)) {
      continue;
    }

    const count = perCategoryCounts.get(item.category) ?? 0;
    if (count >= categoryLimit) {
      continue;
    }

    selected.push(item);
    selectedIds.add(item.id);
    perCategoryCounts.set(item.category, count + 1);
  }

  return selected.sort(compareNews);
}

function addSelectedItem(item, limits) {
  const { selected, selectedIds, perCategoryCounts, categoryLimit, listLimit } = limits;

  if (selected.length >= listLimit || selectedIds.has(item.id)) {
    return false;
  }

  const count = perCategoryCounts.get(item.category) ?? 0;
  if (count >= categoryLimit) {
    return false;
  }

  selected.push(item);
  selectedIds.add(item.id);
  perCategoryCounts.set(item.category, count + 1);
  return true;
}

async function loadTrendItems() {
  try {
    const response = await fetch(MUST_READ_TRENDS_URL);
    if (!response.ok) {
      console.warn(`[warn] latest trends unavailable: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.warn(`[warn] latest trends unavailable: ${error.message}`);
    return [];
  }
}

function buildMustReadToday(items, capturedAt, trends) {
  const runDate = capturedAt.slice(0, 10);
  const yesterday = formatDateOnly(new Date(Date.parse(`${runDate}T00:00:00+09:00`) - ONE_DAY_MS));
  const trendKeywords = extractTrendKeywords(trends);
  const evaluated = items
    .filter((item) => isValidMustReadItem(item))
    .filter((item) => isEligibleMustReadDate(item, runDate, yesterday) || isFallbackMustReadDate(item, runDate))
    .filter((item) => !isExcludedMustReadItem(item))
    .map((item) => evaluateMustReadItem(item, runDate, yesterday, trendKeywords))
    .filter((item) => item.score >= MUST_READ_MIN_SCORE)
    .sort(compareMustReadCandidates);

  const deduped = deduplicateMustRead(evaluated);
  const selected = selectBalancedMustRead(deduped);

  return {
    updatedAt: capturedAt,
    category: MUST_READ_CATEGORY,
    count: selected.length,
    items: selected.map((item, index) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      source: item.source,
      publishedAt: item.publishedAt,
      url: item.url,
      originalCategory: item.category,
      businessCategory: item.businessCategory,
      region: item.region,
      selectionRole: item.selectionRole,
      score: item.score,
      groupKey: item.groupKey
    }))
  };
}

function isValidMustReadItem(item) {
  return Boolean(item?.id && item.title && item.source && item.publishedAt && item.url && item.category);
}

function isEligibleMustReadDate(item, today, yesterday) {
  if (item.publishedAt === today || item.publishedAt === yesterday) {
    return true;
  }

  const ageDays = Math.floor(
    (Date.parse(`${today}T00:00:00+09:00`) - Date.parse(`${item.publishedAt}T00:00:00+09:00`)) /
      ONE_DAY_MS
  );
  return ageDays >= 2 && ageDays <= 3 && isExceptionalRecentItem(item);
}

function isExceptionalRecentItem(item) {
  return /法改正|制度|運賃|料金|航路|新サービス|提供開始|行政|発表|導入|開業|実証|補助金/.test(
    mustReadText(item)
  );
}

function isFallbackMustReadDate(item, today) {
  const ageDays = getPublishedAgeDays(item, today);
  return ageDays >= 2 && ageDays <= 7;
}

function getPublishedAgeDays(item, today) {
  return Math.floor(
    (Date.parse(`${today}T00:00:00+09:00`) - Date.parse(`${item.publishedAt}T00:00:00+09:00`)) /
      ONE_DAY_MS
  );
}

function isExcludedMustReadItem(item) {
  const text = mustReadText(item);
  if (/募金|寄付/.test(text)) {
    return true;
  }
  if (/Vietnam\.vn|マイ・トゥイ/.test(text)) {
    return true;
  }
  if (isIncompleteMustReadTitle(item)) {
    return true;
  }
  if (isOffTargetLocalMustReadItem(item)) {
    return true;
  }
  if (EXCLUDE_EXCEPTIONS.some((rule) => rule.test(text))) {
    return false;
  }
  return EXCLUDE_PATTERNS.some((rule) => rule.test(text));
}

function isIncompleteMustReadTitle(item) {
  return /\.{3}|…{2,}|…$/.test(item.title) || normalizeTitle(item.title).length < 12;
}

function isOffTargetLocalMustReadItem(item) {
  const text = mustReadText(item);
  if (item.category !== "local") {
    return false;
  }
  return !classifyRegion(text) && OFF_TARGET_PREFECTURE_PATTERN.test(text);
}

function isWeakMustReadCandidate(item) {
  const text = mustReadText(item);
  const hasRegion = item.region && item.region !== "none";

  if (/大相撲|大の里|豊昇龍|安青錦|サッカー|プロ野球|Jリーグ|Bリーグ|快勝|４強|4強|シード破る/.test(text)) {
    return true;
  }

  if (/最高\d+℃|朝版|夕版|天気|軽トラ|サンバー|カッコよすぎる/.test(text)) {
    return true;
  }

  if (!hasRegion && isTrustedLocalSource(item.source)) {
    return true;
  }

  if (!hasRegion && /海外|米国|中国|欧州|世界|ウクライナ|インドネシア/.test(text)) {
    return true;
  }

  if (!hasRegion && /事故|事件|搬送|けが|火災|沈没/.test(text) && !isHighImpactMustRead(item)) {
    return true;
  }

  return false;
}

function evaluateMustReadItem(item, today, yesterday, trendKeywords) {
  const text = mustReadText(item);
  const region = classifyRegion(text);
  const businessCategory = classifyBusinessCategory(item, text);
  const mustReadAgeDays = getPublishedAgeDays(item, today);
  const matchedRules = [];
  let score = 0;

  if (item.publishedAt === today) {
    score += 55;
    matchedRules.push("published_today");
  } else if (item.publishedAt === yesterday) {
    score += 8;
    matchedRules.push("published_yesterday");
  } else {
    score += 0;
    matchedRules.push("exceptional_recent");
  }

  if (region) {
    score += ["tanegashima", "yakushima", "amami"].includes(region) ? 28 : 25;
    matchedRules.push(`region_${region}`);
  } else if (isTrustedLocalSource(item.source)) {
    score += 12;
    matchedRules.push("trusted_local_source");
  }

  if (businessCategory !== "other") {
    score += 30;
    matchedRules.push(`business_${businessCategory}`);
  }

  if (isCrossBusiness(text, businessCategory)) {
    score += 18;
    matchedRules.push("cross_business");
  }

  for (const rule of IMPACT_RULES) {
    if (rule.pattern.test(text)) {
      score += rule.score;
      matchedRules.push(rule.tag);
    }
  }

  if (getSourceRank(item.source) === 1) {
    score += 12;
    matchedRules.push("primary_source");
  } else if (getSourceRank(item.source) === 2) {
    score += 8;
    matchedRules.push("local_major_source");
  }

  const trendMatches = trendKeywords.filter((keyword) => keyword && text.includes(keyword));
  if (trendMatches.length > 0) {
    score += Math.min(12, trendMatches.length * 4);
    matchedRules.push("trend_match");
  }

  if (/PR TIMES|プレスリリース|キャンペーン|販売開始/.test(text)) {
    score -= 10;
    matchedRules.push("pr_penalty");
  }
  if (/衝撃|まさか|ヤバい|驚き|!?|！？/.test(text)) {
    score -= 20;
    matchedRules.push("sensational_penalty");
  }
  if (/海外|米国|中国|欧州|世界市場/.test(text) && !region) {
    score -= 15;
    matchedRules.push("overseas_penalty");
  }

  const selectionRole = classifySelectionRole(region, businessCategory, text, item.source);
  return {
    ...item,
    businessCategory,
    region: region || "none",
    selectionRole,
    mustReadAgeDays,
    score,
    matchedRules
  };
}

function extractTrendKeywords(trends) {
  return trends
    .map((item) => cleanText(item.keyword || item.sourceHeadline || item.observationSeed || ""))
    .filter((value) => value.length >= 2)
    .slice(0, 20);
}

function classifyRegion(text) {
  return REGIONS.find((region) => region.pattern.test(text))?.id ?? "";
}

function classifyBusinessCategory(item, text) {
  if (item.category === "shipping") return "shipping";
  if (item.category === "transport") return "transport";
  if (item.category === "care") return "care";
  if (item.category === "pachinko") return "pachinko";
  if (item.category === "bowling") return "bowling";
  if (item.category === "ai_it") return "dx";
  return BUSINESS_CATEGORIES.find((category) => category.pattern.test(text))?.id ?? "other";
}

function classifySelectionRole(region, businessCategory, text, sourceName) {
  const roles = [];
  if (region || isTrustedLocalSource(sourceName)) roles.push("local");
  if (businessCategory !== "other") roles.push("direct_business");
  if (isCrossBusiness(text, businessCategory)) roles.push("cross_business");
  return roles.length > 0 ? roles.join("_and_") : "other";
}

function isCrossBusiness(text, businessCategory) {
  if (["dx", "recruiting", "management", "safety", "energy", "marketing"].includes(businessCategory)) {
    return true;
  }
  return /採用|人手不足|賃上げ|労務|法改正|制度|補助金|熱中症|防災|BCP|サイバー|生成AI|DX|キャッシュレス|燃料|物価/.test(
    text
  );
}

function deduplicateMustRead(items) {
  const selected = [];
  for (const item of items) {
    const duplicateIndex = selected.findIndex((candidate) => isMustReadDuplicate(candidate, item));
    if (duplicateIndex === -1) {
      selected.push(item);
      continue;
    }

    const winner = chooseMustReadRepresentative(selected[duplicateIndex], item);
    selected[duplicateIndex] = winner;
  }
  return selected.sort(compareMustReadCandidates);
}

function isMustReadDuplicate(a, b) {
  if (a.groupKey && a.groupKey === b.groupKey) return true;
  const sameDate = a.publishedAt === b.publishedAt;
  const sameRegion = a.region !== "none" && a.region === b.region;
  const sameBusiness = a.businessCategory !== "other" && a.businessCategory === b.businessCategory;
  const sameDisaster = /地震|震度|警報|避難|通行止め|運休|欠航|熱中症|アラート/.test(`${a.title} ${b.title}`);
  const titleSimilarity = jaccard(tokenize(a.groupKey || a.title), tokenize(b.groupKey || b.title));
  return (
    (titleSimilarity >= 0.7 && (sameDate || sameRegion || sameBusiness)) ||
    (titleSimilarity >= 0.48 && sameDate && sameBusiness) ||
    (sameDate && sameRegion && sameBusiness) ||
    (sameRegion && sameDisaster)
  );
}

function chooseMustReadRepresentative(a, b) {
  const rankDiff = getSourceRank(a.source) - getSourceRank(b.source);
  if (rankDiff !== 0) return rankDiff < 0 ? a : b;

  const capturedDiff = Date.parse(b.capturedAt || 0) - Date.parse(a.capturedAt || 0);
  if (capturedDiff !== 0) return capturedDiff > 0 ? b : a;

  if (a.title.length !== b.title.length) return a.title.length > b.title.length ? a : b;
  if ((a.relatedSources?.length ?? 0) !== (b.relatedSources?.length ?? 0)) {
    return (a.relatedSources?.length ?? 0) > (b.relatedSources?.length ?? 0) ? a : b;
  }
  return a.source.localeCompare(b.source, "ja") <= 0 ? a : b;
}

function selectBalancedMustRead(items) {
  const selected = [];
  const localItems = items.filter(isLocalMustRead);
  const otherItems = items.filter((item) => !isLocalMustRead(item));

  addItemsFromPool(selected, localItems, MUST_READ_LOCAL_MIN, items, { relaxDiversity: true });
  addItemsFromPool(selected, otherItems, MUST_READ_OTHER_MIN, items);

  while (selected.length < MUST_READ_LIMIT) {
    const localCount = countLocalMustRead(selected);
    const otherCount = selected.length - localCount;
    const canAddLocal = localCount < MUST_READ_LOCAL_MAX;
    const canAddOther = otherCount < MUST_READ_OTHER_MAX;
    const candidates = items.filter((item) => {
      if (selected.some((selectedItem) => selectedItem.id === item.id)) return false;
      return isLocalMustRead(item) ? canAddLocal : canAddOther;
    });

    if (candidates.length === 0) break;

    const beforeCount = selected.length;
    addMustReadIfBalanced(selected, candidates[0], items);
    if (selected.length === beforeCount) {
      items = items.filter((item) => item.id !== candidates[0].id);
    }
  }

  return selected.sort(compareMustReadDisplay).slice(0, MUST_READ_LIMIT);
}

function addItemsFromPool(selected, pool, targetCount, allItems, options = {}) {
  for (const item of pool) {
    if (selected.length >= MUST_READ_LIMIT || countPoolItems(selected, pool) >= targetCount) return;
    addMustReadIfBalanced(selected, item, allItems, options);
  }
}

function countPoolItems(selected, pool) {
  const poolIds = new Set(pool.map((item) => item.id));
  return selected.filter((item) => poolIds.has(item.id)).length;
}

function countLocalMustRead(items) {
  return items.filter(isLocalMustRead).length;
}

function isLocalMustRead(item) {
  return item.region && item.region !== "none";
}

function isTrustedLocalSource(sourceName) {
  return /南日本新聞|南海日日新聞|奄美新聞|MBC南日本放送|KTS鹿児島テレビ|KKB鹿児島放送|KYT鹿児島読売テレビ|NHK鹿児島放送局/.test(
    sourceName
  );
}

function addMustReadIfBalanced(selected, item, allItems, options = {}) {
  if (selected.some((candidate) => candidate.id === item.id)) return false;
  if (item.score < MUST_READ_MIN_SCORE) return false;
  if (options.relaxDiversity) {
    selected.push(item);
    return true;
  }

  const sameBusinessCount = selected.filter(
    (candidate) => candidate.businessCategory === item.businessCategory
  ).length;
  const hasBusinessAlternative = allItems.some(
    (candidate) =>
      !selected.some((selectedItem) => selectedItem.id === candidate.id) &&
      candidate.businessCategory !== item.businessCategory &&
      candidate.score >= item.score - 10
  );
  if (sameBusinessCount >= 2 && !isHighImpactMustRead(item) && hasBusinessAlternative) {
    return false;
  }

  const sameSourceCount = selected.filter((candidate) => candidate.source === item.source).length;
  const hasSourceAlternative = allItems.some(
    (candidate) =>
      !selected.some((selectedItem) => selectedItem.id === candidate.id) &&
      candidate.source !== item.source &&
      candidate.score >= item.score - 8
  );
  if (sameSourceCount >= 3 && hasSourceAlternative) {
    return false;
  }

  selected.push(item);
  return true;
}

function isHighImpactMustRead(item) {
  return /traffic_or_alert|fare_or_fee_change|safety/.test(item.matchedRules.join(" "));
}

function compareMustReadCandidates(a, b) {
  return (
    Date.parse(`${b.publishedAt}T00:00:00+09:00`) - Date.parse(`${a.publishedAt}T00:00:00+09:00`) ||
    b.score - a.score ||
    roleRank(a.selectionRole) - roleRank(b.selectionRole) ||
    categoryRank(a.businessCategory) - categoryRank(b.businessCategory) ||
    a.id.localeCompare(b.id)
  );
}

function compareMustReadDisplay(a, b) {
  return (
    mustReadDisplayGroup(a) - mustReadDisplayGroup(b) ||
    Date.parse(`${b.publishedAt}T00:00:00+09:00`) - Date.parse(`${a.publishedAt}T00:00:00+09:00`) ||
    b.score - a.score ||
    categoryRank(a.businessCategory) - categoryRank(b.businessCategory) ||
    getSourceRank(a.source) - getSourceRank(b.source) ||
    a.id.localeCompare(b.id)
  );
}

function mustReadDisplayGroup(item) {
  const hasRegion = item.region && item.region !== "none";
  const isRecent = (item.mustReadAgeDays ?? 0) <= 1;
  const isWeak = isWeakMustReadCandidate(item);
  if (hasRegion && isRecent && !isWeak) return 1;
  if (!hasRegion && isRecent && !isWeak) return 2;
  if (hasRegion && !isWeak) return 3;
  if (hasRegion) return 4;
  return 5;
}

function roleRank(role) {
  if (role.includes("local")) return 1;
  if (role.includes("direct_business")) return 2;
  if (role.includes("cross_business")) return 3;
  return 4;
}

function categoryRank(category) {
  return [
    "transport",
    "shipping",
    "tourism",
    "care",
    "dx",
    "safety",
    "recruiting",
    "management",
    "bowling",
    "pachinko",
    "energy",
    "real_estate",
    "marketing",
    "other"
  ].indexOf(category);
}

function getSourceRank(source) {
  return SOURCE_RANKS.find((entry) => entry.pattern.test(source))?.rank ?? 6;
}

function mustReadText(item) {
  return `${item.title} ${item.source} ${item.category} ${item.groupKey ?? ""}`;
}

function normalizeUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    for (const param of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(param.toLowerCase())) {
        url.searchParams.delete(param);
      }
    }
    url.hash = "";

    const decodedPath = decodeURIComponent(url.pathname);
    url.pathname = decodedPath !== "/" ? decodedPath.replace(/\/+$/, "") : decodedPath;
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeTitle(value) {
  let title = cleanText(value)
    .replace(/\u3000/g, " ")
    .replace(/[【】「」『』（）()［\]\[\]<>＜＞]/g, " ")
    .replace(/[!?！？:：|｜／/\\,，、。・]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const word of DECORATION_WORDS) {
    title = title.replace(new RegExp(`(^|\\s)${escapeRegExp(word)}(\\s|$)`, "gi"), " ");
  }

  title = title
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/\s+\|\s+.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return title;
}

function tokenize(value) {
  const normalized = normalizeTitle(value);
  const roughTokens = normalized.split(/\s+/).filter((token) => token.length >= 2);

  if (roughTokens.length >= 2) {
    return new Set(roughTokens);
  }

  const chars = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    chars.push(normalized.slice(index, index + 2));
  }
  return new Set(chars);
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function addRelatedSource(item, source) {
  if (!source || source === item.source || item.relatedSources.includes(source)) {
    return;
  }
  item.relatedSources.push(source);
}

function compareNews(a, b) {
  const dateDiff = b._date.getTime() - a._date.getTime();
  const sameRecentWindow = Math.abs(dateDiff) <= 7 * 24 * 60 * 60 * 1000;

  if (sameRecentWindow && a._priority !== b._priority) {
    return b._priority - a._priority;
  }

  return dateDiff || b._priority - a._priority;
}

function compareNewsDateFirst(a, b) {
  const dateDiff = b._date.getTime() - a._date.getTime();
  return dateDiff || b._priority - a._priority;
}

function stripInternalFields(item) {
  const { _date, _priority, _sourceId, ...publicItem } = item;
  return publicItem;
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return cleanText(value)
    .replace(/\u3000/g, " ")
    .toLowerCase();
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDateOnly(date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function formatJstDateTime(date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}+09:00`;
}

function createId(seed) {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
