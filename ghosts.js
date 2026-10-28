const museum = document.querySelector(".museum");
const tag = document.getElementById("ghost-tag");
const fields = {
  name: document.getElementById("ghost-name"),
  batch: document.getElementById("ghost-batch"),
  acquired: document.getElementById("ghost-acquired"),
};

// Only real ghosts react; grey placeholders stay quiet.
const ghosts = [...museum.querySelectorAll(".ghost[data-name]")];

let active = null;
// Where the tag points: the mouse pointer, or (touch / keyboard) a spot on the ghost itself.
let tx = 0, ty = 0, cx = 0, cy = 0;
let follow = false;
let raf = null;

// The tag sits just above and to the right of its point, as in the "museum interaction" frame,
// and never runs off the right edge of the window.
function place() {
  const x = Math.min(cx + 10, innerWidth - tag.offsetWidth - 8);
  tag.style.transform = `translate3d(${x}px, ${cy - tag.offsetHeight}px, 0)`;
}

function glide() {
  const k = reduced.matches ? 1 : 0.3;
  cx += (tx - cx) * k;
  cy += (ty - cy) * k;
  place();
  const settled = Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3;
  raf = active && !settled ? requestAnimationFrame(glide) : null;
}

function pointAt(x, y, jump) {
  tx = x;
  ty = y;
  if (jump) {
    cx = x;
    cy = y;
    place();
  }
  if (!raf) raf = requestAnimationFrame(glide);
}

// On the ghost itself: where the pointer sits in the Figma frame.
function anchor(ghost) {
  const r = ghost.getBoundingClientRect();
  return [r.left + 32, r.top - 1];
}

function show(ghost, x, y) {
  const fresh = active !== ghost;
  if (fresh) {
    active?.classList.remove("on");
    active = ghost;
    ghost.classList.add("on");
    fields.name.textContent = ghost.dataset.name;
    fields.batch.textContent = ghost.dataset.batch;
    fields.acquired.textContent = ghost.dataset.acquired;
  }
  // Appear right at the point instead of gliding in from the last ghost.
  pointAt(x, y, fresh || !tag.classList.contains("on"));
  tag.classList.add("on");
}

function hide() {
  active?.classList.remove("on");
  active = null;
  follow = false;
  tag.classList.remove("on");
}

ghosts.forEach((ghost) => {
  ghost.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    follow = true;
    show(ghost, e.clientX, e.clientY);
  });

  // Touch: a tap shows the details, another tap (or a tap anywhere else) hides them.
  ghost.addEventListener("click", (e) => {
    if (follow) return;
    e.stopPropagation();
    if (active === ghost) hide();
    else show(ghost, ...anchor(ghost));
  });

  ghost.addEventListener("focus", () => {
    if (document.documentElement.classList.contains("tabbing")) show(ghost, ...anchor(ghost));
  });
  ghost.addEventListener("blur", () => {
    if (!follow) hide();
  });
});

// The whole row is one hover zone: in the gaps between ghosts the last one stays lit
// (and its tag keeps following the pointer) until the next ghost takes over,
// so moving across the row never flashes every ghost back on.
museum.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse" && follow && active) pointAt(e.clientX, e.clientY);
});
museum.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "mouse") hide();
});

document.addEventListener("click", () => {
  if (!follow) hide();
});

// Tags pinned to a ghost move with it while the page scrolls or resizes.
const repin = () => {
  if (active && !follow) pointAt(...anchor(active), true);
};
addEventListener("scroll", repin, { passive: true });
addEventListener("resize", repin);

addEventListener("keydown", (e) => {
  if (e.key === "Escape") hide();
});
