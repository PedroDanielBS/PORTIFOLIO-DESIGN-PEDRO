import { DICTIONARY, getInitialLang, pickLang, setLang } from "./i18n.js";
import {
  initActiveNavTracking,
  initLiquidGlass,
  initRevealObserver,
  mountOpticalDemoReel,
} from "./liquid-glass.js";

const state = {
  lang: getInitialLang(),
  filter: "all",
  data: {
    profile: {},
    projects: [],
    experiences: [],
  },
  activeControllers: [],
};

const ICONS = {
  arrowUpRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>`,
  chevronLeft: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
  chevronRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
  play: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13l11-6.5-11-6.5z"/></svg>`,
  pause: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  volume: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`,
  mute: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>`,
  maximize: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  layers: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>`,
  film: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4V8z"/></svg>`,
  layout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
  mail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  phone: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  copy: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (
    s.startsWith("/") ||
    s.startsWith("https://") ||
    s.startsWith("http://") ||
    s.startsWith("mailto:") ||
    s.startsWith("demo://")
  ) {
    return s;
  }
  return "";
}

function parseEmbedVideo(url) {
  const clean = safeUrl(url);
  if (!clean) return null;
  if (clean === "demo://optical-reel") return { kind: "demo", src: clean };

  const ytMatch = clean.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    return {
      kind: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`,
    };
  }

  const vimeoMatch = clean.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return {
      kind: "iframe",
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}?title=0&byline=0&portrait=0`,
    };
  }

  return { kind: "native", src: clean };
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("is-shown");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("is-shown"), 2400);
}

function cleanupControllers() {
  state.activeControllers.forEach((ctrl) => ctrl.pause?.());
  state.activeControllers = [];
}

function renderStaticI18n() {
  const dict = DICTIONARY[state.lang];
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const path = el.dataset.i18n.split(".");
    let val = dict;
    for (const k of path) val = val?.[k];
    if (typeof val === "string") el.textContent = val;
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.lang === state.lang);
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === state.lang));
  });
}

function renderHeroAndProfile() {
  const p = state.data.profile || {};
  const dict = DICTIONARY[state.lang];
  const lang = state.lang;

  document.title = `${p.full_name || "Pedro Daniel"} — ${pickLang(p, "role", lang) || "Designer Gráfico"}`;

  const brandName = document.getElementById("brand-name");
  if (brandName) brandName.textContent = p.full_name || "Pedro Daniel";

  const heroImg = document.getElementById("hero-scene-img");
  if (heroImg && safeUrl(p.hero_image_url)) {
    heroImg.src = safeUrl(p.hero_image_url);
  }

  const availText = document.getElementById("availability-text");
  const availDot = document.getElementById("availability-dot");
  const availVal = pickLang(p, "availability", lang);
  if (availText && availVal) availText.textContent = availVal;
  if (availDot) availDot.classList.toggle("is-busy", p.available === false);

  const heroRole = document.getElementById("hero-role");
  const roleVal = pickLang(p, "role", lang);
  if (heroRole && roleVal) heroRole.textContent = roleVal;

  const heroTitle = document.getElementById("hero-title");
  const titleVal = pickLang(p, "headline", lang);
  if (heroTitle && titleVal) heroTitle.textContent = titleVal;

  const heroBio = document.getElementById("hero-bio");
  const bioVal = pickLang(p, "bio", lang);
  if (heroBio && bioVal) heroBio.textContent = bioVal;

  const heroWhatsapp = document.getElementById("hero-whatsapp-cta");
  if (heroWhatsapp && safeUrl(p.whatsapp_url)) {
    heroWhatsapp.href = safeUrl(p.whatsapp_url);
  }

  // Metrics strip
  const years = Number(p.years_experience ?? 5);
  document.getElementById("metric-exp").textContent = `${String(years).padStart(2, "0")} ${dict.hero.metricExpSuffix}`;
  document.getElementById("metric-location").textContent = pickLang(p, "location", lang) || "Brasil";
  document.getElementById("metric-works").textContent = String(state.data.projects.length).padStart(2, "0");

  // Contact section
  const emailVal = p.email || "Pedrodanielbonfa@gmail.com";
  const emailDisplay = document.getElementById("contact-email-value");
  const emailLink = document.getElementById("contact-email-link");
  if (emailDisplay) emailDisplay.textContent = emailVal;
  if (emailLink) emailLink.href = `mailto:${encodeURIComponent(emailVal)}`;

  const phoneVal = p.phone || "(77) 99802-5597";
  const phoneDisplay = document.getElementById("contact-phone-value");
  const phoneLink = document.getElementById("contact-phone-link");
  if (phoneDisplay) phoneDisplay.textContent = phoneVal;
  if (phoneLink && safeUrl(p.whatsapp_url)) phoneLink.href = safeUrl(p.whatsapp_url);

  const socialWrap = document.getElementById("social-links");
  if (socialWrap) {
    const socials = [
      { label: "Behance", url: p.behance_url },
      { label: "Dribbble", url: p.dribbble_url },
      { label: "LinkedIn", url: p.linkedin_url },
      { label: "Instagram", url: p.instagram_url },
    ].filter((s) => safeUrl(s.url));

    socialWrap.innerHTML = socials
      .map(
        (s) =>
          `<a class="social-link" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ${ICONS.arrowUpRight}</a>`
      )
      .join("");
  }

  const footerName = document.getElementById("footer-name");
  if (footerName) footerName.textContent = `${p.full_name || "Pedro Daniel"} · ${new Date().getFullYear()}`;
}

