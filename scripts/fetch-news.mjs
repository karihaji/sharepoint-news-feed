import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = path.join(ROOT, "config");
const DATA_DIR = path.join(ROOT, "data");
const NEWS_PATH = path.join(DATA_DIR, "news.json");

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

  console.log(`Wrote ${limited.length} items to ${path.relative(ROOT, NEWS_PATH)}`);
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
  const sourceName = cleanText(
    item.source?.title ||
      item.source ||
      titleParts.source ||
      source.source ||
      feed.title ||
      ""
  );
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

  if (excludeKeywords.some((keyword) => searchText.includes(normalizeSearchText(keyword)))) {
    return false;
  }

  if (includeKeywords.length === 0) {
    return true;
  }

  return includeKeywords.some((keyword) => searchText.includes(normalizeSearchText(keyword)));
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
