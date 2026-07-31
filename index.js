/* global hexo */

'use strict';

const renderMermaid = require('./lib/filter');

const config = hexo.config.merman || {};

if (config.enable !== false) {
  hexo.extend.filter.register('after_post_render', async data => {
    data.content = await renderMermaid(data.content, {
      documentId: data.path || data.source || data.slug || data.title,
      mermanOptions: config.options
    });
  }, 8);
}