function renderFilterBar() {
  const bar = document.getElementById("works-filter-bar");
  if (!bar) return;
  const dict = DICTIONARY[state.lang].works;
  const projects = state.data.projects;

  const counts = {
    all: projects.length,
    card: projects.filter((p) => p.display_type === "card").length,
    carousel: projects.filter((p) => p.display_type === "carousel").length,
    video: projects.filter((p) => p.display_type === "video").length,
  };

  const tabs = [
    { key: "all", label: dict.all },
    { key: "card", label: dict.card },
    { key: "carousel", label: dict.carousel },
    { key: "video", label: dict.video },
  ];

  bar.innerHTML = tabs
    .map(
      (t) => `
      <button type="button" class="filter-btn ${state.filter === t.key ? "is-active" : ""}" data-filter="${t.key}">
        <span>${esc(t.label)}</span>
        <span class="filter-count">${String(counts[t.key]).padStart(2, "0")}</span>
      </button>
    `
    )
    .join("");

  bar.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderFilterBar();
      renderWorks();
    });
  });
}

function bindCarousel(stage, slides) {
  const track = stage.querySelector(".carousel-track");
  const prevBtn = stage.querySelector("[data-carousel-prev]");
  const nextBtn = stage.querySelector("[data-carousel-next]");
  const dots = Array.from(stage.querySelectorAll(".carousel-dot"));
  const captionEl = stage.querySelector("[data-carousel-caption]");
  const counterEl = stage.querySelector("[data-carousel-counter]");
  let idx = 0;

  function goTo(nextIdx) {
    idx = (nextIdx + slides.length) % slides.length;
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    if (captionEl) {
      captionEl.textContent = pickLang(slides[idx], "caption", state.lang) || "";
      captionEl.style.display = captionEl.textContent ? "block" : "none";
    }
    if (counterEl) {
      counterEl.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    }
  }

  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    goTo(idx - 1);
  });
  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    goTo(idx + 1);
  });
  dots.forEach((d, i) => {
    d.addEventListener("click", (e) => {
      e.stopPropagation();
      goTo(i);
    });
  });

  // Pointer drag / touch swipe
  let startX = 0;
  let dragging = false;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    startX = e.clientX;
  });
  stage.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 48) {
      goTo(dx < 0 ? idx + 1 : idx - 1);
    }
  });
  stage.addEventListener("pointercancel", () => {
    dragging = false;
  });

  goTo(0);
}

function resolveProjectVideoUrl(project) {
  if (!project) return "";
  if (project.video_url && String(project.video_url).trim()) return project.video_url;
  const fromMedia = (project.media_items || []).find((m) => m.type === "video" && m.url);
  return fromMedia ? fromMedia.url : "";
}

