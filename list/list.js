import { loadNewsBundle } from "../shared/news-client.js";
import { createMessage, filterItems, renderNewsList, renderTabs } from "../shared/render.js";
import { formatUpdatedAt, getInitialCategory } from "../shared/utils.js";

const titleElement = document.querySelector("#site-title");
const descriptionElement = document.querySelector("#site-description");
const updatedAtElement = document.querySelector("#updated-at");
const tabsElement = document.querySelector("#category-tabs");
const listElement = document.querySelector("#news-list");

let state = {
  selectedCategory: "all",
  items: [],
  categories: [],
  site: {}
};

init();

async function init() {
  try {
    const { site, categories, news } = await loadNewsBundle();
    state = {
      selectedCategory: getInitialCategory(categories),
      items: news.items ?? [],
      categories,
      site
    };

    titleElement.textContent = site.siteTitle ?? "広報ニュースフィード";
    descriptionElement.textContent = site.siteDescription ?? "";
    updatedAtElement.textContent = formatUpdatedAt(news.updatedAt);
    render();
  } catch (error) {
    console.error(error);
    listElement.innerHTML = "";
    listElement.append(createMessage("ニュースを読み込めませんでした。時間をおいて再度確認してください。"));
  }
}

function render() {
  listElement.dataset.selectedCategory = state.selectedCategory;

  renderTabs(tabsElement, state.categories, state.selectedCategory, (categoryId) => {
    state.selectedCategory = categoryId;
    const params = new URLSearchParams(window.location.search);
    if (categoryId === "all") {
      params.delete("category");
    } else {
      params.set("category", categoryId);
    }

    const query = params.toString();
    history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    render();
  });

  const limit =
    state.selectedCategory === "all"
      ? Number(state.site.listLimit ?? 80)
      : Number(state.site.categoryLimit ?? 20);

  renderNewsList(
    listElement,
    filterItems(state.items, state.selectedCategory),
    state.categories,
    { limit }
  );
}
