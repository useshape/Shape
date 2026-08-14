/** Injected into the live preview so design mode can inspect/edit the real DOM. */
export const DESIGN_BRIDGE_SCRIPT = `
(function () {
  if (window.__SHAPE_DESIGN_BRIDGE__) return;
  window.__SHAPE_DESIGN_BRIDGE__ = true;

  var ATTR = "data-shape-id";
  var SKIP = { SCRIPT:1, STYLE:1, LINK:1, META:1, TITLE:1, NOSCRIPT:1, BR:1 };
  var enabled = false;
  var inspect = true;
  var hoverId = null;
  var selectedId = null;
  var overlay = null;
  var labelEl = null;
  var pending = {};
  var undoStack = [];
  var redoStack = [];
  var origInline = {};

  function post(msg) {
    try { parent.postMessage(Object.assign({ source: "shape-design" }, msg), "*"); } catch (e) {}
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "shape-design-overlay";
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:1.5px solid #9eb0ff;background:rgba(158,176,255,0.12);display:none;box-sizing:border-box;";
    labelEl = document.createElement("div");
    labelEl.style.cssText = "position:absolute;left:-1.5px;top:-18px;height:16px;padding:0 6px;font:11px/16px ui-sans-serif,system-ui,sans-serif;background:#9eb0ff;color:#111;white-space:nowrap;border-radius:3px 3px 0 0;";
    overlay.appendChild(labelEl);
    document.documentElement.appendChild(overlay);
  }

  function cssPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var tag = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(tag + "#" + node.id.replace(/([^\\w-])/g, "\\$1"));
        break;
      }
      var nth = 1;
      var sib = node;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === node.tagName) nth++;
      }
      parts.unshift(tag + ":nth-of-type(" + nth + ")");
      node = node.parentElement;
    }
    return parts.join(">");
  }

  function stableId(el) {
    var path = cssPath(el);
    var h = 2166136261;
    for (var i = 0; i < path.length; i++) {
      h ^= path.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return "s" + (h >>> 0).toString(36);
  }

  var liveById = {};

  function idFor(el) {
    var existing = el.getAttribute(ATTR);
    if (existing) {
      liveById[existing] = el;
      return existing;
    }
    var id = stableId(el);
    if (liveById[id] && liveById[id] !== el) {
      id = id + "-" + Object.keys(liveById).length;
    }
    liveById[id] = el;
    return id;
  }

  function walk(node, acc) {
    if (!node || node.nodeType !== 1) return acc;
    var el = node;
    var tag = el.tagName;
    if (SKIP[tag] || el.id === "shape-design-overlay") return acc;
    var id = idFor(el);
    var label = tag.toLowerCase();
    if (el.id) label += "#" + el.id;
    else if (el.className && typeof el.className === "string") {
      var cls = el.className.trim().split(/\\s+/).slice(0, 2).join(".");
      if (cls) label += "." + cls;
    }
    var childAcc = [];
    for (var i = 0; i < el.children.length; i++) walk(el.children[i], childAcc);
    acc.push({ id: id, tag: tag.toLowerCase(), label: label, children: childAcc });
    return acc;
  }

  function byId(id) {
    if (!id) return null;
    var mapped = liveById[id];
    if (mapped && mapped.isConnected) return mapped;
    return document.querySelector("[" + ATTR + "='" + id + "']");
  }

  function readStyles(el) {
    var s = getComputedStyle(el);
    return {
      color: s.color,
      backgroundColor: s.backgroundColor,
      backgroundImage: s.backgroundImage,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      fontStyle: s.fontStyle,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textAlign: s.textAlign,
      textDecoration: s.textDecorationLine || s.textDecoration,
      textTransform: s.textTransform,
      marginTop: s.marginTop,
      marginRight: s.marginRight,
      marginBottom: s.marginBottom,
      marginLeft: s.marginLeft,
      paddingTop: s.paddingTop,
      paddingRight: s.paddingRight,
      paddingBottom: s.paddingBottom,
      paddingLeft: s.paddingLeft,
      borderWidth: s.borderTopWidth,
      borderStyle: s.borderTopStyle,
      borderColor: s.borderTopColor,
      borderRadius: s.borderTopLeftRadius,
      opacity: s.opacity,
      boxShadow: s.boxShadow,
      display: s.display,
      width: s.width,
      height: s.height,
      gap: s.gap,
      columnGap: s.columnGap,
      rowGap: s.rowGap,
      flexDirection: s.flexDirection,
      justifyContent: s.justifyContent,
      alignItems: s.alignItems,
      flexWrap: s.flexWrap,
      overflow: s.overflow,
      position: s.position,
      top: s.top,
      right: s.right,
      bottom: s.bottom,
      left: s.left,
      mixBlendMode: s.mixBlendMode,
      filter: s.filter,
      backdropFilter: s.backdropFilter || s.webkitBackdropFilter
    };
  }

  function paintOverlay(el, selected) {
    ensureOverlay();
    if (!el) { overlay.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = r.left + "px";
    overlay.style.top = r.top + "px";
    overlay.style.width = Math.max(0, r.width) + "px";
    overlay.style.height = Math.max(0, r.height) + "px";
    overlay.style.borderColor = selected ? "#9eb0ff" : "rgba(158,176,255,0.7)";
    overlay.style.background = selected ? "rgba(158,176,255,0.10)" : "rgba(158,176,255,0.06)";
    var tag = el.tagName.toLowerCase();
    labelEl.textContent = tag + (el.id ? "#" + el.id : "");
  }

  function snapshot(el) {
    if (!el) return;
    var id = el.getAttribute(ATTR);
    if (origInline[id] == null) origInline[id] = el.getAttribute("style") || "";
  }

  function ensureWebFont(family) {
    if (!family) return;
    var name = String(family).replace(/['"]/g, "").split(",")[0].trim();
    var fonts = {
      Inter: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
      "IBM Plex Mono": "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@100;400;500;700&display=swap"
    };
    var href = fonts[name];
    if (!href) return;
    var id = "shape-font-" + name.replace(/\\s+/g, "-");
    if (document.getElementById(id)) return;
    var link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function applyStyles(el, styles) {
    snapshot(el);
    Object.keys(styles || {}).forEach(function (k) {
      var css = k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
      if (k === "fontFamily") ensureWebFont(styles[k]);
      el.style.setProperty(css, styles[k], "important");
    });
  }

  function resolveTarget(data) {
    var target = data.id ? byId(data.id) : null;
    if (!target && data.selector) {
      try { target = document.querySelector(data.selector); } catch (e) { target = null; }
    }
    if (target && !target.getAttribute(ATTR)) {
      target.setAttribute(ATTR, Math.random().toString(36).slice(2, 10));
    }
    return target;
  }

  function reactSource(el) {
    var key = null;
    for (var k in el) {
      if (k.indexOf("__reactFiber") === 0 || k.indexOf("__reactInternalInstance") === 0) { key = k; break; }
    }
    if (!key) return null;
    var fiber = el[key];
    var hops = 0;
    while (fiber && hops < 50) {
      var src = fiber._debugSource || (fiber._debugOwner && fiber._debugOwner._debugSource);
      if (!src && fiber._debugInfo && fiber._debugInfo.length) {
        for (var i = fiber._debugInfo.length - 1; i >= 0; i--) {
          var info = fiber._debugInfo[i];
          if (info && info.fileName) { src = info; break; }
        }
      }
      var type = fiber.type || (fiber._debugOwner && fiber._debugOwner.type);
      var name = type && (type.displayName || type.name);
      if (src && src.fileName) {
        return {
          fileName: String(src.fileName),
          lineNumber: src.lineNumber || 1,
          columnNumber: src.columnNumber || 1,
          componentName: name || ""
        };
      }
      fiber = fiber._debugOwner || fiber.return;
      hops++;
    }
    return null;
  }

  function emitSelected(el) {
    if (!el) { post({ type: "shape-design-selected", element: null }); return; }
    var id = idFor(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, id);
    selectedId = id;
    paintOverlay(el, true);
    post({
      type: "shape-design-selected",
      element: {
        id: id,
        tag: el.tagName.toLowerCase(),
        label: el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""),
        text: (el.childElementCount === 0 ? (el.textContent || "") : "").trim().slice(0, 4000),
        className: typeof el.className === "string" ? el.className : "",
        selector: cssPath(el),
        source: reactSource(el),
        styles: readStyles(el)
      }
    });
  }

  function pick(e) {
    if (!enabled || !inspect) return;
    var el = e.target;
    if (!el || el.id === "shape-design-overlay") return;
    while (el && SKIP[el.tagName]) el = el.parentElement;
    if (!el || el === document.documentElement || el === document.body) {
      if (el === document.body) { /* allow body */ } else return;
    }
    e.preventDefault();
    e.stopPropagation();
    emitSelected(el);
  }

  function onMove(e) {
    if (!enabled || !inspect) return;
    var el = e.target;
    if (!el || el.id === "shape-design-overlay") return;
    var id = idFor(el);
    if (id && id === hoverId) return;
    hoverId = id;
    if (selectedId && id === selectedId) { paintOverlay(el, true); return; }
    paintOverlay(el, false);
  }

  function sendTree() {
    liveById = {};
    var roots = walk(document.body, []);
    post({ type: "shape-design-tree", nodes: [{ id: "root", tag: "html", label: "Root", children: roots }] });
  }

  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || data.source !== "shape-design-host") return;
    if (data.type === "shape-design-enable") {
      enabled = true;
      inspect = data.inspect !== false;
      ensureOverlay();
      hookNetwork();
      sendTree();
      if (selectedId) emitSelected(byId(selectedId));
    }
    if (data.type === "shape-design-disable") {
      enabled = false;
      overlay && (overlay.style.display = "none");
    }
    if (data.type === "shape-design-inspect") inspect = !!data.enabled;
    if (data.type === "shape-design-select") {
      var el = resolveTarget(data);
      if (el) emitSelected(el);
    }
    if (data.type === "shape-design-style") {
      var target = resolveTarget(data);
      if (!target) return;
      var tid = target.getAttribute(ATTR);
      undoStack.push({ id: tid, style: target.getAttribute("style") || "" });
      redoStack = [];
      applyStyles(target, data.styles || {});
      pending[tid] = Object.assign(pending[tid] || {}, data.styles || {});
      emitSelected(target);
    }
    if (data.type === "shape-design-content") {
      var t = resolveTarget(data);
      if (!t) return;
      undoStack.push({ id: t.getAttribute(ATTR), style: t.getAttribute("style") || "", html: t.innerHTML });
      t.textContent = data.text || "";
      pending[t.getAttribute(ATTR)] = Object.assign(pending[t.getAttribute(ATTR)] || {}, { __text: data.text || "" });
    }
    if (data.type === "shape-design-undo") {
      var u = undoStack.pop();
      if (!u) return;
      var ue = byId(u.id);
      if (!ue) return;
      redoStack.push({ id: u.id, style: ue.getAttribute("style") || "", html: ue.innerHTML });
      ue.setAttribute("style", u.style);
      if (u.html != null) ue.innerHTML = u.html;
      emitSelected(ue);
    }
    if (data.type === "shape-design-redo") {
      var r = redoStack.pop();
      if (!r) return;
      var re = byId(r.id);
      if (!re) return;
      undoStack.push({ id: r.id, style: re.getAttribute("style") || "", html: re.innerHTML });
      re.setAttribute("style", r.style);
      if (r.html != null) re.innerHTML = r.html;
      emitSelected(re);
    }
    if (data.type === "shape-design-reset") {
      Object.keys(origInline).forEach(function (id) {
        var n = byId(id);
        if (!n) return;
        if (origInline[id]) n.setAttribute("style", origInline[id]);
        else n.removeAttribute("style");
      });
      pending = {};
      undoStack = [];
      redoStack = [];
      if (selectedId) emitSelected(byId(selectedId));
    }
    if (data.type === "shape-design-request-tree") sendTree();
    if (data.type === "shape-design-pause") {
      paused = !!data.enabled;
      document.documentElement.classList.toggle("shape-paused", paused);
      if (paused) {
        document.documentElement.style.setProperty("pointer-events", "none");
      } else {
        document.documentElement.style.removeProperty("pointer-events");
      }
    }
    if (data.type === "shape-design-pseudo" && data.pseudo) {
      forcePseudo(resolveTarget(data) || byId(selectedId), data.pseudo, !!data.enabled);
    }
  });

  var paused = false;
  var treeTimer = null;
  var mo = new MutationObserver(function () {
    if (!enabled || paused) return;
    if (treeTimer) clearTimeout(treeTimer);
    treeTimer = setTimeout(function () {
      sendTree();
      if (selectedId) {
        var still = byId(selectedId);
        if (still) paintOverlay(still, true);
      }
    }, 280);
  });
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  var networkHooked = false;
  function hookNetwork() {
    if (networkHooked) return;
    networkHooked = true;
    var ofetch = window.fetch;
    if (typeof ofetch === "function") {
      window.fetch = function () {
        var args = arguments;
        var url = String(args[0] && args[0].url ? args[0].url : args[0]);
        var started = Date.now();
        return ofetch.apply(this, args).then(function (res) {
          post({ type: "shape-design-network", method: "GET", url: url, status: res.status, ms: Date.now() - started });
          return res;
        }, function (err) {
          post({ type: "shape-design-network", method: "GET", url: url, status: 0, ms: Date.now() - started });
          throw err;
        });
      };
    }
    var XO = window.XMLHttpRequest;
    if (XO && XO.prototype) {
      var open = XO.prototype.open;
      var send = XO.prototype.send;
      XO.prototype.open = function (method, url) {
        this.__shape = { method: method, url: String(url), started: 0 };
        return open.apply(this, arguments);
      };
      XO.prototype.send = function () {
        var xhr = this;
        if (xhr.__shape) xhr.__shape.started = Date.now();
        xhr.addEventListener("loadend", function () {
          if (!xhr.__shape) return;
          post({
            type: "shape-design-network",
            method: xhr.__shape.method,
            url: xhr.__shape.url,
            status: xhr.status,
            ms: Date.now() - xhr.__shape.started
          });
        });
        return send.apply(this, arguments);
      };
    }
  }

  function forcePseudo(el, pseudo, on) {
    if (!el) return;
    var key = "data-shape-" + pseudo;
    if (on) el.setAttribute(key, "1");
    else el.removeAttribute(key);
    var style = document.getElementById("shape-pseudo-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "shape-pseudo-style";
      document.head.appendChild(style);
    }
    var id = el.getAttribute(ATTR);
    var chunks = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sheet = document.styleSheets[i];
      var rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (!r.selectorText || r.selectorText.indexOf(":" + pseudo) < 0) continue;
        var plain = r.selectorText.replace(new RegExp(":" + pseudo + "\\\\b", "g"), "");
        try {
          if (el.matches(plain.split(",")[0].trim()) || el.matches(r.selectorText)) {
            chunks.push('[data-shape-id="' + id + '"] { ' + r.style.cssText + " }");
          }
        } catch (e) {}
      }
    }
    style.textContent = on ? chunks.join("\\n") : "";
  }

  document.addEventListener("click", pick, true);
  document.addEventListener("mousedown", function (e) {
    if (enabled && inspect) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener("mousemove", onMove, true);
  window.addEventListener("scroll", function () {
    if (selectedId) paintOverlay(byId(selectedId), true);
  }, true);
  window.addEventListener("resize", function () {
    if (selectedId) paintOverlay(byId(selectedId), true);
  });

  post({ type: "shape-design-ready" });
})();
`;