function bindVideoShowcase(stage, project) {
  const parsed = parseEmbedVideo(resolveProjectVideoUrl(project));
  if (!parsed) return;

  const overlay = stage.querySelector(".video-play-overlay");
  const playLens = stage.querySelector(".video-play-lens");
  const hud = stage.querySelector(".video-hud");

  if (parsed.kind === "iframe") {
    const startEmbed = () => {
      stage.innerHTML = `<iframe src="${esc(parsed.src)}&autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(pickLang(project, "title", state.lang))}"></iframe>`;
    };
    overlay?.addEventListener("click", startEmbed);
    return;
  }

  const toggleBtn = stage.querySelector("[data-video-toggle]");
  const muteBtn = stage.querySelector("[data-video-mute]");
  const volumeWrap = stage.querySelector(".video-volume-wrap");
  const volumeSlider = stage.querySelector("[data-video-volume]");
  const fsBtn = stage.querySelector("[data-video-fs]");
  const progress = stage.querySelector(".video-progress");
  const fill = stage.querySelector(".video-progress-fill");
  const timeEl = stage.querySelector(".video-time");

  if (parsed.kind === "demo") {
    const canvas = stage.querySelector("canvas");
    if (!canvas) return;
    const ctrl = mountOpticalDemoReel(canvas, {
      onProgress(cur, dur) {
        if (fill) fill.style.width = `${(cur / dur) * 100}%`;
        if (timeEl) timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      },
    });
    state.activeControllers.push(ctrl);

    const syncUI = (isPlaying) => {
      overlay?.classList.toggle("is-hidden", isPlaying);
      if (toggleBtn) toggleBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    };

    overlay?.addEventListener("click", () => {
      ctrl.play();
      syncUI(true);
    });
    toggleBtn?.addEventListener("click", () => syncUI(ctrl.toggle()));
    progress?.addEventListener("click", (e) => {
      const rect = progress.getBoundingClientRect();
      ctrl.seek((e.clientX - rect.left) / rect.width);
    });
    fsBtn?.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else stage.requestFullscreen?.();
    });
    if (volumeWrap) volumeWrap.style.display = "none";
    if (timeEl) timeEl.textContent = `00:00 / ${formatTime(ctrl.duration)}`;
    return;
  }

  // Native uploaded MP4 / WebM video (1080x1920 vertical or 16:9 horizontal)
  const video = stage.querySelector("video");
  if (!video) return;

  let lastVolume = 1;

  const syncUI = () => {
    const playing = !video.paused && !video.ended;
    overlay?.classList.toggle("is-hidden", playing);
    if (toggleBtn) toggleBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
    const effectiveMuted = video.muted || video.volume === 0;
    if (muteBtn) muteBtn.innerHTML = effectiveMuted ? ICONS.mute : ICONS.volume;
    if (volumeSlider) {
      const val = effectiveMuted ? 0 : video.volume;
      volumeSlider.value = String(val);
      volumeSlider.style.background = `linear-gradient(to right, var(--text-primary) ${val * 100}%, rgba(255,255,255,0.24) ${val * 100}%)`;
    }
  };

  const togglePlay = () => {
    if (video.paused || video.ended) {
      // Pause any other inline videos before playing this one
      document.querySelectorAll(".video-stage video").forEach((other) => {
        if (other !== video && !other.paused) other.pause();
      });
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  overlay?.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay();
  });
  playLens?.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay();
  });
  video.addEventListener("click", togglePlay);
  toggleBtn?.addEventListener("click", togglePlay);
  muteBtn?.addEventListener("click", () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = lastVolume > 0 ? lastVolume : 0.8;
    } else {
      lastVolume = video.volume;
      video.muted = true;
    }
    syncUI();
  });
  volumeSlider?.addEventListener("input", () => {
    const v = Math.max(0, Math.min(1, Number(volumeSlider.value)));
    video.volume = v;
    video.muted = v === 0;
    if (v > 0) lastVolume = v;
    syncUI();
  });
  fsBtn?.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  });
  progress?.addEventListener("click", (e) => {
    if (!video.duration) return;
    const rect = progress.getBoundingClientRect();
    video.currentTime = ((e.clientX - rect.left) / rect.width) * video.duration;
  });

  video.addEventListener("play", syncUI);
  video.addEventListener("pause", syncUI);
  video.addEventListener("ended", syncUI);
  video.addEventListener("volumechange", syncUI);
  video.addEventListener("loadedmetadata", () => {
    if (timeEl && video.duration) {
      timeEl.textContent = `00:00 / ${formatTime(video.duration)}`;
    }
  });
  video.addEventListener("timeupdate", () => {
    if (!video.duration) return;
    if (fill) fill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    if (timeEl) timeEl.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  });

  if (hud) syncUI();
}

