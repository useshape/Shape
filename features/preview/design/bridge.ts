export type DesignComputedStyle = Record<string, string>;

export type DesignComponentItem = {
    key: string;
    tag: string;
    label: string;
    href: string;
    id: string | null;
    classes: string[];
    source: { fileName: string; lineNumber: number; columnNumber: number } | null;
};

export type DesignComponentSnapshot = {
    kind: "dropdown" | "nav" | "link" | "button" | "image";
    name: string;
    open: boolean;
    trigger: string;
    href: string;
    label: string;
    items: DesignComponentItem[];
};

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
    component: DesignComponentSnapshot | null;
};

export type DesignLayerSnapshot = {
    key: string;
    parentKey: string | null;
    tag: string;
    id: string | null;
    classes: string[];
    text: string;
    alt: string;
    ariaLabel: string;
    role: string;
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
  var projectRoot = "";
  var sourceMapCache = {};
  var VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function isUserFile(file) {
    var name = String(file || "").replace(/\\/g, "/");
    if (!name) return false;
    var lower = name.toLowerCase();
    if (lower.indexOf("/node_modules/") >= 0 || lower.indexOf("node_modules/") === 0) return false;
    if (lower.indexOf("/.next/") >= 0 || lower.indexOf("/.turbo/") >= 0) return false;
    if (lower.indexOf("/_next/") >= 0 || lower.indexOf("/static/chunks/") >= 0) return false;
    return true;
  }
  function normalizeFileName(file) {
    var name = String(file || "");
    try { name = decodeURIComponent(name); } catch (_) {}
    name = name.replace(/\\/g, "/");
    name = name
      .replace(/^webpack-internal:\/\/\//, "")
      .replace(/^webpack:\/\/\//, "")
      .replace(/^webpack:\/\//, "")
      .replace(/^turbopack:\/\/\/\[project\]\//, "")
      .replace(/^turbopack:\/\/\//, "")
      .replace(/^\/?@fs\//, "/")
      .replace(/^file:\/\/\//, "")
      .replace(/^file:\/\//, "");
    name = name
      .replace(/^\(app-pages-browser\)\/?/, "")
      .replace(/^\(rsc\)\/?/, "")
      .replace(/^\(app-ssr\)\/?/, "")
      .replace(/^\.\//, "");
    if (/^https?:\/\//i.test(name)) {
      try {
        var url = new URL(name);
        name = url.pathname || name;
      } catch (_) {}
    }
    if (name.charAt(0) === "/" && /^\/[A-Za-z]:\//.test(name)) name = name.slice(1);
    if (projectRoot) {
      var root = String(projectRoot).replace(/\\/g, "/").replace(/\/$/, "");
      var lowerName = name.toLowerCase();
      var lowerRoot = root.toLowerCase();
      if (lowerName.indexOf(lowerRoot + "/") === 0) name = name.slice(root.length + 1);
      else if (lowerName === lowerRoot) name = "";
    }
    return name.replace(/\?.*$/, "").replace(/#.*$/, "");
  }
  function locFromValue(value) {
    if (!value) return null;
    var text = String(value).trim();
    var match = text.match(/^(.*):(\d+):(\d+)(?::[A-Za-z][\w.-]*)?$/) || text.match(/^(.*):(\d+)$/);
    if (!match) return null;
    var fileName = normalizeFileName(match[1]);
    if (!fileName) return null;
    return {
      fileName: fileName,
      lineNumber: Number(match[2]) || 1,
      columnNumber: Number(match[3] || 1)
    };
  }
  function locFromObject(src) {
    if (!src || !src.fileName) return null;
    return {
      fileName: normalizeFileName(src.fileName),
      lineNumber: Number(src.lineNumber) || 1,
      columnNumber: Number(src.columnNumber) || 1
    };
  }
  function decodeVlqSegment(segment) {
    if (!segment) return null;
    var values = [];
    var i = 0;
    while (i < segment.length) {
      var value = 0;
      var shift = 0;
      var continuation = true;
      while (continuation && i < segment.length) {
        var digit = VLQ_CHARS.indexOf(segment.charAt(i++));
        if (digit < 0) return null;
        continuation = (digit & 32) !== 0;
        value += (digit & 31) << shift;
        shift += 5;
      }
      var negative = (value & 1) !== 0;
      value >>= 1;
      values.push(negative ? -value : value);
    }
    return values;
  }
  function decodeOriginalPosition(mappings, targetLine, targetColumn) {
    var generatedLines = String(mappings || "").split(";");
    if (targetLine >= generatedLines.length) return null;
    var accGeneratedColumn = 0;
    var accSourceIndex = 0;
    var accOriginalLine = 0;
    var accOriginalColumn = 0;
    var best = null;
    for (var lineIdx = 0; lineIdx <= targetLine; lineIdx++) {
      var lineMapping = generatedLines[lineIdx];
      if (!lineMapping) continue;
      accGeneratedColumn = 0;
      var segments = lineMapping.split(",");
      for (var s = 0; s < segments.length; s++) {
        var decoded = decodeVlqSegment(segments[s]);
        if (!decoded || decoded.length < 4) continue;
        accGeneratedColumn += decoded[0];
        accSourceIndex += decoded[1];
        accOriginalLine += decoded[2];
        accOriginalColumn += decoded[3];
        if (lineIdx === targetLine && accGeneratedColumn >= targetColumn) {
          return {
            sourceIndex: accSourceIndex,
            originalLine: accOriginalLine + 1,
            originalColumn: accOriginalColumn + 1
          };
        }
        if (lineIdx === targetLine) {
          best = {
            sourceIndex: accSourceIndex,
            originalLine: accOriginalLine + 1,
            originalColumn: accOriginalColumn + 1
          };
        }
      }
    }
    return best;
  }
  function extractChunkFrame(debugStack) {
    var text = typeof debugStack === "string" ? debugStack : (debugStack && debugStack.stack);
    if (!text) return null;
    var lines = String(text).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf("at ") < 0) continue;
      if (/jsxDEV|react-stack-top-frame|react_stack_bottom_frame|react-dom|renderWithHooks|beginWork|performUnitOfWork|node_modules|react-server-dom/i.test(line)) continue;
      var match = line.match(/\((https?:\/\/[^)]+?):(\d+):(\d+)\)/) || line.match(/(https?:\/\/\S+?):(\d+):(\d+)/);
      if (!match) continue;
      return { chunkUrl: match[1], line: Number(match[2]) || 1, column: Number(match[3]) || 1 };
    }
    return null;
  }
  function mapFromJson(sm, generatedLine, generatedColumn, depth) {
    if (!sm || (depth || 0) > 8) return null;
    var line = Math.max(0, Number(generatedLine) || 0);
    var column = Math.max(0, Number(generatedColumn) || 0);
    if (line > 0) line -= 1;
    if (column > 0) column -= 1;
    if (sm.sections && sm.sections.length) {
      var matched = sm.sections[0];
      for (var i = 0; i < sm.sections.length; i++) {
        var offset = sm.sections[i].offset || { line: 0, column: 0 };
        if (offset.line < line || (offset.line === line && (offset.column || 0) <= column)) {
          matched = sm.sections[i];
        } else {
          break;
        }
      }
      if (!matched || !matched.map) return null;
      var sectionLine = line - ((matched.offset && matched.offset.line) || 0);
      var sectionCol = column - ((matched.offset && matched.offset.column) || 0);
      return mapFromJson(matched.map, sectionLine + 1, Math.max(0, sectionCol) + 1, (depth || 0) + 1);
    }
    if (!sm.mappings || !sm.sources || !sm.sources.length) return null;
    var plain = decodeOriginalPosition(sm.mappings, line, column);
    if (!plain) return null;
    var sourceUri = sm.sources[plain.sourceIndex] || sm.sources[0];
    var loc = {
      fileName: normalizeFileName(sourceUri),
      lineNumber: plain.originalLine,
      columnNumber: plain.originalColumn
    };
    return loc.fileName && isUserFile(loc.fileName) ? loc : null;
  }
  function fetchSourceMap(chunkUrl) {
    if (sourceMapCache[chunkUrl]) return sourceMapCache[chunkUrl];
    sourceMapCache[chunkUrl] = fetch(chunkUrl + ".map")
      .then(function (resp) {
        if (resp.ok) return resp.json();
        return fetch(chunkUrl).then(function (js) { return js.ok ? js.text() : ""; }).then(function (text) {
          var match = String(text).match(/[#@]\s*sourceMappingURL=(\S+)\s*$/m);
          if (!match) return null;
          var mapUrl = match[1];
          if (mapUrl.indexOf("data:") === 0) return null;
          return fetch(new URL(mapUrl, chunkUrl).toString()).then(function (mapResp) {
            return mapResp.ok ? mapResp.json() : null;
          });
        });
      })
      .catch(function () { return null; });
    return sourceMapCache[chunkUrl];
  }
  function resolveFrame(frame) {
    if (!frame || !frame.chunkUrl) return Promise.resolve(null);
    return fetchSourceMap(frame.chunkUrl).then(function (sm) {
      var loc = mapFromJson(sm, frame.line, frame.column);
      if (loc && isUserFile(loc.fileName)) return loc;
      return guessFromChunk(frame.chunkUrl);
    });
  }
  function hostFiber(el) {
    var keys = [];
    try { keys = Object.getOwnPropertyNames(el); } catch (_) {
      try { keys = Object.keys(el); } catch (e) { keys = []; }
    }
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
        return el[keys[i]];
      }
    }
    return null;
  }
  function guessFromChunk(chunkUrl) {
    if (!chunkUrl) return null;
    var path = "";
    try { path = decodeURIComponent(new URL(chunkUrl, location.href).pathname); } catch (_) { path = String(chunkUrl); }
    path = path.split("?")[0].replace(/\\/g, "/");
    var rel = "";
    var markers = ["/app/", "/src/", "/pages/", "/components/"];
    for (var m = 0; m < markers.length; m++) {
      var idx = path.indexOf(markers[m]);
      if (idx >= 0) { rel = path.slice(idx + 1); break; }
    }
    if (rel) {
      rel = rel.replace(/-[a-f0-9]{8,16}(?=\.)/i, "");
      rel = rel.replace(/\.(js|mjs|cjs)$/i, "");
      if (!/\.(tsx|ts|jsx|js)$/i.test(rel)) rel += ".tsx";
      rel = normalizeFileName(rel);
      return rel && isUserFile(rel) ? { fileName: rel, lineNumber: 1, columnNumber: 1 } : null;
    }
    var base = path.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");
    var mapped = base
      .replace(/_tsx$/i, ".tsx")
      .replace(/_jsx$/i, ".jsx")
      .replace(/_ts$/i, ".ts")
      .replace(/_js$/i, ".js");
    if (mapped.indexOf(".") >= 0) {
      mapped = mapped.replace(/_/g, "/");
      var cut = mapped.search(/(app|src|pages|components)\//);
      if (cut >= 0) mapped = mapped.slice(cut);
      mapped = normalizeFileName(mapped);
      return mapped && isUserFile(mapped) ? { fileName: mapped, lineNumber: 1, columnNumber: 1 } : null;
    }
    return null;
  }
  function syncFiberLoc(fiber) {
    if (!fiber) return null;
    return locFromObject(fiber._debugSource)
      || locFromObject(fiber.pendingProps && fiber.pendingProps.__source)
      || locFromObject(fiber.memoizedProps && fiber.memoizedProps.__source)
      || locFromValue(fiber.pendingProps && fiber.pendingProps["data-insp-path"])
      || locFromValue(fiber.memoizedProps && fiber.memoizedProps["data-insp-path"]);
  }
  function locFromAttrs(node) {
    if (!node || !node.getAttribute) return null;
    var attrLoc = locFromValue(
      node.getAttribute("data-insp-path") ||
      node.getAttribute("data-shape-loc") ||
      node.getAttribute("data-loc") ||
      node.getAttribute("data-source-loc") ||
      node.getAttribute("data-locatorjs") ||
      node.getAttribute("data-locator-source")
    );
    if (attrLoc && isUserFile(attrLoc.fileName)) return attrLoc;
    var astroFile = node.getAttribute("data-astro-source-file");
    var astroLoc = node.getAttribute("data-astro-source-loc");
    if (astroFile && isUserFile(astroFile)) {
      var astroParts = String(astroLoc || "1:1").split(":");
      return {
        fileName: normalizeFileName(astroFile),
        lineNumber: Number(astroParts[0]) || 1,
        columnNumber: Number(astroParts[1]) || 1
      };
    }
    var inspectorFile = node.getAttribute("data-inspector-relative-path") || node.getAttribute("data-inspector-file");
    if (inspectorFile) {
      return {
        fileName: normalizeFileName(inspectorFile),
        lineNumber: Number(node.getAttribute("data-inspector-line")) || 1,
        columnNumber: Number(node.getAttribute("data-inspector-column")) || 1
      };
    }
    return null;
  }
  function sourceOfSync(el) {
    var node = el;
    var hops = 0;
    while (node && hops++ < 40) {
      var attrLoc = locFromAttrs(node);
      if (attrLoc) return attrLoc;
      node = node.parentElement;
    }
    var current = hostFiber(el);
    var guard = 0;
    while (current && guard++ < 40) {
      var loc = syncFiberLoc(current);
      if (loc && isUserFile(loc.fileName)) return loc;
      current = current._debugOwner || current.return || null;
    }
    return null;
  }
  function sourceOfAsync(el) {
    var sync = sourceOfSync(el);
    if (sync) return Promise.resolve(sync);
    var current = hostFiber(el);
    var frames = [];
    var guard = 0;
    while (current && guard++ < 40) {
      var frame = extractChunkFrame(current._debugStack);
      if (frame) frames.push(frame);
      current = current._debugOwner || current.return || null;
    }
    var index = 0;
    function next() {
      if (index >= frames.length) {
        return Promise.resolve(frames[0] ? guessFromChunk(frames[0].chunkUrl) : null);
      }
      return resolveFrame(frames[index++]).then(function (loc) {
        return loc || next();
      });
    }
    return next();
  }
  var pinnedRoot = null;
  function nodeText(el) {
    return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }
  function classBlob(el) {
    return (String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className || "") + " " + (el.id || "")).toLowerCase();
  }
  function isMenuish(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName.toLowerCase();
    var role = String(el.getAttribute("role") || "").toLowerCase();
    var blob = classBlob(el);
    if (tag === "select" || tag === "details" || tag === "nav") return true;
    if (role === "menu" || role === "listbox" || role === "combobox" || role === "menubar" || role === "navigation") return true;
    if (el.hasAttribute("aria-haspopup") || el.hasAttribute("aria-expanded") || el.hasAttribute("aria-controls")) return true;
    if (el.hasAttribute("data-radix-menu-content") || el.hasAttribute("data-state")) {
      if (/(open|closed)/.test(String(el.getAttribute("data-state") || ""))) return true;
    }
    return /(dropdown|drop-down|popover|submenu|megamenu|nav-item)/.test(blob);
  }
  function findComponentRoot(el) {
    var cur = el;
    for (var i = 0; i < 10 && cur && cur !== document.body; i++) {
      if (isMenuish(cur)) return cur;
      cur = cur.parentElement;
    }
    return el;
  }
  function relatedMenu(root) {
    var id = root.getAttribute("aria-controls") || root.getAttribute("aria-owns");
    if (id) {
      var byId = document.getElementById(id);
      if (byId) return byId;
    }
    var local = root.querySelector("[role='menu'], [role='listbox'], ul, ol, select, [data-radix-menu-content], [data-radix-popper-content-wrapper]");
    if (local) return local;
    var open = document.querySelector("[data-radix-menu-content][data-state='open'], [role='menu'][data-state='open']");
    return open;
  }
  function collectItems(root) {
    var items = [];
    var seen = {};
    function push(n) {
      if (!n || isEditorNode(n) || seen[keyFor(n)]) return;
      var href = n.getAttribute("href") || n.getAttribute("to") || n.getAttribute("data-href") || (n.tagName === "OPTION" ? n.getAttribute("value") : "") || "";
      var label = nodeText(n) || n.getAttribute("aria-label") || n.getAttribute("alt") || href;
      if (!label && !href) return;
      seen[keyFor(n)] = 1;
      items.push({
        key: keyFor(n),
        tag: n.tagName.toLowerCase(),
        label: String(label).slice(0, 80),
        href: href,
        id: n.id || null,
        classes: Array.prototype.slice.call(n.classList || []).filter(function (name) {
          return !String(name).startsWith(PREFIX);
        }),
        source: sourceOfSync(n)
      });
    }
    if (root.tagName === "SELECT") {
      Array.prototype.forEach.call(root.options || [], push);
      return items.slice(0, 24);
    }
    var scope = relatedMenu(root) || root;
    var nodes = scope.querySelectorAll("a[href], a, [role='menuitem'], option, [data-radix-collection-item]");
    Array.prototype.forEach.call(nodes, function (n) {
      if (items.length >= 24) return;
      push(n);
    });
    return items;
  }
  function unpin() {
    if (!pinnedRoot) return;
    pinnedRoot.removeAttribute("data-shape-pin-open");
    var menu = relatedMenu(pinnedRoot);
    if (menu) {
      menu.removeAttribute("data-shape-pin-open");
      if (menu._shapePinDisplay) {
        menu.style.display = menu._shapePinDisplay;
        delete menu._shapePinDisplay;
      } else {
        menu.style.removeProperty("display");
        menu.style.removeProperty("opacity");
        menu.style.removeProperty("visibility");
        menu.style.removeProperty("pointer-events");
        menu.style.removeProperty("height");
        menu.style.removeProperty("transform");
      }
    }
    if (pinnedRoot.tagName === "SELECT") pinnedRoot.removeAttribute("size");
    if (pinnedRoot.tagName === "DETAILS") pinnedRoot.open = false;
    if (pinnedRoot.hasAttribute("aria-expanded")) pinnedRoot.setAttribute("aria-expanded", "false");
    pinnedRoot = null;
  }
  function pinOpen(root, on) {
    if (!on) {
      if (pinnedRoot === root) unpin();
      return;
    }
    if (pinnedRoot && pinnedRoot !== root) unpin();
    pinnedRoot = root;
    root.setAttribute("data-shape-pin-open", "1");
    if (root.hasAttribute("aria-expanded") || root.getAttribute("aria-haspopup")) {
      root.setAttribute("aria-expanded", "true");
    }
    if (root.tagName === "DETAILS") root.open = true;
    if (root.tagName === "SELECT") root.size = Math.min(Math.max(root.options.length, 2), 8);
    var menu = relatedMenu(root);
    if (menu) {
      menu.setAttribute("data-shape-pin-open", "1");
      menu._shapePinDisplay = menu.style.display;
      menu.style.setProperty("display", "block", "important");
      menu.style.setProperty("opacity", "1", "important");
      menu.style.setProperty("visibility", "visible", "important");
      menu.style.setProperty("pointer-events", "auto", "important");
      menu.style.setProperty("height", "auto", "important");
      menu.style.setProperty("transform", "none", "important");
    }
  }
  function inspectComponent(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === "img") {
      return {
        kind: "image",
        name: "Image",
        open: false,
        trigger: "",
        href: el.getAttribute("src") || "",
        label: el.getAttribute("alt") || "",
        items: []
      };
    }
    var root = findComponentRoot(el);
    var items = collectItems(root);
    var href = el.getAttribute("href") || el.getAttribute("to") || root.getAttribute("href") || "";
    var label = nodeText(el) || el.getAttribute("aria-label") || "";
    var kind = null;
    var name = "Component";
    if (root.tagName === "NAV" || (root.getAttribute("role") || "") === "navigation" || (items.length > 1 && root.tagName !== "SELECT" && /(nav)/.test(classBlob(root)))) {
      kind = "nav";
      name = "Navigation";
    } else if (root.tagName === "SELECT" || root.tagName === "DETAILS" || items.length > 1 || isMenuish(root)) {
      kind = "dropdown";
      name = "Dropdown";
    } else if (tag === "a" || href) {
      kind = "link";
      name = "Link";
    } else if (tag === "button") {
      kind = "button";
      name = "Button";
    }
    if (!kind) return null;
    var trigger = nodeText(root.querySelector("summary, [data-radix-collection-item], button, a") || root) || label;
    if (kind === "link" || kind === "button") {
      items = [];
    }
    return {
      kind: kind,
      name: name,
      open: pinnedRoot === root || root.open === true || root.getAttribute("aria-expanded") === "true",
      trigger: String(trigger).slice(0, 80),
      href: href,
      label: String(label || trigger).slice(0, 80),
      items: items
    };
  }
  function snapshot(el, source) {
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
      source: source === undefined ? sourceOfSync(el) : source,
      rect: rectOf(el),
      styles: styleOf(el),
      component: inspectComponent(el)
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
    "." + PREFIX + "rotate{width:10px;height:10px;border-radius:999px;background:#22c55e;border:1.5px solid white;cursor:grab}" +
    "." + PREFIX + "rot-n{left:50%;top:-18px;transform:translateX(-50%)}" +
    "." + PREFIX + "rot-e{right:-18px;top:50%;transform:translateY(-50%)}" +
    "." + PREFIX + "rot-s{left:50%;bottom:-18px;transform:translateX(-50%)}" +
    "." + PREFIX + "rot-w{left:-18px;top:50%;transform:translateY(-50%)}" +
    "." + PREFIX + "rot-ne{right:-14px;top:-14px}." + PREFIX + "rot-nw{left:-14px;top:-14px}" +
    "." + PREFIX + "rot-se{right:-14px;bottom:-14px}." + PREFIX + "rot-sw{left:-14px;bottom:-14px}" +
    "." + PREFIX + "guide{position:fixed;display:none;background:#ff4d9d;box-shadow:0 0 0 1px rgba(0,0,0,.18);z-index:2147483647}" +
    "." + PREFIX + "guide-x{top:0;bottom:0;width:2px}." + PREFIX + "guide-y{left:0;right:0;height:2px}" +
    "[data-shape-pin-open]{visibility:visible!important;pointer-events:auto!important}";
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
    '<i data-handle="move" class="' + PREFIX + 'handle ' + PREFIX + 'move">•••</i>' +
    '<i data-handle="rotate-n" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-n"></i>' +
    '<i data-handle="rotate-e" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-e"></i>' +
    '<i data-handle="rotate-s" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-s"></i>' +
    '<i data-handle="rotate-w" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-w"></i>' +
    '<i data-handle="rotate-ne" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-ne"></i>' +
    '<i data-handle="rotate-nw" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-nw"></i>' +
    '<i data-handle="rotate-se" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-se"></i>' +
    '<i data-handle="rotate-sw" class="' + PREFIX + 'handle ' + PREFIX + 'rotate ' + PREFIX + 'rot-sw"></i></div>';
  document.documentElement.appendChild(overlay);
  var guideX = overlay.children[0];
  var guideY = overlay.children[1];
  var hoverBox = overlay.children[2];
  var selectBox = overlay.children[3];
  var selectLabel = selectBox.querySelector("span");
  var resizeHandles = selectBox.querySelectorAll("[data-handle]:not([data-handle^=rotate])");
  var rotateHandles = selectBox.querySelectorAll("[data-handle^=rotate]");

  function setHandleVisibility() {
    var showResize = mode === "select";
    var showRotate = mode === "rotate";
    Array.prototype.forEach.call(resizeHandles, function (node) {
      node.style.display = showResize ? "" : "none";
    });
    Array.prototype.forEach.call(rotateHandles, function (node) {
      node.style.display = showRotate ? "" : "none";
    });
  }
  function parseRotateDeg(el) {
    var transform = (el.style.transform || getComputedStyle(el).transform || "").trim();
    if (!transform || transform === "none") return 0;
    var match = transform.match(/rotate\(\s*(-?\d*\.?\d+)(deg|rad|turn)?\s*\)/i);
    if (match) {
      var value = Number.parseFloat(match[1]) || 0;
      var unit = (match[2] || "deg").toLowerCase();
      if (unit === "rad") return value * (180 / Math.PI);
      if (unit === "turn") return value * 360;
      return value;
    }
    if (transform.indexOf("matrix(") === 0) {
      var parts = transform.slice(7, -1).split(",").map(function (part) { return Number.parseFloat(part.trim()); });
      if (parts.length >= 2) return Math.atan2(parts[1], parts[0]) * (180 / Math.PI);
    }
    return 0;
  }
  function replaceRotate(transform, deg) {
    var next = "rotate(" + Math.round(deg) + "deg)";
    var raw = (transform || "").trim();
    if (!raw || raw === "none" || raw.indexOf("matrix") === 0) return next;
    if (/rotate\([^)]*\)/i.test(raw)) return raw.replace(/rotate\([^)]*\)/i, next);
    return raw + " " + next;
  }
  setHandleVisibility();

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
    if (selected && !selected.isConnected) {
      selected = null;
      hovered = null;
      post("shape-design-selection", { element: null });
    }
    if (mode === "normal") {
      hoverBox.style.display = "none";
      selectBox.style.display = "none";
      clearGuides();
      return;
    }
    place(hoverBox, mode === "select" && hovered && hovered !== selected ? hovered : null);
    place(selectBox, selected);
    setHandleVisibility();
    if (selected) selectLabel.textContent = selected.tagName.toLowerCase() + " · " + labelFor(selected);
  }
  function collectThemeTokens() {
    var tokens = [];
    var seen = {};
    function add(name, value) {
      if (!name || name.indexOf("--") !== 0 || seen[name]) return;
      var trimmed = String(value || "").trim();
      if (!trimmed) return;
      seen[name] = 1;
      tokens.push({ name: name, value: trimmed });
    }
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        var rules;
        try { rules = sheets[i].cssRules; } catch (_) { continue; }
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (!rule || !rule.style) continue;
          for (var k = 0; k < rule.style.length; k++) {
            var prop = rule.style[k];
            if (prop && prop.indexOf("--") === 0) add(prop, rule.style.getPropertyValue(prop));
          }
        }
      }
    } catch (_) {}
    tokens.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return tokens.slice(0, 120);
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
        id: el.id || null,
        classes: Array.prototype.slice.call(el.classList || []).filter(function (name) {
          return !String(name).startsWith(PREFIX);
        }),
        text: (el.childElementCount === 0 ? el.textContent : "").replace(/\s+/g, " ").trim().slice(0, 80),
        alt: el.getAttribute("alt") || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        role: el.getAttribute("role") || "",
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
    var root = findComponentRoot(el);
    if (isMenuish(root) && root.tagName !== "NAV") pinOpen(root, true);
    else if (pinnedRoot && pinnedRoot !== root) unpin();
    refresh();
    var token = el;
    sourceOfAsync(el).then(function (source) {
      if (selected !== token) return;
      post("shape-design-selection", { element: snapshot(el, source) });
    });
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
      if (drag.kind === "rotate") {
        var angle = Math.atan2(event.clientY - drag.cy, event.clientX - drag.cx) * (180 / Math.PI);
        var nextDeg = drag.startRotation + (angle - drag.startAngle);
        if (event.shiftKey) nextDeg = Math.round(nextDeg / 15) * 15;
        drag.el.style.transform = replaceRotate(drag.baseTransform, nextDeg);
        drag.currentDeg = nextDeg;
        refresh();
        event.preventDefault();
        return;
      }
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
    if (mode === "normal") return;
    var handle = event.target && event.target.getAttribute && event.target.getAttribute("data-handle");
    if (handle && selected) {
      if (String(handle).indexOf("rotate") === 0) {
        if (mode !== "rotate") return;
        var rect = selected.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        drag = {
          kind: "rotate",
          el: selected,
          handle: handle,
          cx: cx,
          cy: cy,
          startAngle: Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI),
          startRotation: parseRotateDeg(selected),
          baseTransform: selected.style.transform || "",
          currentDeg: parseRotateDeg(selected)
        };
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (mode !== "select") return;
      var computed = getComputedStyle(selected);
      drag = {
        kind: "box",
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
    if (drag.kind === "rotate") {
      styles.transform = replaceRotate(drag.baseTransform, drag.currentDeg || drag.startRotation || 0);
    } else if (drag.handle === "move") {
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
    if (!selected || (mode !== "select" && mode !== "rotate")) return;
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
    if (data.type === "shape-design-set-mode") {
      mode = data.mode || "select";
      if (typeof data.projectRoot === "string") projectRoot = data.projectRoot;
      if (mode === "normal") hovered = null;
      drag = null;
      refresh();
    }
    if (data.type === "shape-design-config") {
      if (typeof data.projectRoot === "string") projectRoot = data.projectRoot;
    }
    if (data.type === "shape-design-select-key") {
      var all = document.body ? document.body.querySelectorAll("*") : [];
      for (var i = 0; i < all.length; i++) if (keyFor(all[i]) === data.key) { select(all[i]); break; }
    }
    if (data.type === "shape-design-refresh") { refresh(); sendTree(); }
    if (data.type === "shape-design-align") alignSelected(data.alignment);
    if (data.type === "shape-design-export") exportNode(data.scale || 2, data.requestId);
    if (data.type === "shape-design-set-text" && data.key) {
      var textNodes = document.body ? document.body.querySelectorAll("*") : [];
      for (var ti = 0; ti < textNodes.length; ti++) {
        if (keyFor(textNodes[ti]) === data.key) {
          textNodes[ti].textContent = data.text || "";
          select(textNodes[ti]);
          post("shape-design-commit-text", { element: snapshot(textNodes[ti]), text: textNodes[ti].textContent || "" });
          sendTree();
          break;
        }
      }
    }
    if (data.type === "shape-design-set-open") {
      var openNodes = document.body ? document.body.querySelectorAll("*") : [];
      for (var oi = 0; oi < openNodes.length; oi++) {
        if (keyFor(openNodes[oi]) === data.key) {
          pinOpen(findComponentRoot(openNodes[oi]), !!data.open);
          select(openNodes[oi]);
          sendTree();
          break;
        }
      }
    }
    if (data.type === "shape-design-set-attr" && data.key && data.name) {
      var attrNodes = document.body ? document.body.querySelectorAll("*") : [];
      for (var ai = 0; ai < attrNodes.length; ai++) {
        if (keyFor(attrNodes[ai]) === data.key) {
          var attrName = String(data.name);
          if (attrName === "href" && attrNodes[ai].hasAttribute("to") && !attrNodes[ai].hasAttribute("href")) {
            attrName = "to";
          }
          attrNodes[ai].setAttribute(attrName, data.value || "");
          post("shape-design-commit-attr", {
            element: snapshot(attrNodes[ai]),
            attributes: (function () { var o = {}; o[attrName] = data.value || ""; return o; })()
          });
          if (selected) post("shape-design-selection", { element: snapshot(selected) });
          sendTree();
          break;
        }
      }
    }
    if (data.type === "shape-design-apply-preview" && data.styles) {
      if (data.key) {
        if (!selected || !selected.isConnected || keyFor(selected) !== data.key) {
          selected = null;
          var nodes = document.body ? document.body.querySelectorAll("*") : [];
          for (var si = 0; si < nodes.length; si++) {
            if (keyFor(nodes[si]) === data.key) {
              selected = nodes[si];
              break;
            }
          }
        }
      }
      if (!selected || !selected.isConnected) return;
      Object.keys(data.styles).forEach(function (name) {
        selected.style.setProperty(name, data.styles[name], "important");
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
    post("shape-design-ready", {
      title: document.title,
      url: location.href,
      themeTokens: collectThemeTokens()
    });
  }, 30);
})();`;
