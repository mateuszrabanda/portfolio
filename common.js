// Shared by every page: focus rings, tag colours, copying the email.
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Show focus rings only once someone navigates with Tab; any mouse or touch hides them again.
addEventListener("keydown", (e) => {
  if (e.key === "Tab") document.documentElement.classList.add("tabbing");
});
addEventListener("pointerdown", () => document.documentElement.classList.remove("tabbing"));

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

/* ---------- copy email: erase, "copied", retype ---------- */

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
    tag.textContent = "copied";
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
