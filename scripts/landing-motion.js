(() => {
  const page = document.getElementById("landing-page");
  if (!page) return;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scrollytelling: reveal sections as they enter the viewport instead of all-at-once on load.
  const revealTargets = page.querySelectorAll(".landing-values, .landing-capabilities, .landing-photo-story, .landing-gallery, .landing-locations, .landing-footer");
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

  // Real-time cursor-reactive tilt + spotlight on the hero diagnostic card.
  const diagnosticCard = page.querySelector(".landing-diagnostic-card");
  if (diagnosticCard && !reduceMotion) {
    const maxTilt = 6;
    diagnosticCard.addEventListener("mousemove", (event) => {
      const rect = diagnosticCard.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      diagnosticCard.style.setProperty("--spot-x", `${px * 100}%`);
      diagnosticCard.style.setProperty("--spot-y", `${py * 100}%`);
      diagnosticCard.style.setProperty("--tilt-x", `${(px - 0.5) * maxTilt * 2}deg`);
      diagnosticCard.style.setProperty("--tilt-y", `${(0.5 - py) * maxTilt * 2}deg`);
    });
    diagnosticCard.addEventListener("mouseleave", () => {
      diagnosticCard.style.setProperty("--tilt-x", "0deg");
      diagnosticCard.style.setProperty("--tilt-y", "0deg");
    });
  }

  // Microinteraction: gentle magnetic pull on nav links toward the cursor.
  if (!reduceMotion) {
    page.querySelectorAll(".landing-menu a").forEach((link) => {
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
