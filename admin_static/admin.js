/* Private Admin Studio SPA — Served strictly to authenticated sessions */

const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content || "";
const ADMIN_PATH = document.querySelector('meta[name="admin-path"]')?.content || "/studio-admin";

const state = {
  admin: {},
  profile: {},
  projects: [],
  experiences: [],
  sessions: [],
  login_attempts: [],
  editingMedia: [],
  selectedType: "card",
};

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-shown");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("is-shown"), 2800);
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && options.method !== "GET") {
    headers["X-CSRF-Token"] = CSRF_TOKEN;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    window.location.replace(ADMIN_PATH);
    throw new Error("Sessão expirada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || "Operação não concluída");
  }
  return data;
}

async function uploadFile(file) {
  // 1. Ask server whether to use Signed Direct Upload (Vercel + Supabase) or local upload
  const sign = await api("/api/admin/upload/sign", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      size: file.size,
      content_type: file.type || "application/octet-stream",
    }),
  });

  if (sign.mode === "signed" && sign.signed_url) {
    const putRes = await fetch(sign.signed_url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error("Falha ao enviar arquivo para o Supabase Storage.");
    }
    return {
      url: sign.public_url,
      type: sign.type,
      filename: sign.filename,
      size: file.size,
    };
  }

  // Local fallback
  const fd = new FormData();
  fd.append("file", file);
  return api("/api/admin/upload", { method: "POST", body: fd });
}

/* ── View Switching ─────────────────────────────────────────────────────── */
function switchView(viewId) {
  document.querySelectorAll(".sidebar-item[data-view]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === viewId);
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `view-${viewId}`);
  });
}

document.querySelectorAll(".sidebar-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

/* ── Overview ───────────────────────────────────────────────────────────── */
function renderOverview() {
  const published = state.projects.filter((p) => p.status === "published").length;
  const drafts = state.projects.filter((p) => p.status === "draft").length;
  document.getElementById("stat-published").textContent = String(published).padStart(2, "0");
  document.getElementById("stat-drafts").textContent = String(drafts).padStart(2, "0");
  document.getElementById("stat-experiences").textContent = String(state.experiences.length).padStart(2, "0");
  document.getElementById("stat-sessions").textContent = String(state.sessions.length).padStart(2, "0");
}

/* ── Projects Manager ───────────────────────────────────────────────────── */
function setDisplayType(type) {
  state.selectedType = type;
  document.querySelectorAll("#proj-type-selector .type-option").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.type === type);
  });
  document.getElementById("proj-video-block").style.display = type === "video" ? "flex" : "none";
}

document.querySelectorAll("#proj-type-selector .type-option").forEach((btn) => {
  btn.addEventListener("click", () => setDisplayType(btn.dataset.type));
});

