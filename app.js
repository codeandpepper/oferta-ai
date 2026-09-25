const REPO_OWNER = "codeandpepper";
const REPO_NAME = "oferta-ai";
const BRANCH = "main";
const FILES_ROOT = "pliki";

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

const ICONS = {
  pdf: "📕", doc: "📄", docx: "📄", txt: "📄", md: "📝",
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️", webp: "🖼️",
  xlsx: "📊", xls: "📊", csv: "📊",
  ppt: "📽️", pptx: "📽️",
  zip: "🗜️", dir: "📁",
};

function ext(name) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

async function loadMarkdown(path, targetId) {
  const el = document.getElementById(targetId);
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    el.innerHTML = marked.parse(text);
  } catch (e) {
    el.innerHTML = `<p class="file-error">Nie udało się wczytać ${path}.</p>`;
  }
}

let currentPath = FILES_ROOT;

async function loadFiles(path) {
  currentPath = path;
  renderBreadcrumbs(path);
  const grid = document.getElementById("files-grid");
  grid.innerHTML = "Ładowanie…";
  try {
    const res = await fetch(`${API_BASE}/${path}?ref=${BRANCH}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      grid.innerHTML = `<div class="file-empty">Pusto. Wrzuć pliki do folderu <code>${path}</code>.</div>`;
      return;
    }
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    grid.innerHTML = "";
    items
      .filter((item) => !item.name.startsWith("."))
      .forEach((item) => grid.appendChild(renderFileCard(item)));
  } catch (e) {
    grid.innerHTML = `<div class="file-error">Nie udało się wczytać listy plików (limit GitHub API lub folder nie istnieje).</div>`;
  }
}

function renderBreadcrumbs(path) {
  const nav = document.getElementById("breadcrumbs");
  const parts = path.split("/");
  nav.innerHTML = "";
  parts.forEach((part, i) => {
    const subPath = parts.slice(0, i + 1).join("/");
    const btn = document.createElement("button");
    btn.textContent = part;
    btn.onclick = () => loadFiles(subPath);
    nav.appendChild(btn);
    if (i < parts.length - 1) nav.appendChild(document.createTextNode(" / "));
  });
}

function renderFileCard(item) {
  const row = document.createElement("div");
  row.className = "file-row";
  const iconKey = item.type === "dir" ? "dir" : ext(item.name);
  const icon = ICONS[iconKey] || "📦";
  row.innerHTML = `<span class="file-icon">${icon}</span><span class="file-name" title="${item.name}">${item.name}</span>`;
  row.onclick = () => {
    if (item.type === "dir") {
      loadFiles(item.path);
    } else {
      openPreview(item);
    }
  };
  return row;
}

function openPreview(item) {
  const overlay = document.getElementById("preview-overlay");
  const title = document.getElementById("preview-title");
  const body = document.getElementById("preview-body");
  title.textContent = item.name;
  body.innerHTML = "Ładowanie…";
  overlay.classList.remove("hidden");

  const e = ext(item.name);
  const rawUrl = `${RAW_BASE}/${item.path}`;

  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(e)) {
    body.innerHTML = `<img src="${rawUrl}" alt="${item.name}">`;
  } else if (e === "pdf") {
    body.innerHTML = `<iframe src="${rawUrl}"></iframe>`;
  } else if (["md", "txt"].includes(e)) {
    fetch(rawUrl, { cache: "no-store" })
      .then((r) => r.text())
      .then((text) => {
        body.innerHTML = e === "md" ? marked.parse(text) : `<pre>${escapeHtml(text)}</pre>`;
      })
      .catch(() => (body.innerHTML = `<p class="file-error">Nie udało się wczytać podglądu.</p>`));
  } else {
    body.innerHTML = `<p>Podgląd niedostępny dla tego typu pliku.</p>
      <a class="download-link" href="${rawUrl}" download>Pobierz plik</a>`;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

document.getElementById("preview-close").onclick = () => {
  document.getElementById("preview-overlay").classList.add("hidden");
};
document.getElementById("preview-overlay").addEventListener("click", (e) => {
  if (e.target.id === "preview-overlay") e.target.classList.add("hidden");
});

loadMarkdown("main.md", "main-content");
loadMarkdown("links.md", "links-content");
loadFiles(FILES_ROOT);
