const crypto = require("crypto");
const zlib = require("zlib");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const contentDir = path.join(root, "content", "posts");
const uploadDir = path.join(root, "assets", "uploads");

const inviteCode = process.env.INVITE_CODE || "yjlsx";
const adminUsername = process.env.ADMIN_USERNAME || "yjlsx";
const adminPassword = process.env.ADMIN_PASSWORD || "yjl021410";
const sessionSecret = process.env.SESSION_SECRET || "dev-session-secret-change-on-render";
const githubToken = process.env.GITHUB_TOKEN || "";
const githubRepo = process.env.GITHUB_REPO || "";
const githubBranch = process.env.GITHUB_BRANCH || "main";
const oneWeek = 1000 * 60 * 60 * 24 * 7;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8"
};

fs.mkdirSync(contentDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSession(role) {
  const expires = Date.now() + oneWeek;
  const value = `${role}.${expires}`;
  return `${value}.${sign(value)}`;
}

function readSession(req) {
  const token = parseCookies(req).pn_session;
  if (!token) return null;

  const [role, expires, signature] = token.split(".");
  const value = `${role}.${expires}`;
  if (!role || !expires || !signature) return null;
  if (Number(expires) < Date.now()) return null;
  if (sign(value) !== signature) return null;
  if (!["reader", "admin"].includes(role)) return null;
  return { role, admin: role === "admin" };
}

function setSession(res, role) {
  const token = createSession(role);
  res.setHeader("Set-Cookie", `pn_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", "pn_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function requireReader(req, res) {
  const session = readSession(req);
  if (!session) {
    json(res, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

function requireAdmin(req, res) {
  const session = readSession(req);
  if (!session?.admin) {
    json(res, 403, { error: "admin_required" });
    return null;
  }
  return session;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readJson(req) {
  return readBody(req).then((body) => (body ? JSON.parse(body) : {}));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || `post-${Date.now()}`;
}

function safeFileName(id) {
  return slugify(id).replace(/[\\/:*?"<>|]/g, "-");
}

function parsePostMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const meta = JSON.parse(match[1]);
  const post = normalizePost({
    ...meta,
    content: match[2].trim()
  });
  post.fileMtime = fs.statSync(filePath).mtimeMs;
  return post;
}

function postToMarkdown(post) {
  const { content, fileMtime, ...meta } = post;
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n${content || ""}\n`;
}

function normalizePost(post) {
  const category = post.category || "daily";
  const categoryName = categoryLabel(category);
  const tags = normalizeTags(post.tags ?? post.tag ?? "").filter((tag) => tag !== categoryName);

  return {
    id: post.id || slugify(post.title),
    title: post.title || "未命名文章",
    date: post.date || new Date().toISOString().slice(0, 10),
    category,
    tag: tags.join("，"),
    tags,
    image: post.image || "assets/cover-morning.jpg",
    layout: post.layout || "standard",
    pinned: Boolean(post.pinned),
    sortOrder: normalizeSortOrder(post.sortOrder),
    excerpt: post.excerpt || "",
    content: post.content || ""
  };
}

function normalizeSortOrder(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const order = Number(value);
  return Number.isFinite(order) ? order : undefined;
}

function categoryLabel(category) {
  return {
    daily: "日常思考",
    work: "工作思考",
    reading: "阅读笔记",
    knowledge: "知识沉淀"
  }[category] || "日常思考";
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value.join("，") : String(value || "");
  return [...new Set(raw.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean))];
}

function readPosts() {
  return fs
    .readdirSync(contentDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => parsePostMarkdown(path.join(contentDir, file)))
    .filter(Boolean)
    .sort(comparePosts);
}

function comparePosts(a, b) {
  return (
    Number(b.pinned) - Number(a.pinned) ||
    getSortValue(b) - getSortValue(a) ||
    b.date.localeCompare(a.date) ||
    b.title.localeCompare(a.title)
  );
}

function getSortValue(post) {
  return normalizeSortOrder(post.sortOrder) ?? Number(post.fileMtime || 0);
}

function writePost(post) {
  const existing = post.id ? readPosts().find((item) => item.id === post.id) : null;
  const safePost = normalizePost({
    ...post,
    pinned: post.pinned ?? existing?.pinned ?? false,
    sortOrder: post.sortOrder ?? existing?.sortOrder ?? Date.now()
  });
  const filePath = path.join(contentDir, `${safeFileName(safePost.id)}.md`);
  fs.writeFileSync(filePath, postToMarkdown(safePost), "utf8");
  return safePost;
}

function deletePost(id) {
  const filePath = path.join(contentDir, `${safeFileName(id)}.md`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function togglePinnedPost(id) {
  const post = readPosts().find((item) => item.id === id);
  if (!post) return null;
  return writePost({
    ...post,
    pinned: !post.pinned
  });
}

function reorderPosts(ids) {
  const posts = readPosts();
  const postMap = new Map(posts.map((post) => [post.id, post]));
  const base = Date.now() + ids.length;
  const changed = [];

  ids.forEach((id, index) => {
    const post = postMap.get(id);
    if (!post) return;
    changed.push(
      writePost({
        ...post,
        sortOrder: base - index
      })
    );
  });

  return changed;
}

function saveDataUrl(dataUrl, prefix = "image", pendingWrites = []) {
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/);
  if (!match) return dataUrl;

  const mime = match[1].replace("jpg", "jpeg");
  const ext = mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1];
  const fileName = `${safeFileName(prefix)}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const filePath = path.join(uploadDir, fileName);
  const content = Buffer.from(match[2], "base64");
  fs.writeFileSync(filePath, content);
  pendingWrites.push({ relativePath: `assets/uploads/${fileName}`, content });
  return `assets/uploads/${fileName}`;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64")
  };
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;

  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer
      .slice(offset + 30, offset + 30 + fileNameLength)
      .toString("utf8");
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = buffer.slice(dataStart, dataEnd);

    if (method === 0) {
      entries.set(fileName, compressed);
    } else if (method === 8) {
      entries.set(fileName, zlib.inflateRawSync(compressed));
    }

    offset = dataEnd;
  }

  return entries;
}

function extractDocxText(buffer) {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml");
  if (!documentXml) {
    throw new Error("没有找到 Word 正文内容。");
  }

  const xml = documentXml.toString("utf8");
  return xml
    .split(/<\/w:p>/)
    .map((paragraph) => {
      return [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXml(match[1]))
        .join("");
    })
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractImportedText(fileName, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("文件格式不正确。");
  }

  const ext = path.extname(fileName || "").toLowerCase();
  if (ext === ".txt" || parsed.mime.startsWith("text/")) {
    return parsed.buffer.toString("utf8").replace(/^\uFEFF/, "");
  }

  if (ext === ".docx") {
    return extractDocxText(parsed.buffer);
  }

  if (ext === ".doc") {
    throw new Error("暂不支持旧版 .doc，请另存为 .docx 或 .txt 后再导入。");
  }

  throw new Error("暂时只支持 .txt 和 .docx 导入。");
}

function persistPostImages(post, pendingWrites = []) {
  const safePost = { ...post };
  safePost.image = saveDataUrl(safePost.image, `${safePost.id}-cover`, pendingWrites);
  safePost.content = String(safePost.content || "").replace(
    /!\[([^\]]*)]\((data:image\/[^)]+)\)/g,
    (_, alt, dataUrl) => `![${alt}](${saveDataUrl(dataUrl, `${safePost.id}-inline`, pendingWrites)})`
  );
  return safePost;
}

function githubContentUrl(relativePath) {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${githubRepo}/contents/${encodedPath}`;
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 404) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `GitHub request failed: ${response.status}`);
  }
  return payload;
}

