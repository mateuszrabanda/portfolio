const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

const rail = document.getElementById("rail");
const fade = document.getElementById("fade");
const cards = [...rail.querySelectorAll(".card")];
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- tag colours ---------- */

// Palette from the "colors" frame in Figma; tag text stays black on all of them.
const COLORS = ["#fa0abe", "#e8ff00", "#bf00ff", "#00fff5", "#0080ff", "#ff5252", "#ff8800"];
let lastColor = -1;

function paintTag(el) {
  let i;
  do i = Math.floor(Math.random() * COLORS.length);
  while (i === lastColor);
  lastColor = i;
  el.style.setProperty("--tag-bg", COLORS[i]);
}

// Cards without an image (or with a missing file) stay as grey placeholders.
cards.forEach((card) => {
  const img = card.querySelector("img");
  const markEmpty = () => {
    card.classList.add("empty");
    img?.remove();
  };
  if (!img) return markEmpty();
  if (img.complete && img.naturalWidth === 0) markEmpty();
  else img.addEventListener("error", markEmpty);
});

/* ---------- rail: smooth scroll, drag with momentum, snap ---------- */

const maxScroll = () => rail.scrollWidth - rail.clientWidth;
const stops = () => cards.map((c) => Math.min(c.offsetLeft, maxScroll()));
const nearest = (x) => stops().reduce((best, s) => (Math.abs(s - x) < Math.abs(best - x) ? s : best), 0);

let anim = null;
let animTarget = 0;

function stopAnim() {
  if (anim) cancelAnimationFrame(anim);
  anim = null;
  rail.classList.remove("animating");
}

function scrollToX(x) {
  stopAnim();
  x = clamp(x, 0, maxScroll());
  animTarget = x;
  if (reduced.matches) {
    rail.scrollLeft = x;
    return;
  }
  const from = rail.scrollLeft;
  const dist = x - from;
  const duration = Math.min(900, 420 + Math.abs(dist) * 0.35);
  const t0 = performance.now();
  // Touch snap would fight the per-frame scroll, so it's off while animating.
  rail.classList.add("animating");
  const step = (now) => {
    const p = clamp((now - t0) / duration, 0, 1);
    rail.scrollLeft = from + dist * easeOutQuart(p);
    if (p < 1) anim = requestAnimationFrame(step);
    else stopAnim();
  };
  anim = requestAnimationFrame(step);
}

// Arrows count from where a running animation is heading, so quick clicks add up.
const arrowBase = () => (anim ? animTarget : rail.scrollLeft);

nextBtn.addEventListener("click", () => {
  const x = arrowBase();
  scrollToX(stops().find((s) => s > x + 4) ?? maxScroll());
});

prevBtn.addEventListener("click", () => {
  const x = arrowBase();
  scrollToX([...stops()].reverse().find((s) => s < x - 4) ?? 0);
});

// The rail spans the whole page width, so shots slide out past the column on
// both sides. Left padding keeps the first card aligned with the column; the
// space after the track lets the rail stop with the last card's right edge
// flush with the column's right edge.
const railWrap = rail.parentElement;
const track = rail.querySelector(".track");
const pageEl = document.getElementById("page");
const colEl = document.querySelector(".col");

function sizeRail() {
  const page = pageEl.getBoundingClientRect();
  const inset = colEl.getBoundingClientRect().left - page.left;
  railWrap.style.marginLeft = `${-inset}px`;
  railWrap.style.width = `${page.width}px`;
  rail.style.paddingLeft = `${inset}px`;
  rail.style.scrollPaddingLeft = `${inset}px`;
  track.style.marginRight = `${Math.max(0, page.width - inset - colEl.offsetWidth)}px`;
  updateRail();
}

// The shot aligned with the column is the active one; the rest are dimmed.
// At the very end that's the last shot, flush with the column's right edge.
let activeCard = null;

