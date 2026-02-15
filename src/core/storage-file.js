import yaml from 'js-yaml';
import { extname } from 'path';

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isMarkdownStorageFile(filePath) {
  return extname(filePath).toLowerCase() === '.md';
}

/**
 * Parse markdown frontmatter block.
 * @param {string} content
 * @returns {{ frontmatter: string, body: string }}
 */
function splitFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return { frontmatter: '', body: content };
  }

  const closing = content.indexOf('\n---\n', 4);
  if (closing === -1) {
    return { frontmatter: '', body: content };
  }

  const frontmatter = content.slice(4, closing);
  const body = content.slice(closing + 5);
  return { frontmatter, body };
}

/**
 * Parse a storage file into ontology documents and optional markdown body.
 * @param {string} filePath
 * @param {string} content
 * @returns {{ docs: any[], body: string }}
 */
export function parseStorageFileContent(filePath, content) {
  if (isMarkdownStorageFile(filePath)) {
    const { frontmatter, body } = splitFrontmatter(content);
    if (!frontmatter.trim()) {
      return { docs: [], body };
    }

    const parsed = yaml.load(frontmatter);
    return {
      docs: parsed === null || parsed === undefined ? [] : [parsed],
      body
    };
  }

  const docs = yaml.loadAll(content).filter(doc => doc !== null && doc !== undefined);
  return { docs, body: '' };
}

/**
 * Serialize ontology documents back to storage file format.
 * @param {string} filePath
 * @param {any[]} docs
 * @param {{ body?: string }} [options]
 * @returns {string}
 */
export function serializeStorageFileContent(filePath, docs, options = {}) {
  if (isMarkdownStorageFile(filePath)) {
    const doc = docs.find(d => d !== null && d !== undefined) || {};
    const frontmatter = yaml.dump(doc, { lineWidth: -1, noRefs: true }).trimEnd();
    const body = options.body ?? '';
    return `---\n${frontmatter}\n---\n${body}`;
  }

  return docs.map(d => yaml.dump(d, { lineWidth: -1, noRefs: true })).join('---\n');
}

/**
 * Extract Obsidian wiki links that follow Class/id style from markdown body.
 * @param {string} body
 * @returns {Array<{ className: string, id: string, target: string }>}
 */
export function extractWikiLinks(body) {
  const results = [];
  const seen = new Set();
  const regex = /\[\[([^\]]+)\]\]/g;

  let match;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > 0 && body[match.index - 1] === '!') {
      continue;
    }

    const raw = (match[1] || '').trim();
    if (!raw) continue;

    const noAlias = raw.split('|')[0].trim();
    const noAnchor = noAlias.split('#')[0].trim();
    if (!noAnchor) continue;

    const parts = noAnchor.split('/').filter(Boolean);
    if (parts.length < 2) continue;

    const className = parts[parts.length - 2];
    const id = parts[parts.length - 1];
    const dedupeKey = `${className}/${id}`;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    results.push({ className, id, target: noAnchor });
  }

  return results;
}