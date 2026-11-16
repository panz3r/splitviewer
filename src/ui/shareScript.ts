// Dashboard share-button script, served as a static asset at SHARE_SCRIPT_PATH
// (src/controllers/assets.tsx). The CSP (src/middleware/securityHeaders.ts)
// only allows same-origin script files, so it must never be inlined.
export const SHARE_SCRIPT_PATH = "/share.js";

export const SHARE_SCRIPT = `
  function showToast(msg) {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    if (t._h) clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  document.querySelectorAll("[data-share]").forEach(function (btn) {
    var url = btn.getAttribute("data-share");
    var labels = JSON.parse(btn.getAttribute("data-labels"));
    var supportsShare = typeof navigator.share === "function";
    btn.textContent = supportsShare ? labels.share : labels.shareNoWebShare;
    btn.addEventListener("click", function () {
      if (supportsShare) {
        navigator.share({ title: "SplitViewer", url: url }).then(
          function () { showToast(labels.sharedToast); },
          function (err) {
            if (err && err.name !== "AbortError") showToast(labels.couldNotShare);
          }
        );
      } else {
        navigator.clipboard.writeText(url).then(
          function () { showToast(labels.copiedToast); },
          function () {
            showToast(labels.copyFallback);
          }
        );
      }
    });
  });
`;