function updateRail() {
  const x = rail.scrollLeft;
  const atEnd = x >= maxScroll() - 2;
  prevBtn.disabled = x <= 2;
  nextBtn.disabled = atEnd;
  fade.classList.toggle("off", atEnd);

  const s = stops();
  const i = atEnd && x > 2 ? cards.length - 1 : s.indexOf(nearest(x));
  if (cards[i] !== activeCard) {
    activeCard?.classList.remove("active");
    activeCard = cards[i];
    activeCard.classList.add("active");
  }
}
rail.addEventListener("scroll", updateRail, { passive: true });
rail.addEventListener("scrollend", updateRail);
// Observing the page also catches the scrollbar appearing or disappearing.
new ResizeObserver(sizeRail).observe(pageEl);

// Mouse drag. Touch uses native scrolling with CSS snap.
let drag = null;
let dragged = false;

rail.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  stopAnim();
  drag = { startX: e.clientX, startScroll: rail.scrollLeft, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  dragged = false;
});

addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  if (!dragged && Math.abs(dx) > 5) {
    dragged = true;
    rail.classList.add("dragging");
    hideCursor();
  }
  if (!dragged) return;
  rail.scrollLeft = drag.startScroll - dx;
  const dt = e.timeStamp - drag.lastT;
  if (dt > 0) drag.v = 0.8 * ((drag.lastX - e.clientX) / dt) + 0.2 * drag.v;
  drag.lastX = e.clientX;
  drag.lastT = e.timeStamp;
});

addEventListener("pointerup", () => {
  if (!drag) return;
  const { v } = drag;
  drag = null;
  rail.classList.remove("dragging");
  if (dragged) scrollToX(nearest(rail.scrollLeft + v * 320));
});

// A drag must not count as a click on the card under the pointer.
rail.addEventListener(
  "click",
  (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    dragged = false;
  },
  true
);

// Horizontal trackpad / shift+wheel: settle on the nearest card once it stops.
let wheelTimer;
rail.addEventListener(
  "wheel",
  (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) && !e.shiftKey) return;
    stopAnim();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => scrollToX(nearest(rail.scrollLeft)), 160);
  },
  { passive: true }
);

/* ---------- copy email: erase, "cooopied", retype ---------- */

const announce = document.getElementById("announce");

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

document.querySelectorAll("[data-copy]").forEach((link) => {
  const label = link.textContent;
  let busy = false;

  link.addEventListener("click", async (e) => {
    e.preventDefault();
    if (busy) return;
    // Without clipboard access fall back to the mailto link.
    if (!(await copyText(link.dataset.copy))) {
      location.href = link.href;
      return;
    }
    busy = true;
    // Lock the width so erasing letters doesn't shift the other links.
    link.style.width = `${link.offsetWidth}px`;
    announce.textContent = "Email address copied";
    const tick = reduced.matches ? 0 : 55;

    for (let i = label.length - 1; i >= 1 && tick; i--) {
      link.textContent = label.slice(0, i);
      await wait(tick);
    }
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "cooopied";
    paintTag(tag);
    link.replaceChildren(tag);
    await wait(1200);
    tag.classList.add("out");
    await wait(tick ? 220 : 0);
    for (let i = 1; i <= label.length && tick; i++) {
      link.textContent = label.slice(0, i);
      await wait(tick);
    }
    link.textContent = label;
    link.style.width = "";
    announce.textContent = "";
    busy = false;
  });
});

/* ---------- cursor label ---------- */

const cursor = document.getElementById("cursor");
let cx = 0, cy = 0, tx = 0, ty = 0;
let cursorOn = false;
let cursorRaf = null;

function placeCursor() {
  cursor.style.transform = `translate3d(${cx + 16}px, ${cy - 6}px, 0)`;
}

function showCursor(text) {
  if (cursor.textContent !== text) cursor.textContent = text;
  if (!cursorOn) {
    // Appear right at the pointer instead of gliding in from the last position.
    cx = tx;
    cy = ty;
    placeCursor();
    paintTag(cursor);
  }
  cursorOn = true;
  cursor.classList.add("on");
  if (!cursorRaf) cursorRaf = requestAnimationFrame(moveCursor);
}

function hideCursor() {
  cursorOn = false;
  cursor.classList.remove("on");
}

// Label sits to the right of the pointer, as in the "Work Hover" frame.
function moveCursor() {
  const k = reduced.matches ? 1 : 0.3;
  cx += (tx - cx) * k;
  cy += (ty - cy) * k;
  placeCursor();
  const settled = Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3;
  cursorRaf = cursorOn || !settled ? requestAnimationFrame(moveCursor) : null;
}

