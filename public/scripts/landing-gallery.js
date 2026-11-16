// @ts-check
// Landing "Field Work" gallery: filter chips, a bento grid ("All") / even 4:3 grid (filtered) and a
// lightbox. To add a photo, add an entry to FIELD_WORK_PHOTOS: no layout code changes needed.
// The "All" grid uses grid-auto-flow: dense; the order + spans below fill it without gaps.
(() => {
  /**
   * @typedef {"install" | "training" | "partners" | "events"} FieldWorkCategory
   * @typedef {{ src: string, cat: FieldWorkCategory, title: string, text: string, cols: number, rows: number, pos: string }} FieldWorkPhoto
   */
  /** cols × rows apply to the "All" layout only; pos = object-position (keeps faces in frame). @type {FieldWorkPhoto[]} */
  const FIELD_WORK_PHOTOS = [
    { src: "go-live-partner-lab.jpg", cat: "training", title: "Go-live day at a partner laboratory", text: "First live runs completed together with the laboratory staff on site.", cols: 2, rows: 2, pos: "50% 40%" },
    { src: "analyzer-configuration-on-site.jpg", cat: "install", title: "Analyzer configuration on site", text: "Setting up and verifying a chemistry analyzer before it goes live.", cols: 1, rows: 2, pos: "40% 50%" },
    { src: "diagnostics-expo-booth.jpg", cat: "events", title: "Diagnostics expo booth", text: "Showcasing hematology, FIA and urinalysis analyzers to laboratory professionals.", cols: 1, rows: 2, pos: "50% 55%" },
    { src: "principal-partner-visit.jpg", cat: "partners", title: "Principal partner visit", text: "Hosting our principal’s team at the MDSolutions office.", cols: 1, rows: 2, pos: "50% 40%" },
    { src: "hands-on-training-lab-team.jpg", cat: "training", title: "Hands-on training with the lab team", text: "Walking laboratory staff through daily QC and sample runs on newly installed analyzers.", cols: 2, rows: 1, pos: "50% 35%" },
    { src: "installation-handover.jpg", cat: "install", title: "Installation and handover", text: "Analyzer installed, tested and handed over with the client’s team.", cols: 1, rows: 1, pos: "50% 45%" },
    { src: "technical-seminar-principal.jpg", cat: "partners", title: "Technical seminar with a principal partner", text: "A product and research briefing for our team and partner laboratories.", cols: 2, rows: 1, pos: "50% 55%" },
    { src: "partner-meeting-office.jpg", cat: "partners", title: "Partner meeting at MDSolutions", text: "Reviewing product lines and support plans with visiting partners.", cols: 1, rows: 1, pos: "50% 45%" },
  ];
  /** @type {[string, string][]} */
  const CATEGORIES = [["all", "All"], ["install", "Installations"], ["training", "Training"], ["partners", "Partners"], ["events", "Events"]];
  /** @type {Record<FieldWorkCategory, string>} */
  const TAG = { install: "Installation", training: "Training", partners: "Partners", events: "Events" };

  const section = document.getElementById("lr-gallery");
  if (!section) return;
  /** @param {string} sel */
  const one = (sel) => /** @type {HTMLElement} */ (section.querySelector(sel));
  const filters = one("[data-fw-filters]");
  const grid = one("[data-fw-grid]");
  const count = one("[data-fw-count]");
  const lb = one("[data-fw-lightbox]");
  const lbImg = /** @type {HTMLImageElement} */ (one("[data-lb-img]"));
  const thumbs = one("[data-lb-thumbs]");
  if (!filters || !grid || !lb || !lbImg) return;

  // /assets/landing/* is cached for a year; the worker stamps ?v= on HTML URLs, so URLs built here
  // must carry the same deploy version or a replaced photo would stay stale.
  const version = document.documentElement.getAttribute("data-asset-version");
  /** @param {string} file */
  const url = (file) => `assets/landing/field-work/${file}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
  /** @param {string} value */
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

  let category = "all";
  /** @type {FieldWorkPhoto[]} */
  let list = FIELD_WORK_PHOTOS;
  /** @type {number | null} */
  let index = null;
  /** @type {HTMLElement | null} */
  let returnFocus = null;

  function renderFilters() {
    filters.innerHTML = CATEGORIES.map(([key, label]) => {
      const n = key === "all" ? FIELD_WORK_PHOTOS.length : FIELD_WORK_PHOTOS.filter((photo) => photo.cat === key).length;
      return `<button type="button" class="lr-fw-chip" data-fw-cat="${key}" aria-pressed="${key === category}">${label}<span>${n}</span></button>`;
    }).join("");
  }

  function renderGrid() {
    list = FIELD_WORK_PHOTOS.filter((photo) => category === "all" || photo.cat === category);
    grid.classList.toggle("is-filtered", category !== "all");
    grid.innerHTML = list.map((photo, i) => `
      <button type="button" class="lr-fw-tile${photo.cols === 2 && photo.rows === 2 ? " lr-fw-tile--feature" : ""}" data-fw-i="${i}" aria-label="View photo: ${esc(photo.title)}" style="--fw-cols: ${photo.cols}; --fw-rows: ${photo.rows};">
        <img src="${url(photo.src)}" alt="${esc(photo.title)}" loading="lazy" decoding="async" style="object-position: ${esc(photo.pos)};" />
        <span class="lr-fw-view" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
        <span class="lr-fw-cap"><span class="lr-fw-tag">${TAG[photo.cat]}</span><span class="lr-fw-title">${esc(photo.title)}</span></span>
      </button>`).join("");
    const label = CATEGORIES.find(([key]) => key === category)?.[1] || "";
    count.textContent = category === "all" ? `${FIELD_WORK_PHOTOS.length} photos` : `${list.length} of ${FIELD_WORK_PHOTOS.length} photos · ${label}`;
  }

  /** @param {number} i */
  function show(i) {
    index = (i + list.length) % list.length;
    const photo = list[index];
    lbImg.src = url(photo.src);
    lbImg.alt = photo.title;
    one("[data-lb-cat]").textContent = TAG[photo.cat];
    one("[data-lb-title]").textContent = photo.title;
    one("[data-lb-text]").textContent = photo.text;
    one("[data-lb-count]").textContent = `${index + 1} / ${list.length}`;
    thumbs.innerHTML = list.map((item, j) => `<button type="button" class="lr-lb-thumb" data-lb-j="${j}" aria-label="Show photo ${j + 1}: ${esc(item.title)}" aria-current="${j === index}"><img src="${url(item.src)}" alt="" loading="lazy" /></button>`).join("");
    if (lb.hidden) {
      returnFocus = /** @type {HTMLElement | null} */ (document.activeElement);
      lb.hidden = false;
      document.documentElement.classList.add("lr-lb-open"); // locks page scroll
      /** @type {HTMLElement} */ (one("[data-lb-close]")).focus();
    }
  }

  function close() {
    lb.hidden = true;
    index = null;
    document.documentElement.classList.remove("lr-lb-open");
    returnFocus?.focus();
    returnFocus = null;
  }

  filters.addEventListener("click", (event) => {
    const chip = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-fw-cat]"));
    if (!chip) return;
    category = chip.dataset.fwCat || "all";
    renderFilters();
    renderGrid();
    /** @type {HTMLElement | null} */ (filters.querySelector(`[data-fw-cat="${category}"]`))?.focus();
  });
  grid.addEventListener("click", (event) => {
    const tile = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-fw-i]"));
    if (tile) show(Number(tile.dataset.fwI));
  });
  thumbs.addEventListener("click", (event) => {
    const thumb = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-lb-j]"));
    if (thumb) show(Number(thumb.dataset.lbJ));
  });
  one("[data-lb-prev]").addEventListener("click", () => { if (index !== null) show(index - 1); });
  one("[data-lb-next]").addEventListener("click", () => { if (index !== null) show(index + 1); });
  one("[data-lb-close]").addEventListener("click", close);
  // Clicking the dark area around the photo (not the photo or a control) closes it.
  lb.addEventListener("click", (event) => { if (/** @type {HTMLElement} */ (event.target).hasAttribute("data-lb-backdrop")) close(); });

  document.addEventListener("keydown", (event) => {
    if (index === null) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowLeft") show(index - 1);
    else if (event.key === "ArrowRight") show(index + 1);
    else if (event.key === "Tab") {
      // Keep keyboard focus inside the open lightbox.
      const focusable = /** @type {HTMLElement[]} */ ([...lb.querySelectorAll("button")]).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  /** @type {number | null} */
  let touchX = null;
  lb.addEventListener("touchstart", (event) => { touchX = event.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (event) => {
    if (touchX === null || index === null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });

  renderFilters();
  renderGrid();
})();
