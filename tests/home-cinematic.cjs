#!/usr/bin/env node
/* Static assertions for the cinematic homepage. Run: node tests/home-cinematic.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html'), css = read('styles/home.css'), script = read('scripts/home.js');

assert.match(html, /<section class="home-hero"[^>]*aria-labelledby="home-title"/);
assert.match(html, /<h1 id="home-title">MOZARELLA STICKS<\/h1>/);
assert.match(html, /href="#inside-archive"/);
assert.match(html, /id="inside-archive"/);
assert.match(html, /assets\/media\/beach-party-everyone\.jpg/);
assert.ok(fs.existsSync(path.join(root, 'assets/media/beach-party-everyone.jpg')),
  'Hero image must be checked into the archive');
for (const target of ['timeline.html', 'gallery.html', 'people.html']) {
  assert.match(html, new RegExp('href="' + target.replace('.', '\\.') + '"'));
}
for (const id of ['event-stat', 'era-stat', 'people-stat', 'media-stat', 'featured-events', 'home-photographs', 'latest-event']) {
  assert.ok(html.includes('id="' + id + '"'), 'Missing existing homepage data mount: ' + id);
}
assert.match(html, /scripts\/shared\.js/);
assert.match(html, /styles\/shared\.css/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.ok(!script.includes("document.querySelector('#hero-photo').innerHTML"),
  'The authentic hero must not be replaced dynamically');

// Shared navigation should match the film opening on every public archive page.
const pages = ['index.html','timeline.html','gallery.html','people.html','person.html','event.html'];
const expectedLinks = ['timeline.html','gallery.html','people.html'];
for(const page of pages){
  const markup=read(page);
  assert.match(markup, /<header class="site-header film-header">/, page+' missing film header');
  assert.match(markup, /<span class="film-wordmark"[^>]*>AoMS<\/span>/, page+' missing wordmark');
  assert.match(markup, /class="film-header-rule"/, page+' missing horizontal rule');
  assert.match(markup, /class="primary-nav film-nav"/, page+' missing unified nav');
  assert.match(markup, /class="nav-discover"/, page+' missing Discover action');
  assert.match(markup, /class="icon-button theme-toggle film-theme-toggle"/, page+' missing theme toggle');
  for(const link of expectedLinks)assert.ok(markup.includes('href="'+link+'"'), page+' missing '+link);
}
const shared=read('styles/shared.css');
const motion=read('scripts/interactions.js');
assert.match(shared,/main \.aoms-motion-drift/);
assert.match(shared,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(motion,/main img:not\(\.hero-image\)/);
assert.match(motion,/main \.event-summary/);
assert.match(motion,/main \.event-date/);
assert.match(motion,/\], image\?950:1080\);/);
assert.match(motion,/change<0\?\.30:\.13/);
assert.match(motion,/MutationObserver/);
assert.match(motion,/reduced\.matches/);
assert.match(css,/\.cinema-entry-button\{[\s\S]*?border-radius:999px/);
assert.match(css,/var\(--bg\) 100%/);

console.log('PASS: cinematic homepage, unified headers, motion, reduced-motion and safe data mounts');
