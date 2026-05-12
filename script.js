const categoryNames = {
  all: "全部",
  daily: "日常思考",
  work: "工作思考",
  reading: "阅读笔记",
  knowledge: "知识沉淀"
};

const postList = document.querySelector("#notes");
const searchInput = document.querySelector("#searchInput");
const collectionButtons = document.querySelectorAll("[data-collection]");
const filterButtons = document.querySelectorAll("[data-filter]");
const accessWidget = document.querySelector("#accessWidget");
const accessForm = document.querySelector("#accessForm");
const accessInvite = document.querySelector("#accessInvite");
const accessNote = document.querySelector("#accessNote");
const pagination = document.querySelector("#pagination");
const pagePrev = document.querySelector("#pagePrev");
const pageNext = document.querySelector("#pageNext");
const pageInfo = document.querySelector("#pageInfo");
const motionCanvas = document.querySelector("#motionBg");
const intro = document.querySelector("#top");
const listTools = document.querySelector("#listTools");
const listContent = document.querySelector("#listContent");
const fullArticle = document.querySelector("#fullArticle");
const fullArticleReader = document.querySelector("#fullArticleReader");
const backToList = document.querySelector("#backToList");
const filterTabs = document.querySelector(".filter-tabs");
const listTitle = document.querySelector("#listTitle");

const adminLogin = document.querySelector("#adminLogin");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminLoginUser = document.querySelector("#adminLoginUser");
const adminLoginPassword = document.querySelector("#adminLoginPassword");
const adminLoginNote = document.querySelector("#adminLoginNote");
const adminPanel = document.querySelector("#adminPanel");
const adminForm = document.querySelector("#adminForm");
const adminPostId = document.querySelector("#adminPostId");
const adminTitle = document.querySelector("#adminTitle");
const adminDate = document.querySelector("#adminDate");
const adminCategory = document.querySelector("#adminCategory");
const adminTag = document.querySelector("#adminTag");
const adminExcerpt = document.querySelector("#adminExcerpt");
const adminImage = document.querySelector("#adminImage");
const adminImageFile = document.querySelector("#adminImageFile");
const adminInlineImageFile = document.querySelector("#adminInlineImageFile");
const adminImportFile = document.querySelector("#adminImportFile");
const adminLayout = document.querySelector("#adminLayout");
const adminContent = document.querySelector("#adminContent");
const adminNote = document.querySelector("#adminNote");
const editorColor = document.querySelector("#editorColor");
const editorFontSize = document.querySelector("#editorFontSize");
const editorApplyColor = document.querySelector("#editorApplyColor");
const editorApplySize = document.querySelector("#editorApplySize");
const adminNew = document.querySelector("#adminNew");
const adminDelete = document.querySelector("#adminDelete");
const adminExport = document.querySelector("#adminExport");
const adminLogout = document.querySelector("#adminLogout");

let activeFilter = "all";
let activeCollection = "all";
let activeTag = "";
let isAdmin = false;
let posts = [];
let isAuthenticated = false;
let currentPage = 1;
let currentFilteredPostIds = [];
let currentPageStart = 0;
let draggedPostId = "";
const postsPerPage = 10;
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isAdminRoute = currentPath === "/admin";
let currentPostId = getPostIdFromPath();
let activeArticleCategory = "";
const imageCompression = {
  coverMaxSide: 1800,
  inlineMaxSide: 2200,
  quality: 0.9,
  keepOriginalRatio: 0.94
};
const collectionCopy = {
  all: {
    title: "全部札记"
  },
  essay: {
    title: "随笔文章"
  },
  reading: {
    title: "读书笔记"
  }
};

if (isAdminRoute) {
  accessWidget.classList.add("hidden");
  intro.classList.add("hidden");
  listTools.classList.add("hidden");
  listContent.classList.add("hidden");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" ? payload.message || payload.error : payload;
    throw new Error(message || "请求失败");
  }

  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mediaSrc(value) {
  const src = String(value || "").trim();
  if (!src) return src;
  if (/^(https?:|data:|\/)/i.test(src)) return src;
  if (src.startsWith("assets/")) return `/${src}`;
  return src;
}

