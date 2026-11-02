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
assert.match(shared,/\.home-hero #home-title\.aoms-motion-drift/);
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
assert.match(css,/Revision 3\.1\.2: let the hero fade/);
assert.match(css,/\.home-hero::before\{/);
assert.match(css,/mask-image:linear-gradient\(180deg,#000 0%,#000 54%,transparent 100%\)/);


// Final user-approved direction: compact title, one "THE", no range micro-section.
assert.match(html, /<p class="cinema-kicker">THE ARCHIVE OF<\/p>/);
assert.match(html, /<div class="cinema-rule" aria-hidden="true"><span><\/span>THE<span><\/span><\/div>/);
assert.ok(!html.includes('THE ARCHIVE OF THE'), 'No doubled THE in opening');
assert.ok(!html.includes('id="archive-range"'), 'Remove redundant under-stats mini-section');
assert.ok(!script.includes("querySelector('#archive-range')"), 'No abandoned range mount');
assert.match(css, /Revision 3\.1\.3/);
assert.match(css, /font-size:clamp\(2\.8rem,5\.85vw,7\.1rem\)/);
assert.match(css, /top:clamp\(-270px,-12\.8vw,-78px\)/);
assert.match(css, /@media\(min-width:761px\) and \(max-width:1200px\)/);
assert.match(css, /top:calc\(290px - 34vw\)/);
assert.match(shared, /\.home-hero #home-title\.aoms-motion-drift/);
assert.ok(!shared.includes('main .aoms-motion-drift'), 'No drift on other page titles');
assert.match(motion, /if\(el\.id === 'home-title'\)/);
assert.match(motion, /if\(document\.getElementById\('home-title'\)\)window\.addEventListener\('scroll'/);


/* 3.1.4: opening is quieter and the CTA starts below the hero viewport. */
assert.ok(!html.includes('cinema-kicker'), 'Upper THE ARCHIVE OF line is removed');
const heroAt = html.indexOf('<section class="home-hero"');
const heroEnd = html.indexOf('</section>',heroAt);
const entryAt = html.indexOf('<div class="archive-entry"');
assert.ok(entryAt > heroEnd, 'The Explore button is below the hero, not inside it');
assert.match(html,/href="#archive-entry"/);
assert.match(html,/class="archive-depth"/);
assert.match(html,/class="archive-orbits" aria-hidden="true"/);
for(const arc of ['archive-arc-one','archive-arc-two','archive-arc-three'])
  assert.ok(html.includes(arc), 'Missing background arc: '+arc);
assert.match(css,/Revision 3\.1\.4/);
assert.match(css,/height:min\(25svh,27%\)/);
assert.match(css,/@keyframes aoms-orbit-breathe/);
assert.match(css,/\.archive-entry \.cinema-entry-button/);
assert.match(css,/\.home-hero \.hero-image\{top:auto;bottom:0;height:91%\}/);

console.log('PASS: cinematic 3.1.4 below-fold entry, arcs, photo fade and archive safeguards');