addEventListener("pointermove", (e) => {
  if (!finePointer.matches || e.pointerType !== "mouse") return;
  tx = e.clientX;
  ty = e.clientY;
  if (dragged) return;
  if (openCard) {
    if (e.target === lbImg || e.target === lbClose) hideCursor();
    else showCursor("close");
    return;
  }
  const card = e.target.closest?.(".card");
  if (card && !card.classList.contains("empty")) showCursor("expaaaand");
  else hideCursor();
});

document.addEventListener("pointerleave", hideCursor);

/* ---------- lightbox ---------- */

const page = document.getElementById("page");
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lb-img");
const lbTitle = document.getElementById("lb-title");
const lbClose = document.getElementById("lb-close");
let openCard = null;
let closing = false;

// Transform + clip that make the full lightbox image look exactly like the
// cropped thumbnail in the card (object-fit: cover, centred).
function cardPose(card) {
  const thumb = card.querySelector("img");
  const C = card.getBoundingClientRect();
  const F = lbImg.getBoundingClientRect();
  const s = Math.max(C.width / thumb.naturalWidth, C.height / thumb.naturalHeight);
  const regionW = (C.width / s / thumb.naturalWidth) * F.width;
  const regionH = (C.height / s / thumb.naturalHeight) * F.height;
  const offX = (F.width - regionW) / 2;
  const offY = (F.height - regionH) / 2;
  const k = C.width / regionW;
  return {
    transform: `translate(${C.left - F.left - offX * k}px, ${C.top - F.top - offY * k}px) scale(${k})`,
    clipPath: `inset(${offY}px ${offX}px ${offY}px ${offX}px)`,
  };
}

function setPose(pose, animate) {
  lbImg.style.transition = animate ? "transform .65s var(--ease), clip-path .65s var(--ease)" : "none";
  lbImg.style.transform = pose ? pose.transform : "none";
  lbImg.style.clipPath = pose ? pose.clipPath : "inset(0px 0px 0px 0px)";
}

function openLightbox(card) {
  if (openCard || card.classList.contains("empty")) return;
  const thumb = card.querySelector("img");
  openCard = card;
  lbImg.src = thumb.currentSrc || thumb.src;
  lbImg.alt = thumb.alt;
  lbTitle.textContent = card.dataset.title || "";

  const opened = cards.indexOf(card);
  cards.forEach((c, i) => c.style.setProperty("--d", `${Math.abs(i - opened) * 0.05}s`));
  card.classList.add("is-open");
  document.body.style.setProperty("--sbw", `${innerWidth - document.documentElement.clientWidth}px`);
  lb.hidden = false;
  page.inert = true;
  document.body.classList.add("lb-open");
  hideCursor();

  const run = () => {
    if (!reduced.matches) {
      setPose(cardPose(card), false);
      lbImg.getBoundingClientRect();
    }
    card.style.visibility = "hidden";
    lb.classList.add("on");
    setPose(null, !reduced.matches);
    lbClose.focus({ preventScroll: true });
  };
  if (lbImg.complete && lbImg.naturalWidth) run();
  else lbImg.addEventListener("load", run, { once: true });
}

function closeLightbox() {
  if (!openCard || closing) return;
  closing = true;
  const card = openCard;
  lb.classList.remove("on");
  document.body.classList.remove("lb-open");
  if (!reduced.matches) setPose(cardPose(card), true);

  setTimeout(() => {
    lb.hidden = true;
    setPose(null, false);
    card.style.visibility = "";
    card.classList.remove("is-open");
    page.inert = false;
    card.focus({ preventScroll: true });
    openCard = null;
    closing = false;
  }, reduced.matches ? 0 : 650);
}

cards.forEach((card) => card.addEventListener("click", () => openLightbox(card)));
lb.addEventListener("click", (e) => {
  if (e.target !== lbImg) closeLightbox();
});

addEventListener("keydown", (e) => {
  if (!openCard) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "Tab") {
    e.preventDefault();
    lbClose.focus();
  }
});