function unlockSite(admin = false) {
  isAdmin = admin;
  isAuthenticated = true;
  adminLogin.classList.add("hidden");
  adminPanel.classList.toggle("hidden", !isAdmin);
  accessWidget.classList.add("hidden");
  accessWidget.classList.toggle("unlocked", true);

  if (isAdminRoute && !isAdmin) {
    lockSite("这里需要管理员账号和密码。");
    return;
  }

  if (currentPostId) {
    showArticlePage(currentPostId);
  } else if (isAdminRoute) {
    showAdminListView();
    loadPosts();
  } else {
    loadPosts();
  }
}

function lockSite(message = "") {
  isAdmin = false;
  isAuthenticated = false;
  posts = [];
  renderPosts();
  adminPanel.classList.add("hidden");
  adminLogin.classList.toggle("hidden", !isAdminRoute);
  accessWidget.classList.toggle("hidden", isAdminRoute);
  accessWidget.classList.toggle("unlocked", false);
  accessNote.textContent = message;

  if (isAdminRoute) {
    showAdminLoginView();
    adminLoginNote.textContent = message;
    adminLoginUser.focus();
  } else {
    showListView();
  }
}

function getPostIdFromPath() {
  const match = window.location.pathname.match(/^\/post\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function checkSession() {
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      if (isAdminRoute && !session.admin) {
        lockSite("这里需要管理员账号和密码。");
        return;
      }
      unlockSite(session.admin);
      return;
    }
  } catch {
    // Keep the gate visible when the session endpoint is unavailable.
  }

  lockSite();
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessNote.textContent = "";

  const invite = accessInvite.value.trim();

  if (!invite) {
    accessNote.textContent = "请输入邀请码。";
    return;
  }

  try {
    const session = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        identity: invite,
        secret: ""
      })
    });

    unlockSite(session.admin);
    accessInvite.value = "";
    accessNote.textContent = "文章已解锁。";
  } catch (error) {
    accessNote.textContent = error.message || "邀请码不对。";
    accessInvite.focus();
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminLoginNote.textContent = "";

  try {
    const session = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        identity: adminLoginUser.value.trim(),
        secret: adminLoginPassword.value.trim()
      })
    });

    if (session.admin) {
      adminLoginForm.reset();
      unlockSite(true);
      adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      adminLoginNote.textContent = "这个账号没有管理权限。";
    }
  } catch (error) {
    adminLoginNote.textContent = error.message || "登录失败。";
    adminLoginPassword.select();
  }
});

async function loadPosts() {
  try {
    const data = await api("/api/posts");
    posts = data.posts || [];
    currentPage = 1;
    renderPosts();
  } catch (error) {
    lockSite(error.message === "unauthorized" ? "" : error.message);
  }
}