async function getGitHubSha(relativePath) {
  if (!githubToken || !githubRepo) return null;
  const payload = await githubRequest(`${githubContentUrl(relativePath)}?ref=${encodeURIComponent(githubBranch)}`);
  return payload?.sha || null;
}

async function putGitHubFile(relativePath, content, message) {
  if (!githubToken || !githubRepo) return;

  const sha = await getGitHubSha(relativePath);
  await githubRequest(githubContentUrl(relativePath), {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString("base64"),
      branch: githubBranch,
      ...(sha ? { sha } : {})
    })
  });
}

async function deleteGitHubFile(relativePath, message) {
  if (!githubToken || !githubRepo) return;

  const sha = await getGitHubSha(relativePath);
  if (!sha) return;

  await githubRequest(githubContentUrl(relativePath), {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha,
      branch: githubBranch
    })
  });
}

async function pushGitHubWrites(writes, message) {
  for (const write of writes) {
    await putGitHubFile(write.relativePath, write.content, message);
  }
}

function renderMarkdown(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraphLines = [];

  function flushParagraph() {
    const rendered = renderParagraphLines(paragraphLines);
    if (rendered) html.push(rendered);
    paragraphLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      const language = trimmed.replace(/^```/, "").trim().toLowerCase();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      html.push(renderCodeBlock(language, codeLines.join("\n")));
      continue;
    }

    if (isTableStart(lines, index)) {
      flushParagraph();
      const tableLines = [lines[index], lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderTable(tableLines));
      continue;
    }

    if (isTabbedTableStart(lines, index)) {
      flushParagraph();
      const tableLines = [];
      while (index < lines.length && lines[index].includes("\t")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderDelimitedTable(tableLines, "\t"));
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      html.push(`<figure><img src="${escapeHtml(publicMediaSrc(imageMatch[2]))}" alt="${escapeHtml(imageMatch[1] || "文章图片")}" />${
        imageMatch[1] ? `<figcaption>${escapeHtml(imageMatch[1])}</figcaption>` : ""
      }</figure>`);
      continue;
    }

    if (isMarkdownHeading(trimmed)) {
      flushParagraph();
      html.push(renderMarkdownHeading(trimmed));
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().replace(/^> ?/, ""));
        index += 1;
      }
      index -= 1;
      html.push(`<blockquote>${renderParagraphLines(quoteLines)}</blockquote>`);
      continue;
    }

    if (trimmed === "---") {
      flushParagraph();
      html.push("<hr />");
      continue;
    }

    if (isAutoSectionHeading(trimmed)) {
      flushParagraph();
      pushAutoSection(html, trimmed);
      continue;
    }

    if (isListLine(trimmed)) {
      flushParagraph();
      const listLines = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (isListLine(current)) {
          listLines.push(current);
          index += 1;
          continue;
        }

        let nextIndex = index;
        while (nextIndex < lines.length && !lines[nextIndex].trim()) {
          nextIndex += 1;
        }

        if (nextIndex > index && isListLine(lines[nextIndex]?.trim() || "")) {
          index = nextIndex;
          continue;
        }

        break;
      }
      index -= 1;
      html.push(renderListBlock(listLines.join("\n")));
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();

  return html.length ? html.join("") : "<p>这篇文章还没有正文。</p>";
}

function publicMediaSrc(value) {
  const src = String(value || "").trim();
  if (!src) return src;
  if (/^(https?:|data:|\/)/i.test(src)) return src;
  if (src.startsWith("assets/")) return `/${src}`;
  return src;
}

function renderParagraphLines(lines) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^\[center][\s\S]*\[\/center]$/.test(line)) {
        return `<p class="center-paragraph">${renderInline(line)}</p>`;
      }
      return `<p>${renderInline(line)}</p>`;
    })
    .join("");
}

function isAutoSectionHeading(line) {
  return isChineseSectionHeading(line) || isConclusionHeading(line);
}

function pushAutoSection(html, line) {
  if (html.at(-1) === "<hr />") {
    html.pop();
  }

  const className = isConclusionHeading(line) ? "auto-section conclusion-section" : "auto-section";
  html.push(`<hr class="auto-section-rule" /><h3 class="${className}">${renderInline(line)}</h3>`);
}

function isChineseSectionHeading(block) {
  const line = block.trim();
  return (
    !line.includes("\n") &&
    line.length <= 42 &&
    (/^[一二三四五六七八九十]+[、.．]\s*\S+/.test(line) ||
      /^第[一二三四五六七八九十\d]+(?:[章节部分条点个、.．：:]|\s+)\s*\S+/.test(line))
  );
}

function isConclusionHeading(block) {
  const line = block.trim();
  return !line.includes("\n") && line.length <= 42 && /^(结语|结论|总结|尾声|写在最后)(?:\s|：|:|$)/.test(line);
}

function isMarkdownHeading(line) {
  return /^#{1,4}\s+\S+/.test(line);
}

function renderMarkdownHeading(line) {
  const match = line.match(/^(#{1,4})\s+(.+)$/);
  const level = Math.min(4, match[1].length + 1);
  return `<h${level}>${renderInline(match[2])}</h${level}>`;
}

function isListLine(line) {
  return /^([-*]|[0-9]+[.)、])\s*\S+/.test(line);
}

function renderListBlock(block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const ordered = lines.every((line) => /^[0-9]+[.)、]\s*\S+/.test(line));
  const items = lines
    .map((line) => line.replace(/^([-*]|[0-9]+[.)、])\s*/, ""))
    .map((line) => `<li>${renderInline(line)}</li>`)
    .join("");
  return ordered ? `<ol class="auto-list">${items}</ol>` : `<ul class="auto-list">${items}</ul>`;
}

function renderCodeBlock(language, code) {
  if (language === "mermaid") {
    return `<div class="chart-block"><div class="mermaid">${escapeHtml(code)}</div></div>`;
  }
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

function isTableStart(lines, index) {
  const header = lines[index]?.trim() || "";
  const separator = lines[index + 1]?.trim() || "";
  return header.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separator);
}

function isTabbedTableStart(lines, index) {
  const current = lines[index] || "";
  const next = lines[index + 1] || "";
  return current.includes("\t") && next.includes("\t");
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines) {
  const header = splitTableRow(lines[0]);
  const body = lines.slice(2).map(splitTableRow);
  return renderTableRows(header, body);
}

function renderDelimitedTable(lines, delimiter) {
  const rows = lines
    .map((line) => line.split(delimiter).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return "";
  return renderTableRows(rows[0], rows.slice(1));
}

function renderTableRows(header, body) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>
        <tbody>
          ${body
            .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInline(value) {
  let output = escapeHtml(value);

  output = output.replace(
    /\[color=(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)]([\s\S]*?)\[\/color]/g,
    '<span style="color: $1">$2</span>'
  );
  output = output.replace(/\[size=(\d{1,2})]([\s\S]*?)\[\/size]/g, (_, size, text) => {
    const safeSize = Math.min(48, Math.max(12, Number(size)));
    return `<span style="font-size: ${safeSize}px">${text}</span>`;
  });
  output = output.replace(/\[center]([\s\S]*?)\[\/center]/g, '<span class="text-center">$1</span>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return output;
}

function publicPost(post, includeContent = false) {
  const base = {
    id: post.id,
    title: post.title,
    date: post.date,
    category: post.category,
    tag: post.tag,
    tags: post.tags || normalizeTags(post.tag),
    image: post.image,
    layout: post.layout,
    pinned: Boolean(post.pinned),
    sortOrder: post.sortOrder,
    excerpt: post.excerpt
  };
  if (includeContent) {
    base.content = post.content;
    base.html = renderMarkdown(post.content);
  }
  return base;
}

function canEnterNormally(identity, secret) {
  const looksLikeEmail = /\S+@\S+\.\S+/.test(identity);
  return (identity === inviteCode && !secret) || (looksLikeEmail && secret === inviteCode);
}

async function handleApi(req, res, route) {
  if (route === "/api/session" && req.method === "GET") {
    const session = readSession(req);
    json(res, 200, { authenticated: Boolean(session), admin: Boolean(session?.admin) });
    return;
  }

  if (route === "/api/login" && req.method === "POST") {
    const { identity = "", secret = "" } = await readJson(req);
    const cleanIdentity = String(identity).trim();
    const cleanSecret = String(secret).trim();

    if (cleanIdentity === adminUsername && cleanSecret === adminPassword) {
      setSession(res, "admin");
      json(res, 200, { authenticated: true, admin: true });
      return;
    }

    if (cleanIdentity === adminUsername && cleanSecret && cleanSecret !== adminPassword) {
      json(res, 401, { error: "bad_invite", message: "邀请码不对。" });
      return;
    }

    if (canEnterNormally(cleanIdentity, cleanSecret)) {
      setSession(res, "reader");
      json(res, 200, { authenticated: true, admin: false });
      return;
    }

    json(res, 401, { error: "invite_required", message: "邮箱已收到，但需要邀请码才可以进入。" });
    return;
  }

  if (route === "/api/logout" && req.method === "POST") {
    clearSession(res);
    json(res, 200, { ok: true });
    return;
  }

  if (route === "/api/posts" && req.method === "GET") {
    if (!requireReader(req, res)) return;
    json(res, 200, { posts: readPosts().map((post) => publicPost(post)) });
    return;
  }

  if (route === "/api/posts/order" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [];
    if (!ids.length) {
      json(res, 400, { error: "bad_request", message: "没有收到排序列表。" });
      return;
    }

    const changed = reorderPosts(ids);
    for (const post of changed) {
      await putGitHubFile(`content/posts/${safeFileName(post.id)}.md`, postToMarkdown(post), "Reorder notes");
    }
    json(res, 200, { posts: readPosts().map((post) => publicPost(post)) });
    return;
  }

  const postMatch = route.match(/^\/api\/posts\/([^/]+)$/);
  const pinMatch = route.match(/^\/api\/posts\/([^/]+)\/pin$/);
  if (postMatch && req.method === "GET") {
    if (!requireReader(req, res)) return;
    const post = readPosts().find((item) => item.id === decodeURIComponent(postMatch[1]));
    if (!post) {
      json(res, 404, { error: "not_found" });
      return;
    }
    json(res, 200, { post: publicPost(post, true) });
    return;
  }

  if (pinMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(pinMatch[1]);
    const post = togglePinnedPost(id);
    if (!post) {
      json(res, 404, { error: "not_found" });
      return;
    }
    await putGitHubFile(`content/posts/${safeFileName(post.id)}.md`, postToMarkdown(post), `Toggle pinned note: ${post.title}`);
    json(res, 200, { post: publicPost(post, true) });
    return;
  }

  if (route === "/api/posts" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const pendingWrites = [];
    const post = writePost(persistPostImages(normalizePost(body.post || body), pendingWrites));
    pendingWrites.push({
      relativePath: `content/posts/${safeFileName(post.id)}.md`,
      content: postToMarkdown(post)
    });
    await pushGitHubWrites(pendingWrites, `Update note: ${post.title}`);
    json(res, 200, { post: publicPost(post, true) });
    return;
  }

  if (postMatch && req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(postMatch[1]);
    deletePost(id);
    await deleteGitHubFile(`content/posts/${safeFileName(id)}.md`, `Delete note: ${id}`);
    json(res, 200, { ok: true });
    return;
  }

  if (route === "/api/export" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    json(res, 200, { posts: readPosts() });
    return;
  }

  if (route === "/api/import" && req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const text = extractImportedText(body.fileName, body.dataUrl);
    json(res, 200, { text });
    return;
  }

  json(res, 404, { error: "not_found" });
}

function serveStatic(req, res, cleanUrl) {
  const route =
    cleanUrl === "/" || cleanUrl === "/admin" || cleanUrl.startsWith("/post/")
      ? "/index.html"
      : cleanUrl;
  const allowed =
    route === "/index.html" ||
    route === "/styles.css" ||
    route === "/script.js" ||
    route.startsWith("/assets/");

  if (!allowed) {
    send(res, 404, "Not found");
    return;
  }

  if (route.startsWith("/content/")) {
    send(res, 404, "Not found");
    return;
  }

  if (route.startsWith("/assets/uploads/") && !requireReader(req, res)) {
    return;
  }

  const filePath = path.normalize(path.join(root, route));

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }

    send(res, 200, data, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const cleanUrl = decodeURIComponent(req.url.split("?")[0]);

    if (cleanUrl.startsWith("/api/")) {
      await handleApi(req, res, cleanUrl);
      return;
    }

    serveStatic(req, res, cleanUrl);
  } catch (error) {
    json(res, 500, { error: "server_error", message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Preview available at http://127.0.0.1:${port}`);
});
