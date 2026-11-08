(function gallerySmokeTest() {
  'use strict';
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../scripts/event-gallery.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../event.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../scripts/event.js'), 'utf8');

  class FakeElement {
    constructor(tag = 'div') {
      this.tag = tag;
      this.innerHTML = '';
      this.hidden = false;
      this.handlers = {};
      this.dataset = {};
      this.attrs = {};
      this.children = [];
      this.style = {};
      this.isConnected = true;
      this.classList = {toggle: () => {}};
    }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    setAttribute(name, value) { this.attrs[name] = value; }
    focus() { this.focused = true; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    querySelector(selector) { return selector === 'video' ? this.children.find(x => x.tag === 'video') || null : null; }
    querySelectorAll() { return this.children; }
    insertAdjacentHTML(_position, content) { this.innerHTML += content; }
    pause() { this.paused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.handlers.close?.(); }
  }

  const window = {MSArchive: {
    escapeHtml: str => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    personName: id => id,
    mediaMime: item => item.type === 'video' ? 'video/mp4' : 'image/jpeg'
  }};
  const document = {
    body: {style: {overflow: ''}},
    createElement: tag => new FakeElement(tag)
  };
  vm.runInNewContext(source, {window, document});
  const selectors = {
    '[data-media-preview]': 'preview',
    '[data-media-expanded]': 'expanded',
    '[data-media-expand-wrap]': 'expandWrap',
    '[data-media-expand]': 'expand',
    '[data-media-grid]': 'grid',
    '[data-media-progress]': 'progress',
    '[data-media-load]': 'load',
    '[data-media-viewer]': 'viewer',
    '[data-viewer-stage]': 'stage',
    '[data-viewer-caption]': 'caption',
    '[data-viewer-people]': 'people',
    '[data-viewer-position]': 'position',
    '[data-viewer-prev]': 'prev',
    '[data-viewer-next]': 'next',
    '[data-viewer-close]': 'close'
  };
  function setup(media) {
    const nodes = {};
    Object.values(selectors).forEach(name => {nodes[name] = new FakeElement();});
    const filters = ['all', 'photos', 'videos'].map(value => {
      const node = new FakeElement('button');
      node.dataset.mediaFilter = value;
      return node;
    });
    const mount = new FakeElement();
    mount.querySelector = selector => {
      if (selector.startsWith('[data-media-filter="')) return filters.find(x => selector.includes(`"${x.dataset.mediaFilter}"`));
      return nodes[selectors[selector]];
    };
    mount.querySelectorAll = selector => selector === '[data-media-filter]' ? filters : [];
    window.MSArchive.mountEventGallery(mount, media, {peopleById: {}});
    const click = (selector, element) => mount.handlers.click({
      target: {closest: check => check === selector ? element : null}
    });
    return {nodes, filters, mount, click};
  }
  const buttons = markup => (markup.match(/data-memory-index="/g) || []).length;
  const sample = Array.from({length: 56}, (_, i) => ({
    id: `memory-${i}`, caption: `Memory ${i}`, type: i % 5 === 0 ? 'video' : 'image',
    url: `/assets/media/memory-${i}.jpg`, posterUrl: i % 5 === 0 && i % 2 === 0 ? `/poster-${i}.jpg` : '',
    people: []
  }));

  assert.ok(html.indexOf('event-gallery.js') < html.indexOf('scripts/event.js'), 'Gallery module must load first');
  assert.ok(page.indexOf('class="event-story"') < page.indexOf('${gallery}'), 'Story must precede media');
  assert.ok(page.includes('event.coverMediaId'), 'Cover override must remain supported');

  const gallery = setup(sample);
  assert.equal(buttons(gallery.mount.innerHTML), 5);
  assert.ok(!gallery.mount.innerHTML.includes('<video'), 'Video players must not appear in initial markup');
  gallery.click('[data-media-expand]', gallery.nodes.expand);
  assert.equal(buttons(gallery.nodes.grid.innerHTML), 24);
  assert.equal(gallery.nodes.preview.hidden, true);
  gallery.click('[data-media-load]', gallery.nodes.load);
  assert.equal(buttons(gallery.nodes.grid.innerHTML), 48);
  gallery.click('[data-media-load]', gallery.nodes.load);
  assert.equal(buttons(gallery.nodes.grid.innerHTML), 56);
  assert.equal(gallery.nodes.load.hidden, true);
  gallery.click('[data-media-filter]', gallery.filters[2]);
  assert.equal(buttons(gallery.nodes.grid.innerHTML), 12);
  assert.equal(gallery.filters[2].attrs['aria-pressed'], 'true');
  const opener = new FakeElement('button');
  opener.dataset.memoryIndex = '0';
  gallery.click('[data-memory-index]', opener);
  assert.equal(gallery.nodes.viewer.open, true);
  assert.equal(gallery.nodes.stage.children[0].tag, 'video', 'Create player on request only');
  assert.equal(gallery.nodes.position.textContent, '1 / 12');
  gallery.nodes.viewer.close();
  assert.equal(gallery.nodes.stage.children.length, 0, 'Release player on close');
  assert.equal(document.body.style.overflow, '');
  assert.equal(opener.focused, true, 'Return keyboard focus to opener');
  gallery.click('[data-media-collapse]', new FakeElement('button'));
  assert.equal(gallery.nodes.preview.hidden, false);

  const compact = setup(sample.slice(0, 3));
  assert.equal(buttons(compact.mount.innerHTML), 3);
  assert.ok(compact.mount.innerHTML.includes('data-media-expand-wrap hidden'), 'No expansion for small events');
  const empty = setup([]);
  assert.equal(empty.mount.innerHTML, '', 'No gallery when no media exists');
  console.log('Event Galleries 2.0 smoke tests passed.');
})();