function renderPosts() {
  const keyword = searchInput.value.trim().toLowerCase();
  updateCollectionView();
  const filteredPosts = posts.filter((post) => {
    const matchesCollection =
      activeCollection === "all" ||
      (activeCollection === "reading" ? post.category === "reading" : post.category !== "reading");
    const matchesFilter =
      activeCollection === "reading" || activeFilter === "all" || post.category === activeFilter;
    const tags = getTags(post);
    const matchesTag = !activeTag || tags.includes(activeTag);
    const text = `${post.title} ${post.category} ${categoryNames[post.category] || ""} ${tags.join(" ")} ${post.excerpt}`.toLowerCase();
    return matchesCollection && matchesFilter && matchesTag && text.includes(keyword);
  });
  currentFilteredPostIds = filteredPosts.map((post) => post.id);

  if (!filteredPosts.length) {
    postList.innerHTML = `
      <div class="empty-state">
        ${posts.length ? "没有找到相关内容。换个关键词，或者切换一下上面的区域。" : "输入邀请码后，文章会显示在这里。"}
      </div>
    `;
    pagination.classList.add("hidden");
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * postsPerPage;
  currentPageStart = start;
  const pagePosts = filteredPosts.slice(start, start + postsPerPage);

  postList.innerHTML = pagePosts
    .map(
      (post) => `
        <article class="post-card ${isAdmin ? "sortable" : ""}" data-post-id="${escapeHtml(post.id)}" ${isAdmin ? `draggable="true"` : ""}>
          <img src="${escapeHtml(mediaSrc(post.image))}" alt="${escapeHtml(post.title)}封面图" />
          <div>
            <div class="post-meta">
              <span>${escapeHtml(post.date)}</span>
              ${post.pinned ? `<span class="pin-badge">置顶</span>` : ""}
              <button type="button" class="category-link" data-category="${escapeHtml(post.category)}">
                ${escapeHtml(categoryNames[post.category] || post.category)}
              </button>
            </div>
            <h2>
              <a href="#" data-read="${escapeHtml(post.id)}" aria-label="阅读${escapeHtml(post.title)}">
                ${escapeHtml(post.title)}
              </a>
            </h2>
            <div class="post-tags">${renderTagButtons(post)}</div>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="post-actions">
              ${
                isAdmin
                  ? `
                    <button class="inline-edit" type="button" data-edit="${escapeHtml(post.id)}">编辑</button>
                    <button class="inline-edit danger" type="button" data-delete="${escapeHtml(post.id)}">删除文章</button>
                    <button class="inline-edit ${post.pinned ? "active" : ""}" type="button" data-pin="${escapeHtml(post.id)}">
                      ${post.pinned ? "已置顶" : "置顶"}
                    </button>
                    <button class="inline-edit" type="button" data-move="up" data-move-id="${escapeHtml(post.id)}">上移</button>
                    <button class="inline-edit" type="button" data-move="down" data-move-id="${escapeHtml(post.id)}">下移</button>
                    <span class="drag-handle" data-drag-id="${escapeHtml(post.id)}">拖动排序</span>
                  `
                  : ""
              }
            </div>
          </div>
        </article>
      `
    )
    .join("");

  pagination.classList.toggle("hidden", totalPages <= 1);
  pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
  pagePrev.disabled = currentPage <= 1;
  pageNext.disabled = currentPage >= totalPages;
}

function setCollection(collection) {
  activeCollection = collection;
  activeFilter = "all";
  activeTag = "";
  currentPage = 1;
  collectionButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.collection === collection);
  });
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
  renderPosts();
}

function setFilter(filter) {
  activeCollection = filter === "reading" ? "reading" : "essay";
  activeFilter = filter;
  activeTag = "";
  currentPage = 1;
  collectionButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.collection === activeCollection);
  });
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });
  renderPosts();
}

function applyCategoryFilter(category) {
  showListView();
  setFilter(category === "reading" ? "reading" : category);
  document.querySelector(".tools").scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyTagFilter(tag) {
  const sourceCategory = currentPostId ? activeArticleCategory : "";
  showListView();
  if (sourceCategory) {
    activeCollection = sourceCategory === "reading" ? "reading" : "essay";
  }
  activeTag = tag;
  activeFilter = "all";
  currentPage = 1;
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
  renderPosts();
  document.querySelector(".tools").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateCollectionView() {
  const copy = collectionCopy[activeCollection] || collectionCopy.essay;
  listTitle.textContent = activeTag ? `# ${activeTag}` : copy.title;
  filterTabs.classList.toggle("hidden", activeCollection !== "essay");
  collectionButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.collection === activeCollection);
  });
}

