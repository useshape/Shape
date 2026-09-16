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
      "flex-direction","flex-wrap","justify-content","align-items","align-self","gap","row-gap","column-gap",
      "grid-template-columns","grid-template-rows","grid-column","grid-row",
      "width","height","min-width","min-height","max-width","max-height",
      "margin-top","margin-right","margin-bottom","margin-left",
      "padding-top","padding-right","padding-bottom","padding-left",
      "overflow","opacity","visibility",
      "font-family","font-size","font-weight","line-height","letter-spacing",
      "text-align","text-decoration-line","text-decoration-thickness","text-underline-offset","text-decoration-color","text-transform","color",
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
  function isUserFile(file) {
    var name = String(file || "").replace(/\\/g, "/");
    return !!name && name.indexOf("/node_modules/") < 0 && name.indexOf("/.next/") < 0;
  }
  function locFromValue(value) {
    if (!value) return null;
    var text = String(value);
    var match = text.match(/^(.*):(\d+):(\d+)$/) || text.match(/^(.*):(\d+)$/);
    if (!match) return null;
    return { fileName: match[1], lineNumber: Number(match[2]) || 1, columnNumber: Number(match[3] || 1) };
  }
  function locFromObject(src) {
    if (!src || !src.fileName) return null;
    return {
      fileName: String(src.fileName),
      lineNumber: Number(src.lineNumber) || 1,
      columnNumber: Number(src.columnNumber) || 1
    };
  }
  function hostFiber(el) {
    var keys;
    try { keys = Object.keys(el); } catch (_) { keys = []; }
    var fiberKey = keys.find(function (key) {
      return key.indexOf("__reactFiber$") === 0 || key.indexOf("__reactInternalInstance$") === 0;
    });
    return fiberKey ? el[fiberKey] : null;
  }
  function fiberLoc(fiber) {
    if (!fiber) return null;
    return locFromObject(fiber._debugSource)
      || locFromObject(fiber.pendingProps && fiber.pendingProps.__source)
      || locFromObject(fiber.memoizedProps && fiber.memoizedProps.__source);
  }
  function userLoc(fiber) {
    var loc = fiberLoc(fiber);
    var owner = fiber;
    var guard = 0;
    while (loc && !isUserFile(loc.fileName) && owner && owner._debugOwner && guard++ < 20) {
      owner = owner._debugOwner;
      loc = fiberLoc(owner);
    }
    return loc && isUserFile(loc.fileName) ? loc : null;
  }
  function sourceOf(el) {
    var attrLoc = locFromValue(el.getAttribute && (
      el.getAttribute("data-shape-loc") ||
      el.getAttribute("data-loc") ||
      el.getAttribute("data-source-loc")
    ));
    if (attrLoc && isUserFile(attrLoc.fileName)) return attrLoc;
    var astroFile = el.getAttribute && el.getAttribute("data-astro-source-file");
    var astroLoc = el.getAttribute && el.getAttribute("data-astro-source-loc");
    if (astroFile && isUserFile(astroFile)) {
      var astroParts = String(astroLoc || "1:1").split(":");
      return { fileName: astroFile, lineNumber: Number(astroParts[0]) || 1, columnNumber: Number(astroParts[1]) || 1 };
    }
    var inspectorFile = el.getAttribute && (el.getAttribute("data-inspector-relative-path") || el.getAttribute("data-inspector-file"));
    if (inspectorFile) {
      return {
        fileName: inspectorFile,
        lineNumber: Number(el.getAttribute("data-inspector-line")) || 1,
        columnNumber: Number(el.getAttribute("data-inspector-column")) || 1
      };
    }
    return userLoc(hostFiber(el));
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
    "html,body,*{scrollbar-width:none!important;-ms-overflow-style:none!important}" +
    "html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" +
    "#" + PREFIX + "overlay{position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:Inter,system-ui,sans-serif}" +
    "." + PREFIX + "box{position:fixed;border:1.5px solid #3b82f6;box-sizing:border-box;display:none}" +
    "." + PREFIX + "hover{border-color:rgba(59,130,246,.72);background:rgba(59,130,246,.055)}" +
    "." + PREFIX + "label{position:absolute;left:-1px;bottom:100%;max-width:220px;padding:3px 6px;border-radius:4px 4px 0 0;background:#2563eb;color:white;font:500 11px/1.2 Inter,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "." + PREFIX + "handle{position:absolute;width:8px;height:8px;border:1px solid white;border-radius:2px;background:#2563eb;pointer-events:auto}" +
    "." + PREFIX + "nw{left:-5px;top:-5px;cursor:nwse-resize}." + PREFIX + "ne{right:-5px;top:-5px;cursor:nesw-resize}" +
    "." + PREFIX + "sw{left:-5px;bottom:-5px;cursor:nesw-resize}." + PREFIX + "se{right:-5px;bottom:-5px;cursor:nwse-resize}" +
    "." + PREFIX + "move{left:50%;top:-22px;width:28px;height:18px;transform:translateX(-50%);cursor:move;border-radius:4px;color:white;font:600 12px/16px Inter;text-align:center}" +
    "." + PREFIX + "guide{position:fixed;display:none;background:#ff4d9d;box-shadow:0 0 0 1px rgba(0,0,0,.18);z-index:2147483647}" +
    "." + PREFIX + "guide-x{top:0;bottom:0;width:2px}." + PREFIX + "guide-y{left:0;right:0;height:2px}";
  document.documentElement.appendChild(style);

  var overlay = document.createElement("div");
  overlay.id = PREFIX + "overlay";
  overlay.innerHTML =
    '<div class="' + PREFIX + 'guide ' + PREFIX + 'guide-x"></div>' +
    '<div class="' + PREFIX + 'guide ' + PREFIX + 'guide-y"></div>' +
    '<div class="' + PREFIX + 'box ' + PREFIX + 'hover"></div>' +
    '<div class="' + PREFIX + 'box ' + PREFIX + 'selected"><span class="' + PREFIX + 'label"></span>' +
    '<i data-handle="nw" class="' + PREFIX + 'handle ' + PREFIX + 'nw"></i>' +
    '<i data-handle="ne" class="' + PREFIX + 'handle ' + PREFIX + 'ne"></i>' +
    '<i data-handle="sw" class="' + PREFIX + 'handle ' + PREFIX + 'sw"></i>' +
    '<i data-handle="se" class="' + PREFIX + 'handle ' + PREFIX + 'se"></i>' +
    '<i data-handle="move" class="' + PREFIX + 'handle ' + PREFIX + 'move">•••</i></div>';
  document.documentElement.appendChild(overlay);
  var guideX = overlay.children[0];
  var guideY = overlay.children[1];
  var hoverBox = overlay.children[2];
  var selectBox = overlay.children[3];
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

  function clearGuides() {
    guideX.style.display = "none";
    guideY.style.display = "none";
  }
  function snapTargets(el) {
    var xs = [0, window.innerWidth / 2, window.innerWidth];
    var ys = [0, window.innerHeight / 2, window.innerHeight];
    var parent = el.parentElement;
    if (parent) {
      var parentRect = parent.getBoundingClientRect();
      xs.push(parentRect.left, parentRect.left + parentRect.width / 2, parentRect.right);
      ys.push(parentRect.top, parentRect.top + parentRect.height / 2, parentRect.bottom);
      Array.prototype.forEach.call(parent.children, function (sibling) {
        if (sibling === el || isEditorNode(sibling)) return;
        var rect = sibling.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        xs.push(rect.left, rect.left + rect.width / 2, rect.right);
        ys.push(rect.top, rect.top + rect.height / 2, rect.bottom);
      });
    }
    return { xs: xs, ys: ys };
  }
  function nearestSnap(points, targets) {
    var best = null;
    points.forEach(function (point) {
      targets.forEach(function (target) {
        var distance = target - point;
        if (Math.abs(distance) <= 8 && (!best || Math.abs(distance) < Math.abs(best.distance))) {
          best = { distance: distance, guide: target };
        }
      });
    });
    return best;
  }
  function snapMove(el, rect, dx, dy) {
    var targets = snapTargets(el);
    var snapX = nearestSnap(
      [rect.left + dx, rect.left + rect.width / 2 + dx, rect.right + dx],
      targets.xs
    );
    var snapY = nearestSnap(
      [rect.top + dy, rect.top + rect.height / 2 + dy, rect.bottom + dy],
      targets.ys
    );
    clearGuides();
    if (!snapX) {
      var nextX = rect.left + dx;
      var gridX = Math.round(nextX / 8) * 8;
      if (Math.abs(gridX - nextX) <= 4) {
        dx += gridX - nextX;
        snapX = { distance: 0, guide: gridX };
      }
    }
    if (!snapY) {
      var nextY = rect.top + dy;
      var gridY = Math.round(nextY / 8) * 8;
      if (Math.abs(gridY - nextY) <= 4) {
        dy += gridY - nextY;
        snapY = { distance: 0, guide: gridY };
      }
    }
    if (snapX) {
      dx += snapX.distance;
      guideX.style.display = "block";
      guideX.style.left = snapX.guide + "px";
    }
    if (snapY) {
      dy += snapY.distance;
      guideY.style.display = "block";
      guideY.style.top = snapY.guide + "px";
    }
    return { dx: dx, dy: dy };
  }
  function snapEdge(el, axis, value) {
    var targets = snapTargets(el);
    var snapped = nearestSnap([value], axis === "x" ? targets.xs : targets.ys);
    if (!snapped) return value;
    if (axis === "x") {
      guideX.style.display = "block";
      guideX.style.left = snapped.guide + "px";
    } else {
      guideY.style.display = "block";
      guideY.style.top = snapped.guide + "px";
    }
    return value + snapped.distance;
  }

  document.addEventListener("pointermove", function (event) {
    if (drag) {
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (drag.handle === "move") {
        var snapped = snapMove(drag.el, drag.rect, dx, dy);
        drag.el.style.position = drag.position === "static" ? "relative" : drag.position;
        drag.el.style.left = Math.round(drag.left + snapped.dx) + "px";
        drag.el.style.top = Math.round(drag.top + snapped.dy) + "px";
      } else {
        clearGuides();
        var west = drag.handle.indexOf("w") >= 0;
        var north = drag.handle.indexOf("n") >= 0;
        var edgeX = snapEdge(drag.el, "x", west ? drag.rect.left + dx : drag.rect.right + dx);
        var edgeY = snapEdge(drag.el, "y", north ? drag.rect.top + dy : drag.rect.bottom + dy);
        var w = Math.max(1, west ? drag.rect.right - edgeX : edgeX - drag.rect.left);
        var h = Math.max(1, north ? drag.rect.bottom - edgeY : edgeY - drag.rect.top);
        drag.el.style.position = drag.position === "static" ? "relative" : drag.position;
        drag.el.style.width = Math.round(w) + "px";
        drag.el.style.height = Math.round(h) + "px";
        if (west) drag.el.style.left = Math.round(drag.left + (edgeX - drag.rect.left)) + "px";
        if (north) drag.el.style.top = Math.round(drag.top + (edgeY - drag.rect.top)) + "px";
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
        rect: selected.getBoundingClientRect(),
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
    clearGuides();
    var styles = {};
    if (drag.handle === "move") {
      styles.position = drag.el.style.position;
      styles.left = drag.el.style.left;
      styles.top = drag.el.style.top;
    } else {
      styles.width = drag.el.style.width;
      styles.height = drag.el.style.height;
      if (drag.handle.indexOf("w") >= 0) styles.left = drag.el.style.left;
      if (drag.handle.indexOf("n") >= 0) styles.top = drag.el.style.top;
      styles.position = drag.el.style.position;
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
  function copyComputed(from, to) {
    if (!from || !to || from.nodeType !== 1 || to.nodeType !== 1) return;
    var computed = getComputedStyle(from);
    var cssText = "";
    for (var i = 0; i < computed.length; i++) {
      cssText += computed[i] + ":" + computed.getPropertyValue(computed[i]) + ";";
    }
    to.setAttribute("style", cssText);
    var fromKids = from.children;
    var toKids = to.children;
    for (var j = 0; j < fromKids.length && j < toKids.length; j++) copyComputed(fromKids[j], toKids[j]);
  }
  function exportNode(scale, requestId) {
    try {
      var el = selected || document.documentElement;
      var rect = el.getBoundingClientRect();
      var width = Math.max(1, Math.round(rect.width * scale));
      var height = Math.max(1, Math.round(rect.height * scale));
      var clone = el.cloneNode(true);
      copyComputed(el, clone);
      clone.style.margin = "0";
      clone.style.position = "static";
      clone.style.transform = "none";
      clone.style.width = rect.width + "px";
      clone.style.height = rect.height + "px";
      clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      var serialized = new XMLSerializer().serializeToString(clone);
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' + serialized + "</foreignObject></svg>";
      var image = new Image();
      image.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          post("shape-design-export-result", { requestId: requestId });
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        post("shape-design-export-result", {
          requestId: requestId,
          dataUrl: canvas.toDataURL("image/png"),
          width: width,
          height: height
        });
      };
      image.onerror = function () {
        post("shape-design-export-result", { requestId: requestId });
      };
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (_) {
      post("shape-design-export-result", { requestId: requestId });
    }
  }
  function alignSelected(alignment) {
    if (!selected || !selected.parentElement) return;
    var rect = selected.getBoundingClientRect();
    var parentRect = selected.parentElement.getBoundingClientRect();
    var computed = getComputedStyle(selected);
    var left = parseFloat(computed.left) || 0;
    var top = parseFloat(computed.top) || 0;
    if (computed.position === "static") selected.style.position = "relative";
    if (alignment === "center" || alignment === "center-x") {
      left += parentRect.left + (parentRect.width - rect.width) / 2 - rect.left;
      selected.style.left = Math.round(left) + "px";
    }
    if (alignment === "center" || alignment === "center-y") {
      top += parentRect.top + (parentRect.height - rect.height) / 2 - rect.top;
      selected.style.top = Math.round(top) + "px";
    }
    refresh();
    var styles = { position: selected.style.position || computed.position };
    if (alignment === "center" || alignment === "center-x") styles.left = selected.style.left;
    if (alignment === "center" || alignment === "center-y") styles.top = selected.style.top;
    post("shape-design-commit-styles", { element: snapshot(selected), styles: styles });
  }
  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "shape-design-set-mode") mode = data.mode || "select";
    if (data.type === "shape-design-select-key") {
      var all = document.body ? document.body.querySelectorAll("*") : [];
      for (var i = 0; i < all.length; i++) if (keyFor(all[i]) === data.key) { select(all[i]); break; }
    }
    if (data.type === "shape-design-refresh") { refresh(); sendTree(); }
    if (data.type === "shape-design-align") alignSelected(data.alignment);
    if (data.type === "shape-design-export") exportNode(data.scale || 2, data.requestId);
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
