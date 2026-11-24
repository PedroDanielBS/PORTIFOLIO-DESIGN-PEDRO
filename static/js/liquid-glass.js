/* Liquid Glass Optical Interaction & Smooth Motion Utilities */

export function initLiquidGlass(root = document) {
  const surfaces = root.querySelectorAll(".liquid-glass");
  surfaces.forEach((el) => {
    if (el.dataset.glassBound === "1") return;
    el.dataset.glassBound = "1";

    let rafId = null;
    let targetX = 50;
    let targetY = 0;

    const apply = () => {
      el.style.setProperty("--mx", `${targetX.toFixed(1)}%`);
      el.style.setProperty("--my", `${targetY.toFixed(1)}%`);
      rafId = null;
    };

    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      targetX = ((e.clientX - rect.left) / rect.width) * 100;
      targetY = ((e.clientY - rect.top) / rect.height) * 100;
      if (!rafId) rafId = requestAnimationFrame(apply);
    });
  });
}

export function initRevealObserver(root = document) {
  const els = root.querySelectorAll(".reveal:not(.is-visible)");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -32px 0px" }
  );

  els.forEach((el) => io.observe(el));
}

export function initActiveNavTracking() {
  const links = Array.from(document.querySelectorAll(".nav-link[data-section]"));
  const sections = links
    .map((link) => document.getElementById(link.dataset.section))
    .filter(Boolean);

  if (!sections.length || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          links.forEach((l) => l.classList.toggle("is-active", l.dataset.section === id));
        }
      });
    },
    { rootMargin: "-35% 0px -55% 0px" }
  );

  sections.forEach((sec) => io.observe(sec));
}

/**
 * Interactive 60fps optical-glass kinetic showreel renderer
 * Used for the initial seeded demo video (`demo://optical-reel`) before Pedro uploads an MP4.
 */
export function mountOpticalDemoReel(canvas, { onProgress } = {}) {
  const ctx = canvas.getContext("2d");
  let playing = false;
  let elapsed = 0;
  const duration = 18; // seconds loop
  let lastTs = 0;
  let rafId = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    const w = canvas.clientWidth || 960;
    const h = canvas.clientHeight || 540;
    ctx.clearRect(0, 0, w, h);

    // Obsidian studio backdrop
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#07080B");
    bg.addColorStop(0.5, "#0D0F14");
    bg.addColorStop(1, "#07080A");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Architectural hairline Swiss grid
    ctx.strokeStyle = "rgba(243, 244, 247, 0.045)";
    ctx.lineWidth = 1;
    const step = 64;
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const cx = w * 0.52;
    const cy = h * 0.5;
    const baseR = Math.min(w, h) * 0.28;

    // Interlocking optical glass & titanium arcs
    for (let i = 0; i < 5; i++) {
      const phase = t * (0.42 + i * 0.08) + i * 1.15;
      const rx = baseR * (0.62 + i * 0.14);
      const ry = rx * (0.46 + 0.14 * Math.sin(phase * 0.7));

      ctx.save();
      ctx.translate(cx + Math.cos(phase * 0.5) * 28, cy + Math.sin(phase * 0.4) * 14);
      ctx.rotate(phase * 0.35 + i * 0.4);

      const grad = ctx.createLinearGradient(-rx, -ry, rx, ry);
      grad.addColorStop(0, "rgba(243, 244, 247, 0.44)");
      grad.addColorStop(0.45, "rgba(127, 178, 255, 0.14)");
      grad.addColorStop(1, "rgba(243, 244, 247, 0.06)");

      ctx.strokeStyle = grad;
      ctx.lineWidth = i === 2 ? 2.4 : 1.25;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Specular caustic glint traveling along ring
      const gx = Math.cos(phase * 1.3) * rx;
      const gy = Math.sin(phase * 1.3) * ry;
      const glint = ctx.createRadialGradient(gx, gy, 0, gx, gy, 34);
      glint.addColorStop(0, "rgba(255, 255, 255, 0.55)");
      glint.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glint;
      ctx.beginPath();
      ctx.arc(gx, gy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Minimal editorial timecode watermark
    ctx.fillStyle = "rgba(243, 244, 247, 0.52)";
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillText(`OPTICAL STUDY // ${t.toFixed(2).padStart(5, "0")}s`, 28, 36);
  }

  function tick(ts) {
    if (!playing) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.1);
    lastTs = ts;
    elapsed = (elapsed + dt) % duration;
    draw(elapsed);
    if (onProgress) onProgress(elapsed, duration);
    rafId = requestAnimationFrame(tick);
  }

  resize();
  draw(elapsed);
  window.addEventListener("resize", () => {
    resize();
    draw(elapsed);
  });

  return {
    play() {
      if (playing) return;
      playing = true;
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
      return playing;
    },
    seek(ratio) {
      elapsed = Math.max(0, Math.min(1, ratio)) * duration;
      draw(elapsed);
      if (onProgress) onProgress(elapsed, duration);
    },
    isPlaying: () => playing,
    duration,
  };
}