function buildWorkMarkup(project, index) {
  const lang = state.lang;
  const dict = DICTIONARY[lang].works;
  const idxStr = String(index + 1).padStart(2, "0");
  const title = pickLang(project, "title", lang);
  const subtitle = pickLang(project, "subtitle", lang);
  const typeLabel = dict.typeLabels[project.display_type] || project.display_type;
  const cover = safeUrl(project.cover_url);
  const spanClass = `is-${project.display_type}`;

  let mediaHtml = "";

  if (project.display_type === "carousel") {
    const slides =
      project.media_items && project.media_items.length
        ? project.media_items
        : cover
        ? [{ url: cover, type: "image", caption_pt: subtitle, caption_en: subtitle }]
        : [];

    mediaHtml = `
      <div class="carousel-stage" data-carousel-id="${project.id}">
        <div class="work-badge-row">
          <span class="glass-chip">${ICONS.layers} ${esc(typeLabel)}</span>
          <span class="glass-chip mono" data-carousel-counter>01 / ${String(slides.length || 1).padStart(2, "0")}</span>
        </div>
        <div class="carousel-track">
          ${slides
            .map((s) => {
              const u = safeUrl(s.url);
              if (s.type === "video") {
                return `<div class="carousel-slide"><video src="${esc(u)}" muted loop playsinline autoplay></video></div>`;
              }
              return `<div class="carousel-slide"><img src="${esc(u)}" alt="${esc(title)}" loading="lazy" /></div>`;
            })
            .join("")}
        </div>
        <div class="carousel-controls">
          <div class="carousel-caption-pill liquid-glass" data-carousel-caption></div>
          <div class="carousel-nav-group liquid-glass">
            <button type="button" class="carousel-arrow" data-carousel-prev aria-label="Anterior">${ICONS.chevronLeft}</button>
            <div class="carousel-dots">
              ${slides.map((_, i) => `<button type="button" class="carousel-dot ${i === 0 ? "is-active" : ""}" aria-label="Slide ${i + 1}"></button>`).join("")}
            </div>
            <button type="button" class="carousel-arrow" data-carousel-next aria-label="Próximo">${ICONS.chevronRight}</button>
          </div>
        </div>
      </div>
    `;
  } else if (project.display_type === "video") {
    const resolvedVideo = resolveProjectVideoUrl(project);
    const parsed = parseEmbedVideo(resolvedVideo);
    const isDemo = parsed?.kind === "demo";
    const isNative = parsed?.kind === "native";
    const videoSrcWithFrame = isNative
      ? parsed.src.includes("#")
        ? parsed.src
        : `${parsed.src}#t=0.1`
      : "";
    mediaHtml = `
      <div class="video-stage" data-video-id="${project.id}">
        <div class="work-badge-row">
          <span class="glass-chip">${ICONS.film} ${esc(typeLabel)}</span>
          <span class="glass-chip mono">${esc(project.year || "2026")}</span>
        </div>
        ${
          isDemo
            ? `<canvas aria-label="${esc(title)}"></canvas>`
            : isNative
            ? `<video src="${esc(videoSrcWithFrame)}" ${cover ? `poster="${esc(cover)}"` : ""} playsinline preload="metadata"></video>`
            : cover
            ? `<img class="work-media-img" src="${esc(cover)}" alt="${esc(title)}" loading="lazy" />`
            : `<div style="width:100%;height:100%;background:#08090c;"></div>`
        }
        <div class="video-play-overlay" style="cursor:pointer;">
          <button type="button" class="video-play-lens liquid-glass" aria-label="${esc(dict.playReel)}">
            ${ICONS.play}
          </button>
          <span class="glass-chip">${esc(dict.playReel)}</span>
        </div>
        ${
          isDemo || isNative
            ? `
          <div class="video-hud liquid-glass">
            <button type="button" class="video-hud-btn" data-video-toggle aria-label="Play/Pause">${ICONS.play}</button>
            <div class="video-progress"><div class="video-progress-fill"></div></div>
            <span class="video-time">00:00 / 00:00</span>
            <div class="video-volume-wrap">
              <button type="button" class="video-hud-btn" data-video-mute aria-label="Mute">${ICONS.volume}</button>
              <input type="range" class="video-volume-slider" data-video-volume min="0" max="1" step="0.02" value="1" aria-label="Volume" />
            </div>
            <button type="button" class="video-hud-btn" data-video-fs aria-label="Fullscreen">${ICONS.maximize}</button>
          </div>
        `
            : ""
        }
      </div>
    `;
  } else {
    mediaHtml = `
      <div class="work-media-frame" data-open-project="${project.id}">
        <div class="work-badge-row">
          <span class="glass-chip">${ICONS.layout} ${esc(project.category || typeLabel)}</span>
          <span class="glass-chip mono">${esc(project.year || "2026")}</span>
        </div>
        <img class="work-media-img" src="${esc(cover)}" alt="${esc(title)}" loading="lazy" />
      </div>
    `;
  }

  return `
    <article class="work-item liquid-glass ${spanClass} reveal">
      ${mediaHtml}
      <div class="work-body">
        <div class="work-body-text">
          <div class="work-meta-top">
            <span class="mono">${idxStr}</span>
            <span>${esc(project.category)}</span>
            ${project.client ? `<span>· ${esc(project.client)}</span>` : ""}
          </div>
          <h3 class="work-title">${esc(title)}</h3>
          ${subtitle ? `<p class="work-subtitle">${esc(subtitle)}</p>` : ""}
        </div>
        <button type="button" class="work-open-btn" data-open-project="${project.id}" aria-label="${esc(dict.viewDetails)}">
          ${ICONS.arrowUpRight}
        </button>
      </div>
    </article>
  `;
}