function renderMediaSlidesEditor() {
  const list = document.getElementById("media-slides-list");
  if (!state.editingMedia.length) {
    list.innerHTML = `<div style="font-size:13px;color:var(--text-muted);">Nenhuma mídia adicional adicionada.</div>`;
    return;
  }

  list.innerHTML = state.editingMedia
    .map(
      (m, i) => `
      <div class="media-slide-row" data-idx="${i}">
        ${
          m.type === "video"
            ? `<video src="${esc(m.url)}" class="item-thumb" muted></video>`
            : `<img src="${esc(m.url)}" class="item-thumb" alt="Slide ${i + 1}" />`
        }
        <input class="input" data-slide-pt="${i}" value="${esc(m.caption_pt || "")}" placeholder="Legenda (PT)" />
        <input class="input" data-slide-en="${i}" value="${esc(m.caption_en || "")}" placeholder="Caption (EN)" />
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn btn-ghost btn-sm" data-slide-up="${i}" title="Subir">↑</button>
          <button type="button" class="btn btn-danger btn-sm" data-slide-del="${i}">Remover</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll("[data-slide-pt]").forEach((inp) => {
    inp.addEventListener("input", () => {
      state.editingMedia[Number(inp.dataset.slidePt)].caption_pt = inp.value;
    });
  });
  list.querySelectorAll("[data-slide-en]").forEach((inp) => {
    inp.addEventListener("input", () => {
      state.editingMedia[Number(inp.dataset.slideEn)].caption_en = inp.value;
    });
  });
  list.querySelectorAll("[data-slide-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.slideUp);
      if (i <= 0) return;
      const tmp = state.editingMedia[i - 1];
      state.editingMedia[i - 1] = state.editingMedia[i];
      state.editingMedia[i] = tmp;
      renderMediaSlidesEditor();
    });
  });
  list.querySelectorAll("[data-slide-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editingMedia.splice(Number(btn.dataset.slideDel), 1);
      renderMediaSlidesEditor();
    });
  });
}

function openProjectEditor(project = null) {
  const panel = document.getElementById("project-editor-panel");
  const titleEl = document.getElementById("project-editor-title");
  panel.style.display = "block";

  if (!project) {
    titleEl.textContent = "Novo trabalho";
    document.getElementById("proj-id").value = "";
    document.getElementById("proj-title-pt").value = "";
    document.getElementById("proj-title-en").value = "";
    document.getElementById("proj-sub-pt").value = "";
    document.getElementById("proj-sub-en").value = "";
    document.getElementById("proj-category").value = "UI/UX";
    document.getElementById("proj-year").value = String(new Date().getFullYear());
    document.getElementById("proj-client").value = "";
    document.getElementById("proj-external").value = "";
    document.getElementById("proj-role-pt").value = "Designer Gráfico & UI/UX";
    document.getElementById("proj-role-en").value = "Graphic & UI/UX Designer";
    document.getElementById("proj-deliverables").value = "";
    document.getElementById("proj-desc-pt").value = "";
    document.getElementById("proj-desc-en").value = "";
    document.getElementById("proj-cover-url").value = "";
    document.getElementById("proj-video-url").value = "";
    document.getElementById("proj-featured").checked = false;
    document.getElementById("proj-status").value = "published";
    state.editingMedia = [];
    setDisplayType("card");
  } else {
    titleEl.textContent = `Editar: ${project.title_pt}`;
    document.getElementById("proj-id").value = project.id;
    document.getElementById("proj-title-pt").value = project.title_pt || "";
    document.getElementById("proj-title-en").value = project.title_en || "";
    document.getElementById("proj-sub-pt").value = project.subtitle_pt || "";
    document.getElementById("proj-sub-en").value = project.subtitle_en || "";
    document.getElementById("proj-category").value = project.category || "UI/UX";
    document.getElementById("proj-year").value = project.year || "2026";
    document.getElementById("proj-client").value = project.client || "";
    document.getElementById("proj-external").value = project.external_url || "";
    document.getElementById("proj-role-pt").value = project.role_pt || "";
    document.getElementById("proj-role-en").value = project.role_en || "";
    document.getElementById("proj-deliverables").value = (project.deliverables || []).join(", ");
    document.getElementById("proj-desc-pt").value = project.description_pt || "";
    document.getElementById("proj-desc-en").value = project.description_en || "";
    document.getElementById("proj-cover-url").value = project.cover_url || "";
    document.getElementById("proj-video-url").value = project.video_url || "";
    document.getElementById("proj-featured").checked = Boolean(project.featured);
    document.getElementById("proj-status").value = project.status || "published";
    state.editingMedia = (project.media_items || []).map((m) => ({ ...m }));
    setDisplayType(project.display_type || "card");
  }

  renderMediaSlidesEditor();
  updateCoverPreview(document.getElementById("proj-cover-url").value.trim());
  setUploadStatus("");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderProjectsList() {
  const list = document.getElementById("projects-list");
  if (!state.projects.length) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:14px;">Nenhum trabalho cadastrado ainda.</div>`;
    return;
  }

  const typeNames = { card: "Card", carousel: "Carrossel", video: "Vídeo" };

  list.innerHTML = state.projects
    .map(
      (p, idx) => `
      <div class="item-row">
        <div class="item-row-left">
          ${
            p.cover_url
              ? `<img class="item-thumb" src="${esc(p.cover_url)}" alt="${esc(p.title_pt)}" />`
              : `<div class="item-thumb"></div>`
          }
          <div style="min-width:0;">
            <div class="item-title">${esc(p.title_pt)}</div>
            <div class="item-meta">
              <span class="status-tag">${esc(typeNames[p.display_type] || p.display_type)}</span>
              <span class="status-tag ${p.status === "published" ? "is-ok" : "is-draft"}">${
                p.status === "published" ? "Publicado" : "Rascunho"
              }</span>
              <span>${esc(p.category)}</span>
              <span class="mono">${esc(p.year)}</span>
            </div>
          </div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-move-proj="${idx}" data-dir="-1" title="Mover acima">↑</button>
          <button type="button" class="btn btn-ghost btn-sm" data-move-proj="${idx}" data-dir="1" title="Mover abaixo">↓</button>
          <button type="button" class="btn btn-ghost btn-sm" data-edit-proj="${p.id}">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-del-proj="${p.id}">Excluir</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll("[data-edit-proj]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = state.projects.find((x) => x.id === Number(btn.dataset.editProj));
      if (p) openProjectEditor(p);
    });
  });

  list.querySelectorAll("[data-del-proj]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.delProj);
      if (!confirm("Excluir este trabalho permanentemente?")) return;
      try {
        await api(`/api/admin/projects/${id}`, { method: "DELETE" });
        toast("Trabalho excluído");
        await loadBootstrap();
      } catch (err) {
        toast(err.message);
      }
    });
  });

  list.querySelectorAll("[data-move-proj]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.moveProj);
      const dir = Number(btn.dataset.dir);
      const target = idx + dir;
      if (target < 0 || target >= state.projects.length) return;
      const arr = [...state.projects];
      const [moved] = arr.splice(idx, 1);
      arr.splice(target, 0, moved);
      try {
        await api("/api/admin/projects/reorder", {
          method: "POST",
          body: JSON.stringify({ ids: arr.map((x) => x.id) }),
        });
        toast("Ordem atualizada");
        await loadBootstrap();
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

// Cover preview helper
function updateCoverPreview(url) {
  const box = document.getElementById("proj-cover-preview");
  if (!box) return;
  if (!url) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  box.style.display = "block";
  box.innerHTML = `<img src="${esc(url)}" alt="Prévia da capa" style="max-height:140px;border-radius:var(--r-sm);border:1px solid var(--border-subtle);" />`;
}

function setUploadStatus(msg, isError = false) {
  const el = document.getElementById("upload-status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger)" : "var(--text-secondary)";
}

document.getElementById("proj-cover-url").addEventListener("input", (e) => {
  updateCoverPreview(e.target.value.trim());
});

// Explicit button triggers (avoids nested-input click recursion)
const coverFileInput = document.getElementById("proj-cover-file");
document.getElementById("proj-cover-btn").addEventListener("click", () => coverFileInput.click());

coverFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    setUploadStatus(`Enviando capa (${file.name})...`);
    toast("Enviando capa...");
    const up = await uploadFile(file);
    document.getElementById("proj-cover-url").value = up.url;
    updateCoverPreview(up.url);
    setUploadStatus("Capa enviada com sucesso.");
    toast("Capa enviada");
  } catch (err) {
    setUploadStatus(err.message, true);
    toast(err.message);
  } finally {
    e.target.value = "";
  }
});

const videoFileInput = document.getElementById("proj-video-file");
document.getElementById("proj-video-btn").addEventListener("click", () => videoFileInput.click());

videoFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    setUploadStatus(`Enviando vídeo (${file.name})...`);
    toast("Enviando vídeo...");
    const up = await uploadFile(file);
    document.getElementById("proj-video-url").value = up.url;
    setUploadStatus("Vídeo enviado com sucesso.");
    toast("Vídeo enviado");
  } catch (err) {
    setUploadStatus(err.message, true);
    toast(err.message);
  } finally {
    e.target.value = "";
  }
});

async function handleMultiMediaFiles(files) {
  let okCount = 0;
  for (const file of Array.from(files)) {
    try {
      setUploadStatus(`Enviando ${file.name}...`);
      toast(`Enviando ${file.name}...`);
      const up = await uploadFile(file);
      state.editingMedia.push({
        url: up.url,
        type: up.type,
        caption_pt: "",
        caption_en: "",
      });
      okCount += 1;
      if (!document.getElementById("proj-cover-url").value && up.type === "image") {
        document.getElementById("proj-cover-url").value = up.url;
        updateCoverPreview(up.url);
      }
      if (state.selectedType === "video" && !document.getElementById("proj-video-url").value && up.type === "video") {
        document.getElementById("proj-video-url").value = up.url;
      }
      renderMediaSlidesEditor();
    } catch (err) {
      setUploadStatus(`Erro em ${file.name}: ${err.message}`, true);
      toast(err.message);
    }
  }
  if (okCount > 0) {
    setUploadStatus(`${okCount} arquivo(s) enviado(s) com sucesso.`);
    toast("Mídias adicionadas");
  }
}

const dropzone = document.getElementById("media-dropzone");
const multiInput = document.getElementById("media-multi-file");
multiInput.addEventListener("click", (e) => e.stopPropagation());
dropzone.addEventListener("click", () => multiInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    multiInput.click();
  }
});
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("is-dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("is-dragover");
  if (e.dataTransfer?.files?.length) handleMultiMediaFiles(e.dataTransfer.files);
});
multiInput.addEventListener("change", (e) => {
  if (e.target.files?.length) handleMultiMediaFiles(e.target.files);
  e.target.value = "";
});

document.getElementById("project-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("proj-id").value;
  const payload = {
    display_type: state.selectedType,
    title_pt: document.getElementById("proj-title-pt").value.trim(),
    title_en: document.getElementById("proj-title-en").value.trim(),
    subtitle_pt: document.getElementById("proj-sub-pt").value.trim(),
    subtitle_en: document.getElementById("proj-sub-en").value.trim(),
    category: document.getElementById("proj-category").value,
    year: document.getElementById("proj-year").value.trim(),
    client: document.getElementById("proj-client").value.trim(),
    external_url: document.getElementById("proj-external").value.trim(),
    role_pt: document.getElementById("proj-role-pt").value.trim(),
    role_en: document.getElementById("proj-role-en").value.trim(),
    deliverables: document
      .getElementById("proj-deliverables")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    description_pt: document.getElementById("proj-desc-pt").value.trim(),
    description_en: document.getElementById("proj-desc-en").value.trim(),
    cover_url: document.getElementById("proj-cover-url").value.trim(),
    video_url: document.getElementById("proj-video-url").value.trim(),
    media_items: state.editingMedia,
    featured: document.getElementById("proj-featured").checked,
    status: document.getElementById("proj-status").value,
    sort_order: 0,
  };

  try {
    if (id) {
      const existing = state.projects.find((p) => p.id === Number(id));
      payload.sort_order = existing?.sort_order || 0;
      await api(`/api/admin/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast("Trabalho atualizado");
    } else {
      await api("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Trabalho publicado");
    }
    document.getElementById("project-editor-panel").style.display = "none";
    await loadBootstrap();
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("new-project-btn").addEventListener("click", () => openProjectEditor(null));
document.getElementById("cancel-project-btn").addEventListener("click", () => {
  document.getElementById("project-editor-panel").style.display = "none";
});

/* ── Experiences Manager ────────────────────────────────────────────────── */
function openExpEditor(exp = null) {
  const panel = document.getElementById("exp-editor-panel");
  const titleEl = document.getElementById("exp-editor-title");
  panel.style.display = "block";

  if (!exp) {
    titleEl.textContent = "Nova experiência";
    document.getElementById("exp-id").value = "";
    document.getElementById("exp-company").value = "";
    document.getElementById("exp-role-pt").value = "";
    document.getElementById("exp-role-en").value = "";
    document.getElementById("exp-period-pt").value = "";
    document.getElementById("exp-period-en").value = "";
    document.getElementById("exp-loc-pt").value = "";
    document.getElementById("exp-loc-en").value = "";
    document.getElementById("exp-sum-pt").value = "";
    document.getElementById("exp-sum-en").value = "";
    document.getElementById("exp-hi-pt").value = "";
    document.getElementById("exp-hi-en").value = "";
    document.getElementById("exp-visible").checked = true;
  } else {
    titleEl.textContent = `Editar: ${exp.company}`;
    document.getElementById("exp-id").value = exp.id;
    document.getElementById("exp-company").value = exp.company || "";
    document.getElementById("exp-role-pt").value = exp.role_pt || "";
    document.getElementById("exp-role-en").value = exp.role_en || "";
    document.getElementById("exp-period-pt").value = exp.period_pt || "";
    document.getElementById("exp-period-en").value = exp.period_en || "";
    document.getElementById("exp-loc-pt").value = exp.location_pt || "";
    document.getElementById("exp-loc-en").value = exp.location_en || "";
    document.getElementById("exp-sum-pt").value = exp.summary_pt || "";
    document.getElementById("exp-sum-en").value = exp.summary_en || "";
    document.getElementById("exp-hi-pt").value = (exp.highlights_pt || []).join("\n");
    document.getElementById("exp-hi-en").value = (exp.highlights_en || []).join("\n");
    document.getElementById("exp-visible").checked = Boolean(exp.visible);
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderExperiencesList() {
  const list = document.getElementById("experiences-list");
  if (!state.experiences.length) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:14px;">Nenhuma experiência cadastrada ainda. Clique em "Adicionar experiência" para começar.</div>`;
    return;
  }

  list.innerHTML = state.experiences
    .map(
      (e) => `
      <div class="item-row">
        <div>
          <div class="item-title">${esc(e.role_pt)} · ${esc(e.company)}</div>
          <div class="item-meta">
            <span class="mono">${esc(e.period_pt)}</span>
            ${e.location_pt ? `<span>· ${esc(e.location_pt)}</span>` : ""}
            <span class="status-tag ${e.visible ? "is-ok" : "is-draft"}">${e.visible ? "Visível" : "Oculta"}</span>
          </div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-exp="${e.id}">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-del-exp="${e.id}">Excluir</button>
        </div>
      </div>
    `
    )
    .join("");

  list.querySelectorAll("[data-edit-exp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const exp = state.experiences.find((x) => x.id === Number(btn.dataset.editExp));
      if (exp) openExpEditor(exp);
    });
  });

  list.querySelectorAll("[data-del-exp]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.delExp);
      if (!confirm("Remover esta experiência?")) return;
      try {
        await api(`/api/admin/experiences/${id}`, { method: "DELETE" });
        toast("Experiência removida");
        await loadBootstrap();
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

document.getElementById("exp-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("exp-id").value;
  const payload = {
    company: document.getElementById("exp-company").value.trim(),
    role_pt: document.getElementById("exp-role-pt").value.trim(),
    role_en: document.getElementById("exp-role-en").value.trim(),
    period_pt: document.getElementById("exp-period-pt").value.trim(),
    period_en: document.getElementById("exp-period-en").value.trim(),
    location_pt: document.getElementById("exp-loc-pt").value.trim(),
    location_en: document.getElementById("exp-loc-en").value.trim(),
    summary_pt: document.getElementById("exp-sum-pt").value.trim(),
    summary_en: document.getElementById("exp-sum-en").value.trim(),
    highlights_pt: document
      .getElementById("exp-hi-pt")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    highlights_en: document
      .getElementById("exp-hi-en")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    visible: document.getElementById("exp-visible").checked,
    sort_order: 0,
  };

  try {
    if (id) {
      await api(`/api/admin/experiences/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast("Experiência atualizada");
    } else {
      await api("/api/admin/experiences", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Experiência adicionada");
    }
    document.getElementById("exp-editor-panel").style.display = "none";
    await loadBootstrap();
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("new-exp-btn").addEventListener("click", () => openExpEditor(null));
document.getElementById("cancel-exp-btn").addEventListener("click", () => {
  document.getElementById("exp-editor-panel").style.display = "none";
});

/* ── Profile Editor ─────────────────────────────────────────────────────── */
function updateAvatarPreview(url) {
  const box = document.getElementById("prof-avatar-preview");
  if (!box) return;
  const src = url || "/static/assets/pedro-profile.jpg";
  box.style.display = "flex";
  box.style.alignItems = "center";
  box.style.gap = "12px";
  box.innerHTML = `<img src="${esc(src)}" alt="Prévia da foto do card" style="width:92px;height:104px;object-fit:cover;object-position:center 18%;border-radius:14px;border:1px solid var(--border-medium);" /><span style="font-size:12px;color:var(--text-muted);">Prévia no recorte do card</span>`;
}

function populateProfileForm() {
  const p = state.profile || {};
  document.getElementById("prof-name").value = p.full_name || "";
  document.getElementById("prof-years").value = p.years_experience ?? 5;
  document.getElementById("prof-role-pt").value = p.role_pt || "";
  document.getElementById("prof-role-en").value = p.role_en || "";
  document.getElementById("prof-head-pt").value = p.headline_pt || "";
  document.getElementById("prof-head-en").value = p.headline_en || "";
  document.getElementById("prof-bio-pt").value = p.bio_pt || "";
  document.getElementById("prof-bio-en").value = p.bio_en || "";
  document.getElementById("prof-loc-pt").value = p.location_pt || "";
  document.getElementById("prof-loc-en").value = p.location_en || "";
  document.getElementById("prof-avail-pt").value = p.availability_pt || "";
  document.getElementById("prof-avail-en").value = p.availability_en || "";
  document.getElementById("prof-email").value = p.email || "";
  document.getElementById("prof-phone").value = p.phone || "";
  document.getElementById("prof-whatsapp").value = p.whatsapp_url || "";
  document.getElementById("prof-behance").value = p.behance_url || "";
  document.getElementById("prof-dribbble").value = p.dribbble_url || "";
  document.getElementById("prof-linkedin").value = p.linkedin_url || "";
  document.getElementById("prof-instagram").value = p.instagram_url || "";
  document.getElementById("prof-avatar-img").value = p.avatar_url || "";
  updateAvatarPreview(p.avatar_url || "");
  document.getElementById("prof-available").checked = p.available !== false;
}

const avatarFileInput = document.getElementById("prof-avatar-file");
document.getElementById("prof-avatar-btn").addEventListener("click", () => avatarFileInput.click());
document.getElementById("prof-avatar-img").addEventListener("input", (e) => {
  updateAvatarPreview(e.target.value.trim());
});

function buildProfilePayload() {
  return {
    full_name: document.getElementById("prof-name").value.trim(),
    years_experience: Number(document.getElementById("prof-years").value || 5),
    role_pt: document.getElementById("prof-role-pt").value.trim(),
    role_en: document.getElementById("prof-role-en").value.trim(),
    headline_pt: document.getElementById("prof-head-pt").value.trim(),
    headline_en: document.getElementById("prof-head-en").value.trim(),
    bio_pt: document.getElementById("prof-bio-pt").value.trim(),
    bio_en: document.getElementById("prof-bio-en").value.trim(),
    location_pt: document.getElementById("prof-loc-pt").value.trim(),
    location_en: document.getElementById("prof-loc-en").value.trim(),
    availability_pt: document.getElementById("prof-avail-pt").value.trim(),
    availability_en: document.getElementById("prof-avail-en").value.trim(),
    available: document.getElementById("prof-available").checked,
    email: document.getElementById("prof-email").value.trim(),
    phone: document.getElementById("prof-phone").value.trim(),
    whatsapp_url: document.getElementById("prof-whatsapp").value.trim(),
    behance_url: document.getElementById("prof-behance").value.trim(),
    dribbble_url: document.getElementById("prof-dribbble").value.trim(),
    linkedin_url: document.getElementById("prof-linkedin").value.trim(),
    instagram_url: document.getElementById("prof-instagram").value.trim(),
    avatar_url: document.getElementById("prof-avatar-img").value.trim(),
    hero_image_url: state.profile.hero_image_url || "",
  };
}

avatarFileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    toast("Enviando foto do card...");
    const up = await uploadFile(file);
    document.getElementById("prof-avatar-img").value = up.url;
    updateAvatarPreview(up.url);
    // Auto-save profile immediately so the new card photo goes live right away
    await api("/api/admin/profile", { method: "PUT", body: JSON.stringify(buildProfilePayload()) });
    toast("Foto do card atualizada e salva!");
    await loadBootstrap();
  } catch (err) {
    toast(err.message);
  } finally {
    e.target.value = "";
  }
});

document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = buildProfilePayload();

  try {
    await api("/api/admin/profile", { method: "PUT", body: JSON.stringify(payload) });
    toast("Perfil salvo");
    await loadBootstrap();
  } catch (err) {
    toast(err.message);
  }
});

/* ── Security Panel ─────────────────────────────────────────────────────── */
function renderSecurity() {
  const sTbody = document.getElementById("sessions-tbody");
  sTbody.innerHTML = state.sessions
    .map(
      (s) => `
      <tr>
        <td class="mono">${esc(s.ip)}</td>
        <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.user_agent)}</td>
        <td class="mono">${esc(s.created_at.slice(0, 19).replace("T", " "))}</td>
        <td>${s.is_current ? `<span class="status-tag is-ok">Sessão atual</span>` : `<span class="status-tag">Ativa</span>`}</td>
      </tr>
    `
    )
    .join("");

  const aTbody = document.getElementById("attempts-tbody");
  aTbody.innerHTML = state.login_attempts
    .map(
      (a) => `
      <tr>
        <td class="mono">${esc(a.attempted_at.slice(0, 19).replace("T", " "))}</td>
        <td class="mono">${esc(a.ip)}</td>
        <td>${esc(a.email_attempted)}</td>
        <td>${a.success ? `<span class="status-tag is-ok">Autorizado</span>` : `<span class="status-tag is-draft">Recusado</span>`}</td>
      </tr>
    `
    )
    .join("");
}

document.getElementById("security-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current_password = document.getElementById("sec-current").value;
  const new_email = document.getElementById("sec-email").value.trim() || null;
  const new_password = document.getElementById("sec-new-pass").value || null;

  if (!new_email && !new_password) {
    toast("Informe um novo e-mail ou uma nova senha");
    return;
  }

  try {
    const res = await api("/api/admin/security/credentials", {
      method: "POST",
      body: JSON.stringify({ current_password, new_email, new_password }),
    });
    document.getElementById("sec-current").value = "";
    document.getElementById("sec-email").value = "";
    document.getElementById("sec-new-pass").value = "";
    if (res.email) document.getElementById("sidebar-email").textContent = res.email;
    toast("Credenciais atualizadas com segurança");
    await loadBootstrap();
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("revoke-others-btn").addEventListener("click", async () => {
  try {
    await api("/api/admin/security/revoke-others", { method: "POST" });
    toast("Outras sessões encerradas");
    await loadBootstrap();
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.replace(ADMIN_PATH);
  }
});

document.getElementById("quick-new-project").addEventListener("click", () => {
  switchView("projects");
  openProjectEditor(null);
});

document.getElementById("quick-new-exp").addEventListener("click", () => {
  switchView("experiences");
  openExpEditor(null);
});

async function loadBootstrap() {
  const data = await api("/api/admin/bootstrap");
  state.admin = data.admin || {};
  state.profile = data.profile || {};
  state.projects = data.projects || [];
  state.experiences = data.experiences || [];
  state.sessions = data.sessions || [];
  state.login_attempts = data.login_attempts || [];

  renderOverview();
  renderProjectsList();
  renderExperiencesList();
  populateProfileForm();
  renderSecurity();
}

loadBootstrap().catch((err) => toast(err.message));
