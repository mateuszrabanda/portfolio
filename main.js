const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

const rail = document.getElementById("rail");
const track = rail.querySelector(".track");
const shots = [...track.children];

// Cards without an image or video (or with a missing file) stay as grey placeholders.
shots.forEach((li) => {
  const card = li.querySelector(".card");
  const img = card.querySelector("img, video");
  const markEmpty = () => {
    card.classList.add("empty");
    img?.remove();
    const label = document.createElement("span");
    label.className = "soon";
    label.textContent = "coming soon";
    card.append(label);
  };
  if (!img) return markEmpty();
  if (img.tagName === "IMG" && img.complete && img.naturalWidth === 0) markEmpty();
  else img.addEventListener("error", markEmpty);
});

/* ---------- rail: an endless strip drifting slowly to the left ---------- */

// The shots are laid out three times over, so the strip never runs out; copies
// are hidden from screen readers and the tab order. The strip shows the middle
// set and jumps by one set's width whenever it drifts (or is dragged) too far.
const SETS = 3;
for (let i = 1; i < SETS; i++) {
  shots.forEach((li) => {
    const copy = li.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.querySelector(".card").tabIndex = -1;
    track.append(copy);
  });
}
const cards = [...track.querySelectorAll(".card")];
const n = shots.length;

const SPEED = 28; // px per second
let pos = 0; // how far the track has moved left
let speed = 0; // current drift; eases towards SPEED, or to 0 while paused
let fling = 0; // leftover speed after letting go of a drag, dies away
let hovered = false;
let touchHold = 0; // after a touch, the strip waits a moment before drifting on

const setWidth = () => cards[n].offsetLeft - cards[0].offsetLeft;

function wrap() {
  const w = setWidth();
  if (w > 0) pos = w + ((((pos - w) % w) + w) % w);
}

function place() {
  wrap();
  track.style.transform = `translate3d(${-pos}px, 0, 0)`;
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const paused = hovered || drag || openCard || reduced.matches || now < touchHold;
  speed += ((paused ? 0 : SPEED) - speed) * Math.min(1, dt * (paused ? 6 : 1.5));
  fling *= Math.exp(-dt * 3);
  if (Math.abs(fling) < 1) fling = 0;
  if (!drag) pos += (speed + fling) * dt;
  place();
  requestAnimationFrame(tick);
}

// Start on the middle set, its first shot lined up with the column.
const startPos = () => setWidth() + cards[0].offsetLeft - (rail.clientWidth - document.querySelector(".col").offsetWidth) / 2;
pos = startPos();
place();
requestAnimationFrame(tick);
addEventListener("resize", place);

// With a mouse, the strip slows to a stop under the pointer.
rail.addEventListener("pointerenter", (e) => {
  if (e.pointerType === "mouse") hovered = true;
});
rail.addEventListener("pointerleave", () => (hovered = false));

// Drag (mouse or finger) moves the strip either way; letting go keeps a bit of the speed.
let drag = null;
let dragged = false;
let pressedCard = null;
let paintT = 0;

// Pressing a card shrinks it a touch; letting go (or starting a drag) releases it.
function release() {
  pressedCard?.classList.remove("pressed");
  pressedCard = null;
}

rail.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  pressedCard = e.target.closest(".card");
  pressedCard?.classList.add("pressed");
  drag = { id: e.pointerId, type: e.pointerType, startX: e.clientX, startPos: pos, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  dragged = false;
  fling = 0;
});

addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.startX;
  if (!dragged && Math.abs(dx) > 5) {
    dragged = true;
    rail.classList.add("dragging");
    release();
    if (drag.type === "mouse") {
      showCursor(dragLabel());
      cursor.classList.add("drag");
      paintT = performance.now();
    }
  }
  if (!dragged) return;
  pos = drag.startPos - dx;
  const dt = e.timeStamp - drag.lastT;
  if (dt > 0) drag.v = 0.8 * ((drag.lastX - e.clientX) / dt) + 0.2 * drag.v;
  drag.lastX = e.clientX;
  drag.lastT = e.timeStamp;
});

function endDrag(e) {
  release();
  if (!drag || e.pointerId !== drag.id) return;
  const { v, type } = drag;
  drag = null;
  rail.classList.remove("dragging");
  if (type !== "mouse") touchHold = performance.now() + 1500;
  if (!dragged) return;
  fling = v * 1000 * 0.6;
  hideCursor();
  cursor.classList.remove("drag");
  // Cleared after the click that follows this pointerup has been swallowed.
  setTimeout(() => (dragged = false), 0);
}
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);

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

