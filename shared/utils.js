export function formatUpdatedAt(value) {
  if (!value) {
    return "未取得";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未取得";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatNewsDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

export function getCategoryLabel(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.label ?? categoryId;
}

export function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || a.capturedAt || 0);
    const bTime = Date.parse(b.publishedAt || b.capturedAt || 0);
    return bTime - aTime;
  });
}

export function getInitialCategory(categories) {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("category");
  return categories.some((category) => category.id === requested) ? requested : "all";
}