function getTags(post) {
  if (Array.isArray(post.tags) && post.tags.length) return post.tags;
  return String(post.tag || "")
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderTagButtons(post) {
  return getTags(post)
    .map(
      (tag) =>
        `<button type="button" class="tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    )
    .join("");
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

collectionButtons.forEach((button) => {
  button.addEventListener("click", () => setCollection(button.dataset.collection));
});

searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderPosts();
});

pagePrev.addEventListener("click", () => {
  currentPage = Math.max(1, currentPage - 1);
  renderPosts();
  document.querySelector(".tools").scrollIntoView({ behavior: "smooth", block: "start" });
});

pageNext.addEventListener("click", () => {
  currentPage += 1;
  renderPosts();
  document.querySelector(".tools").scrollIntoView({ behavior: "smooth", block: "start" });
});

postList.addEventListener("click", async (event) => {
  const readLink = event.target.closest("[data-read]");
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  const pinButton = event.target.closest("[data-pin]");
  const moveButton = event.target.closest("[data-move-id]");
  const tagButton = event.target.closest("[data-tag]");
  const categoryButton = event.target.closest("[data-category]");

  if (categoryButton) {
    applyCategoryFilter(categoryButton.dataset.category);
    return;
  }

  if (tagButton) {
    applyTagFilter(tagButton.dataset.tag);
    return;
  }

  if (readLink) {
    event.preventDefault();
    openArticle(readLink.dataset.read);
  }

  if (editButton) {
    await openEditor(editButton.dataset.edit);
  }

  if (deleteButton) {
    await deletePostById(deleteButton.dataset.delete);
  }

  if (pinButton) {
    await togglePostPin(pinButton.dataset.pin);
  }

  if (moveButton) {
    await movePostOnPage(moveButton.dataset.moveId, moveButton.dataset.move);
  }
});

postList.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".post-card[data-post-id]");
  if (!card || !isAdmin || event.target.closest("button, a, input, select, textarea")) {
    event.preventDefault();
    return;
  }
  draggedPostId = card.dataset.postId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedPostId);
  card.classList.add("dragging");
});

postList.addEventListener("dragover", (event) => {
  if (!draggedPostId || !isAdmin) return;
  event.preventDefault();
  const draggingCard = postList.querySelector(`[data-post-id="${cssEscape(draggedPostId)}"]`);
  const targetCard = event.target.closest(".post-card");
  if (!draggingCard || !targetCard || draggingCard === targetCard) return;

  const targetBox = targetCard.getBoundingClientRect();
  const insertAfter = event.clientY > targetBox.top + targetBox.height / 2;
  postList.insertBefore(draggingCard, insertAfter ? targetCard.nextSibling : targetCard);
});

postList.addEventListener("dragend", async () => {
  if (!draggedPostId || !isAdmin) return;
  postList.querySelectorAll(".post-card.dragging").forEach((card) => card.classList.remove("dragging"));
  draggedPostId = "";
  await saveDraggedOrder();
});

postList.addEventListener("drop", (event) => {
  if (!draggedPostId || !isAdmin) return;
  event.preventDefault();
});

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

async function saveDraggedOrder() {
  const visibleIds = [...postList.querySelectorAll("[data-post-id]")].map((card) => card.dataset.postId);
  if (!visibleIds.length) return;

  const nextIds = [...currentFilteredPostIds];
  nextIds.splice(currentPageStart, visibleIds.length, ...visibleIds);

  try {
    const data = await api("/api/posts/order", {
      method: "POST",
      body: JSON.stringify({ ids: nextIds })
    });
    posts = data.posts || posts;
    currentFilteredPostIds = nextIds;
    adminNote.textContent = "文章排序已保存。";
    renderPosts();
  } catch (error) {
    adminNote.textContent = error.message || "保存排序失败。";
    await loadPosts();
  }
}

async function movePostOnPage(postId, direction) {
  const cards = [...postList.querySelectorAll("[data-post-id]")];
  const index = cards.findIndex((card) => card.dataset.postId === postId);
  if (index < 0) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= cards.length) {
    adminNote.textContent = direction === "up" ? "已经在当前页最上面了。" : "已经在当前页最下面了。";
    return;
  }

  const card = cards[index];
  const target = cards[targetIndex];
  if (direction === "up") {
    postList.insertBefore(card, target);
  } else {
    postList.insertBefore(target, card);
  }
  await saveDraggedOrder();
}

async function getFullPost(postId) {
  const data = await api(`/api/posts/${encodeURIComponent(postId)}`);
  return data.post;
}

function openArticle(postId) {
  window.history.pushState({}, "", `/post/${encodeURIComponent(postId)}`);
  currentPostId = postId;
  showArticlePage(postId);
}

function showListView() {
  currentPostId = "";
  intro.classList.remove("hidden");
  listTools.classList.remove("hidden");
  listContent.classList.remove("hidden");
  fullArticle.classList.add("hidden");
}

function showAdminLoginView() {
  currentPostId = "";
  intro.classList.add("hidden");
  listTools.classList.add("hidden");
  listContent.classList.add("hidden");
  fullArticle.classList.add("hidden");
}

function showAdminListView() {
  currentPostId = "";
  intro.classList.add("hidden");
  listTools.classList.remove("hidden");
  listContent.classList.remove("hidden");
  fullArticle.classList.add("hidden");
}

async function showArticlePage(postId) {
  const post = await getFullPost(postId);
  activeArticleCategory = post.category;

  intro.classList.add("hidden");
  listTools.classList.add("hidden");
  listContent.classList.add("hidden");
  fullArticle.classList.remove("hidden");

  fullArticleReader.className = `article-reader layout-${post.layout}`;
  fullArticleReader.innerHTML = `
    <h1>${escapeHtml(post.title)}</h1>
    <div class="article-meta">
      <span>${escapeHtml(post.date)}</span>
      <button type="button" class="category-link" data-category="${escapeHtml(post.category)}">
        ${escapeHtml(categoryNames[post.category] || post.category)}
      </button>
    </div>
    <div class="article-tags">${renderTagButtons(post)}</div>
    <img class="article-cover" src="${escapeHtml(mediaSrc(post.image))}" alt="${escapeHtml(post.title)}封面图" />
    <div class="article-body">${post.html}</div>
  `;
  renderArticleDiagrams();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderArticleDiagrams() {
  const diagrams = fullArticleReader.querySelectorAll(".mermaid");
  if (!diagrams.length) return;

  try {
    const mermaidModule = await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs");
    const mermaid = mermaidModule.default;
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
    await mermaid.run({ nodes: [...diagrams] });
  } catch {
    diagrams.forEach((diagram) => {
      diagram.classList.add("mermaid-failed");
    });
  }
}

fullArticleReader.addEventListener("click", (event) => {
  const tagButton = event.target.closest("[data-tag]");
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    window.history.pushState({}, "", "/");
    applyCategoryFilter(categoryButton.dataset.category);
    return;
  }
  if (tagButton) {
    applyTagFilter(tagButton.dataset.tag);
  }
});

backToList.addEventListener("click", (event) => {
  event.preventDefault();
  window.history.pushState({}, "", "/");
  currentPostId = "";
  showListView();
  if (isAuthenticated) loadPosts();
});

window.addEventListener("popstate", () => {
  currentPostId = getPostIdFromPath();
  if (currentPostId && isAuthenticated) {
    showArticlePage(currentPostId);
  } else {
    showListView();
    if (isAuthenticated) loadPosts();
  }
});

async function openEditor(postId) {
  const today = new Date().toISOString().slice(0, 10);
  const post = postId ? await getFullPost(postId) : null;

  adminPostId.value = post?.id || "";
  adminTitle.value = post?.title || "";
  adminDate.value = post?.date || today;
  adminCategory.value = post?.category || "daily";
  adminTag.value = getTags(post || {}).join("，");
  adminExcerpt.value = post?.excerpt || "";
  adminImage.value = post?.image || "assets/cover-morning.jpg";
  adminLayout.value = post?.layout || "standard";
  adminContent.value = post?.content || "";
  adminNote.textContent = post ? `正在编辑：${post.title}` : "正在创建新文章。";
  adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  adminTitle.focus();
}

adminNew.addEventListener("click", () => openEditor());

adminForm.addEventListener("reset", () => {
  window.setTimeout(() => {
    adminPostId.value = "";
    adminDate.value = new Date().toISOString().slice(0, 10);
    adminImage.value = "assets/cover-morning.jpg";
    adminLayout.value = "standard";
    adminNote.textContent = "表单已清空，可以写新文章。";
  });
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const post = {
    id: adminPostId.value,
    title: adminTitle.value.trim(),
    date: adminDate.value,
    category: adminCategory.value,
    tag: adminTag.value.trim() || categoryNames[adminCategory.value],
    tags: adminTag.value.trim(),
    image: adminImage.value.trim() || "assets/cover-morning.jpg",
    layout: adminLayout.value,
    excerpt: adminExcerpt.value.trim(),
    content: adminContent.value.trim()
  };

  try {
    const saved = await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({ post })
    });
    adminPostId.value = saved.post.id;
    adminImage.value = saved.post.image;
    adminNote.textContent = `已保存：${saved.post.title}`;
    await loadPosts();
  } catch (error) {
    adminNote.textContent = error.message || "保存失败。";
  }
});

adminDelete.addEventListener("click", async () => {
  const postId = adminPostId.value;
  if (!postId) {
    adminNote.textContent = "当前没有正在编辑的文章。";
    return;
  }

  await deletePostById(postId, adminTitle.value || postId, true);
});

async function deletePostById(postId, title = "", resetEditor = false) {
  const post = posts.find((item) => item.id === postId);
  const displayTitle = title || post?.title || postId;
  if (!window.confirm(`确定删除《${displayTitle}》吗？`)) return;

  try {
    await api(`/api/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
    await loadPosts();
    if (resetEditor || adminPostId.value === postId) {
      adminForm.reset();
    }
    adminNote.textContent = "文章已删除。";
  } catch (error) {
    adminNote.textContent = error.message || "删除失败。";
  }
}

async function togglePostPin(postId) {
  try {
    const data = await api(`/api/posts/${encodeURIComponent(postId)}/pin`, {
      method: "POST",
      body: "{}"
    });
    await loadPosts();
    adminNote.textContent = data.post.pinned ? `已置顶：${data.post.title}` : `已取消置顶：${data.post.title}`;
  } catch (error) {
    adminNote.textContent = error.message || "置顶操作失败。";
  }
}

adminExport.addEventListener("click", async () => {
  try {
    const data = await api("/api/export");
    const blob = new Blob([JSON.stringify(data.posts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "myblog-posts.json";
    link.click();
    URL.revokeObjectURL(url);
    adminNote.textContent = "已导出文章数据。";
  } catch (error) {
    adminNote.textContent = error.message || "导出失败。";
  }
});

adminLogout.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
  lockSite(isAdminRoute ? "已退出管理。" : "");
});

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败。"));
    });
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function blobToDataUrl(blob) {
  return readFileAsDataUrl(new File([blob], "image", { type: blob.type || "image/webp" }));
}

