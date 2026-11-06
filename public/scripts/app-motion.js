// @ts-check
(() => {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.addEventListener("pointerdown", (event) => {
    const eventTarget = /** @type {HTMLElement} */ (event.target);
    const target = /** @type {HTMLElement | null} */ (eventTarget.closest ? eventTarget.closest(".primary-button, .ghost-button, .tab, .nav-item, .mini-button, .icon-button") : null);
    if (!target) return;
    target.classList.remove("motion-pressed");
    void target.offsetWidth;
    target.classList.add("motion-pressed");
  }, { passive: true });

  document.addEventListener("animationend", (event) => {
    if (event.animationName === "pressGlow") /** @type {Element} */ (event.target).classList.remove("motion-pressed");
  });
})();
