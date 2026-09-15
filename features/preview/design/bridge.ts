export type DesignComputedStyle = Record<string, string>;

export type DesignElementSnapshot = {
    key: string;
    parentKey: string | null;
    tag: string;
    id: string | null;
    classes: string[];
    text: string;
    attributes: Record<string, string>;
    source: { fileName: string; lineNumber: number; columnNumber: number } | null;
    rect: { x: number; y: number; width: number; height: number };
    styles: DesignComputedStyle;
};

export type DesignLayerSnapshot = {
    key: string;
    parentKey: string | null;
    tag: string;
    label: string;
    depth: number;
    hidden: boolean;
};

/**
 * Runs only in the localhost preview frame. It owns canvas hit-testing and
 * optimistic manipulation; source writes remain in the host/Tauri process.
 */
export const DESIGN_BRIDGE_SCRIPT = String.raw`
(function () {
  if (window.__shapeDesignBridge) {
    window.__shapeDesignBridge.refresh();
    return;
  }

  var PREFIX = "__shape_design_";
  var selected = null;
  var hovered = null;
  var mode = "select";
  var keyMap = new WeakMap();
  var keySeed = 0;
  var drag = null;

  function post(type, detail) {
    try { window.parent.postMessage(Object.assign({ type: type }, detail || {}), "*"); } catch (_) {}
  }
  function keyFor(el) {
    if (!keyMap.has(el)) keyMap.set(el, PREFIX + (++keySeed));
    return keyMap.get(el);
  }
  function isEditorNode(el) {
    return !el || el.id === PREFIX + "overlay" || !!el.closest("#" + PREFIX + "overlay");
  }
  function labelFor(el) {
    var label = el.getAttribute("aria-label") || el.getAttribute("alt") || "";
    var text = (el.childElementCount === 0 ? el.textContent : "").replace(/\s+/g, " ").trim();
    return (label || text || el.id || (el.classList && el.classList[0]) || el.tagName.toLowerCase()).slice(0, 54);
  }
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  function styleOf(el) {
    var s = getComputedStyle(el);
    var names = [
      "display","position","top","right","bottom","left","z-index",
      "flex-direction","flex-wrap","justify-content","align-items","align-self","gap",
      "grid-template-columns","grid-template-rows","grid-column","grid-row",
      "width","height","min-width","min-height","max-width","max-height",
      "margin-top","margin-right","margin-bottom","margin-left",
      "padding-top","padding-right","padding-bottom","padding-left",
      "overflow","opacity","visibility",
      "font-family","font-size","font-weight","line-height","letter-spacing",
      "text-align","text-decoration-line","text-transform","color",
      "background-color","background-image","background-size","background-position",
      "border-top-width","border-right-width","border-bottom-width","border-left-width",
      "border-style","border-color","border-radius","box-shadow",
      "filter","backdrop-filter","mix-blend-mode","transform","transform-origin",
      "transition-property","transition-duration","transition-timing-function",
      "cursor","pointer-events"
    ];
    var out = {};
    names.forEach(function (name) { out[name] = s.getPropertyValue(name).trim(); });
    return out;
  }
  function sourceOf(el) {
    var astroFile = el.getAttribute && el.getAttribute("data-astro-source-file");
    var astroLoc = el.getAttribute && el.getAttribute("data-astro-source-loc");
    if (astroFile) {
      var astroParts = String(astroLoc || "1:1").split(":");
      return { fileName: astroFile, lineNumber: Number(astroParts[0]) || 1, columnNumber: Number(astroParts[1]) || 1 };
    }
    var keys;
    try { keys = Object.keys(el); } catch (_) { keys = []; }
    var fiberKey = keys.find(function (key) { return key.indexOf("__reactFiber$") === 0 || key.indexOf("__reactInternalInstance$") === 0; });
    var fiber = fiberKey ? el[fiberKey] : null;
    function sourceFromStack(stack) {
      if (!stack) return null;
      var lines = String(stack).split("\n");
      var matcher = /([^()\s]+?\.(?:jsx?|tsx?|astro)(?:\?[^):\s]*)?):(\d+):(\d+)/i;
      for (var index = 0; index < lines.length; index++) {
        var match = lines[index].match(matcher);
        if (!match || /node_modules[\\/]react/i.test(match[1])) continue;
        var fileName = match[1].replace(/\?.*$/, "");
        try { fileName = decodeURIComponent(fileName); } catch (_) {}
        return {
          fileName: fileName,
          lineNumber: Number(match[2]) || 1,
          columnNumber: Number(match[3]) || 1
        };
      }
      return null;
    }
    var guard = 0;
    while (fiber && guard++ < 30) {
      var src = fiber._debugSource || (fiber._debugOwner && fiber._debugOwner._debugSource);
      if (src && src.fileName) {
        return {
          fileName: String(src.fileName),
          lineNumber: Number(src.lineNumber) || 1,
          columnNumber: Number(src.columnNumber) || 1
        };
      }
      var stackSource = sourceFromStack(
        (fiber._debugStack && fiber._debugStack.stack) ||
        (fiber._debugOwner && fiber._debugOwner._debugStack && fiber._debugOwner._debugStack.stack)
      );
      if (stackSource) return stackSource;
      fiber = fiber.return;
    }
    return null;
  }
  function snapshot(el) {
    var attrs = {};
    Array.prototype.forEach.call(el.attributes || [], function (attr) {
      if (!attr.name.startsWith("data-shape")) attrs[attr.name] = attr.value;
    });
    return {
      key: keyFor(el),
      parentKey: el.parentElement ? keyFor(el.parentElement) : null,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.prototype.slice.call(el.classList || []).filter(function (name) {
        return !name.startsWith(PREFIX);
      }),
      text: (el.childElementCount === 0 ? el.textContent : "").replace(/\s+/g, " ").trim().slice(0, 240),
      attributes: attrs,
      source: sourceOf(el),
      rect: rectOf(el),
      styles: styleOf(el)
    };
  }

  var style = document.createElement("style");
  style.id = PREFIX + "style";
  style.textContent =
    "#" + PREFIX + "overlay{position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:Inter,system-ui,sans-serif}" +
    "." + PREFIX + "box{position:fixed;border:1.5px solid #3b82f6;box-sizing:border-box;display:none}" +
    "." + PREFIX + "hover{border-color:rgba(59,130,246,.72);background:rgba(59,130,246,.055)}" +
    "." + PREFIX + "label{position:absolute;left:-1px;bottom:100%;max-width:220px;padding:3px 6px;border-radius:4px 4px 0 0;background:#2563eb;color:white;font:500 11px/1.2 Inter,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "." + PREFIX + "handle{position:absolute;width:8px;height:8px;border:1px solid white;border-radius:2px;background:#2563eb;pointer-events:auto}" +
    "." + PREFIX + "nw{left:-5px;top:-5px;cursor:nwse-resize}." + PREFIX + "ne{right:-5px;top:-5px;cursor:nesw-resize}" +
    "." + PREFIX + "sw{left:-5px;bottom:-5px;cursor:nesw-resize}." + PREFIX + "se{right:-5px;bottom:-5px;cursor:nwse-resize}" +
    "." + PREFIX + "move{left:50%;top:-22px;width:28px;height:18px;transform:translateX(-50%);cursor:move;border-radius:4px;color:white;font:600 12px/16px Inter;text-align:center}";
  document.documentElement.appendChild(style);

  var overlay = document.createElement("div");
  overlay.id = PREFIX + "overlay";
  overlay.innerHTML =
    '<div class="' + PREFIX + 'box ' + PREFIX + 'hover"></div>' +
    '<div class="' + PREFIX + 'box ' + PREFIX + 'selected"><span class="' + PREFIX + 'label"></span>' +
    '<i data-handle="nw" class="' + PREFIX + 'handle ' + PREFIX + 'nw"></i>' +
    '<i data-handle="ne" class="' + PREFIX + 'handle ' + PREFIX + 'ne"></i>' +
    '<i data-handle="sw" class="' + PREFIX + 'handle ' + PREFIX + 'sw"></i>' +
    '<i data-handle="se" class="' + PREFIX + 'handle ' + PREFIX + 'se"></i>' +
    '<i data-handle="move" class="' + PREFIX + 'handle ' + PREFIX + 'move">•••</i></div>';
  document.documentElement.appendChild(overlay);
  var hoverBox = overlay.children[0];
  var selectBox = overlay.children[1];
  var selectLabel = selectBox.querySelector("span");

  function place(box, el) {
    if (!el || !el.isConnected) { box.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }
  function refresh() {
    place(hoverBox, hovered && hovered !== selected ? hovered : null);
    place(selectBox, selected);
    if (selected) selectLabel.textContent = selected.tagName.toLowerCase() + " · " + labelFor(selected);
  }
  function sendTree() {
    var layers = [];
    var root = document.body;
    if (!root) return;
    function walk(el, depth) {
      if (layers.length >= 500 || isEditorNode(el)) return;
      var r = el.getBoundingClientRect();
      var s = getComputedStyle(el);
      layers.push({
        key: keyFor(el),
        parentKey: el.parentElement && el.parentElement !== document.documentElement ? keyFor(el.parentElement) : null,
        tag: el.tagName.toLowerCase(),
        label: labelFor(el),
        depth: depth,
        hidden: s.display === "none" || s.visibility === "hidden" || r.width === 0 || r.height === 0
      });
      Array.prototype.forEach.call(el.children, function (child) { walk(child, depth + 1); });
    }
    walk(root, 0);
    post("shape-design-tree", { layers: layers });
  }
  function select(el) {
    if (!el || isEditorNode(el)) return;
    selected = el;
    hovered = null;
    refresh();
    post("shape-design-selection", { element: snapshot(el) });
  }

  document.addEventListener("pointermove", function (event) {
    if (drag) {
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (drag.handle === "move") {
        drag.el.style.position = drag.position === "static" ? "relative" : drag.position;
        drag.el.style.left = (drag.left + dx) + "px";
        drag.el.style.top = (drag.top + dy) + "px";
      } else {
        var w = Math.max(1, drag.width + (drag.handle.indexOf("e") >= 0 ? dx : -dx));
        var h = Math.max(1, drag.height + (drag.handle.indexOf("s") >= 0 ? dy : -dy));
        drag.el.style.width = Math.round(w) + "px";
        drag.el.style.height = Math.round(h) + "px";
      }
      refresh();
      event.preventDefault();
      return;
    }
    if (mode !== "select") return;
    var el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || isEditorNode(el)) return;
    hovered = el;
    refresh();
  }, true);

  document.addEventListener("pointerdown", function (event) {
    var handle = event.target && event.target.getAttribute && event.target.getAttribute("data-handle");
    if (handle && selected) {
      var computed = getComputedStyle(selected);
      drag = {
        el: selected,
        handle: handle,
        x: event.clientX,
        y: event.clientY,
        width: selected.getBoundingClientRect().width,
        height: selected.getBoundingClientRect().height,
        left: parseFloat(computed.left) || 0,
        top: parseFloat(computed.top) || 0,
        position: computed.position
      };
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (mode !== "select") return;
    var el = event.target;
    if (!el || isEditorNode(el)) return;
    select(el);
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener("pointerup", function () {
    if (!drag) return;
    var styles = {};
    if (drag.handle === "move") {
      styles.position = drag.el.style.position;
      styles.left = drag.el.style.left;
      styles.top = drag.el.style.top;
    } else {
      styles.width = drag.el.style.width;
      styles.height = drag.el.style.height;
    }
    post("shape-design-commit-styles", { element: snapshot(drag.el), styles: styles });
    drag = null;
  }, true);

  document.addEventListener("dblclick", function (event) {
    if (mode !== "select") return;
    var el = event.target;
    if (!el || el.childElementCount !== 0 || isEditorNode(el)) return;
    select(el);
    var before = el.textContent || "";
    el.contentEditable = "true";
    el.focus();
    var finish = function () {
      el.contentEditable = "false";
      el.removeEventListener("blur", finish);
      if ((el.textContent || "") !== before) {
        post("shape-design-commit-text", { element: snapshot(el), text: el.textContent || "" });
      }
    };
    el.addEventListener("blur", finish);
    event.preventDefault();
    event.stopPropagation();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (!selected || mode !== "select") return;
    var editing = event.target && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
    if (editing) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      post("shape-design-delete", { element: snapshot(selected) });
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      post("shape-design-duplicate", { element: snapshot(selected) });
      event.preventDefault();
      return;
    }
    if (/^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
      var computed = getComputedStyle(selected);
      var step = event.shiftKey ? 10 : 1;
      var left = parseFloat(computed.left) || 0;
      var top = parseFloat(computed.top) || 0;
      if (computed.position === "static") selected.style.position = "relative";
      if (event.key === "ArrowLeft") left -= step;
      if (event.key === "ArrowRight") left += step;
      if (event.key === "ArrowUp") top -= step;
      if (event.key === "ArrowDown") top += step;
      selected.style.left = left + "px";
      selected.style.top = top + "px";
      refresh();
      post("shape-design-commit-styles", {
        element: snapshot(selected),
        styles: { position: selected.style.position || computed.position, left: selected.style.left, top: selected.style.top }
      });
      event.preventDefault();
    }
  }, true);

  window.addEventListener("scroll", refresh, true);
  window.addEventListener("resize", refresh);
  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "shape-design-set-mode") mode = data.mode || "select";
    if (data.type === "shape-design-select-key") {
      var all = document.body ? document.body.querySelectorAll("*") : [];
      for (var i = 0; i < all.length; i++) if (keyFor(all[i]) === data.key) { select(all[i]); break; }
    }
    if (data.type === "shape-design-refresh") { refresh(); sendTree(); }
    if (data.type === "shape-design-apply-preview" && selected && data.styles) {
      Object.keys(data.styles).forEach(function (name) {
        selected.style.setProperty(name, data.styles[name]);
      });
      refresh();
      post("shape-design-selection", { element: snapshot(selected) });
    }
  });

  var observer = new MutationObserver(function () { refresh(); });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  window.__shapeDesignBridge = { refresh: refresh, select: select };
  setTimeout(function () {
    sendTree();
    post("shape-design-ready", { title: document.title, url: location.href });
  }, 30);
})();`;
