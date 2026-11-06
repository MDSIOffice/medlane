// @ts-check
// Landing "delivery journey": a pinned, scroll-driven story. The truck holds still while the road,
// skyline and content move past it, then the camera rises through clouds onto the Philippines map.
// Without JS (or with reduced motion) the scenes stay as plain stacked content; see .lr-journey in styles.
(() => {
  const root = document.getElementById("lr-journey");
  if (!root) return;
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /** @param {string} sel */
  const one = (sel) => /** @type {HTMLElement | null} */ (root.querySelector(sel));
  /** @param {string} sel */
  const all = (sel) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);
  /** @param {string} sel */
  const svgOne = (sel) => /** @type {SVGGraphicsElement | null} */ (root.querySelector(sel));

  if (!root.querySelector("[data-route]") || !one('[data-scene="road"]') || !one('[data-scene="top"]') || !one('[data-scene="map"]')) return;
  const route = /** @type {SVGPathElement} */ (root.querySelector("[data-route]"));
  const roadScene = /** @type {HTMLElement} */ (one('[data-scene="road"]'));
  const topScene = /** @type {HTMLElement} */ (one('[data-scene="top"]'));
  const mapScene = /** @type {HTMLElement} */ (one('[data-scene="map"]'));

  root.classList.add("is-story");

  const far = svgOne("[data-far]");
  const near = svgOne("[data-near]");
  const dashes = one("[data-dashes]");
  const curb = one("[data-curb]");
  const truck = one("[data-truck]");
  const bob = one("[data-bob]");
  const chip = one("[data-chip]");
  const watermark = one("[data-watermark]");
  const roadCopy = one("[data-road-copy]");
  const wheels = /** @type {SVGGElement[]} */ ([...root.querySelectorAll("[data-wheel]")]);
  const signs = all("[data-sign]");
  const steps = all("[data-step]");
  const vdashes = one("[data-vdashes]");
  const trail = one("[data-trail]");
  const clouds = one("[data-clouds]");
  const cloudEls = all("[data-cloud]");
  const veil = one("[data-veil]");
  const map = one("[data-map]");
  const van = svgOne("[data-van]");
  const mapChip = svgOne("[data-mapchip]");
  const mapChipText = /** @type {SVGTextElement | null} */ (root.querySelector("[data-mapchip-text]"));
  const mapChipBg = svgOne("[data-mapchip-bg]");
  const pins = /** @type {SVGGElement[]} */ ([...root.querySelectorAll("[data-pin]")]);
  const dots = /** @type {SVGGElement[]} */ ([...root.querySelectorAll("[data-dot]")]);
  const spokes = svgOne("[data-spokes]");
  const digits = all("[data-digit]");

  const SKY_TILE = 1200;
  const DASH_TILE = 96;
  const CURB_TILE = 64;
  const ROAD_TRAVEL_PX = 11000;

  /** @param {number} v */
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  /** @param {number} p @param {number} a @param {number} b */
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  /** @param {number} t */
  const ease = (t) => t * t * (3 - 2 * t);
  /** @param {number} t Overshoots slightly so signs "pop" out of the ground. */
  const easeBack = (t) => { const c = 1.4; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
  /** @param {number} a @param {number} b @param {number} t */
  const lerp = (a, b, t) => a + (b - a) * t;
  /** @param {HTMLElement} el @param {number} opacity */
  const setScene = (el, opacity) => {
    el.style.opacity = opacity.toFixed(3);
    el.style.visibility = opacity < 0.01 ? "hidden" : "visible";
  };

  const routeLength = route.getTotalLength();
  route.style.strokeDasharray = String(routeLength);

  /** @param {SVGGElement} el */
  const fractionAlongRoute = (el) => {
    const m = el.transform.baseVal.consolidate()?.matrix;
    if (!m) return 1;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const pt = route.getPointAtLength((i / 200) * routeLength);
      const d = Math.hypot(pt.x - m.e, pt.y - m.f);
      if (d < bestD) { bestD = d; best = i / 200; }
    }
    return best;
  };
  const pinAt = pins.map(fractionAlongRoute);
  // Dots beside the route light up as the truck passes level with them; the rest join in the final fan-out.
  const dotAt = dots.map((dot) => {
    const f = fractionAlongRoute(dot);
    const m = dot.transform.baseVal.consolidate()?.matrix;
    const pt = route.getPointAtLength(f * routeLength);
    return m && Math.hypot(pt.x - m.e, pt.y - m.f) < 30 ? f : 0.92;
  });

  const CHIP_STOPS = /** @type {[number, string][]} */ ([
    [0, "Leaving Las Piñas HQ"],
    [0.2, "Arriving in Naga City"],
    [0.38, "Crossing to the Visayas"],
    [0.68, "On to Mindanao"],
    [0.985, "Delivered, nationwide"],
  ]);
  let chipLabel = "";

  /** @param {number} p */
  function renderRoad(p) {
    const px = p * ROAD_TRAVEL_PX;
    if (far) far.style.transform = `translate3d(${-(px * 0.14) % SKY_TILE}px,0,0)`;
    if (near) near.style.transform = `translate3d(${-(px * 0.36) % SKY_TILE}px,0,0)`;
    if (dashes) dashes.style.transform = `translate3d(${-px % DASH_TILE}px,0,0)`;
    if (curb) curb.style.transform = `translate3d(${-px % CURB_TILE}px,0,0)`;
    const spin = `${(px / 3).toFixed(1)}deg`;
    wheels.forEach((wheel) => { wheel.style.transform = `rotate(${spin})`; });
    if (truck) truck.style.transform = `translate3d(${lerp(-125, 0, ease(seg(p, 0, 0.05)))}%,0,0)`;
    if (bob) bob.style.transform = `translateY(${(Math.sin(px / 34) * 1.3).toFixed(2)}px)`;
    if (chip) {
      const c = ease(seg(p, 0.05, 0.08));
      chip.style.opacity = c.toFixed(3);
      chip.style.transform = `translateY(${(1 - c) * 10}px)`;
    }
    if (watermark) watermark.style.transform = `translate3d(${lerp(62, -46, seg(p, 0, 0.34))}%,0,0)`;
    if (roadCopy) {
      const c = ease(seg(p, 0.03, 0.08));
      roadCopy.style.opacity = c.toFixed(3);
      roadCopy.style.transform = `translateY(${(1 - c) * 18}px)`;
    }
    signs.forEach((sign, i) => {
      const t = seg(p, 0.08 + i * 0.038, 0.115 + i * 0.038);
      sign.style.opacity = t > 0 ? "1" : "0";
      sign.style.transform = `translateY(${((1 - easeBack(t)) * 118).toFixed(1)}%)`;
    });
  }

  /** @param {number} p */
  function renderTop(p) {
    const px = p * ROAD_TRAVEL_PX * 1.3;
    if (vdashes) vdashes.style.transform = `translate3d(0,${-px % DASH_TILE}px,0)`;
    if (trail) trail.style.transform = `scaleY(${ease(seg(p, 0.38, 0.46)).toFixed(3)})`;
    let current = -1;
    steps.forEach((step, i) => {
      const start = 0.415 + i * 0.044;
      const t = ease(seg(p, start, start + 0.024));
      step.style.opacity = t.toFixed(3);
      step.style.transform = `translate3d(${(1 - t) * 26}px,0,0)`;
      if (t > 0.5) current = i;
    });
    steps.forEach((step, i) => step.classList.toggle("is-current", i === current));
  }

  /** @param {number} p */
  function renderClouds(p) {
    if (!clouds) return;
    const inT = ease(seg(p, 0.645, 0.725));
    const outT = ease(seg(p, 0.735, 0.81));
    const visible = inT > 0 && outT < 1;
    clouds.style.visibility = visible ? "visible" : "hidden";
    if (!visible) return;
    cloudEls.forEach((cloud) => {
      const dir = Number(cloud.dataset.cloud) || 1;
      const x = lerp(dir * 60, 0, inT) + dir * outT * 95;
      cloud.style.transform = `translate3d(${x.toFixed(1)}vw,0,0) scale(calc(var(--s) * ${lerp(0.8, 1.15, outT).toFixed(3)}))`;
      cloud.style.opacity = (inT * (1 - outT * 0.25)).toFixed(3);
    });
    if (veil) veil.style.opacity = (seg(p, 0.69, 0.725) * (1 - seg(p, 0.735, 0.775))).toFixed(3);
  }

  /** @param {number} p */
  function renderMap(p) {
    if (map) map.style.transform = `scale(${lerp(1.3, 1, ease(seg(p, 0.73, 0.82))).toFixed(3)})`;
    const r = ease(seg(p, 0.79, 0.975));
    route.style.strokeDashoffset = (routeLength * (1 - r)).toFixed(1);
    const at = r * routeLength;
    const pt = route.getPointAtLength(at);
    const back = route.getPointAtLength(Math.max(0, at - 3));
    const ahead = route.getPointAtLength(Math.min(routeLength, at + 3));
    const angle = Math.atan2(ahead.y - back.y, ahead.x - back.x) * (180 / Math.PI);
    van?.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    // Keep the chip inside the 620-wide map: flip it to the truck's left when it would run off the edge.
    const chipWidth = Number(mapChipBg?.getAttribute("width")) || 170;
    const chipX = pt.x + 24 + chipWidth > 620 ? pt.x - 24 - chipWidth : pt.x + 24;
    mapChip?.setAttribute("transform", `translate(${chipX.toFixed(1)} ${(pt.y - 26).toFixed(1)})`);
    pins.forEach((pin, i) => pin.classList.toggle("is-reached", r >= pinAt[i] - 0.004 && p > 0.76));
    dots.forEach((dot, i) => dot.classList.toggle("is-reached", r >= dotAt[i]));
    if (spokes) spokes.style.opacity = ease(seg(r, 0.86, 1)).toFixed(3);
    const label = CHIP_STOPS.reduce((acc, [from, text]) => (r >= from ? text : acc), CHIP_STOPS[0][1]);
    if (label !== chipLabel && mapChipText && mapChipBg) {
      chipLabel = label;
      mapChipText.textContent = label;
      mapChipBg.setAttribute("width", String(Math.ceil(mapChipText.getComputedTextLength()) + 46));
    }
    const roll = ease(seg(p, 0.78, 0.9));
    digits.forEach((digit) => {
      const target = Number(digit.dataset.digit) || 0;
      digit.style.setProperty("--roll", (target * roll).toFixed(3));
    });
  }

  /** @param {number} p */
  function render(p) {
    setScene(roadScene, 1 - ease(seg(p, 0.32, 0.385)));
    roadScene.style.transform = `scale(${lerp(1, 1.14, ease(seg(p, 0.32, 0.385))).toFixed(3)})`;
    const topIn = ease(seg(p, 0.345, 0.4));
    const topOut = ease(seg(p, 0.645, 0.72));
    setScene(topScene, topIn * (1 - topOut));
    topScene.style.transform = `scale(${(lerp(1.12, 1, topIn) * lerp(1, 0.62, topOut)).toFixed(3)})`;
    setScene(mapScene, ease(seg(p, 0.725, 0.77)));
    if (p < 0.4) renderRoad(p);
    if (p > 0.33 && p < 0.74) renderTop(p);
    renderClouds(p);
    if (p > 0.7) renderMap(p);
  }

  const readTarget = () => {
    const rect = root.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    return range > 0 ? clamp01(-rect.top / range) : 0;
  };

  // Damped follow so wheel notches glide instead of stepping. Only runs while the section is on screen.
  let current = readTarget();
  let frame = 0;
  let visible = false;
  const tick = () => {
    frame = 0;
    const target = readTarget();
    const delta = target - current;
    current = Math.abs(delta) < 0.00015 ? target : current + delta * 0.14;
    render(current);
    if (visible && current !== target) frame = requestAnimationFrame(tick);
  };
  const wake = () => { if (visible && !frame) frame = requestAnimationFrame(tick); };

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) wake();
  }, { rootMargin: "20% 0px 20% 0px" }).observe(root);
  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", wake, { passive: true });
  render(current);
})();
