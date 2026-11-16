/* Giao tiếp với Nhà Mình. Không chia sẻ token hoặc mật khẩu. */
(() => {
  "use strict";
  const origin = "https://nha-minh.giadinhxuan.workers.dev";
  let initialized = false, last = null;
  function send(message) {
    if (window.parent !== window) window.parent.postMessage(message, origin);
  }
  window.NhaMinhBridge = {
    status(line, tone = "idle", alert = "", at = Date.now()) {
      last = { type: "nhaminh:status", line, tone, alert, at };
      send(last);
    },
    ready() { initialized = true; send({ type: "nhaminh:ready" }); },
  };
  window.addEventListener("message", e => {
    if (e.origin !== origin || e.source !== window.parent || !e.data) return;
    if (e.data.type === "nhaminh:status-request" && initialized) {
      if (last) send(last);
      else send({ type: "nhaminh:status", line: "Đang tải dữ liệu…", tone: "idle", alert: "", at: Date.now() });
    }
    if (e.data.type === "nhaminh:visibility" && !e.data.visible) {
      window.dispatchEvent(new Event("nhaminh:background"));
    }
  });
})();