// Horizontal trackpad / shift+wheel moves the strip too.
rail.addEventListener(
  "wheel",
  (e) => {
    const d = e.shiftKey ? e.deltaY : e.deltaX;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) && !e.shiftKey) return;
    e.preventDefault();
    pos += d;
  },
  { passive: false }
);

/* ---------- cursor label ---------- */

const cursor = document.getElementById("cursor");
let cx = 0, cy = 0, tx = 0, ty = 0;
let cursorOn = false;
let cursorRaf = null;

function placeCursor() {
  // Same scale as --u in the CSS, so the label keeps its distance on big screens.
  const u = devicePixelRatio >= 1.25 ? 1
    : Math.min(1.6, Math.max(1, Math.min(innerWidth / 1600, innerHeight / 900)));
  cursor.style.transform = `translate3d(${cx + 16 * u}px, ${cy - 6 * u}px, 0)`;
}

// "expand" with 2 to 5 a's, drawn anew each time the label appears.
function expandLabel() {
  return `exp${"a".repeat(2 + Math.floor(Math.random() * 4))}nd`;
}

// "draaag" while dragging the rail, also with 2 to 5 a's.
function dragLabel() {
  return `dr${"a".repeat(2 + Math.floor(Math.random() * 4))}g`;
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
  if (dragged) {
    // While dragging, the tag drifts to a new colour at most every 0.4s
    // (CSS blends the change), so it stays readable on fast drags.
    if (drag && performance.now() - paintT > 400) {
      paintTag(cursor);
      paintT = performance.now();
    }
    return;
  }
  if (openCard) {
    if (e.target === view || e.target === lbClose) hideCursor();
    else showCursor("close");
    return;
  }
  const card = e.target.closest?.(".card");
  if (card) showCursor(cursorOn && cursor.textContent.startsWith("exp") ? cursor.textContent : expandLabel());
  else hideCursor();
});

document.addEventListener("pointerleave", hideCursor);

/* ---------- lightbox ---------- */

const page = document.getElementById("page");
const lb = document.getElementById("lb");
const lbImg = document.getElementById("lb-img");
const lbPh = document.getElementById("lb-ph");
const lbVideo = document.getElementById("lb-video");
const lbTitle = document.getElementById("lb-title");
const lbClose = document.getElementById("lb-close");
let openCard = null;
let closing = false;
// What the lightbox shows: the full image, or a 4:3 placeholder for cards without one.
let view = lbImg;

// A shot's own proportions; a placeholder takes the proportions of its card.
function naturalSize(card) {
  const thumb = card.querySelector("img, video");
  if (!thumb) return [card.offsetWidth, card.offsetHeight];
  if (thumb.tagName === "VIDEO") return [thumb.videoWidth || thumb.width, thumb.videoHeight || thumb.height];
  return [thumb.naturalWidth, thumb.naturalHeight];
}

