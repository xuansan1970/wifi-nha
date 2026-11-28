/* NHÀ MÌNH · PASTEL AURA GLASS — chuyển động dùng chung (không phụ thuộc thư viện).
   Gắn: <script src="/nm-fx.js" defer data-rise=".card" data-tilt=".tile" data-swap="#main" data-ripple=".btn" data-press="button"></script>
   - rise   : thẻ hiện dần lần đầu, so le 35ms (tối đa 16 bước)
   - tilt   : nghiêng 3D theo chuột, chỉ máy có chuột (hover:hover + pointer:fine)
   - swap   : container đổi nội dung (đổi tab/trang) thì trượt nhẹ; vẽ lại định kỳ cùng cấu trúc thì KHÔNG chạy
   - ripple : gợn sáng tại điểm bấm
   - press  : nhún khi bấm
   Tất cả tắt khi prefers-reduced-motion. Không vẽ lại DOM của app, chỉ thêm class/style. */
(() => {
  "use strict";
  const S = document.currentScript, d = S ? S.dataset : {};
  const root = document.documentElement;
  root.classList.add("nm");
  /* app chưa có sáng/tối riêng: theo lựa chọn chung của Nhà Mình, không có thì theo máy */
  if (d.autoTheme !== undefined && !root.dataset.theme) {
    const pick = () => { let t = null; try { t = new URLSearchParams(location.search).get("theme") || localStorage.getItem("nm_theme"); } catch (e) {}
      root.dataset.theme = t === "dark" || t === "light" ? t : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      root.style.colorScheme = root.dataset.theme; };
    pick();
    if (d.autoTheme === "system") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { try { localStorage.removeItem("nm_theme"); } catch (e) {} root.removeAttribute("data-theme"); pick(); });
    addEventListener("message", e => { const m = e.data; if (m && m.type === "nhaminh:theme" && (m.theme === "light" || m.theme === "dark")) { root.dataset.theme = m.theme; root.style.colorScheme = m.theme; } });
  }
  try { if (window.self !== window.top) root.classList.add("is-embed"); } catch (e) { root.classList.add("is-embed"); }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover:hover) and (pointer:fine)");
  const sel = k => (d[k] || "").trim();

  /* ---------- rise: chỉ các thẻ có mặt trong 0.35 giây đầu (vẽ lại sau đó không chạy lại) ---------- */
  const RISE = sel("rise");
  let n = 0;
  function markRise(scope) {
    if (!RISE || root.classList.contains("nm-settled")) return;
    (scope || document).querySelectorAll(RISE).forEach(el => {
      if (el.classList.contains("nm-rise")) return;
      el.classList.add("nm-rise"); el.style.setProperty("--nm-i", Math.min(n++, 16));
    });
  }
  if (RISE) {
    const mo = new MutationObserver(() => markRise());
    const start = () => { markRise(); mo.observe(document.body, { childList: true, subtree: true }); };
    document.readyState === "loading" ? addEventListener("DOMContentLoaded", start) : start();
    setTimeout(() => mo.disconnect(), 350);
    setTimeout(() => root.classList.add("nm-settled"), 1300);
  } else root.classList.add("nm-settled");

  /* ---------- swap: so chữ ký cấu trúc (thẻ + class + id con cấp 1) ---------- */
  const SWAP = sel("swap");
  if (SWAP) {
    const sig = el => Array.from(el.children, c => c.tagName + "." + c.id + "." + (c.className && c.className.baseVal === undefined ? c.className : "")
      .replace(/\b(nm-[\w-]+|on|active|is-[\w-]+|busy|sel)\b/g, "").trim()).join("|") + "#" + location.hash;
    const seen = new WeakMap(); let q = false;
    const check = () => {
      q = false;
      document.querySelectorAll(SWAP).forEach(el => {
        const s = sig(el), old = seen.get(el); seen.set(el, s);
        if (old === undefined || old === s || reduce.matches || !root.classList.contains("nm-settled")) return;
        el.classList.remove("nm-swap"); void el.offsetWidth; el.classList.add("nm-swap");
        clearTimeout(el._nmT); el._nmT = setTimeout(() => el.classList.remove("nm-swap"), 600);
      });
    };
    const mo = new MutationObserver(() => { if (!q) { q = true; requestAnimationFrame(check); } });
    const start = () => { check(); mo.observe(document.body, { childList: true, subtree: true }); };
    document.readyState === "loading" ? addEventListener("DOMContentLoaded", start) : start();
    addEventListener("hashchange", () => requestAnimationFrame(check));
  }

  /* ---------- tilt ---------- */
  const TILT = sel("tilt"), MAX = +(d.tiltMax || 8);
  if (TILT) {
    let cur = null, raf = 0, ev = null;
    const reset = el => { el.style.transform = ""; el.classList.remove("nm-tilting"); };
    const paint = () => {
      raf = 0; if (!cur || !ev) return;
      const r = cur.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
      cur.style.transform = `perspective(1100px) rotateY(${(x * MAX).toFixed(2)}deg) rotateX(${(-y * MAX).toFixed(2)}deg) translateY(-3px)`;
      cur.style.setProperty("--nm-mx", ((x + .5) * 100).toFixed(1) + "%");
      cur.style.setProperty("--nm-my", ((y + .5) * 100).toFixed(1) + "%");
    };
    document.addEventListener("pointermove", e => {
      if (!fine.matches || reduce.matches || e.pointerType !== "mouse") return;
      const el = e.target.closest && e.target.closest(TILT);
      if (el !== cur) {
        if (cur) { cur.style.transition = "transform .35s var(--nm-ease)"; reset(cur); }
        cur = el;
        if (cur) { cur.classList.add("nm-tilting"); cur.style.transition = "transform .12s linear"; }
      }
      ev = e; if (cur && !raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (cur) { reset(cur); cur = null; } });
    addEventListener("blur", () => { if (cur) { reset(cur); cur = null; } });
  }

  /* ---------- ripple + press ---------- */
  const RIP = sel("ripple"), PRESS = sel("press");
  document.addEventListener("pointerdown", e => {
    if (reduce.matches || !e.target.closest) return;
    if (PRESS) { const p = e.target.closest(PRESS); if (p) p.classList.add("nm-press"); }
    const h = RIP && e.target.closest(RIP);
    if (!h || h.disabled || h.getAttribute("aria-disabled") === "true") return;
    h.classList.add("nm-ripple-host");
    const r = h.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    const sp = document.createElement("span");
    sp.className = "nm-ripple"; sp.setAttribute("aria-hidden", "true");
    sp.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;--nm-rs:${s}px`;
    h.appendChild(sp); setTimeout(() => sp.remove(), 600);
  }, { passive: true });

  /* ---------- màu thanh trạng thái theo theme ---------- */
  const meta = () => {
    const m = document.querySelector('meta[name="theme-color"]'); if (!m) return;
    m.content = root.dataset.theme === "dark" ? "#121129" : "#F5F2FC";
  };
  new MutationObserver(meta).observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
  meta();
})();
