'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const renderMermaid = require('../lib/filter');

test('renders NexT and standard Mermaid code blocks as inline SVG', async () => {
  const input = [
    '<p>before</p>',
    '<pre><code class="mermaid">flowchart TD\nA--&gt;B</code></pre>',
    '<pre><code class="language-mermaid">sequenceDiagram\nA-&gt;&gt;B: Hello</code></pre>',
    '<p>after</p>'
  ].join('');

  const output = await renderMermaid(input, { documentId: 'source/test.md' });

  assert.equal((output.match(/data-renderer="merman"/g) || []).length, 2);
  assert.equal((output.match(/<svg /g) || []).length, 2);
  assert.match(output, /^<p>before<\/p>/);
  assert.match(output, /<p>after<\/p>$/);
  assert.doesNotMatch(output, /<code class="(?:language-)?mermaid">/);
});

test('renders pre and div source containers', async () => {
  const input = [
    '<pre class="mermaid">flowchart LR\nA --> B</pre>',
    '<div class="mermaid">pie title Pets\n"Dogs" : 5</div>'
  ].join('');

  const output = await renderMermaid(input, { documentId: 'containers' });
  assert.equal((output.match(/<svg /g) || []).length, 2);
});

test('leaves unrelated and already rendered HTML byte-for-byte unchanged', async () => {
  const unrelated = '<article><pre><code>const mermaid = true;</code></pre></article>';
  const rendered = '<div class="mermaid" data-processed="true"><svg id="existing"></svg></div>';

  assert.equal(await renderMermaid(unrelated), unrelated);
  assert.equal(await renderMermaid(rendered), rendered);
});

test('generates stable unique IDs for repeated diagrams', async () => {
  const block = '<pre><code class="mermaid">flowchart TD\nA --> B</code></pre>';
  const first = await renderMermaid(block + block, { documentId: 'same-post' });
  const second = await renderMermaid(block + block, { documentId: 'same-post' });
  const ids = [...first.matchAll(/<svg id="([^"]+)"/g)].map(match => match[1]);

  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(
    ids,
    [...second.matchAll(/<svg id="([^"]+)"/g)].map(match => match[1])
  );
});

test('supports concurrent filter calls', async () => {
  const [flowchart, sequence] = await Promise.all([
    renderMermaid('<pre class="mermaid">flowchart TD\nA --> B</pre>', { documentId: 'flow' }),
    renderMermaid('<pre class="mermaid">sequenceDiagram\nA->>B: Hi</pre>', { documentId: 'sequence' })
  ]);

  assert.match(flowchart, /class="flowchart"/);
  assert.match(sequence, /aria-roledescription="sequence"/);
});

test('reports invalid diagrams with their position', async () => {
  await assert.rejects(
    renderMermaid('<pre class="mermaid">this is not a diagram</pre>'),
    /Failed to render Mermaid diagram 1:/
  );
});

test('registers an asynchronous Hexo filter', async () => {
  let filter;
  global.hexo = {
    config: {
      merman: {
        options: {
          site_config: { theme: 'neutral' }
        }
      }
    },
    extend: {
      filter: {
        register(type, callback, priority) {
          assert.equal(type, 'after_post_render');
          assert.equal(priority, 8);
          filter = callback;
        }
      }
    }
  };

  try {
    delete require.cache[require.resolve('../index')];
    require('../index');
    const data = {
      path: 'posts/diagram.html',
      content: '<pre><code class="mermaid">flowchart TD\nA --> B</code></pre>'
    };

    await filter(data);
    assert.match(data.content, /<svg /);
    assert.match(data.content, /data-renderer="merman"/);
  } finally {
    delete require.cache[require.resolve('../index')];
    delete global.hexo;
  }
});

test('does not register the Hexo filter when disabled', () => {
  let registered = false;
  global.hexo = {
    config: {
      merman: { enable: false }
    },
    extend: {
      filter: {
        register() {
          registered = true;
        }
      }
    }
  };

  try {
    delete require.cache[require.resolve('../index')];
    require('../index');
    assert.equal(registered, false);
  } finally {
    delete require.cache[require.resolve('../index')];
    delete global.hexo;
  }
});
