'use strict';

const { createHash } = require('node:crypto');
const render = require('./renderer');

const parser = import('parse5');

function attribute(node, name) {
  return node.attrs?.find(attr => attr.name === name)?.value;
}

function hasClass(node, className) {
  return (attribute(node, 'class') || '').split(/\s+/).includes(className);
}

function containsElement(node, tagName) {
  return node.childNodes?.some(child =>
    child.tagName === tagName || containsElement(child, tagName)
  ) || false;
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value;
  return node.childNodes?.map(textContent).join('') || '';
}

function isMermaidCode(node) {
  return node?.tagName === 'code' &&
    (hasClass(node, 'mermaid') || hasClass(node, 'language-mermaid'));
}

function findDiagrams(fragment) {
  const diagrams = [];

  function visit(node) {
    if (!node.sourceCodeLocation) return;

    const code = node.tagName === 'pre' && node.childNodes?.find(isMermaidCode);
    if (code) {
      diagrams.push({ node, source: textContent(code) });
      return;
    }

    const isSourceContainer =
      (node.tagName === 'pre' || node.tagName === 'div') && hasClass(node, 'mermaid');
    const isRendered = attribute(node, 'data-processed') === 'true' || containsElement(node, 'svg');

    if (isSourceContainer && !isRendered) {
      diagrams.push({ node, source: textContent(node) });
      return;
    }

    node.childNodes?.forEach(visit);
  }

  fragment.childNodes.forEach(visit);
  return diagrams;
}

function diagramId(documentId, source, index) {
  const hash = createHash('sha256')
    .update(String(documentId || ''))
    .update('\0')
    .update(String(index))
    .update('\0')
    .update(source)
    .digest('hex')
    .slice(0, 16);
  return `merman-${hash}`;
}

function bindingOptions(options, id) {
  const mermanOptions = options.mermanOptions || {};
  return {
    ...mermanOptions,
    svg: {
      pipeline: 'readable',
      ...mermanOptions.svg,
      diagram_id: id
    }
  };
}

module.exports = async function(content, options = {}) {
  if (!content || !content.includes('mermaid')) return content;

  const { parseFragment } = await parser;
  const fragment = parseFragment(content, { sourceCodeLocationInfo: true });
  const diagrams = findDiagrams(fragment);
  if (!diagrams.length) return content;

  const replacements = [];

  for (const [index, diagram] of diagrams.entries()) {
    const source = diagram.source.trim();
    if (!source) continue;

    const id = diagramId(options.documentId, source, index);
    let svg;
    try {
      svg = await render(source, bindingOptions(options, id));
    } catch (error) {
      const message = error?.message || String(error);
      throw new Error(`Failed to render Mermaid diagram ${index + 1}: ${message}`, {
        cause: error
      });
    }

    replacements.push({
      start: diagram.node.sourceCodeLocation.startOffset,
      end: diagram.node.sourceCodeLocation.endOffset,
      value: `<div class="mermaid" data-processed="true" data-renderer="merman">${svg}</div>`
    });
  }

  replacements.sort((a, b) => b.start - a.start);
  return replacements.reduce(
    (result, replacement) =>
      result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end),
    content
  );
};