async function readCompressedImage(file, maxSide) {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return {
      dataUrl: await readFileAsDataUrl(file),
      originalSize: file.size,
      finalSize: file.size,
      compressed: false
    };
  }

  try {
    const image = await loadImageFromFile(file);
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const webpBlob = await canvasToBlob(canvas, "image/webp", imageCompression.quality);
    if (!webpBlob || webpBlob.size >= file.size * imageCompression.keepOriginalRatio) {
      return {
        dataUrl: await readFileAsDataUrl(file),
        originalSize: file.size,
        finalSize: file.size,
        compressed: false
      };
    }

    return {
      dataUrl: await blobToDataUrl(webpBlob),
      originalSize: file.size,
      finalSize: webpBlob.size,
      compressed: true
    };
  } catch {
    return {
      dataUrl: await readFileAsDataUrl(file),
      originalSize: file.size,
      finalSize: file.size,
      compressed: false
    };
  }
}

function compressionMessage(result, label) {
  if (!result.compressed) {
    return `${label}已载入。原图已经比较合适，保存时会直接上传。`;
  }
  return `${label}已自动压缩：${formatFileSize(result.originalSize)} -> ${formatFileSize(result.finalSize)}，保存文章后上传。`;
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

function wrapSelection(textarea, before, after = "") {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || "文字";
  const replacement = `${before}${selected}${after}`;
  textarea.value = `${textarea.value.slice(0, start)}${replacement}${textarea.value.slice(end)}`;
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = start + before.length + selected.length;
  textarea.focus();
}

function prefixSelection(textarea, prefix) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || "文字";
  const replacement = selected
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
  textarea.value = `${textarea.value.slice(0, start)}${replacement}${textarea.value.slice(end)}`;
  textarea.selectionStart = start + prefix.length;
  textarea.selectionEnd = start + replacement.length;
  textarea.focus();
}

