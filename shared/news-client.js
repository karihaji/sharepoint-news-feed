export async function loadNewsBundle() {
  const [site, categories, news, mustReadToday] = await Promise.all([
    fetchJson("../config/site.json"),
    fetchJson("../config/categories.json"),
    fetchJson("../data/news.json"),
    fetchOptionalJson("../data/must-read-today.json")
  ]);

  return {
    site,
    categories,
    news,
    mustReadToday
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchOptionalJson(url) {
  try {
    return await fetchJson(url);
  } catch {
    return null;
  }
}
