import { formatNewsDate, getCategoryLabel, sortByDateDesc } from "./utils.js";

export function renderTabs(container, categories, selectedCategory, onSelect) {
  container.innerHTML = "";
  container.setAttribute("role", "tablist");

  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-tab";
    button.dataset.category = category.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(category.id === selectedCategory));
    button.tabIndex = category.id === selectedCategory ? 0 : -1;

    const icon = document.createElement("span");
    icon.className = "category-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = getCategoryIcon(category.id);

    const label = document.createElement("span");
    label.textContent = category.label;

    button.append(icon, label);

    button.addEventListener("click", () => onSelect(category.id));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const tabs = [...container.querySelectorAll(".category-tab")];
      const currentIndex = tabs.indexOf(button);
      let nextIndex = currentIndex;

      if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
      if (event.key === "ArrowRight") nextIndex = Math.min(tabs.length - 1, currentIndex + 1);
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;

      tabs[nextIndex].focus();
      onSelect(tabs[nextIndex].dataset.category);
    });

    container.append(button);
  }
}

export function renderNewsList(container, items, categories, options = {}) {
  container.innerHTML = "";

  if (items.length === 0) {
    container.append(createMessage("表示できるニュースがありません。"));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of sortByDateDesc(items).slice(0, options.limit ?? items.length)) {
    fragment.append(createNewsCard(item, categories));
  }
  container.append(fragment);
}

export function filterItems(items, categoryId) {
  if (categoryId === "all") {
    return items;
  }
  return items.filter((item) => item.category === categoryId);
}

export function createMessage(text) {
  const message = document.createElement("p");
  message.className = "state-message";
  message.textContent = text;
  return message;
}

function createNewsCard(item, categories) {
  const article = document.createElement("article");
  article.className = "news-card";
  article.dataset.category = item.category;
  if (item.originalCategory) {
    article.dataset.originalCategory = item.originalCategory;
  }

  const accent = document.createElement("div");
  accent.className = "news-accent";
  accent.setAttribute("aria-hidden", "true");

  const meta = document.createElement("div");
  meta.className = "news-meta";

  const category = document.createElement("span");
  category.className = "news-category";
  const displayCategoryId = item.originalCategory || item.category;
  category.dataset.category = displayCategoryId;

  const categoryIcon = document.createElement("span");
  categoryIcon.className = "category-icon";
  categoryIcon.setAttribute("aria-hidden", "true");
  categoryIcon.textContent = getCategoryIcon(displayCategoryId);

  const categoryText = document.createElement("span");
  categoryText.textContent = getCategoryLabel(categories, displayCategoryId);

  category.append(categoryIcon, categoryText);
  if (item.rank) {
    const rank = document.createElement("span");
    rank.className = "news-rank";
    rank.textContent = `#${item.rank}`;
    meta.append(rank);
  }

  const source = document.createElement("span");
  source.className = "news-source";
  source.textContent = item.source || "提供元不明";

  const time = document.createElement("time");
  time.dateTime = item.publishedAt || "";
  time.textContent = formatNewsDate(item.publishedAt);

  meta.append(category, source, time);

  const title = document.createElement("h3");
  title.className = "news-title";
  title.textContent = item.title;

  const link = document.createElement("a");
  link.className = "news-link";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${item.title} の元記事を新しいタブで開きます`);
  link.innerHTML = "元記事を開く <span aria-hidden=\"true\">↗</span>";

  const footer = document.createElement("div");
  footer.className = "news-footer";
  footer.append(link);

  article.append(accent, meta, title, footer);
  return article;
}

function getCategoryIcon(categoryId) {
  return {
    all: "全",
    must_read_today: "読",
    local: "地",
    transport: "交",
    shipping: "海",
    care: "介",
    pachinko: "遊",
    bowling: "球",
    ai_it: "AI"
  }[categoryId] ?? "N";
}