document.querySelectorAll("[data-editor-wrap]").forEach((button) => {
  button.addEventListener("click", () => {
    const [before, after] = button.dataset.editorWrap.split("|");
    wrapSelection(adminContent, before, after);
  });
});

document.querySelectorAll("[data-editor-prefix]").forEach((button) => {
  button.addEventListener("click", () => {
    prefixSelection(adminContent, button.dataset.editorPrefix);
  });
});

document.querySelectorAll("[data-editor-insert]").forEach((button) => {
  button.addEventListener("click", () => {
    insertAtCursor(adminContent, button.dataset.editorInsert.replaceAll("\\n", "\n"));
  });
});

editorApplyColor.addEventListener("click", () => {
  wrapSelection(adminContent, `[color=${editorColor.value}]`, "[/color]");
});

editorApplySize.addEventListener("click", () => {
  wrapSelection(adminContent, `[size=${editorFontSize.value}]`, "[/size]");
});

adminImageFile.addEventListener("change", async () => {
  const file = adminImageFile.files[0];
  if (!file) return;

  adminNote.textContent = "正在优化封面图片...";
  const result = await readCompressedImage(file, imageCompression.coverMaxSide);
  adminImage.value = result.dataUrl;
  adminImageFile.value = "";
  adminNote.textContent = compressionMessage(result, "封面图片");
});

