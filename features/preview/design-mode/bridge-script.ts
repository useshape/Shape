/** Injected into the live preview so design mode can inspect/edit the real DOM. */
export const DESIGN_BRIDGE_SCRIPT = `
(function () {
  if (window.__SHAPE_DESIGN_BRIDGE__) return;
  window.__SHAPE_DESIGN_BRIDGE__ = true;

  var ATTR = "data-shape-id";
  var SKIP = { SCRIPT:1, STYLE:1, LINK:1, META:1, TITLE:1, NOSCRIPT:1, BR:1 };
  var enabled = false;
  var inspect = true;
  var tool = "select";
  var hoverId = null;
  var selectedId = null;
  var overlay = null;
  var labelEl = null;
  var pending = {};
  var undoStack = [];
  var redoStack = [];
  var origInline = {};
  var liveProps = {};
  var paused = false;
  var resumeAfterEdit = false;
  var emulateFocus = false;
  var watchId = null;
  var watchSnap = null;
  var marqueeEl = null;
  var interact = null;
  var handles = {};
  var insertLine = null;
  var textEdit = null;

  var TEXT_LIKE = {
    H1:1, H2:1, H3:1, H4:1, H5:1, H6:1,
    P:1, SPAN:1, A:1, BUTTON:1, LABEL:1, LI:1,
    TD:1, TH:1, FIGCAPTION:1, BLOCKQUOTE:1,
    STRONG:1, EM:1, SMALL:1, CODE:1
  };

  function post(msg) {
    try { parent.postMessage(Object.assign({ source: "shape-design" }, msg), "*"); } catch (e) {}
  }

  function bridgeLog(level, event, fields) {
    post({ type: "shape-design-log", level: level, event: event, fields: fields || {} });
  }

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return;
    overlay = document.createElement("div");
    overlay.id = "shape-design-overlay";
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:1.5px solid #9eb0ff;background:rgba(158,176,255,0.12);display:none;box-sizing:border-box;";
    labelEl = document.createElement("div");
    labelEl.style.cssText = "position:absolute;left:-1.5px;top:-18px;height:16px;padding:0 6px;font:11px/16px ui-sans-serif,system-ui,sans-serif;background:#9eb0ff;color:#111;white-space:nowrap;border-radius:3px 3px 0 0;";
    overlay.appendChild(labelEl);
    var edges = [
      { k: "n", css: "left:50%;top:-4px;margin-left:-4px;cursor:ns-resize;" },
      { k: "e", css: "right:-4px;top:50%;margin-top:-4px;cursor:ew-resize;" },
      { k: "s", css: "left:50%;bottom:-4px;margin-left:-4px;cursor:ns-resize;" },
      { k: "w", css: "left:-4px;top:50%;margin-top:-4px;cursor:ew-resize;" }
    ];
    for (var hi = 0; hi < edges.length; hi++) {
      var h = document.createElement("div");
      h.setAttribute("data-shape-handle", edges[hi].k);
      h.style.cssText = "position:absolute;width:8px;height:8px;background:#9eb0ff;border:1px solid #111;box-sizing:border-box;pointer-events:auto;display:none;z-index:1;" + edges[hi].css;
      overlay.appendChild(h);
      handles[edges[hi].k] = h;
    }
    (document.body || document.documentElement).appendChild(overlay);
  }

  function ensureMarquee() {
    if (marqueeEl && marqueeEl.isConnected) return;
    marqueeEl = document.createElement("div");
    marqueeEl.id = "shape-design-marquee";
    marqueeEl.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:1px solid #9eb0ff;background:rgba(158,176,255,0.15);display:none;box-sizing:border-box;";
    (document.body || document.documentElement).appendChild(marqueeEl);
  }

  function paintMarquee(x0, y0, x1, y1) {
    ensureMarquee();
    var left = Math.min(x0, x1);
    var top = Math.min(y0, y1);
    marqueeEl.style.display = "block";
    marqueeEl.style.left = left + "px";
    marqueeEl.style.top = top + "px";
    marqueeEl.style.width = Math.abs(x1 - x0) + "px";
    marqueeEl.style.height = Math.abs(y1 - y0) + "px";
  }

  function hideMarquee() {
    if (marqueeEl) marqueeEl.style.display = "none";
  }

  function syncHandles(show) {
    var keys = ["n", "e", "s", "w"];
    for (var i = 0; i < keys.length; i++) {
      if (handles[keys[i]]) handles[keys[i]].style.display = show ? "block" : "none";
    }
  }

  function parsePx(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function isPositioned(el) {
    if (!el) return false;
    var p = getComputedStyle(el).position;
    return p === "absolute" || p === "fixed" || p === "sticky" || p === "relative";
  }

  function isFlowParent(el) {
    if (!el) return false;
    var d = getComputedStyle(el).display;
    return d === "flex" || d === "inline-flex" || d === "grid" || d === "inline-grid";
  }

  function isNormalFlowChild(el) {
    if (!el) return false;
    var cs = getComputedStyle(el);
    return cs.position === "static" || cs.position === "relative";
  }

  function flowChildren(parent) {
    var out = [];
    if (!parent) return out;
    for (var i = 0; i < parent.children.length; i++) {
      var c = parent.children[i];
      if (skipChrome(c) || SKIP[c.tagName]) continue;
      if (!isNormalFlowChild(c)) continue;
      out.push(c);
    }
    return out;
  }

  function ensureInsertionLine() {
    if (insertLine && insertLine.isConnected) return insertLine;
    insertLine = document.createElement("div");
    insertLine.id = "shape-design-insert";
    insertLine.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;background:#9eb0ff;display:none;";
    (document.body || document.documentElement).appendChild(insertLine);
    return insertLine;
  }

  function hideInsertionLine() {
    if (insertLine) insertLine.style.display = "none";
  }

  function paintInsertionLine(parent, index, vertical) {
    var kids = flowChildren(parent);
    ensureInsertionLine();
    var rect;
    if (kids.length === 0) {
      rect = parent.getBoundingClientRect();
      insertLine.style.left = rect.left + "px";
      insertLine.style.top = rect.top + "px";
      insertLine.style.width = vertical ? "2px" : Math.max(2, rect.width) + "px";
      insertLine.style.height = vertical ? Math.max(2, rect.height) + "px" : "2px";
      insertLine.style.display = "block";
      return;
    }
    if (index <= 0) {
      rect = kids[0].getBoundingClientRect();
      if (vertical) {
        insertLine.style.left = rect.left + "px";
        insertLine.style.top = rect.top + "px";
        insertLine.style.width = "2px";
        insertLine.style.height = rect.height + "px";
      } else {
        insertLine.style.left = rect.left + "px";
        insertLine.style.top = rect.top + "px";
        insertLine.style.width = rect.width + "px";
        insertLine.style.height = "2px";
      }
    } else if (index >= kids.length) {
      rect = kids[kids.length - 1].getBoundingClientRect();
      if (vertical) {
        insertLine.style.left = (rect.right - 2) + "px";
        insertLine.style.top = rect.top + "px";
        insertLine.style.width = "2px";
        insertLine.style.height = rect.height + "px";
      } else {
        insertLine.style.left = rect.left + "px";
        insertLine.style.top = (rect.bottom - 2) + "px";
        insertLine.style.width = rect.width + "px";
        insertLine.style.height = "2px";
      }
    } else {
      var a = kids[index - 1].getBoundingClientRect();
      var b = kids[index].getBoundingClientRect();
      if (vertical) {
        var x = (a.right + b.left) / 2;
        insertLine.style.left = (x - 1) + "px";
        insertLine.style.top = Math.min(a.top, b.top) + "px";
        insertLine.style.width = "2px";
        insertLine.style.height = Math.max(a.height, b.height) + "px";
      } else {
        var y = (a.bottom + b.top) / 2;
        insertLine.style.left = Math.min(a.left, b.left) + "px";
        insertLine.style.top = (y - 1) + "px";
        insertLine.style.width = Math.max(a.width, b.width) + "px";
        insertLine.style.height = "2px";
      }
    }
    insertLine.style.display = "block";
  }

  function reorderIndexAt(parent, clientX, clientY, vertical) {
    var kids = flowChildren(parent);
    if (!kids.length) return 0;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      var mid = vertical ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
      var v = vertical ? clientX : clientY;
      if (v < mid) return i;
    }
    return kids.length;
  }

  function isPageRoot(el) {
    if (!el || el === document.documentElement || el === document.body) return true;
    var id = (el.id || "").toLowerCase();
    return id === "__next" || id === "root" || id === "app" || id === "__nuxt";
  }

  /** Full-viewport wrappers (min-h-screen, layout shells) — never select/drag these as “the page”. */
  function isPageShell(el) {
    if (!el || el.nodeType !== 1) return true;
    if (isPageRoot(el)) return true;
    var tag = el.tagName;
    if (tag === "HTML" || tag === "BODY") return true;
    var role = el.getAttribute && el.getAttribute("role");
    if (role === "dialog" || role === "alertdialog" || role === "menu") return false;
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    if (r.width >= vw * 0.9 && r.height >= vh * 0.85) {
      if (
        tag === "MAIN" || tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" ||
        tag === "FORM" || tag === "UL" || tag === "NAV" || tag === "HEADER" ||
        tag === "FOOTER" || tag === "ASIDE"
      ) {
        return true;
      }
    }
    return false;
  }

  function isInteractive(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (
      tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA" ||
      tag === "SELECT" || tag === "LABEL" || tag === "SUMMARY" || tag === "OPTION" ||
      tag === "IMG" || tag === "SVG" || tag === "VIDEO" || tag === "AUDIO" ||
      tag === "CANVAS" || tag === "IFRAME"
    ) return true;
    var role = el.getAttribute && el.getAttribute("role");
    if (
      role === "button" || role === "link" || role === "menuitem" || role === "tab" ||
      role === "checkbox" || role === "switch" || role === "textbox" || role === "combobox" ||
      role === "option" || role === "slider" || role === "img"
    ) return true;
    if (el.isContentEditable) return true;
    try {
      if (getComputedStyle(el).cursor === "pointer") return true;
    } catch (errCursor) {}
    return false;
  }

  /** Prefer a real UI control over a full-page layout wrapper. */
  function refineHit(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.ownerSVGElement) el = el.ownerSVGElement;
    var cur = el;
    var strong = null;
    var media = null;
    var candidate = el;
    while (cur && cur !== document.documentElement) {
      if (isPageShell(cur)) break;
      var tag = cur.tagName;
      var role = cur.getAttribute && cur.getAttribute("role");
      var isStrong =
        tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA" ||
        tag === "SELECT" || tag === "LABEL" || tag === "SUMMARY" ||
        role === "button" || role === "link" || role === "menuitem" || role === "tab" ||
        role === "checkbox" || role === "switch" || role === "textbox" || role === "combobox" ||
        role === "option" || role === "slider" || cur.isContentEditable;
      if (!isStrong) {
        try { if (getComputedStyle(cur).cursor === "pointer") isStrong = true; } catch (ePtr) {}
      }
      if (isStrong) { strong = cur; break; }
      if (!media && (tag === "IMG" || tag === "SVG" || tag === "VIDEO" || tag === "AUDIO" || tag === "CANVAS" || tag === "IFRAME" || role === "img")) {
        media = cur;
      }
      candidate = cur;
      cur = cur.parentElement;
    }
    if (strong) return strong;
    if (media) return media;
    if (isPageShell(candidate)) return null;
    return candidate;
  }

  function shouldReorder(el) {
    var parent = el.parentElement;
    if (!parent || !isFlowParent(parent) || !isNormalFlowChild(el)) return false;
    var pos = getComputedStyle(el).position;
    if (pos === "absolute" || pos === "fixed") return false;
    // Top-level page shells: free-move with snap instead of reshuffling the whole document.
    if (isPageRoot(parent) || isPageShell(parent)) return false;
    return true;
  }

  function promoteToRelative(el) {
    var cs = getComputedStyle(el);
    if (cs.position !== "static") {
      return {
        position: cs.position,
        left: parsePx(cs.left),
        top: parsePx(cs.top)
      };
    }
    // relative left/top are offsets from normal flow — seed at 0, never offsetLeft/Top
    // (those are layout coordinates and would jump the element by its full inset).
    applyStyles(el, {
      position: "relative",
      left: "0px",
      top: "0px"
    });
    return { position: "relative", left: 0, top: 0 };
  }

  function isEditableFocus() {
    var ae = document.activeElement;
    if (!ae || ae === document.body || ae === document.documentElement) return false;
    var tag = ae.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.isContentEditable) return true;
    return false;
  }

  function isTextLike(el) {
    return !!(el && TEXT_LIKE[el.tagName]);
  }

  function endTextEdit(commit) {
    if (!textEdit) return;
    var el = textEdit.el;
    var id = textEdit.id;
    var original = textEdit.original;
    el.removeEventListener("keydown", textEdit.onKey);
    el.removeEventListener("blur", textEdit.onBlur);
    el.contentEditable = "false";
    el.removeAttribute("contenteditable");
    var text = el.textContent || "";
    textEdit = null;
    if (!commit) {
      el.textContent = original;
    } else if (text !== original) {
      pending[id] = Object.assign(pending[id] || {}, { __text: text });
      post({ type: "shape-design-text-edited", id: id, text: text });
    }
    if (el.isConnected) emitSelected(el, false);
  }

  function beginTextEdit(el) {
    if (!el || !isTextLike(el) || textEdit) return;
    var id = el.getAttribute(ATTR) || idFor(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, id);
    var original = el.textContent || "";
    var onKey = function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        endTextEdit(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        endTextEdit(false);
      }
    };
    var onBlur = function () {
      endTextEdit(true);
    };
    textEdit = { el: el, id: id, original: original, onKey: onKey, onBlur: onBlur };
    el.contentEditable = "true";
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (err) {}
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", onBlur);
  }

  function onDblClick(e) {
    if (!enabled || !inspect) return;
    if (textEdit) return;
    var el = selectedId ? byId(selectedId) : null;
    if (!el || !isTextLike(el)) return;
    var hit = elFromPoint(e.clientX, e.clientY) || e.target;
    if (!hit || (hit !== el && !el.contains(hit))) return;
    e.preventDefault();
    e.stopPropagation();
    interact = null;
    beginTextEdit(el);
  }

  // SVG elements expose className as an SVGAnimatedString, not a string.
  function classOf(el) {
    if (!el) return "";
    if (typeof el.className === "string") return el.className;
    if (el.className && typeof el.className.baseVal === "string") return el.className.baseVal;
    return (el.getAttribute && el.getAttribute("class")) || "";
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
      var raw = classOf(node);
      var cls = raw.split(/\\s+/).filter(function (c) {
        return c.length >= 3 && !/^(flex|inline-flex|grid|block|hidden|relative|absolute|sticky|w-full|h-full)$/.test(c);
      })[0];
      var nth = 1;
      var sib = node;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === node.tagName) nth++;
      }
      if (cls && /^[A-Za-z_][\\w-]*$/.test(cls)) parts.unshift(tag + "." + cls);
      else parts.unshift(tag + ":nth-of-type(" + nth + ")");
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
    if (SKIP[tag] || el.id === "shape-design-overlay" || el.id === "shape-guides" || el.id === "shape-design-marquee" || (el.id && el.id.indexOf("shape-prog-") === 0)) return acc;
    var id = idFor(el);
    var label = tag.toLowerCase();
    if (el.id) label += "#" + el.id;
    else {
      var cls = classOf(el).trim().split(/\\s+/).slice(0, 2).join(".");
      if (cls) label += "." + cls;
    }
    var childAcc = [];
    for (var i = 0; i < el.children.length; i++) walk(el.children[i], childAcc);
    var cs = getComputedStyle(el);
    var hidden = cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0;
    var interactive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(tag) || el.tabIndex >= 0;
    acc.push({ id: id, tag: tag.toLowerCase(), label: label, hidden: hidden, interactive: interactive, children: childAcc });
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
      whiteSpace: s.whiteSpace,
      textOverflow: s.textOverflow,
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
      backdropFilter: s.backdropFilter || s.webkitBackdropFilter,
      maskImage: s.maskImage || s.webkitMaskImage,
      WebkitMaskImage: s.webkitMaskImage || s.maskImage
    };
  }

  var lastPtr = { x: 0, y: 0 };

  function skipChrome(node) {
    if (!node || node.nodeType !== 1) return true;
    if (node.id === "shape-design-overlay" || node.id === "shape-guides" || node.id === "shape-design-marquee") return true;
    if (node.id && node.id.indexOf("shape-prog-") === 0) return true;
    if (node.getAttribute && node.getAttribute("data-shape-handle")) return true;
    if (overlay && overlay.contains && overlay.contains(node)) return true;
    return false;
  }

  function elFromPoint(x, y) {
    try {
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i++) {
        var n = stack[i];
        if (skipChrome(n) || SKIP[n.tagName]) continue;
        if (isPageShell(n)) continue;
        var refined = refineHit(n);
        if (refined && !isPageShell(refined) && !skipChrome(refined)) return refined;
      }
    } catch (err) {}
    return null;
  }

  function paintOverlay(el, selected) {
    ensureOverlay();
    if (!el) { overlay.style.display = "none"; syncHandles(false); return; }
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
    syncHandles(!!selected);
  }

  var progLayers = {};
  var guideRoot = null;

  function bandMask(angle, i, n) {
    var a = i / n;
    var b = (i + 1) / n;
    var fade = 1 / n;
    var start = Math.max(0, (a - fade) * 100);
    var mid1 = a * 100;
    var mid2 = b * 100;
    var end = Math.min(100, (b + fade) * 100);
    return "linear-gradient(" + angle + "deg, transparent " + start + "%, #000 " + mid1 + "%, #000 " + mid2 + "%, transparent " + end + "%)";
  }

  function clearProg(id) {
    var n = progLayers[id];
    if (n && n.parentNode) n.parentNode.removeChild(n);
    delete progLayers[id];
  }

  function syncProgOverlays() {
    var seen = {};
    Object.keys(liveProps).forEach(function (id) {
      var decls = liveProps[id];
      var blurRaw = decls["--shape-prog-blur"];
      if (!blurRaw || blurRaw === "none" || blurRaw === "0px") { clearProg(id); return; }
      var el = byId(id);
      if (!el || !el.isConnected) { clearProg(id); return; }
      seen[id] = 1;
      var r = el.getBoundingClientRect();
      var root = progLayers[id];
      if (!root) {
        root = document.createElement("div");
        root.id = "shape-prog-" + id;
        root.style.cssText = "position:fixed;pointer-events:none;z-index:2147483644;overflow:hidden;";
        for (var i = 0; i < 6; i++) {
          var layer = document.createElement("div");
          layer.style.cssText = "position:absolute;inset:0;";
          root.appendChild(layer);
        }
        (document.body || document.documentElement).appendChild(root);
        progLayers[id] = root;
      }
      root.style.left = r.left + "px";
      root.style.top = r.top + "px";
      root.style.width = Math.max(0, r.width) + "px";
      root.style.height = Math.max(0, r.height) + "px";
      root.style.borderRadius = getComputedStyle(el).borderRadius;
      var maxBlur = parseFloat(blurRaw) || 8;
      var startBlur = parseFloat(decls["--shape-prog-start"] || "0") || 0;
      if (startBlur > maxBlur) { var tmp = startBlur; startBlur = maxBlur; maxBlur = tmp; }
      var angle = String(decls["--shape-prog-angle"] || "180deg").replace("deg", "");
      var kids = root.children;
      var weights = [0, 0.2, 0.4, 0.6, 0.8, 1];
      for (var k = 0; k < kids.length; k++) {
        var pxb = Math.max(0.25, startBlur + (maxBlur - startBlur) * weights[k]);
        var mask = bandMask(angle, k, kids.length);
        kids[k].style.backdropFilter = "blur(" + pxb + "px)";
        kids[k].style.webkitBackdropFilter = "blur(" + pxb + "px)";
        kids[k].style.maskImage = mask;
        kids[k].style.webkitMaskImage = mask;
      }
    });
    Object.keys(progLayers).forEach(function (id) { if (!seen[id]) clearProg(id); });
  }

  function paintGuides(g) {
    if (!guideRoot) {
      guideRoot = document.createElement("div");
      guideRoot.id = "shape-guides";
      guideRoot.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483645;";
      (document.body || document.documentElement).appendChild(guideRoot);
    }
    if (!guideRoot.isConnected) (document.body || document.documentElement).appendChild(guideRoot);
    guideRoot.innerHTML = "";
    var xs = (g && g.xs) ? g.xs : (g && g.x != null ? [g.x] : []);
    var ys = (g && g.ys) ? g.ys : (g && g.y != null ? [g.y] : []);
    for (var i = 0; i < xs.length; i++) {
      var v = document.createElement("div");
      v.style.cssText = "position:absolute;top:0;bottom:0;width:1px;background:#ff4ff8;left:" + xs[i] + "px;";
      guideRoot.appendChild(v);
    }
    for (var j = 0; j < ys.length; j++) {
      var hline = document.createElement("div");
      hline.style.cssText = "position:absolute;left:0;right:0;height:1px;background:#ff4ff8;top:" + ys[j] + "px;";
      guideRoot.appendChild(hline);
    }
  }

  var snapGuideTimer = 0;
  function collectSnapBoxes(el) {
    var boxes = [];
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    var n = Math.min(nodes.length, 160);
    for (var i = 0; i < n; i++) {
      var node = nodes[i];
      if (node === el || skipChrome(node)) continue;
      var r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
      boxes.push({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
    }
    return boxes;
  }
  function snapSize(el, styles) {
    if (!styles || (!styles.width && !styles.height)) return;
    var boxes = collectSnapBoxes(el);
    var xs = [];
    var ys = [];
    var THRESH = 12;
    if (styles.width) {
      var w = parseFloat(styles.width);
      if (!isNaN(w)) {
        var bestW = w;
        var errW = THRESH + 1;
        for (var a = 0; a < boxes.length; a++) {
          var dw = Math.abs(boxes[a].width - w);
          if (dw <= THRESH && dw < errW) { errW = dw; bestW = boxes[a].width; }
        }
        styles.width = Math.max(1, Math.round(bestW)) + "px";
        for (var b = 0; b < boxes.length; b++) {
          if (Math.abs(boxes[b].width - bestW) <= 1) xs.push(boxes[b].left, boxes[b].right);
        }
      }
    }
    if (styles.height) {
      var h = parseFloat(styles.height);
      if (!isNaN(h)) {
        var bestH = h;
        var errH = THRESH + 1;
        for (var c = 0; c < boxes.length; c++) {
          var dh = Math.abs(boxes[c].height - h);
          if (dh <= THRESH && dh < errH) { errH = dh; bestH = boxes[c].height; }
        }
        styles.height = Math.max(1, Math.round(bestH)) + "px";
        for (var d = 0; d < boxes.length; d++) {
          if (Math.abs(boxes[d].height - bestH) <= 1) ys.push(boxes[d].top, boxes[d].bottom);
        }
      }
    }
    paintGuides({ xs: xs, ys: ys });
    window.clearTimeout(snapGuideTimer);
    snapGuideTimer = window.setTimeout(function () { paintGuides({}); }, 900);
  }

  /** Snap proposed relative left/top so the element's edges/centers align with siblings/parent. */
  function snapMove(el, styles) {
    if (!styles || styles.left == null || styles.top == null) return;
    var left = parseFloat(styles.left);
    var top = parseFloat(styles.top);
    if (isNaN(left) || isNaN(top)) return;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var curLeft = parsePx(cs.left);
    var curTop = parsePx(cs.top);
    var dx0 = left - curLeft;
    var dy0 = top - curTop;
    var box = {
      left: r.left + dx0,
      top: r.top + dy0,
      right: r.right + dx0,
      bottom: r.bottom + dy0,
      width: r.width,
      height: r.height
    };
    var cx = (box.left + box.right) / 2;
    var cy = (box.top + box.bottom) / 2;
    var boxes = collectSnapBoxes(el);
    var parent = el.parentElement;
    if (parent && !isPageRoot(parent)) {
      var pr = parent.getBoundingClientRect();
      boxes.push({ left: pr.left, top: pr.top, width: pr.width, height: pr.height, right: pr.right, bottom: pr.bottom });
    }
    var THRESH = 6;
    var bestDx = 0;
    var bestDy = 0;
    var errX = THRESH + 1;
    var errY = THRESH + 1;
    var guideXs = [];
    var guideYs = [];
    function considerX(target, source) {
      var d = target - source;
      var ad = Math.abs(d);
      if (ad <= THRESH && ad < errX) {
        errX = ad;
        bestDx = d;
      }
    }
    function considerY(target, source) {
      var d = target - source;
      var ad = Math.abs(d);
      if (ad <= THRESH && ad < errY) {
        errY = ad;
        bestDy = d;
      }
    }
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var bcx = (b.left + b.right) / 2;
      var bcy = (b.top + b.bottom) / 2;
      considerX(b.left, box.left);
      considerX(b.right, box.right);
      considerX(b.left, box.right);
      considerX(b.right, box.left);
      considerX(bcx, cx);
      considerY(b.top, box.top);
      considerY(b.bottom, box.bottom);
      considerY(b.top, box.bottom);
      considerY(b.bottom, box.top);
      considerY(bcy, cy);
    }
    if (errX <= THRESH) {
      left += bestDx;
      var snappedL = box.left + bestDx;
      var snappedR = box.right + bestDx;
      var snappedCx = cx + bestDx;
      for (var gx = 0; gx < boxes.length; gx++) {
        var bx = boxes[gx];
        var bxcx = (bx.left + bx.right) / 2;
        if (Math.abs(bx.left - snappedL) <= 1 || Math.abs(bx.right - snappedL) <= 1) guideXs.push(bx.left);
        if (Math.abs(bx.left - snappedR) <= 1 || Math.abs(bx.right - snappedR) <= 1) guideXs.push(bx.right);
        if (Math.abs(bxcx - snappedCx) <= 1) guideXs.push(bxcx);
      }
    }
    if (errY <= THRESH) {
      top += bestDy;
      var snappedT = box.top + bestDy;
      var snappedB = box.bottom + bestDy;
      var snappedCy = cy + bestDy;
      for (var gy = 0; gy < boxes.length; gy++) {
        var by = boxes[gy];
        var bycy = (by.top + by.bottom) / 2;
        if (Math.abs(by.top - snappedT) <= 1 || Math.abs(by.bottom - snappedT) <= 1) guideYs.push(by.top);
        if (Math.abs(by.top - snappedB) <= 1 || Math.abs(by.bottom - snappedB) <= 1) guideYs.push(by.bottom);
        if (Math.abs(bycy - snappedCy) <= 1) guideYs.push(bycy);
      }
    }
    styles.left = Math.round(left) + "px";
    styles.top = Math.round(top) + "px";
    if (guideXs.length || guideYs.length) {
      paintGuides({ xs: guideXs, ys: guideYs });
      window.clearTimeout(snapGuideTimer);
      snapGuideTimer = window.setTimeout(function () { paintGuides({}); }, 600);
    } else {
      paintGuides({});
    }
  }

  function snapshot(el) {
    if (!el) return;
    var id = el.getAttribute(ATTR);
    if (origInline[id] == null) origInline[id] = el.getAttribute("style") || "";
  }

  function ensureWebFont(family) {
    if (!family) return;
    var name = String(family).replace(/['"]/g, "").split(",")[0].trim();
    if (!name) return;
    var generic = {"serif":1,"sans-serif":1,"monospace":1,"cursive":1,"fantasy":1,"system-ui":1,"ui-sans-serif":1,"ui-serif":1,"ui-monospace":1,"inherit":1,"initial":1,"unset":1};
    if (generic[name.toLowerCase()]) return;
    var id = "shape-font-" + name.replace(/\\s+/g, "-");
    if (document.getElementById(id)) return;
    var href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + ":wght@100..900&display=swap";
    var link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function cssDeclValue(v) {
    return String(v).split(";").join("").split("}").join("");
  }

  function flushLiveCss() {
    var styleEl = document.getElementById("shape-design-live");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "shape-design-live";
      (document.head || document.documentElement).appendChild(styleEl);
    }
    var css = "";
    Object.keys(liveProps).forEach(function (id) {
      var decls = liveProps[id];
      var safeId = id.replace(/"/g, "");
      var prog = decls["--shape-prog-blur"] || "";
      var skip = {};
      if (prog && prog !== "none") {
        skip["mask-image"] = 1;
        skip["-webkit-mask-image"] = 1;
        skip["mask-size"] = 1;
        skip["mask-repeat"] = 1;
        skip["backdrop-filter"] = 1;
        skip["-webkit-backdrop-filter"] = 1;
      }
      var body = Object.keys(decls).filter(function (k) { return !skip[k]; }).map(function (k) { return k + ":" + cssDeclValue(decls[k]) + " !important"; }).join(";");
      if (body) css += "[" + ATTR + '="' + safeId + '"]{' + body + "}";
    });
    styleEl.textContent = css;
    syncProgOverlays();
  }

  function applyStyles(el, styles, opts) {
    snapshot(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, idFor(el));
    var id = el.getAttribute(ATTR);
    liveProps[id] = liveProps[id] || {};
    styles = styles || {};
    if (opts && opts.snapMove) snapMove(el, styles);
    else snapSize(el, styles);
    if (styles.borderStyle === "none" && (styles.borderWidth == null || styles.borderWidth === "")) styles.borderWidth = "0px";
    if ((styles.borderWidth === "0px" || styles.borderWidth === "0") && (styles.borderStyle == null || styles.borderStyle === "")) styles.borderStyle = "none";
    Object.keys(styles).forEach(function (k) {
      var css = k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
      if (k === "fontFamily") ensureWebFont(styles[k]);
      var val = styles[k];
      if (val == null || String(val).trim() === "") {
        delete liveProps[id][css];
        return;
      }
      liveProps[id][css] = String(val);
    });
    flushLiveCss();
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

  function stackPayload(stack) {
    if (!stack) return null;
    var text = typeof stack === "string" ? stack : (stack && stack.stack);
    if (!text) return null;
    var generated = null;
    var original = null;
    var lines = String(text).split("\\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      if (/node_modules[\\/\\\\]|react-dom|jsx-dev-runtime|jsx-runtime|webpack\\/runtime/i.test(line)) continue;
      var m = line.match(/((?:webpack-internal:\\/\\/\\/|turbopack:\\/\\/\\/|https?:\\/\\/|file:\\/\\/|\\/)[^\\s]+?\\.(?:tsx|jsx|ts|js|vue|svelte))(?::(\\d+))?(?::(\\d+))?/i);
      if (!m) continue;
      var file = m[1].replace(/\\)+$/, "").replace(/^\\(+/, "");
      try { file = decodeURIComponent(file.split("?")[0]); } catch (e) { file = file.split("?")[0]; }
      var loc = { fileName: file, lineNumber: m[2] ? +m[2] : 1, columnNumber: m[3] ? +m[3] : 1 };
      var cleaned = cleanSourcePath(file);
      var isOrig = /\\.(tsx|jsx|vue|svelte)$/i.test(cleaned) && !/_next\\/static|\\/chunks\\/|node_modules/i.test(file);
      var isGen = /_next\\/static|\\/chunks\\/|\\.he5\\.|webpack-internal:|turbopack:/i.test(file) && !/node_modules/i.test(file);
      if (isOrig && !original) original = { fileName: cleaned || file, lineNumber: loc.lineNumber, columnNumber: loc.columnNumber };
      if (isGen && !generated) generated = loc;
    }
    if (!original && !generated) return null;
    return { original: original, generated: generated };
  }

  function cleanSourcePath(file) {
    var n = String(file || "").replace(/\\\\/g, "/").split("?")[0];
    try { n = decodeURIComponent(n); } catch (e) {}
    n = n.replace(/^https?:\\/\\/[^/]+/, "");
    n = n.replace(/^rsc:\\/\\/React\\/(?:Server|Client)\\//i, "");
    n = n.replace(/^webpack-internal:\\/\\/\\//, "");
    n = n.replace(/^webpack:\\/\\/[^/]+\\//, "");
    n = n.replace(/^turbopack:\\/\\/\\/(?:\\[project\\]\\/)?/, "");
    n = n.replace(/^file:\\/\\//, "");
    n = n.replace(/^\\/@fs\\//, "");
    n = n.replace(/^\\/_N_E\\//, "");
    while (/^\\([^)]+\\)\\//.test(n)) n = n.replace(/^\\([^)]+\\)\\//, "");
    n = n.replace(/^\\.\\//, "");
    var src = n.toLowerCase().lastIndexOf("/src/");
    if (src >= 0) n = n.slice(src + 1);
    var app = n.toLowerCase().lastIndexOf("/app/");
    if (app >= 0 && n.indexOf("src/") !== 0) n = n.slice(app + 1);
    return n.replace(/^\\/+/, "");
  }

  var VLQ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function decodeVlq(str) {
    var out = [];
    var i = 0;
    while (i < str.length) {
      var shift = 0, value = 0, digit;
      do {
        digit = VLQ.indexOf(str.charAt(i++));
        if (digit < 0) return out;
        value += (digit & 31) << shift;
        shift += 5;
      } while (digit & 32);
      out.push(value & 1 ? -(value >> 1) : value >> 1);
    }
    return out;
  }
  function isProjectSrc(file) {
    if (!file) return false;
    var n = cleanSourcePath(file);
    if (/node_modules|_next\\/static|\\/chunks\\/|exports\\.jsx$/i.test(n)) return false;
    if (!/\\.(tsx|jsx|vue|svelte|html)$/i.test(n)) return false;
    var base = n.split("/").pop() || n;
    if (/^(app|page|layout|index|main)\\.(tsx|jsx|html)$/i.test(base)) return true;
    return n.indexOf("/") >= 0 || /^(src|app|pages|components)\\//i.test(n);
  }
  function isPrimitivePath(file) {
    return /\\/(ui|components\\/ui|node_modules)\\//i.test(String(file || ""));
  }
  function fromChunkName(file) {
    var base = String(file).replace(/\\\\/g, "/").split("/").pop() || "";
    var m = base.match(/^(.+)_(tsx|jsx|ts|js)(?:_[a-z0-9._]+)?\\.js$/i);
    if (!m) return null;
    var decoded = m[1].replace(/__/g, "\\0").split("_").map(function (p) { return p.replace(/\\0/g, "_"); }).join("/");
    var path = decoded + "." + m[2].toLowerCase();
    return isProjectSrc(path) || /^(src|app|pages)\\//i.test(path) ? path : null;
  }
  function cleanScriptUrl(file) {
    var f = String(file || "").replace(/^[(\\s]+/, "").replace(/[)\\s]+$/, "").split("?")[0];
    if (!f || /node_modules/i.test(f)) return "";
    if (/webpack-internal:|turbopack:|webpack:\\/\\//i.test(f)) {
      return location.origin + "/__nextjs_source-map?filename=" + encodeURIComponent(f);
    }
    if (/^https?:\\/\\//i.test(f)) return f;
    if (f.charAt(0) === "/") return location.origin + f;
    return "";
  }
  function originalFromMap(map, genLine, genCol) {
    if (map && map.sections && map.sections.length) {
      for (var s = 0; s < map.sections.length; s++) {
        var sec = map.sections[s];
        var start = (sec.offset && sec.offset.line) || 0;
        var next = map.sections[s + 1];
        var end = next && next.offset ? next.offset.line : 1e9;
        if (genLine - 1 >= start && genLine - 1 < end && (sec.map || sec.url)) {
          return originalFromMap(sec.map, genLine - start, genCol);
        }
      }
    }
    var lines = String((map && map.mappings) || "").split(";");
    var row = lines[genLine - 1];
    if (!row) return null;
    var segs = row.split(",");
    var gCol = 0, src = 0, oLine = 0, oCol = 0;
    var bestProj = null, bestAny = null;
    for (var i = 0; i < segs.length; i++) {
      if (!segs[i]) continue;
      var v = decodeVlq(segs[i]);
      gCol += v[0] || 0;
      if (v.length < 4) continue;
      src += v[1]; oLine += v[2]; oCol += v[3];
      var source = (map.sources && map.sources[src]) || "";
      var cand = { source: source, line: oLine + 1, column: oCol + 1, dist: Math.abs(gCol - genCol) };
      if (!bestAny || cand.dist < bestAny.dist) bestAny = cand;
      if (isProjectSrc(source) && (!bestProj || cand.dist < bestProj.dist)) bestProj = cand;
    }
    return bestProj || (bestAny && isProjectSrc(bestAny.source) ? bestAny : null);
  }
  function resolveIdentity(src, cb) {
    if (!src) return cb(null);
    var cleaned = cleanSourcePath(src.fileName);
    if (isProjectSrc(cleaned) && src.lineNumber > 0) {
      return cb(Object.assign({}, src, { fileName: cleaned }));
    }
    var gen = src.generated;
    var chunk = fromChunkName((gen && gen.fileName) || src.fileName);
    function finish(mapped) {
      if (mapped) return cb(mapped);
      if (chunk) return cb({ fileName: chunk, lineNumber: src.lineNumber > 1 ? src.lineNumber : 1, columnNumber: src.columnNumber || 1, componentName: src.componentName, generated: gen, mapped: false });
      cb(src);
    }
    var url = gen ? cleanScriptUrl(gen.fileName) : "";
    if (!url) return finish(null);
    fetch(url).then(function (r) { return r.ok ? r.text() : ""; }).then(function (js) {
      var hint = /sourceMappingURL=(\\S+)/.exec(js);
      var mapUrl = hint ? new URL(hint[1], url).href : url.split("?")[0] + ".map";
      return fetch(mapUrl).then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (map) {
      if (!map) return finish(null);
      var orig = originalFromMap(map, gen.lineNumber, gen.columnNumber || 0);
      if (!orig) return finish(null);
      var file = orig.source.replace(/^webpack:\\/\\/[^/]+\\//, "").replace(/^\\.\\//, "");
      file = cleanSourcePath(file);
      if (!isProjectSrc(file) && chunk) file = chunk;
      if (!isProjectSrc(file) && !chunk) return finish(null);
      cb({ fileName: isProjectSrc(file) ? file : chunk, lineNumber: orig.line, columnNumber: orig.column, componentName: src.componentName, generated: gen, mapped: true });
    }).catch(function () { finish(null); });
  }

  function ownerName(fiber) {
    if (!fiber) return "";
    var o = fiber._debugOwner;
    if (typeof o === "function") return o.displayName || o.name || "";
    if (o && typeof o === "object") {
      if (typeof o.type === "function") return o.type.displayName || o.type.name || "";
      if (o.name) return String(o.name);
      if (o.displayName) return String(o.displayName);
    }
    var t = fiber.type;
    if (typeof t === "function") return t.displayName || t.name || "";
    if (t && t.displayName) return t.displayName;
    return "";
  }

  function sourceFromFiberNode(fiber) {
    if (!fiber) return null;
    var name = ownerName(fiber);
    var src = fiber._debugSource;
    if (!src && fiber._debugInfo && fiber._debugInfo.length) {
      for (var i = fiber._debugInfo.length - 1; i >= 0; i--) {
        var info = fiber._debugInfo[i];
        if (info && (info.fileName || info.file)) { src = info; break; }
        if (info && info.debugStack) {
          var stacked = stackPayload(info.debugStack);
          if (stacked && stacked.original) {
            src = { fileName: stacked.original.fileName, lineNumber: stacked.original.lineNumber, columnNumber: stacked.original.columnNumber };
            break;
          }
        }
      }
    }
    var payload = stackPayload(fiber._debugStack) || stackPayload(fiber._debugTask);
    var fileName = "";
    var lineNumber = 0;
    var columnNumber = 1;
    if (src && (src.fileName || src.file) && /\\.(tsx|jsx|vue|svelte)$/i.test(String(src.fileName || src.file).split("?")[0])) {
      fileName = cleanSourcePath(String(src.fileName || src.file));
      lineNumber = src.lineNumber || src.line || 1;
      columnNumber = src.columnNumber || src.column || 1;
    } else if (payload && payload.original) {
      fileName = cleanSourcePath(payload.original.fileName);
      lineNumber = payload.original.lineNumber;
      columnNumber = payload.original.columnNumber;
    }
    var generated = payload && payload.generated ? payload.generated : null;
    if (!fileName && generated) {
      fileName = generated.fileName;
      lineNumber = generated.lineNumber;
      columnNumber = generated.columnNumber;
    }
    if (!fileName && !generated) return null;
    return {
      fileName: fileName,
      lineNumber: lineNumber,
      columnNumber: columnNumber,
      componentName: name,
      generated: generated || undefined,
      nodeId: (fileName || (generated && generated.fileName) || "") + ":" + lineNumber + ":" + columnNumber
    };
  }

  function nextOwnerFiber(fiber) {
    if (!fiber) return null;
    var owner = fiber._debugOwner;
    if (owner && typeof owner === "object" && (owner.return || owner.tag != null || owner.type)) return owner;
    return fiber.return || null;
  }

  function sourceFromFiber(fiber) {
    if (!fiber) return null;
    var innermost = null;
    var preferred = null;
    var node = fiber;
    for (var hops = 0; hops < 24 && node; hops++) {
      var cand = sourceFromFiberNode(node);
        if (cand) {
          if (!innermost) innermost = cand;
          if (isProjectSrc(cand.fileName)) {
            if (!preferred) preferred = cand;
            else if (isPrimitivePath(preferred.fileName) && !isPrimitivePath(cand.fileName)) preferred = cand;
          }
        }
      node = nextOwnerFiber(node);
    }
    return preferred || innermost;
  }

  function reactFiber(el) {
    if (!el) return null;
    for (var k in el) {
      if (k.indexOf("__reactFiber") === 0 || k.indexOf("__reactInternalInstance") === 0) return el[k];
    }
    var names = Object.getOwnPropertyNames(el);
    for (var i = 0; i < names.length; i++) {
      if (names[i].indexOf("__reactFiber") === 0 || names[i].indexOf("__reactInternalInstance") === 0) return el[names[i]];
    }
    return null;
  }

  function reactSource(el) {
    var fiber = reactFiber(el);
    if (!fiber) return null;
    return sourceFromFiber(fiber);
  }

  function camelToKebab(k) {
    return k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
  }
  function breakpointName(w) {
    if (w < 640) return "base";
    if (w < 768) return "sm";
    if (w < 1024) return "md";
    if (w < 1280) return "lg";
    if (w < 1536) return "xl";
    return "2xl";
  }
  function parseRgb(s) {
    var m = String(s).match(/rgba?\\(\\s*([\\d.]+)\\s*[, ]\\s*([\\d.]+)\\s*[, ]\\s*([\\d.]+)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3]];
  }
  function lum(r, g, b) {
    var a = [r, g, b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function collectInspect(el) {
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var parentCs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    var rules = [];
    function walkSheet(sheet, media, layer) {
      var list;
      try { list = sheet.cssRules; } catch (e) { return; }
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        var rule = list[i];
        var type = rule.type;
        if (type === 4) {
          walkSheet(rule, (media ? media + " and " : "") + (rule.conditionText || (rule.media && rule.media.mediaText) || ""), layer);
        } else if (type === 12 || (rule.cssRules && type !== 1)) {
          var nextLayer = layer;
          if (rule.name === "layer" || (rule.constructor && String(rule.constructor.name).indexOf("Layer") >= 0)) nextLayer = rule.name || layer;
          walkSheet(rule, media, nextLayer);
        } else if (rule.selectorText && rule.style) {
          try {
            if (el.matches(rule.selectorText)) {
              var href = "";
              try { href = sheet.href || ""; } catch (e2) {}
              var file = href ? href.split("/").pop().split("?")[0] : "(inline)";
              var decls = [];
              for (var j = 0; j < rule.style.length; j++) {
                var p = rule.style[j];
                decls.push({ property: p, authored: rule.style.getPropertyValue(p), important: rule.style.getPropertyPriority(p) === "important" });
              }
              var win = "";
              var cls = classOf(el).split(/\\s+/);
              for (var ci = 0; ci < cls.length; ci++) {
                if (!cls[ci]) continue;
                var esc = cls[ci].replace(/:/g, "\\\\:");
                if (rule.selectorText.indexOf("." + esc) >= 0 || rule.selectorText.indexOf("." + cls[ci]) >= 0) { win = cls[ci]; break; }
              }
              rules.push({ selector: rule.selectorText, href: file, media: media || "", layer: layer || "", decls: decls, className: win });
            }
          } catch (e3) {}
        }
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) walkSheet(document.styleSheets[s], "", "");

    var computedStyles = readStyles(el);
    var origins = {};
    var inheritKeys = { color: 1, fontFamily: 1, fontSize: 1, fontWeight: 1, lineHeight: 1, letterSpacing: 1, textAlign: 1 };
    Object.keys(computedStyles).forEach(function (key) {
      var prop = camelToKebab(key);
      var computedVal = cs.getPropertyValue(prop) || computedStyles[key];
      var authored = el.style.getPropertyValue(prop);
      var source = authored ? { kind: "inline", label: "inline style" } : { kind: "computed", label: "computed" };
      var inherited = false;
      var overridden = false;
      var inactive = false;
      var seen = false;
      if (!authored) {
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          for (var d = 0; d < rule.decls.length; d++) {
            if (rule.decls[d].property === prop && rule.decls[d].authored) {
              if (seen) overridden = true;
              seen = true;
              authored = rule.decls[d].authored;
              var kind = /\\.module\\.css/.test(rule.href) ? "module" : (rule.className && (rule.className.indexOf(":") >= 0 || /^(sm|md|lg|xl|2xl|hover|focus|dark)/.test(rule.className)) ? "utility" : "stylesheet");
              source = { kind: kind, label: rule.selector + " — " + rule.href, selector: rule.selector, href: rule.href, media: rule.media, layer: rule.layer, className: rule.className };
            }
          }
        }
      }
      if (!authored && parentCs && inheritKeys[key]) {
        var pval = parentCs.getPropertyValue(prop);
        if (pval && pval === computedVal) {
          inherited = true;
          authored = computedVal;
          source = { kind: "inherited", label: "inherited from parent" };
        }
      }
      if (authored && authored.indexOf("var(") === 0) source = Object.assign({}, source, { kind: "variable", label: authored + " — " + (source.label || "") });
      var display = cs.display;
      if ((key === "flexDirection" || key === "justifyContent" || key === "alignItems" || key === "flexWrap") && display.indexOf("flex") < 0) inactive = true;
      if ((key === "gap" || key === "columnGap" || key === "rowGap") && display.indexOf("flex") < 0 && display.indexOf("grid") < 0) inactive = true;
      origins[key] = { property: prop, computed: computedVal, authored: authored || computedVal, source: source, inherited: inherited, overridden: overridden, inactive: inactive };
    });

    var issues = [];
    if (rect.width < 0.5 || rect.height < 0.5) issues.push({ id: "zero-size", severity: "warn", title: "Zero-size element", detail: Math.round(rect.width) + "×" + Math.round(rect.height) });
    if (cs.display === "none") issues.push({ id: "hidden", severity: "warn", title: "Hidden", detail: "display: none" });
    else if (cs.visibility === "hidden") issues.push({ id: "hidden", severity: "warn", title: "Hidden", detail: "visibility: hidden" });
    else if (parseFloat(cs.opacity) === 0) issues.push({ id: "hidden", severity: "warn", title: "Hidden", detail: "opacity: 0" });
    if (cs.pointerEvents === "none") issues.push({ id: "pointer-events", severity: "info", title: "Pointer events disabled", detail: "pointer-events: none" });
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) issues.push({ id: "offscreen", severity: "info", title: "Outside viewport", detail: "" });
    if ((cs.overflow === "hidden" || cs.overflow === "clip") && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      issues.push({ id: "overflow", severity: "info", title: "Content is clipped", detail: "overflow: " + cs.overflow });
    }
    Object.keys(origins).forEach(function (k) {
      if (origins[k].inherited) issues.push({ id: "inherited-" + k, severity: "info", title: camelToKebab(k) + " is inherited", detail: origins[k].source.label });
      if (origins[k].inactive) issues.push({ id: "inactive-" + k, severity: "info", title: camelToKebab(k) + " is inactive", detail: "Not used with display: " + cs.display });
      if (origins[k].overridden) issues.push({ id: "overridden-" + k, severity: "info", title: camelToKebab(k) + " was overridden", detail: origins[k].source.label });
    });

    var role = el.getAttribute("role") || "";
    if (!role) {
      if (el.tagName === "BUTTON") role = "button";
      else if (el.tagName === "A") role = "link";
      else if (el.tagName === "IMG") role = "img";
      else if (el.tagName === "INPUT") role = el.getAttribute("type") || "textbox";
      else role = el.tagName.toLowerCase();
    }
    var name = el.getAttribute("aria-label") || el.getAttribute("alt") || (el.innerText || "").trim().slice(0, 80);
    var focusable = el.tabIndex >= 0 || /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    if ((role === "button" || role === "link") && !name) issues.push({ id: "a11y-name", severity: "warn", title: "Missing accessible name", detail: "" });
    if (el.tagName === "IMG" && el.getAttribute("alt") == null && el.getAttribute("role") !== "presentation") {
      issues.push({ id: "a11y-alt", severity: "warn", title: "Image missing alt text", detail: "" });
    }
    var fg = parseRgb(cs.color);
    var bg = parseRgb(cs.backgroundColor);
    var contrast = null;
    if (fg && bg && (bg[0] + bg[1] + bg[2] > 0 || parseFloat(cs.opacity) < 1)) {
      var L1 = lum(fg[0], fg[1], fg[2]);
      var L2 = lum(bg[0], bg[1], bg[2]);
      contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (contrast < 4.5 && (el.innerText || "").trim()) issues.push({ id: "contrast", severity: "warn", title: "Low contrast", detail: contrast.toFixed(2) + ":1" });
    }

    var classes = classOf(el).split(/\\s+/).filter(Boolean).map(function (c) {
      var kind = /__/.test(c) ? "module" : (/:/.test(c) || /^(flex|grid|hidden|block|inline|text-|bg-|p-|m-|w-|h-|rounded|items-|justify-)/.test(c) ? "utility" : "class");
      return { name: c, enabled: true, kind: kind };
    });

    return {
      box: {
        width: rect.width, height: rect.height, x: rect.x, y: rect.y,
        marginTop: cs.marginTop, marginRight: cs.marginRight, marginBottom: cs.marginBottom, marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
        borderTop: cs.borderTopWidth, borderRight: cs.borderRightWidth, borderBottom: cs.borderBottomWidth, borderLeft: cs.borderLeftWidth
      },
      layout: {
        display: cs.display, position: cs.position, flexDirection: cs.flexDirection, flexWrap: cs.flexWrap,
        justifyContent: cs.justifyContent, alignItems: cs.alignItems, gap: cs.gap, columnGap: cs.columnGap, rowGap: cs.rowGap,
        gridTemplateColumns: cs.gridTemplateColumns, gridTemplateRows: cs.gridTemplateRows,
        isFlex: cs.display.indexOf("flex") >= 0, isGrid: cs.display.indexOf("grid") >= 0
      },
      accessibility: { role: role, name: name || "(none)", focusable: focusable, alt: el.tagName === "IMG" ? el.getAttribute("alt") : undefined, contrast: contrast },
      responsive: { width: innerWidth, height: innerHeight, dpr: window.devicePixelRatio || 1, breakpoint: breakpointName(innerWidth) },
      origins: origins,
      matched: rules.slice(-16).map(function (r) { return { selector: r.selector, href: r.href, media: r.media, layer: r.layer }; }),
      classes: classes,
      issues: issues,
      states: { paused: paused, emulateFocus: emulateFocus }
    };
  }

  function elementPayload(el) {
    var id = idFor(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, id);
    var src = reactSource(el);
    var inspect = collectInspect(el);
    return {
      id: id,
      tag: el.tagName.toLowerCase(),
      label: el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""),
      text: (el.childElementCount === 0 ? (el.textContent || "") : "").trim().slice(0, 4000),
      className: classOf(el),
      selector: cssPath(el),
      locateText: (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 160),
      source: src,
      editable: true,
      styles: readStyles(el),
      inspect: inspect
    };
  }

  function emitSelected(el, additive) {
    if (!el) { post({ type: "shape-design-selected", element: null, additive: false }); return; }
    var payload = elementPayload(el);
    selectedId = payload.id;
    paintOverlay(el, true);
    bridgeLog("INFO", "select", {
      id: payload.id,
      tag: payload.tag,
      label: payload.label,
      className: payload.className ? String(payload.className).slice(0, 120) : "",
      additive: !!additive,
      source: payload.source
        ? (String(payload.source.fileName || "").split("/").pop().split(String.fromCharCode(92)).pop() + ":" + payload.source.lineNumber)
        : null
    });
    post({ type: "shape-design-selected", element: payload, additive: !!additive });
    resolveIdentity(payload.source, function (src) {
      payload.source = src;
      payload.editable = true;
      if (payload.inspect) {
        payload.inspect.issues = (payload.inspect.issues || []).filter(function (x) { return x.id !== "no-source"; });
      }
      post({ type: "shape-design-selected", element: payload, additive: !!additive });
    });
  }

  function pushUndoFor(id) {
    undoStack.push({ id: id, live: JSON.parse(JSON.stringify(liveProps[id] || {})) });
    redoStack = [];
  }

  function postMoved(el) {
    if (!el) return;
    var id = el.getAttribute(ATTR) || idFor(el);
    var cs = getComputedStyle(el);
    var live = liveProps[id] || {};
    var left = live.left || cs.left;
    var top = live.top || cs.top;
    var position = live.position || cs.position;
    pending[id] = Object.assign(pending[id] || {}, { left: left, top: top, position: position });
    post({ type: "shape-design-moved", id: id, left: left, top: top, position: position });
  }

  function postResized(el) {
    if (!el) return;
    var id = el.getAttribute(ATTR) || idFor(el);
    var cs = getComputedStyle(el);
    var live = liveProps[id] || {};
    var width = live.width || cs.width;
    var height = live.height || cs.height;
    pending[id] = Object.assign(pending[id] || {}, { width: width, height: height });
    post({ type: "shape-design-resized", id: id, width: width, height: height });
  }

  function sourceKeyOf(el) {
    var src = reactSource(el);
    if (!src) return "";
    var file = cleanSourcePath(src.fileName || "");
    if (!file && src.generated) file = String(src.generated.fileName || "");
    var key = (file || "") + ":" + (src.lineNumber || 0) + ":" + (src.columnNumber || 1);
    if (src.nodeId) return String(src.nodeId);
    return key;
  }

  function findBySourceKey(want) {
    if (!want) return null;
    var key = String(want);
    var parts = key.split(":");
    var wantFile = parts.length >= 3 ? parts.slice(0, -2).join(":") : key;
    var wantLine = parts.length >= 3 ? +parts[parts.length - 2] : 0;
    var wantCol = parts.length >= 3 ? +parts[parts.length - 1] : 0;
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    var soft = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (skipChrome(el) || SKIP[el.tagName]) continue;
      var sk = sourceKeyOf(el);
      if (sk && sk === key) return el;
      var src = reactSource(el);
      if (!src) continue;
      var file = cleanSourcePath(src.fileName || "");
      if (!file && src.generated) file = cleanSourcePath(src.generated.fileName || "");
      if (file && wantFile && (file === wantFile || file.indexOf(wantFile) >= 0 || wantFile.indexOf(file) >= 0)) {
        if (wantLine && src.lineNumber === wantLine) {
          if (!wantCol || src.columnNumber === wantCol || !soft) soft = el;
          if (wantCol && src.columnNumber === wantCol) return el;
        } else if (!soft && !wantLine) soft = el;
      }
    }
    return soft;
  }

  function elementsInRect(x0, y0, x1, y1) {
    var left = Math.min(x0, x1);
    var top = Math.min(y0, y1);
    var right = Math.max(x0, x1);
    var bottom = Math.max(y0, y1);
    var hits = [];
    var nodes = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (skipChrome(el) || SKIP[el.tagName]) continue;
      if (el === document.body || el === document.documentElement) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      if (cx < left || cx > right || cy < top || cy > bottom) continue;
      hits.push(el);
    }
    var filtered = [];
    for (var a = 0; a < hits.length; a++) {
      var keep = true;
      for (var b = 0; b < hits.length; b++) {
        if (a !== b && hits[a].contains(hits[b])) { keep = false; break; }
      }
      if (keep) filtered.push(hits[a]);
    }
    return filtered;
  }

  function startMove(el, e) {
    if (isPageRoot(el) || isPageShell(el)) {
      bridgeLog("WARN", "move:refused", {
        why: isPageRoot(el) ? "page-root" : "page-shell",
        tag: el && el.tagName,
        id: el && el.id
      });
      return false;
    }
    var id = idFor(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, id);
    pushUndoFor(id);
    var promoted = promoteToRelative(el);
    interact = {
      mode: "move",
      el: el,
      id: id,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: promoted.left,
      origTop: promoted.top,
      position: promoted.position,
      moved: false,
      pointerId: e.pointerId
    };
    return true;
  }

  function startReorder(el, e) {
    var parent = el.parentElement;
    if (!parent || !isFlowParent(parent)) return false;
    var kids = flowChildren(parent);
    var fromIndex = kids.indexOf(el);
    if (fromIndex < 0) return false;
    var id = idFor(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, id);
    pushUndoFor(id);
    var dir = getComputedStyle(parent).flexDirection || "";
    var vertical = dir.indexOf("row") === 0 || getComputedStyle(parent).display.indexOf("grid") >= 0 && false;
    // row / row-reverse → vertical insertion line (reorder along x); column → horizontal line
    vertical = dir.indexOf("column") !== 0;
    if (getComputedStyle(parent).display === "grid" || getComputedStyle(parent).display === "inline-grid") {
      vertical = true;
    }
    interact = {
      mode: "reorder",
      el: el,
      id: id,
      parent: parent,
      fromIndex: fromIndex,
      toIndex: fromIndex,
      vertical: vertical,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      parentSelector: cssPath(parent)
    };
    return true;
  }

  function startResize(el, edge, e) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    var id = idFor(el);
    if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, id);
    pushUndoFor(id);
    interact = {
      mode: "resize",
      el: el,
      id: id,
      edge: edge,
      startX: e.clientX,
      startY: e.clientY,
      origW: r.width,
      origH: r.height,
      origLeft: parsePx(cs.left),
      origTop: parsePx(cs.top),
      position: cs.position,
      positioned: isPositioned(el),
      moved: false
    };
  }

  function pick(e) {
    if (!enabled || !inspect) return;
    if (e.button != null && e.button !== 0) return;
    lastPtr.x = e.clientX;
    lastPtr.y = e.clientY;
    var el = elFromPoint(e.clientX, e.clientY);
    if (!el) {
      el = e.target;
      if (el && el.nodeType === 1) el = refineHit(el);
    }
    if (!el || skipChrome(el) || isPageShell(el)) return;
    while (el && SKIP[el.tagName]) el = el.parentElement;
    if (!el || el.nodeType !== 1 || isPageShell(el) || skipChrome(el)) return;
    e.preventDefault();
    e.stopPropagation();
    post({ type: "shape-design-selecting" });
    emitSelected(el, !!(e.metaKey || e.ctrlKey));
  }

  function onPointerDown(e) {
    if (!enabled || !inspect) return;
    if (e.button != null && e.button !== 0) return;
    lastPtr.x = e.clientX;
    lastPtr.y = e.clientY;

    if (textEdit) {
      var te = textEdit.el;
      if (te && (e.target === te || te.contains(e.target))) return;
      endTextEdit(true);
    }

    var handle = e.target && e.target.getAttribute ? e.target.getAttribute("data-shape-handle") : null;
    if (handle && selectedId) {
      var handleEl = byId(selectedId);
      if (handleEl) {
        e.preventDefault();
        e.stopPropagation();
        startResize(handleEl, handle, e);
        return;
      }
    }

    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      interact = {
        mode: "marquee",
        x0: e.clientX,
        y0: e.clientY,
        x1: e.clientX,
        y1: e.clientY,
        additive: !!(e.metaKey || e.ctrlKey)
      };
      paintMarquee(e.clientX, e.clientY, e.clientX, e.clientY);
      return;
    }

    var hit = elFromPoint(e.clientX, e.clientY);
    if (!hit && e.target && e.target.nodeType === 1 && !skipChrome(e.target)) {
      hit = refineHit(e.target);
    }
    if (hit && !skipChrome(hit) && !isPageShell(hit) && selectedId) {
      var selected = byId(selectedId);
      if (selected && (hit === selected || selected.contains(hit))) {
        // Clicking a more specific control inside a large/shell selection should re-target.
        if (hit !== selected && (isPageShell(selected) || isInteractive(hit))) {
          pick(e);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        try {
          if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
          else if (e.target && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
        } catch (errCap) {}
        // Flex/grid children: reorder (unless Alt forces free-move). Page roots free-move.
        if (!e.altKey && shouldReorder(selected)) {
          if (startReorder(selected, e)) return;
        }
        if (!startMove(selected, e)) {
          pick(e);
        }
        return;
      }
    }

    pick(e);
  }

  function onPointerMove(e) {
    lastPtr.x = e.clientX;
    lastPtr.y = e.clientY;
    if (!enabled || !inspect) return;

    if (interact) {
      e.preventDefault();
      if (interact.mode === "marquee") {
        interact.x1 = e.clientX;
        interact.y1 = e.clientY;
        paintMarquee(interact.x0, interact.y0, interact.x1, interact.y1);
        return;
      }
      if (interact.mode === "move") {
        var mdx = e.clientX - interact.startX;
        var mdy = e.clientY - interact.startY;
        if (Math.abs(mdx) > 2 || Math.abs(mdy) > 2) interact.moved = true;
        if (!interact.moved) return;
        applyStyles(interact.el, {
          position: interact.position,
          left: Math.round(interact.origLeft + mdx) + "px",
          top: Math.round(interact.origTop + mdy) + "px"
        }, { snapMove: true });
        paintOverlay(interact.el, true);
        return;
      }
      if (interact.mode === "reorder") {
        var rdx = e.clientX - interact.startX;
        var rdy = e.clientY - interact.startY;
        if (Math.abs(rdx) > 2 || Math.abs(rdy) > 2) interact.moved = true;
        if (!interact.moved) return;
        var nextIdx = reorderIndexAt(interact.parent, e.clientX, e.clientY, interact.vertical);
        // Adjust for removing the dragged item from the list when computing insert slot
        var from = interact.fromIndex;
        var adjusted = nextIdx;
        if (adjusted > from) adjusted -= 1;
        interact.toIndex = adjusted;
        var kids = flowChildren(interact.parent);
        var placeholder = kids[adjusted] || null;
        if (placeholder === interact.el) {
          // no-op
        } else if (placeholder) {
          interact.parent.insertBefore(interact.el, placeholder);
        } else {
          interact.parent.appendChild(interact.el);
        }
        // Recompute toIndex from live DOM
        interact.toIndex = flowChildren(interact.parent).indexOf(interact.el);
        paintInsertionLine(interact.parent, interact.toIndex, interact.vertical);
        paintOverlay(interact.el, true);
        return;
      }
      if (interact.mode === "resize") {
        var rdx = e.clientX - interact.startX;
        var rdy = e.clientY - interact.startY;
        if (Math.abs(rdx) > 1 || Math.abs(rdy) > 1) interact.moved = true;
        if (!interact.moved) return;
        var styles = {};
        var w = interact.origW;
        var h = interact.origH;
        var left = interact.origLeft;
        var top = interact.origTop;
        var edge = interact.edge;
        if (edge === "e") w = interact.origW + rdx;
        if (edge === "w") { w = interact.origW - rdx; left = interact.origLeft + rdx; }
        if (edge === "s") h = interact.origH + rdy;
        if (edge === "n") { h = interact.origH - rdy; top = interact.origTop + rdy; }
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        styles.width = w + "px";
        styles.height = h + "px";
        if (interact.positioned && (edge === "n" || edge === "w")) {
          styles.position = interact.position;
          if (edge === "w") styles.left = Math.round(left) + "px";
          if (edge === "n") styles.top = Math.round(top) + "px";
        }
        applyStyles(interact.el, styles);
        paintOverlay(interact.el, true);
        return;
      }
    }

    var el = elFromPoint(e.clientX, e.clientY) || e.target;
    if (!el || skipChrome(el)) return;
    var id = idFor(el);
    hoverId = id;
    if (selectedId && id === selectedId) { paintOverlay(el, true); return; }
    paintOverlay(el, false);
  }

  function onPointerUp(e) {
    if (!interact) return;
    var state = interact;
    interact = null;
    paintGuides({});
    try {
      if (e && e.currentTarget && e.currentTarget.releasePointerCapture && state.pointerId != null) {
        e.currentTarget.releasePointerCapture(state.pointerId);
      }
    } catch (errRel) {}
    if (state.mode === "marquee") {
      hideMarquee();
      var dx = Math.abs((state.x1 || state.x0) - state.x0);
      var dy = Math.abs((state.y1 || state.y0) - state.y0);
      if (dx < 4 && dy < 4) {
        var tiny = elFromPoint(state.x0, state.y0);
        if (tiny && !skipChrome(tiny)) {
          while (tiny && SKIP[tiny.tagName]) tiny = tiny.parentElement;
          if (tiny && tiny.nodeType === 1) {
            post({ type: "shape-design-selecting" });
            emitSelected(tiny, true);
          }
        }
        return;
      }
      var els = elementsInRect(state.x0, state.y0, state.x1, state.y1);
      var payloads = [];
      for (var i = 0; i < els.length; i++) payloads.push(elementPayload(els[i]));
      if (payloads.length) {
        selectedId = payloads[0].id;
        paintOverlay(els[0], true);
      } else {
        syncHandles(!!selectedId);
      }
      post({ type: "shape-design-area", elements: payloads, additive: !!state.additive });
      return;
    }
    if (state.mode === "move") {
      if (!state.moved) {
        emitSelected(state.el, !!(e && (e.metaKey || e.ctrlKey)));
        return;
      }
      postMoved(state.el);
      emitSelected(state.el, false);
      return;
    }
    if (state.mode === "reorder") {
      hideInsertionLine();
      if (!state.moved || state.fromIndex === state.toIndex) {
        emitSelected(state.el, !!(e && (e.metaKey || e.ctrlKey)));
        return;
      }
      post({
        type: "shape-design-reordered",
        id: state.id,
        parentSelector: state.parentSelector,
        fromIndex: state.fromIndex,
        toIndex: state.toIndex
      });
      emitSelected(state.el, false);
      return;
    }
    if (state.mode === "resize") {
      if (state.moved) {
        postResized(state.el);
        emitSelected(state.el, false);
      }
    }
  }

  function onKeyDown(e) {
    if (!enabled || !inspect || !selectedId) return;
    if (isEditableFocus()) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    var el = byId(selectedId);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    // Flex/grid: nudge sibling index with arrows when in normal flow
    if (!e.altKey && shouldReorder(el)) {
      var kids = flowChildren(el.parentElement);
      var idx = kids.indexOf(el);
      if (idx < 0) return;
      var delta = 0;
      var parentCs = getComputedStyle(el.parentElement);
      var alongMain =
        parentCs.display.indexOf("grid") >= 0 ||
        (parentCs.flexDirection || "").indexOf("column") !== 0;
      if (alongMain) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1;
      } else {
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
      }
      var next = Math.max(0, Math.min(kids.length - 1, idx + delta));
      if (next === idx) return;
      pushUndoFor(idFor(el));
      var target = kids[next];
      if (next > idx) {
        if (target.nextSibling) el.parentElement.insertBefore(el, target.nextSibling);
        else el.parentElement.appendChild(el);
      } else {
        el.parentElement.insertBefore(el, target);
      }
      post({
        type: "shape-design-reordered",
        id: idFor(el),
        parentSelector: cssPath(el.parentElement),
        fromIndex: idx,
        toIndex: next
      });
      emitSelected(el, false);
      return;
    }
    if (!isPositioned(el)) {
      promoteToRelative(el);
    }
    var step = e.shiftKey ? 10 : 1;
    var cs = getComputedStyle(el);
    var left = parsePx(cs.left);
    var top = parsePx(cs.top);
    if (e.key === "ArrowLeft") left -= step;
    if (e.key === "ArrowRight") left += step;
    if (e.key === "ArrowUp") top -= step;
    if (e.key === "ArrowDown") top += step;
    var id = el.getAttribute(ATTR) || idFor(el);
    pushUndoFor(id);
    applyStyles(el, {
      position: cs.position === "static" ? "relative" : cs.position,
      left: Math.round(left) + "px",
      top: Math.round(top) + "px"
    }, { snapMove: true });
    paintOverlay(el, true);
    postMoved(el);
  }

  function sendViews() {
    var views = [];
    var seen = {};
    function add(label, path) {
      var lab = String(label || "").replace(/\\s+/g, " ").trim();
      lab = lab.replace(/\\s+\\d+$/, "");
      if (!lab || lab.length < 2 || lab.length > 28) return;
      if (/^(search|settings|notifications|learn more|see all|browse all|cancel|close|back|edit avatar|edit profile)$/i.test(lab)) return;
      var key = String(path || lab).toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      views.push({ label: lab, path: path || "" });
    }
    try {
      var as = document.querySelectorAll("a[href]");
      for (var i = 0; i < as.length; i++) {
        var a = as[i];
        var u = new URL(a.href, location.href);
        if (u.origin !== location.origin) continue;
        var p = u.pathname || "/";
        if (p.indexOf("/api/") === 0 || p.indexOf("/_next") === 0) continue;
        add((a.innerText || a.getAttribute("aria-label") || p), p);
      }
    } catch (e) {}
    try {
      var roots = document.querySelectorAll("nav, aside, [role=navigation], header");
      for (var r = 0; r < roots.length; r++) {
        var els = roots[r].querySelectorAll("a, button");
        for (var j = 0; j < els.length; j++) {
          var el = els[j];
          var t = (el.innerText || el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
          t = t.replace(/\\s+\\d+$/, "");
          add(t, "");
        }
      }
    } catch (e2) {}
    post({ type: "shape-design-pages", views: views });
  }

  function sendTree() {
    var roots = [];
    if (document.body) {
      for (var i = 0; i < document.body.children.length; i++) {
        var kid = document.body.children[i];
        if (SKIP[kid.tagName] || skipChrome(kid)) continue;
        walk(kid, roots);
      }
    }
    post({ type: "shape-design-tree", nodes: roots });
    sendViews();
  }

  function inlineClone(el) {
    var clone = el.cloneNode(true);
    function copy(src, dst) {
      if (!src || !dst || src.nodeType !== 1 || dst.nodeType !== 1) return;
      var cs = getComputedStyle(src);
      var text = "";
      for (var i = 0; i < cs.length; i++) {
        var p = cs[i];
        if (p === "cursor" || p === "pointer-events") continue;
        var val = cs.getPropertyValue(p);
        if (!val) continue;
        if (val.indexOf("url(") !== -1 && val.indexOf("data:") < 0 && val.indexOf("url(#") < 0) {
          if (p.indexOf("background") !== -1 || p === "list-style-image" || p === "content") val = "none";
          else continue;
        }
        text += p + ":" + val + ";";
      }
      dst.setAttribute("style", text);
      dst.removeAttribute(ATTR);
      var sc = src.children, dc = dst.children;
      for (var j = 0; j < sc.length && j < dc.length; j++) copy(sc[j], dc[j]);
    }
    copy(el, clone);
    return clone;
  }

  function rasterizeSvg(svg, width, height) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not rasterize the element."));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve({ mime: "image/png", dataUrl: canvas.toDataURL("image/png"), width: width, height: height });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        reject(new Error("Could not rasterize the element. Try SVG, or a node without external images."));
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  function exportNode(el, format, scale) {
    try {
      var r = el.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      var clone = inlineClone(el);
      clone.style.margin = "0";
      clone.style.position = "relative";
      clone.style.left = "0";
      clone.style.top = "0";
      clone.style.right = "auto";
      clone.style.bottom = "auto";
      clone.style.transform = "none";
      clone.style.width = w + "px";
      clone.style.height = h + "px";
      clone.style.maxWidth = "none";
      clone.style.maxHeight = "none";
      var wrap = document.createElement("div");
      wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      wrap.style.cssText = "width:" + w + "px;height:" + h + "px;overflow:hidden;background:transparent;";
      wrap.appendChild(clone);
      var inner = new XMLSerializer().serializeToString(wrap);
      if (inner.indexOf("xmlns") < 0) {
        inner = inner.replace("<div", '<div xmlns="http://www.w3.org/1999/xhtml"');
      }
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + (w * scale) + '" height="' + (h * scale) + '" viewBox="0 0 ' + w + " " + h + '">' +
        '<foreignObject width="100%" height="100%">' + inner + "</foreignObject></svg>";
      var outW = Math.max(1, Math.round(w * scale));
      var outH = Math.max(1, Math.round(h * scale));
      if (format === "svg") {
        return Promise.resolve({ mime: "image/svg+xml", dataUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), width: outW, height: outH });
      }
      return rasterizeSvg(svg, outW, outH);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || data.source !== "shape-design-host") return;
    if (data.type === "shape-design-enable") {
      enabled = true;
      hoverId = null;
      inspect = data.inspect !== false;
      if (data.tool) tool = data.tool;
      ensureOverlay();
      hookNetwork();
      sendTree();
      bridgeLog("INFO", "bridge:enabled", { inspect: inspect, tool: tool, href: String(location.href || "") });
      var under = elFromPoint(lastPtr.x, lastPtr.y);
      if (selectedId) emitSelected(byId(selectedId));
      else if (under) paintOverlay(under, false);
    }
    if (data.type === "shape-design-tool") tool = data.tool === "draw" ? "draw" : "select";
    if (data.type === "shape-design-disable") {
      enabled = false;
      hoverId = null;
      interact = null;
      hideMarquee();
      overlay && (overlay.style.display = "none");
      syncHandles(false);
      paintGuides({});
      bridgeLog("INFO", "bridge:disabled", {});
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
      undoStack.push({ id: tid, live: JSON.parse(JSON.stringify(liveProps[tid] || {})) });
      redoStack = [];
      applyStyles(target, data.styles || {});
      pending[tid] = Object.assign(pending[tid] || {}, data.styles || {});
      if (resumeAfterEdit && paused) {
        paused = false;
        document.documentElement.classList.remove("shape-paused");
        document.documentElement.style.removeProperty("pointer-events");
        post({ type: "shape-design-paused", enabled: false });
      }
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
      var prev = liveProps[u.id] ? JSON.parse(JSON.stringify(liveProps[u.id])) : {};
      redoStack.push({ id: u.id, live: prev, html: ue.innerHTML });
      if (u.live) liveProps[u.id] = u.live;
      else delete liveProps[u.id];
      flushLiveCss();
      if (u.html != null) ue.innerHTML = u.html;
      emitSelected(ue);
    }
    if (data.type === "shape-design-redo") {
      var r = redoStack.pop();
      if (!r) return;
      var re = byId(r.id);
      if (!re) return;
      undoStack.push({ id: r.id, live: liveProps[r.id] ? JSON.parse(JSON.stringify(liveProps[r.id])) : {}, html: re.innerHTML });
      if (r.live) liveProps[r.id] = r.live;
      else delete liveProps[r.id];
      flushLiveCss();
      if (r.html != null) re.innerHTML = r.html;
      emitSelected(re);
    }
    if (data.type === "shape-design-reset") {
      liveProps = {};
      flushLiveCss();
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
    if (data.type === "shape-design-inject-font") {
      ensureWebFont(data.family);
    }
    if (data.type === "shape-design-list-fonts") {
      var names = [];
      try {
        if (document.fonts && document.fonts.forEach) {
          document.fonts.forEach(function (f) {
            var fam = String(f.family || "").replace(/['"]/g, "").trim();
            if (fam && names.indexOf(fam) < 0) names.push(fam);
          });
        }
      } catch (e) {}
      post({ type: "shape-design-fonts", req: data.req, fonts: names });
    }
    if (data.type === "shape-design-export") {
      var expEl = resolveTarget(data);
      var req = data.req;
      var fail = function (err) {
        post({ type: "shape-design-export-result", req: req, error: (err && err.message) || String(err) || "Export failed." });
      };
      if (!expEl) {
        fail({ message: "Select an element to export." });
      } else {
        var fmt = data.format || "png";
        var sc = Number(data.scale) || 1;
        try {
          exportNode(expEl, fmt === "svg" ? "svg" : "png", sc).then(function (out) {
            post(Object.assign({ type: "shape-design-export-result", req: req, format: fmt, scale: sc }, out));
          }, fail);
        } catch (err) {
          fail(err);
        }
      }
    }
    if (data.type === "shape-design-request-tree") sendTree();
    if (data.type === "shape-design-open-view") {
      var want = String(data.label || "").replace(/\\s+/g, " ").trim().toLowerCase();
      if (want) {
        var nodes = document.querySelectorAll("nav a, nav button, aside a, aside button, header a, header button");
        for (var vi = 0; vi < nodes.length; vi++) {
          var vt = (nodes[vi].innerText || nodes[vi].getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().toLowerCase();
          vt = vt.replace(/\\s+\\d+$/, "");
          if (vt === want || vt.indexOf(want) === 0) {
            try { nodes[vi].click(); } catch (ce) {}
            break;
          }
        }
      }
      sendTree();
    }
    if (data.type === "shape-design-pause") {
      paused = !!data.enabled;
      if (data.resumeAfterEdit != null) resumeAfterEdit = !!data.resumeAfterEdit;
      document.documentElement.classList.toggle("shape-paused", paused);
      if (paused) {
        document.documentElement.style.setProperty("pointer-events", "none");
      } else {
        document.documentElement.style.removeProperty("pointer-events");
      }
      post({ type: "shape-design-paused", enabled: paused });
    }
    if (data.type === "shape-design-emulate-focus") {
      emulateFocus = !!data.enabled;
      if (emulateFocus) document.documentElement.setAttribute("data-shape-emulate-focus", "");
      else document.documentElement.removeAttribute("data-shape-emulate-focus");
      ensureForceSheet();
      if (selectedId) emitSelected(byId(selectedId));
    }
    if (data.type === "shape-design-class") {
      var clsEl = resolveTarget(data) || byId(selectedId);
      if (clsEl && data.className) {
        clsEl.classList.toggle(String(data.className), !!data.enabled);
        emitSelected(clsEl);
      }
    }
    if (data.type === "shape-design-watch") {
      watchId = data.enabled ? (data.id || selectedId) : null;
      var wEl = watchId ? byId(watchId) : null;
      watchSnap = wEl ? { className: classOf(wEl), style: wEl.getAttribute("style") || "", text: wEl.textContent || "", w: wEl.getBoundingClientRect().width, h: wEl.getBoundingClientRect().height } : null;
    }
    if (data.type === "shape-design-pseudo" && data.pseudo) {
      forcePseudo(resolveTarget(data) || byId(selectedId), data.pseudo, !!data.enabled);
    }
    if (data.type === "shape-design-set-var") {
      var varName = String(data.name || "");
      if (varName) {
        if (data.value == null || String(data.value).trim() === "") {
          document.documentElement.style.removeProperty(varName);
        } else {
          document.documentElement.style.setProperty(varName, String(data.value));
        }
      }
    }
    if (data.type === "shape-design-reselect") {
      var found = null;
      if (data.id) found = byId(data.id);
      if (!found && data.selector) {
        try { found = document.querySelector(data.selector); } catch (re) { found = null; }
      }
      if (!found && data.sourceKey) found = findBySourceKey(data.sourceKey);
      if (found) emitSelected(found);
    }
  });

  var treeTimer = null;
  var mo = new MutationObserver(function () {
    if (!enabled || paused) return;
    if (watchId) {
      var w = byId(watchId);
      if (w && watchSnap) {
        var next = { className: classOf(w), style: w.getAttribute("style") || "", text: w.textContent || "", w: w.getBoundingClientRect().width, h: w.getBoundingClientRect().height };
        if (next.className !== watchSnap.className || next.style !== watchSnap.style || next.text !== watchSnap.text || Math.abs(next.w - watchSnap.w) > 0.5 || Math.abs(next.h - watchSnap.h) > 0.5) {
          watchSnap = next;
          post({ type: "shape-design-watch-hit", id: watchId, change: next });
        }
      }
    }
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
    ensureForceSheet();
    var name = String(pseudo || "").replace(/^:/, "");
    if (!name) return;
    if (on) el.setAttribute("data-shape-" + name, "");
    else el.removeAttribute("data-shape-" + name);
  }

  var forceSheetEl = null;
  function collectForceRules(rule, acc) {
    try {
      if (!rule) return;
      if (rule.selectorText) {
        var sel = rule.selectorText;
        var repl = sel
          .replace(/:focus-visible\\b/g, "[data-shape-focus-visible]")
          .replace(/:focus-within\\b/g, "[data-shape-focus-within]")
          .replace(/:hover\\b/g, "[data-shape-hover]")
          .replace(/:focus\\b/g, "[data-shape-focus]")
          .replace(/:active\\b/g, "[data-shape-active]")
          .replace(/:target\\b/g, "[data-shape-target]");
        if (repl !== sel) acc.push(repl + "{" + (rule.style ? rule.style.cssText : "") + "}");
      }
      var kids = rule.cssRules || rule.rules;
      if (kids) {
        for (var i = 0; i < kids.length; i++) collectForceRules(kids[i], acc);
      }
    } catch (e) {}
  }
  function ensureForceSheet() {
    if (forceSheetEl && forceSheetEl.parentNode) return;
    forceSheetEl = document.getElementById("shape-force-pseudo");
    if (!forceSheetEl) {
      forceSheetEl = document.createElement("style");
      forceSheetEl.id = "shape-force-pseudo";
      (document.head || document.documentElement).appendChild(forceSheetEl);
    }
    var acc = [];
    for (var s = 0; s < document.styleSheets.length; s++) {
      try {
        var rules = document.styleSheets[s].cssRules;
        if (!rules) continue;
        for (var i = 0; i < rules.length; i++) collectForceRules(rules[i], acc);
      } catch (e) {}
    }
    forceSheetEl.textContent = acc.join("\\n");
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("dragstart", function (e) {
    if (enabled && inspect) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("dblclick", onDblClick, true);
  document.addEventListener("click", function (e) {
    if (textEdit) return;
    if (enabled && inspect) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener("scroll", function () {
    if (selectedId) paintOverlay(byId(selectedId), true);
    syncProgOverlays();
  }, true);
  window.addEventListener("resize", function () {
    if (selectedId) paintOverlay(byId(selectedId), true);
    syncProgOverlays();
  });
  try {
    new MutationObserver(function (records) {
      if (!enabled) return;
      var mine = true;
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        if (t && t.id !== "shape-design-overlay" && t.id !== "shape-guides" && t.id !== "shape-design-marquee") { mine = false; break; }
      }
      if (mine) return;
      if (!overlay || !overlay.isConnected) ensureOverlay();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (err) {}

  post({ type: "shape-design-ready" });
  var readyPulse = 0;
  var readyTimer = setInterval(function () {
    if (enabled || ++readyPulse > 20) { clearInterval(readyTimer); return; }
    post({ type: "shape-design-ready" });
  }, 300);

  function reportLocation() {
    try { post({ type: "shape-preview-location", href: String(location.href || "") }); } catch (e) {}
  }
  try {
    var hist = window.history;
    var wrapHist = function (name) {
      var orig = hist[name];
      if (typeof orig !== "function") return;
      hist[name] = function () {
        var ret = orig.apply(this, arguments);
        reportLocation();
        return ret;
      };
    };
    wrapHist("pushState");
    wrapHist("replaceState");
  } catch (e) {}
  window.addEventListener("popstate", reportLocation);
  window.addEventListener("hashchange", reportLocation);
  reportLocation();
})();
`;
