#!/usr/bin/env node
/**
 * Build search index from shape/docs. Run from shape repo root:
 *   bun run docs:index
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHAPE_ROOT = path.resolve(__dirname, "../..");
const DOCS_ROOT = path.join(SHAPE_ROOT, "docs");
const OUT_DIR = path.join(DOCS_ROOT, "generated");
const OUT_FILE = path.join(OUT_DIR, "search-index.json");

const DEFAULT_SECTION_ORDER = [
  "introduction",
  "workspace",
  "editor",
  "files",
  "git",
  "ai",
  "terminal",
  "settings",
  "reference",
  "tutorials",
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getSectionOrder() {
  const root = readJson(path.join(DOCS_ROOT, "meta.json"));
  return root?.sectionOrder ?? DEFAULT_SECTION_ORDER;
}

function readSectionMeta(folderKey) {
  const meta = readJson(path.join(DOCS_ROOT, folderKey, "meta.json"));
  if (meta) return meta;
  const title = folderKey.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title, defaultOpen: true };
}

function walkDir(dir, base = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "generated") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, [...base, entry.name]));
    } else if (entry.name.endsWith(".mdx")) {
      files.push([...base, entry.name.replace(/\.mdx$/, "")]);
    }
  }
  return files;
}

function slugToHref(slug) {
  return "/docs/" + slug.join("/");
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toPlainText(content) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkByHeadings(slug, content) {
  const href = slugToHref(slug);
  const lines = content.split("\n");
  const chunks = [];
  let currentHeading = null;
  let currentLines = [];

  function flush() {
    const text = toPlainText(currentLines.join("\n"));
    if (!text) return;
    const headingId = currentHeading ? slugifyHeading(currentHeading) : "intro";
    chunks.push({
      id: `${slug.join("/")}#${headingId}`,
      slug,
      href,
      heading: currentHeading,
      text,
    });
  }

  for (const line of lines) {
    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (match) {
      flush();
      currentHeading = match[2].replace(/\*\*/g, "").replace(/`/g, "").trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (chunks.length === 0) {
    const text = toPlainText(content);
    if (text) {
      chunks.push({
        id: `${slug.join("/")}#intro`,
        slug,
        href,
        heading: null,
        text,
      });
    }
  }

  return chunks;
}

function loadDoc(slug) {
  const filePath = path.join(DOCS_ROOT, ...slug) + ".mdx";
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title ?? slug[slug.length - 1],
    description: data.description ?? "",
    order: data.order ?? 999,
    content,
  };
}

function buildNavTree() {
  const slugs = walkDir(DOCS_ROOT);
  const sectionOrder = getSectionOrder();
  const bySection = new Map();

  for (const slug of slugs) {
    if (slug.length < 2) continue;
    // Contributor docs stay in the nav/repo but are not indexed for public search/chat.
    if (slug[0] === "developing") continue;
    // Internal render fixtures must not appear in the product docs index.
    if (slug[0] === "reference" && slug[1] === "mdx-components") continue;
    const doc = loadDoc(slug);
    if (!doc) continue;
    const key = slug[0];
    const list = bySection.get(key) ?? [];
    list.push({
      slug: doc.slug,
      title: doc.title,
      description: doc.description,
      order: doc.order,
    });
    bySection.set(key, list);
  }

  return sectionOrder
    .map((key) => {
      const items = bySection.get(key);
      if (!items?.length) return null;
      const meta = readSectionMeta(key);
      return {
        key,
        title: meta.title,
        items: items.sort((a, b) => a.order - b.order),
      };
    })
    .filter(Boolean);
}

function main() {
  if (!fs.existsSync(DOCS_ROOT)) {
    console.error(`Docs root not found: ${DOCS_ROOT}`);
    process.exit(1);
  }

  const nav = buildNavTree();
  const pages = [];
  const chunks = [];

  for (const group of nav) {
    for (const item of group.items) {
      const doc = loadDoc(item.slug);
      if (!doc) continue;
      const href = slugToHref(item.slug);
      const pageChunks = chunkByHeadings(item.slug, doc.content);
      const body = pageChunks.map((c) => c.text).join(" ");

      pages.push({
        slug: item.slug,
        title: item.title,
        description: item.description,
        order: item.order,
        section: group.title,
        href,
        body,
      });

      for (const chunk of pageChunks) {
        chunks.push({
          ...chunk,
          title: item.title,
          section: group.title,
        });
      }
    }
  }

  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    pages,
    chunks,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2), "utf-8");
  console.log(`Wrote ${pages.length} pages, ${chunks.length} chunks → ${OUT_FILE}`);
}

main();