adminInlineImageFile.addEventListener("change", async () => {
  const file = adminInlineImageFile.files[0];
  if (!file) return;

  adminNote.textContent = "正在优化正文图片...";
  const result = await readCompressedImage(file, imageCompression.inlineMaxSide);
  insertAtCursor(adminContent, `\n\n![正文图片](${result.dataUrl})\n\n`);
  adminInlineImageFile.value = "";
  adminNote.textContent = compressionMessage(result, "正文图片");
});

adminImportFile.addEventListener("change", async () => {
  const file = adminImportFile.files[0];
  if (!file) return;

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const result = await api("/api/import", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        dataUrl
      })
    });

    const importedText = result.text.trim();
    if (!importedText) {
      adminNote.textContent = "没有从文件里读到正文。";
      return;
    }

    if (adminContent.value.trim()) {
      insertAtCursor(adminContent, `\n\n${importedText}\n\n`);
    } else {
      adminContent.value = importedText;
      adminContent.focus();
    }

    adminNote.textContent = `已导入：${file.name}`;
  } catch (error) {
    adminNote.textContent = error.message || "导入失败。";
  } finally {
    adminImportFile.value = "";
  }
});

function startMotionBackground() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!motionCanvas || prefersReducedMotion) return;

  const context = motionCanvas.getContext("2d");
  let width = 0;
  let height = 0;
  let points = [];

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    motionCanvas.width = width * pixelRatio;
    motionCanvas.height = height * pixelRatio;
    motionCanvas.style.width = `${width}px`;
    motionCanvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const count = Math.max(24, Math.floor((width * height) / 36000));
    points = Array.from({ length: count }, (_, index) => ({
      x: (index * 149) % width,
      y: (index * 211) % height,
      radius: 1.2 + (index % 4) * 0.45,
      speed: 0.12 + (index % 5) * 0.025,
      phase: index * 0.7
    }));
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(49, 95, 88, 0.32)";
    context.strokeStyle = "rgba(111, 47, 42, 0.11)";
    context.lineWidth = 1;

    points.forEach((point, index) => {
      const drift = time * 0.00008 * point.speed;
      const x = (point.x + Math.sin(drift + point.phase) * 36 + width) % width;
      const y = (point.y + time * 0.018 * point.speed) % height;

      context.beginPath();
      context.arc(x, y, point.radius, 0, Math.PI * 2);
      context.fill();

      for (let nextIndex = index + 1; nextIndex < points.length; nextIndex += 1) {
        const next = points[nextIndex];
        const nextX = (next.x + Math.sin(drift + next.phase) * 36 + width) % width;
        const nextY = (next.y + time * 0.018 * next.speed) % height;
        const distance = Math.hypot(x - nextX, y - nextY);

        if (distance < 130) {
          context.globalAlpha = 1 - distance / 130;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(nextX, nextY);
          context.stroke();
          context.globalAlpha = 1;
        }
      }
    });

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
}

checkSession();
renderPosts();
startMotionBackground();
