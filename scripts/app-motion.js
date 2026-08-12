(() => {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest ? event.target.closest(".primary-button, .ghost-button, .tab, .nav-item, .mini-button, .icon-button") : null;
    if (!target) return;
    target.classList.remove("motion-pressed");
    void target.offsetWidth;
    target.classList.add("motion-pressed");
  }, { passive: true });

  document.addEventListener("animationend", (event) => {
    if (event.animationName === "pressGlow") event.target.classList.remove("motion-pressed");
  });
})();