// Transform + clip that make the full lightbox view look exactly like the
// cropped thumbnail in the card (object-fit: cover, centred).
function cardPose(card) {
  const [nw, nh] = naturalSize(card);
  const C = card.getBoundingClientRect();
  const F = view.getBoundingClientRect();
  // The placeholder only moves and opens from the centre, never scales,
  // so its "coming soon" label keeps the same size as on the card.
  if (view === lbPh) {
    const dx = C.left + C.width / 2 - (F.left + F.width / 2);
    const dy = C.top + C.height / 2 - (F.top + F.height / 2);
    const insetX = Math.max(0, (F.width - C.width) / 2);
    const insetY = Math.max(0, (F.height - C.height) / 2);
    return {
      transform: `translate(${dx}px, ${dy}px)`,
      clipPath: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px)`,
    };
  }
  const s = Math.max(C.width / nw, C.height / nh);
  const regionW = (C.width / s / nw) * F.width;
  const regionH = (C.height / s / nh) * F.height;
  const offX = (F.width - regionW) / 2;
  const offY = (F.height - regionH) / 2;
  const k = C.width / regionW;
  return {
    transform: `translate(${C.left - F.left - offX * k}px, ${C.top - F.top - offY * k}px) scale(${k})`,
    clipPath: `inset(${offY}px ${offX}px ${offY}px ${offX}px)`,
  };
}

function setPose(pose, animate) {
  view.style.transition = animate ? "transform .65s var(--ease), clip-path .65s var(--ease)" : "none";
  view.style.transform = pose ? pose.transform : "none";
  view.style.clipPath = pose ? pose.clipPath : "inset(0px 0px 0px 0px)";
}

// Fill the lightbox with a card's shot (or placeholder), title and proportions.
function showInLightbox(card) {
  const thumb = card.querySelector("img");
  const clip = card.querySelector("video");
  view = thumb ? lbImg : clip ? lbVideo : lbPh;
  lbImg.hidden = view !== lbImg;
  lbVideo.hidden = view !== lbVideo;
  lbPh.hidden = view !== lbPh;
  if (thumb) {
    lbImg.src = thumb.currentSrc || thumb.src;
    lbImg.alt = thumb.alt;
  }
  // A video stays still on its card and only plays, from the start, once zoomed in.
  if (clip) {
    const src = clip.currentSrc || clip.src;
    if (lbVideo.src !== src) lbVideo.src = src;
    lbVideo.setAttribute("aria-label", clip.getAttribute("aria-label") || "");
    lbVideo.currentTime = 0;
    lbVideo.play().catch(() => {});
  } else {
    lbVideo.pause();
  }
  lbTitle.textContent = card.dataset.title || "coming soon";
  const [nw, nh] = naturalSize(card);
  lb.style.setProperty("--ar", nw / nh);
}

function openLightbox(card) {
  if (openCard) return;
  const thumb = card.querySelector("img");
  openCard = card;
  showInLightbox(card);

  const opened = cards.indexOf(card);
  cards.forEach((c, i) => c.style.setProperty("--d", `${Math.min(8, Math.abs(i - opened)) * 0.05}s`));
  card.classList.add("is-open");
  document.body.style.setProperty("--sbw", `${innerWidth - document.documentElement.clientWidth}px`);
  lb.hidden = false;
  page.inert = true;
  document.body.classList.add("lb-open");
  hideCursor();

  const run = () => {
    if (!reduced.matches) {
      setPose(cardPose(card), false);
      view.getBoundingClientRect();
    }
    card.style.visibility = "hidden";
    lb.classList.add("on");
    setPose(null, !reduced.matches);
    lbClose.focus({ preventScroll: true });
  };
  if (!thumb || (lbImg.complete && lbImg.naturalWidth)) run();
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
    lbVideo.pause();
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
  if (e.target !== view) closeLightbox();
});

// ← / → in the lightbox step through the shots, round and round. The strip moves
// along behind it, so closing lands on the shot you were looking at.
// Steps happen instantly: no fade, so quick presses don't pulse.
function stepLightbox(dir) {
  if (!openCard || closing) return;
  const k = (cards.indexOf(openCard) % n + dir + n) % n;
  // Centre that shot in the strip, then take whichever copy of it ended up there.
  const target = cards[n + k];
  pos = target.offsetLeft - (rail.clientWidth - target.offsetWidth) / 2;
  place();
  const next = cards.filter((c, i) => i % n === k).find((c) => c.offsetLeft >= pos - 1 && c.offsetLeft + c.offsetWidth <= pos + rail.clientWidth + 1) || target;

  const prev = openCard;
  next.style.visibility = "hidden";
  next.classList.add("is-open");
  prev.classList.remove("is-open");
  // Keep the previous card hidden until it has faded out behind the lightbox.
  setTimeout(() => {
    if (prev !== openCard) prev.style.visibility = "";
  }, 600);
  openCard = next;
  showInLightbox(next);
}

addEventListener("keydown", (e) => {
  if (!openCard) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") stepLightbox(1);
  if (e.key === "ArrowLeft") stepLightbox(-1);
  if (e.key === "Tab") {
    e.preventDefault();
    lbClose.focus();
  }
});

/* ---------- peek: the rest of the ghost under a see-through browser bar ---------- */

// The page ends at the ghost's tip, but on phones whose browser bar floats over the page
// (Safari on iOS 26) the screen goes on below that end. A fixed copy of the ghost tracks
// the clipped one, so the rest of it shows through the bar instead of a hard cut;
// where the screen ends at the page end, the copy just sits off screen.
const peekGhost = document.querySelector(".peek-ghost");
if (peekGhost && !finePointer.matches) {
  const tail = document.createElement("div");
  tail.className = "peek-tail";
  tail.setAttribute("aria-hidden", "true");
  tail.append(peekGhost.querySelector(".ghost-img").cloneNode());
  document.body.append(tail);
  document.documentElement.classList.add("peek-tailed");

  // Scroll fires once per frame already; moving the copy right there keeps it in step.
  const follow = () => {
    const r = peekGhost.getBoundingClientRect();
    tail.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    tail.hidden = r.top > innerHeight + 200;
  };
  addEventListener("scroll", follow, { passive: true });
  addEventListener("resize", follow);
  visualViewport?.addEventListener("resize", follow);
  // Fonts and shots loading in push the ghost down after the first placement.
  new ResizeObserver(follow).observe(document.body);
  follow();
}
