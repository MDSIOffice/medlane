(() => {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const spotlightSelector = ".panel, .stat-card, .sales-summary-card, .invoice-card, .report-card";
  let activeCard = null;

  document.addEventListener("mousemove", (event) => {
    const card = event.target.closest ? event.target.closest(spotlightSelector) : null;
    if (card !== activeCard) {
      if (activeCard) {
        activeCard.style.removeProperty("--spot-x");
        activeCard.style.removeProperty("--spot-y");
      }
      activeCard = card;
    }
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--spot-x", `${px}%`);
    card.style.setProperty("--spot-y", `${py}%`);
  }, { passive: true });
})();
