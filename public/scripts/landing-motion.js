(() => {
  const page = document.getElementById("landing-page");
  if (!page) return;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scrollytelling: reveal sections as they enter the viewport instead of all-at-once on load.
  const revealTargets = page.querySelectorAll(".lr-section:not(.lr-hero)");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    revealTargets.forEach((target) => observer.observe(target));
  } else {
    revealTargets.forEach((target) => target.classList.add("in-view"));
  }

  // Scroll progress bar + back-to-top button.
  const progressBar = page.querySelector(".landing-scroll-progress span");
  const backToTop = document.getElementById("landing-back-to-top");
  let ticking = false;
  function updateScrollUi() {
    ticking = false;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    if (backToTop) backToTop.classList.toggle("visible", scrollTop > 480);
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateScrollUi);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  updateScrollUi();
  backToTop?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  // Microinteraction: gentle magnetic pull on nav links toward the cursor.
  if (!reduceMotion) {
    page.querySelectorAll(".lr-nav-links a").forEach((link) => {
      link.addEventListener("mousemove", (event) => {
        const rect = link.getBoundingClientRect();
        const offsetX = (event.clientX - rect.left - rect.width / 2) * 0.28;
        const offsetY = (event.clientY - rect.top - rect.height / 2) * 0.28;
        link.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      });
      link.addEventListener("mouseleave", () => {
        link.style.transform = "";
      });
    });
  }
})();
