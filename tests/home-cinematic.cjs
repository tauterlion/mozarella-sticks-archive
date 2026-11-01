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
console.log('PASS: cinematic homepage structure, media, routes, existing mounts and motion safeguards');
