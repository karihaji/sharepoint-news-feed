import { loadNewsBundle } from "../shared/news-client.js";
import { createMessage, filterItems, renderNewsList, renderTabs } from "../shared/render.js";
import { formatUpdatedAt } from "../shared/utils.js";

const titleElement = document.querySelector("#site-title");
const updatedAtElement = document.querySelector("#updated-at");
const tabsElement = document.querySelector("#category-tabs");
const listElement = document.querySelector("#news-list");
const moreLinks = [
  document.querySelector("#more-link-top"),
  document.querySelector("#more-link-bottom")
];

let state = {
  selectedCategory: "all",
  items: [],
  categories: [],
  limit: 10
};

init();

async function init() {
  try {
    const { site, categories, news } = await loadNewsBundle();
    state = {
      selectedCategory: "all",
      items: news.items ?? [],
      categories,
      limit: Number(site.compactLimit ?? 10)
    };

    titleElement.textContent = site.siteTitle ?? "広報ニュースフィード";
    updatedAtElement.textContent = formatUpdatedAt(news.updatedAt);
    setupMoreLinks(site);
    render();
  } catch (error) {
    console.error(error);
    listElement.innerHTML = "";
    listElement.append(createMessage("ニュースを読み込めませんでした。時間をおいて再度確認してください。"));
  }
}

function render() {
  renderTabs(tabsElement, state.categories, state.selectedCategory, (categoryId) => {
    state.selectedCategory = categoryId;
    render();
  });

  renderNewsList(
    listElement,
    filterItems(state.items, state.selectedCategory),
    state.categories,
    { limit: state.limit }
  );
}

function setupMoreLinks(site) {
  const url = site.moreLinkUrl ?? "";
  const label = site.moreLinkLabel ?? "もっと見る";

  for (const link of moreLinks) {
    if (!url) {
      link.hidden = true;
      continue;
    }

    link.href = url;
    link.innerHTML = `${label} <span aria-hidden="true">↗</span>`;
    link.setAttribute("aria-label", `${label}を新しいタブで開きます`);
    link.hidden = false;
  }
}
