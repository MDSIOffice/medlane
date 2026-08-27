(() => {
  const page = document.getElementById("landing-page");
  if (!page) return;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Scrollytelling: reveal sections (and their staggered children) on enter ----
  const revealTargets = page.querySelectorAll(".lr-section:not(.lr-hero)");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    revealTargets.forEach((target) => observer.observe(target));
  } else {
    revealTargets.forEach((target) => target.classList.add("in-view"));
  }

  // ---- Count-up metrics when the profile section scrolls into view ----
  const counters = page.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window && !reduceMotion) {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        countObserver.unobserve(el);
        const target = Number(el.dataset.count) || 0;
        const suffix = el.dataset.suffix || "";
        const started = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - started) / 1100);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => countObserver.observe(el));
  } else {
    counters.forEach((el) => { el.textContent = (el.dataset.count || "0") + (el.dataset.suffix || ""); });
  }

  // ---- Scroll UI: progress bar, back-to-top, condensed nav, hero parallax ----
  const progressBar = page.querySelector(".landing-scroll-progress span");
  const backToTop = document.getElementById("landing-back-to-top");
  const nav = document.getElementById("lr-nav");
  const hero = page.querySelector(".lr-hero");
  if (hero && !reduceMotion) hero.classList.add("lr-parallax");
  let ticking = false;
  function updateScrollUi() {
    ticking = false;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    if (progressBar) progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollTop / maxScroll))})`;
    if (backToTop) backToTop.classList.toggle("visible", scrollTop > 520);
    if (nav) nav.classList.toggle("lr-nav--scrolled", scrollTop > 24);
    if (hero && !reduceMotion && scrollTop < window.innerHeight) hero.style.setProperty("--lr-sy", String(scrollTop));
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

  // ---- Nav: scroll-spy + sliding ink indicator + magnetic links ----
  const navLinks = [...page.querySelectorAll(".lr-nav-links a")];
  const ink = page.querySelector(".lr-nav-ink");
  const linkFor = (id) => navLinks.find((a) => a.getAttribute("href") === "#" + id);
  let activeLink = navLinks[0] || null;
  function moveInk(el) {
    if (!ink || !el) return;
    ink.style.opacity = "1";
    ink.style.width = el.offsetWidth + "px";
    ink.style.transform = `translateX(${el.offsetLeft}px)`;
  }
  function setActive(el) {
    if (!el) return;
    navLinks.forEach((a) => a.classList.toggle("is-active", a === el));
    activeLink = el;
    moveInk(el);
  }
  if ("IntersectionObserver" in window && navLinks.length) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(linkFor(entry.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["lr-profile", "lr-capabilities", "lr-gallery", "lr-locations", "lr-contact"].forEach((id) => {
      const section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }
  if (!reduceMotion) {
    navLinks.forEach((link) => {
      link.addEventListener("mouseenter", () => moveInk(link));
      link.addEventListener("mousemove", (event) => {
        const rect = link.getBoundingClientRect();
        const offsetX = (event.clientX - rect.left - rect.width / 2) * 0.22;
        const offsetY = (event.clientY - rect.top - rect.height / 2) * 0.22;
        link.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      });
      link.addEventListener("mouseleave", () => {
        link.style.transform = "";
        moveInk(activeLink);
      });
    });
  }
  window.addEventListener("resize", () => moveInk(activeLink), { passive: true });
  window.addEventListener("load", () => { moveInk(activeLink); });

  // ---- Smooth in-page scrolling for landing anchors ----
  page.querySelectorAll('a[href^="#lr-"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const target = document.getElementById(anchor.getAttribute("href").slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
