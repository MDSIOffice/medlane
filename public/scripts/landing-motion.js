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
  const parallaxItems = [];
  let ticking = false;
  function updateScrollUi() {
    ticking = false;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    if (progressBar) progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollTop / maxScroll))})`;
    if (backToTop) backToTop.classList.toggle("visible", scrollTop > 520);
    if (nav) nav.classList.toggle("lr-nav--scrolled", scrollTop > 24);
    if (hero && !reduceMotion && scrollTop < window.innerHeight) hero.style.setProperty("--lr-sy", String(scrollTop));
    if (!reduceMotion && parallaxItems.length) {
      const vh = window.innerHeight;
      parallaxItems.forEach(({ el, range }) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -120 || rect.top > vh + 120) return;
        const centerOffset = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2);
        el.style.setProperty("--lr-par", (Math.max(-1, Math.min(1, centerOffset)) * -range).toFixed(1) + "px");
      });
    }
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateScrollUi);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
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

  // ================= Expressive motion layer =================
  const heroTitle = document.getElementById("lr-hero-title");
  const heroCard = page.querySelector(".lr-hero-card");

  // ---- Split the headline into per-word spans for a staggered rotate-up reveal ----
  if (hero && heroTitle && !reduceMotion) {
    const frag = document.createDocumentFragment();
    let wordIndex = 0;
    [...heroTitle.childNodes].forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        frag.appendChild(node.cloneNode(true)); // keep <br> etc.
        return;
      }
      (node.textContent || "").split(/(\s+)/).forEach((chunk) => {
        if (!chunk) return;
        if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(" ")); return; }
        const word = document.createElement("span");
        word.className = "lr-word";
        const inner = document.createElement("span");
        inner.textContent = chunk;
        inner.style.setProperty("--lr-wd", (0.45 + wordIndex * 0.08).toFixed(2) + "s");
        word.appendChild(inner);
        frag.appendChild(word);
        wordIndex += 1;
      });
    });
    heroTitle.textContent = "";
    heroTitle.appendChild(frag);
    // The words are visible by default (base CSS); `.lr-head-ready` is what hides-then-reveals
    // them via @keyframes. Only arm it when the tab is actually visible — a backgrounded tab
    // freezes the animation timeline, which would otherwise leave the headline blank until
    // first focus. If hidden, wait and play the reveal the first time the page is shown.
    const playHeadlineReveal = () => hero.classList.add("lr-head-ready");
    if (document.visibilityState === "visible") {
      playHeadlineReveal();
    } else {
      const onFirstShow = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", onFirstShow);
        playHeadlineReveal();
      };
      document.addEventListener("visibilitychange", onFirstShow);
    }
  }

  // ---- Hero card 3D tilt — activate only after the entrance animation settles ----
  if (heroCard && !reduceMotion) {
    const armTilt = () => heroCard.classList.add("lr-tilt-ready");
    heroCard.addEventListener("animationend", armTilt, { once: true });
    setTimeout(armTilt, 1800);
  }

  // ---- Pointer-reactive hero (aurora/orb follow + card tilt) and cursor spotlight on dark surfaces ----
  if (!reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    const darkSurfaces = [...page.querySelectorAll(".lr-hero, .lr-section--dark")];
    let pointerRaf = 0;
    let lastPointer = null;
    const applyPointer = () => {
      pointerRaf = 0;
      const e = lastPointer;
      if (!e) return;
      if (hero) {
        const r = hero.getBoundingClientRect();
        if (e.clientY > r.top && e.clientY < r.bottom) {
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / Math.max(r.height, 1) - 0.5;
          hero.style.setProperty("--lr-mx", nx.toFixed(3));
          hero.style.setProperty("--lr-my", ny.toFixed(3));
          if (heroCard) {
            heroCard.style.setProperty("--lr-tx", (nx * 7).toFixed(2) + "deg");
            heroCard.style.setProperty("--lr-ty", (-ny * 7).toFixed(2) + "deg");
          }
        }
      }
      darkSurfaces.forEach((sec) => {
        const r = sec.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        sec.classList.toggle("lr-spot-on", inside);
        if (inside) {
          sec.style.setProperty("--lr-spot-x", (e.clientX - r.left).toFixed(0) + "px");
          sec.style.setProperty("--lr-spot-y", (e.clientY - r.top).toFixed(0) + "px");
        }
      });
    };
    window.addEventListener("pointermove", (e) => {
      lastPointer = e;
      if (!pointerRaf) pointerRaf = requestAnimationFrame(applyPointer);
    }, { passive: true });
    document.addEventListener("pointerleave", () => {
      if (hero) { hero.style.setProperty("--lr-mx", "0"); hero.style.setProperty("--lr-my", "0"); }
      if (heroCard) { heroCard.style.setProperty("--lr-tx", "0deg"); heroCard.style.setProperty("--lr-ty", "0deg"); }
      darkSurfaces.forEach((sec) => sec.classList.remove("lr-spot-on"));
    });

    // ---- Magnetic pull on primary CTAs ----
    page.querySelectorAll(".lr-btn, .lr-nav-cta").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) * 0.25;
        const my = (e.clientY - r.top - r.height / 2) * 0.4;
        btn.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
      });
      btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
    });
  }

  // ---- Register scroll-linked parallax targets (consumed by updateScrollUi) ----
  if (!reduceMotion) {
    page.querySelectorAll(".lr-bento figure").forEach((fig) => {
      if (fig.querySelector("img")) parallaxItems.push({ el: fig, range: 14 });
    });
    const profilePhoto = page.querySelector(".lr-profile-photo");
    if (profilePhoto) parallaxItems.push({ el: profilePhoto, range: 20 });
    if (parallaxItems.length) onScroll();
  }
})();
