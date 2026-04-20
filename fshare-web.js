const form = document.querySelector("#searchForm");
const queryInput = document.querySelector("#query");
const fetchButton = document.querySelector("#fetchButton");
const submitButton = document.querySelector("#submitButton");
const resetButton = document.querySelector("#resetButton");
const cacheMeta = document.querySelector("#cacheMeta");
const statusCard = document.querySelector("#statusCard");
const statusText = document.querySelector("#statusText");
const resultsTitle = document.querySelector("#resultsTitle");
const resultsMeta = document.querySelector("#resultsMeta");
const emptyState = document.querySelector("#emptyState");
const resultsList = document.querySelector("#resultsList");
const template = document.querySelector("#resultItemTemplate");

function formatBytes(size) {
  if (!size || size < 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(isoString) {
  if (!isoString) {
    return "chưa có";
  }

  return new Date(isoString).toLocaleString("vi-VN");
}

function setStatus(kind, message) {
  statusCard.className = `status-card is-${kind}`;
  statusText.textContent = message;
}

function setBusy(mode) {
  const isFetching = mode === "fetch";
  const isSearching = mode === "search";
  fetchButton.disabled = isFetching || isSearching;
  submitButton.disabled = isFetching || isSearching;
  resetButton.disabled = isFetching || isSearching;
  fetchButton.textContent = isFetching ? "Đang fetch..." : "Fetch mới danh sách app";
  submitButton.textContent = isSearching ? "Đang search..." : "Search";
}

function renderCacheMeta(data) {
  if (!data.hasCache) {
    cacheMeta.textContent = "Chưa có cache local. Bấm Fetch mới để tải toàn bộ danh sách app.";
    return;
  }

  cacheMeta.textContent = `Cache local có ${data.totalItems} item • Cập nhật lần cuối ${formatDate(data.fetchedAt)}`;
}

function renderResults(matches, meta) {
  resultsList.innerHTML = "";

  if (!matches.length) {
    resultsTitle.textContent = "Không có item khớp";
    resultsMeta.textContent = `Đang search trên ${meta.totalItems} item local`;
    emptyState.hidden = false;
    emptyState.textContent = "Không tìm thấy item nào khớp từ khóa hiện tại.";
    resultsList.hidden = true;
    return;
  }

  resultsTitle.textContent = `${matches.length} item khớp`;
  resultsMeta.textContent = `Search trên ${meta.totalItems} item local • Cache ${formatDate(meta.fetchedAt)}`;
  emptyState.hidden = true;
  resultsList.hidden = false;

  for (const item of matches) {
    const fragment = template.content.cloneNode(true);
    const badge = fragment.querySelector(".result-badge");
    const name = fragment.querySelector(".result-name");
    const resultPath = fragment.querySelector(".result-path");
    const resultSize = fragment.querySelector(".result-size");
    const link = fragment.querySelector(".result-link");

    badge.textContent = item.type === 0 ? "Folder" : "File";
    name.textContent = item.name;
    name.href = item.fileUrl;
    resultPath.textContent = item.path || "/";
    resultSize.textContent = formatBytes(item.size);
    link.href = item.fileUrl;

    resultsList.appendChild(fragment);
  }
}

async function loadStatus() {
  const response = await fetch("/api/status");
  const data = await response.json();
  renderCacheMeta(data);
  return data;
}

fetchButton.addEventListener("click", async () => {
  setBusy("fetch");
  setStatus("loading", "Đang fetch toàn bộ danh sách từ Fshare và ghi đè cache local.");

  try {
    const response = await fetch("/api/fetch", { method: "POST" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Fetch thất bại.");
    }

    setStatus("idle", data.message || "Đã fetch xong.");
    await loadStatus();
    resultsTitle.textContent = "Chưa có kết quả";
    resultsMeta.textContent = "";
    emptyState.hidden = false;
    emptyState.textContent = "Cache đã được cập nhật. Nhập tên app rồi search.";
    resultsList.hidden = true;
    resultsList.innerHTML = "";
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : "Không thể fetch dữ liệu.");
  } finally {
    setBusy("");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    queryInput.focus();
    return;
  }

  setBusy("search");
  setStatus("loading", "Đang search trong cache local.");

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search thất bại.");
    }

    setStatus("idle", `Đã search xong. Tìm thấy ${data.matchedItems} kết quả.`);
    renderResults(data.matches, data);
    await loadStatus();
  } catch (error) {
    setStatus("error", error instanceof Error ? error.message : "Không thể search cache local.");
  } finally {
    setBusy("");
  }
});

resetButton.addEventListener("click", () => {
  form.reset();
  setStatus("idle", "Sẵn sàng.");
  resultsTitle.textContent = "Chưa có kết quả";
  resultsMeta.textContent = "";
  emptyState.hidden = false;
  emptyState.textContent = "Nhập tên app rồi search. Nếu cache chưa có, bấm Fetch mới trước.";
  resultsList.hidden = true;
  resultsList.innerHTML = "";
  queryInput.focus();
});

loadStatus().catch(() => {
  cacheMeta.textContent = "Không đọc được trạng thái cache local.";
});