function renderWorks() {
  cleanupControllers();
  const grid = document.getElementById("works-grid");
  if (!grid) return;

  const filtered =
    state.filter === "all"
      ? state.data.projects
      : state.data.projects.filter((p) => p.display_type === state.filter);

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="work-item" style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-secondary);">
        ${esc(DICTIONARY[state.lang].works.empty)}
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((p, i) => buildWorkMarkup(p, i)).join("");

  filtered.forEach((project) => {
    if (project.display_type === "carousel") {
      const stage = grid.querySelector(`[data-carousel-id="${project.id}"]`);
      const slides =
        project.media_items && project.media_items.length
          ? project.media_items
          : project.cover_url
          ? [{ url: project.cover_url, type: "image", caption_pt: project.subtitle_pt, caption_en: project.subtitle_en }]
          : [];
      if (stage && slides.length) bindCarousel(stage, slides);
    }
    if (project.display_type === "video") {
      const stage = grid.querySelector(`[data-video-id="${project.id}"]`);
      if (stage) bindVideoShowcase(stage, project);
    }
  });

  grid.querySelectorAll("[data-open-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.openProject);
      const found = state.data.projects.find((p) => p.id === id);
      if (found) openProjectModal(found);
    });
  });

  initLiquidGlass(grid);
  initRevealObserver(grid);
}

