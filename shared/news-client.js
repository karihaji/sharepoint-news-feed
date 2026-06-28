export async function loadNewsBundle() {
  const [site, categories, news] = await Promise.all([
    fetchJson("../config/site.json"),
    fetchJson("../config/categories.json"),
    fetchJson("../data/news.json")
  ]);

  return {
    site,
    categories,
    news
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}