function renderExperiences() {
  const wrap = document.getElementById("experience-content");
  if (!wrap) return;
  const lang = state.lang;
  const dict = DICTIONARY[lang].experience;
  const items = state.data.experiences || [];

  if (!items.length) {
    const years = String(state.data.profile?.years_experience ?? 5).padStart(2, "0");
    wrap.innerHTML = `
      <div class="craft-grid reveal">
        <div class="craft-card is-hero-stat liquid-glass">
          <div class="craft-big-num mono">${esc(years)}+</div>
          <p class="craft-desc">${esc(dict.yearsCaption)}</p>
        </div>
        <div class="craft-card">
          <span class="mono" style="font-size:12px;color:var(--text-muted)">01</span>
          <div>
            <h3 class="craft-title">${esc(dict.pillar1Title)}</h3>
            <p class="craft-desc">${esc(dict.pillar1Desc)}</p>
          </div>
        </div>
        <div class="craft-card">
          <span class="mono" style="font-size:12px;color:var(--text-muted)">02</span>
          <div>
            <h3 class="craft-title">${esc(dict.pillar2Title)}</h3>
            <p class="craft-desc">${esc(dict.pillar2Desc)}</p>
          </div>
        </div>
      </div>
    `;
    initLiquidGlass(wrap);
    initRevealObserver(wrap);
    return;
  }

  wrap.innerHTML = `
    <div class="exp-list">
      ${items
        .map((exp) => {
          const highlights = exp[`highlights_${lang}`]?.length
            ? exp[`highlights_${lang}`]
            : exp.highlights_pt || [];
          return `
            <article class="exp-row reveal">
              <div>
                <div class="exp-period">${esc(pickLang(exp, "period", lang))}</div>
                <div class="exp-location">${esc(pickLang(exp, "location", lang))}</div>
              </div>
              <div>
                <h3 class="exp-role">${esc(pickLang(exp, "role", lang))}</h3>
                <div class="exp-company">${esc(exp.company)}</div>
                ${
                  pickLang(exp, "summary", lang)
                    ? `<p class="exp-summary">${esc(pickLang(exp, "summary", lang))}</p>`
                    : ""
                }
                ${
                  highlights.length
                    ? `<ul class="exp-highlights">${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
                    : ""
                }
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  initRevealObserver(wrap);
}

function openProjectModal(project) {
  // Pause any background inline videos so audio never overlaps
  document.querySelectorAll(".video-stage video").forEach((v) => v.pause());

  const backdrop = document.getElementById("project-modal");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  if (!backdrop || !bodyEl) return;

  const lang = state.lang;
  const dict = DICTIONARY[lang].modal;
  const typeLabel = DICTIONARY[lang].works.typeLabels[project.display_type] || project.display_type;

  titleEl.textContent = pickLang(project, "title", lang);

  // Build ordered slide list (video first if video project, plus media_items or cover)
  const slides = [];
  const resolvedVideo = resolveProjectVideoUrl(project);
  if (project.display_type === "video" && resolvedVideo) {
    const parsed = parseEmbedVideo(resolvedVideo);
    if (parsed?.kind === "iframe") {
      slides.push({ kind: "iframe", url: parsed.src, caption: pickLang(project, "subtitle", lang) });
    } else if (parsed?.kind === "native") {
      slides.push({
        kind: "video",
        url: parsed.src,
        poster: safeUrl(project.cover_url),
        caption: pickLang(project, "subtitle", lang),
      });
    }
  }

  const rawMedia =
    project.media_items && project.media_items.length
      ? project.media_items
      : project.cover_url
      ? [{ url: project.cover_url, type: "image", caption_pt: "", caption_en: "" }]
      : [];

  rawMedia.forEach((m) => {
    const u = safeUrl(m.url);
    if (!u) return;
    if (slides.some((s) => s.url === u)) return;
    slides.push({
      kind: m.type === "video" ? "video" : "image",
      url: u,
      caption: pickLang(m, "caption", lang),
    });
  });

  const extUrl = safeUrl(project.external_url);
  const desc = pickLang(project, "description", lang) || pickLang(project, "subtitle", lang);

  bodyEl.innerHTML = `
    <div class="modal-stage" id="modal-stage"></div>
    <div class="modal-sidebar">
      <div class="modal-meta-grid">
        <div><span class="metric-label">${esc(dict.client)}</span><div class="metric-value">${esc(project.client || "—")}</div></div>
        <div><span class="metric-label">${esc(dict.year)}</span><div class="metric-value mono">${esc(project.year || "—")}</div></div>
        <div><span class="metric-label">${esc(dict.role)}</span><div class="metric-value">${esc(pickLang(project, "role", lang) || "Designer")}</div></div>
        <div><span class="metric-label">${esc(dict.format)}</span><div class="metric-value">${esc(typeLabel)}</div></div>
      </div>

      ${desc ? `<p class="modal-desc">${esc(desc)}</p>` : ""}

      ${
        project.deliverables?.length
          ? `<div class="modal-tags">${project.deliverables.map((d) => `<span class="tag-item">${esc(d)}</span>`).join("")}</div>`
          : ""
      }

      ${
        extUrl
          ? `<div><a class="btn btn-primary btn-sm" href="${esc(extUrl)}" target="_blank" rel="noopener noreferrer">${esc(dict.visitExternal)} ${ICONS.arrowUpRight}</a></div>`
          : ""
      }

      ${
        slides.length > 1
          ? `<div class="modal-thumbs" id="modal-thumbs">
              ${slides
                .map((s, i) =>
                  s.kind === "image"
                    ? `<button type="button" class="modal-thumb-btn ${i === 0 ? "is-active" : ""}" data-modal-idx="${i}" aria-label="Mídia ${i + 1}"><img src="${esc(s.url)}" alt="" /></button>`
                    : `<button type="button" class="modal-thumb-btn ${i === 0 ? "is-active" : ""}" data-modal-idx="${i}" aria-label="Vídeo ${i + 1}" style="display:grid;place-items:center;color:var(--text-primary);">${ICONS.film}</button>`
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;

  let currentIdx = 0;
  const stageEl = document.getElementById("modal-stage");
  const thumbBtns = Array.from(bodyEl.querySelectorAll(".modal-thumb-btn"));

  function renderStage(idx) {
    if (!slides.length) {
      stageEl.innerHTML = "";
      return;
    }
    currentIdx = (idx + slides.length) % slides.length;
    const s = slides[currentIdx];

    let mediaTag = "";
    if (s.kind === "iframe") {
      mediaTag = `<iframe src="${esc(s.url)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else if (s.kind === "video") {
      mediaTag = `<video class="modal-stage-media" src="${esc(s.url)}" ${s.poster ? `poster="${esc(s.poster)}"` : ""} controls playsinline></video>`;
    } else {
      mediaTag = `<img class="modal-stage-media" src="${esc(s.url)}" alt="${esc(s.caption || pickLang(project, "title", lang))}" />`;
    }

    const navHtml =
      slides.length > 1 || s.caption
        ? `
        <div class="modal-stage-nav">
          ${s.caption ? `<div class="modal-stage-caption liquid-glass">${esc(s.caption)}</div>` : ""}
          ${
            slides.length > 1
              ? `
              <div class="modal-stage-arrows liquid-glass">
                <button type="button" class="carousel-arrow" id="modal-prev" aria-label="Anterior">${ICONS.chevronLeft}</button>
                <span class="mono" style="font-size:11px;padding-inline:4px;color:var(--text-secondary);">${String(currentIdx + 1).padStart(2, "0")}/${String(slides.length).padStart(2, "0")}</span>
                <button type="button" class="carousel-arrow" id="modal-next" aria-label="Próximo">${ICONS.chevronRight}</button>
              </div>
            `
              : ""
          }
        </div>
      `
        : "";

    stageEl.innerHTML = mediaTag + navHtml;
    stageEl.querySelector("#modal-prev")?.addEventListener("click", () => renderStage(currentIdx - 1));
    stageEl.querySelector("#modal-next")?.addEventListener("click", () => renderStage(currentIdx + 1));
    thumbBtns.forEach((b, i) => b.classList.toggle("is-active", i === currentIdx));
  }

  thumbBtns.forEach((b) => {
    b.addEventListener("click", () => renderStage(Number(b.dataset.modalIdx)));
  });

  renderStage(0);
  backdrop.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeProjectModal() {
  const backdrop = document.getElementById("project-modal");
  if (!backdrop) return;
  // Stop all video/audio playback inside modal immediately
  backdrop.querySelectorAll("video").forEach((v) => {
    v.pause();
    v.removeAttribute("src");
    v.load();
  });
  const bodyEl = document.getElementById("modal-body");
  if (bodyEl) bodyEl.innerHTML = "";
  backdrop.classList.remove("is-open");
  document.body.style.overflow = "";
}

function renderAll() {
  renderStaticI18n();
  renderHeroAndProfile();
  renderFilterBar();
  renderWorks();
  renderExperiences();
}

async function bootstrap() {
  setLang(state.lang);

  // Language switcher
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lang = btn.dataset.lang;
      setLang(state.lang);
      renderAll();
    });
  });

  // Mobile menu
  const menuBtn = document.getElementById("mobile-menu-btn");
  const drawer = document.getElementById("mobile-drawer");
  menuBtn?.addEventListener("click", () => {
    const open = drawer.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  drawer?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => drawer.classList.remove("is-open"));
  });

  // Copy email button
  document.getElementById("copy-email-btn")?.addEventListener("click", async () => {
    const email = state.data.profile?.email || "Pedrodanielbonfa@gmail.com";
    try {
      await navigator.clipboard.writeText(email);
      showToast(DICTIONARY[state.lang].contact.copied);
    } catch {
      showToast(email);
    }
  });

  // Modal close handlers
  document.getElementById("modal-close")?.addEventListener("click", closeProjectModal);
  document.getElementById("project-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "project-modal") closeProjectModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeProjectModal();
  });

  try {
    const res = await fetch("/api/public/portfolio", { headers: { Accept: "application/json" } });
    if (res.ok) {
      state.data = await res.json();
    }
  } catch (err) {
    console.error("Failed to load portfolio:", err);
  }

  renderAll();
  initLiquidGlass(document);
  initRevealObserver(document);
  initActiveNavTracking();
}

bootstrap();
