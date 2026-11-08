#!/usr/bin/env node
/* Lightweight cross-page Chromium smoke test for Revision 3.1 and Event Galleries 2.0.
   Run with a local server and Playwright: BASE_URL=http://127.0.0.1:8765/ node tests/cinematic-browser.cjs */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const targets = [
  ['index.html', 'home'],
  ['timeline.html', 'timeline'],
  ['gallery.html', 'gallery'],
  ['people.html', 'people'],
  ['person.html?id=alejandro', 'profile'],
  ['event.html?id=graduation', 'event']
];
const cases = [
  {name:'desktop',size:{width:1600,height:900}},
  {name:'tablet',size:{width:768,height:1024}},
  {name:'phone',size:{width:390,height:844}},
  {name:'small-phone',size:{width:320,height:700}}
];

(async () => {
  const browser = await chromium.launch({headless:true});
  let checks = 0;
  try {
    for (const setup of cases) {
      const context = await browser.newContext({viewport:setup.size,colorScheme:'dark'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const theme of ['dark','light']) {
        for (const [url,name] of targets) {
          await page.goto(base+url,{waitUntil:'domcontentloaded'});
          await page.evaluate(value => {
            localStorage.setItem('ms-theme',value);
            document.documentElement.dataset.theme=value;
          },theme);
          await page.waitForSelector('.film-header .film-nav');
          // Rendered data is asynchronous; wait for useful content on each page.
          if(name==='home') await page.waitForFunction(() => {
            const x = document.querySelector('#latest-event');
            return x && !x.classList.contains('skeleton') && !x.querySelector('.error-state');
          },null,{timeout:15000});
          if(name==='timeline') await page.waitForSelector('.event-card',{timeout:15000});
          if(name==='gallery') await page.waitForSelector('.media-card',{timeout:15000});
          if(name==='people') await page.waitForSelector('.person-card',{timeout:15000});
          if(name==='profile') await page.waitForSelector('.profile-hero',{timeout:15000});
          if(name==='event') {
            await page.waitForSelector('.event-hero h1',{timeout:15000});
            await page.waitForSelector('.event-story .event-prose p',{timeout:15000});
          }
          const result = await page.evaluate(() => {
            const header = document.querySelector('header.film-header');
            const links = [...header.querySelectorAll('.film-nav a')];
            const labels = links.map(x=>x.textContent.trim());
            return {
              overflow: document.documentElement.scrollWidth - innerWidth,
              header: Boolean(header),
              labels,
              theme:document.documentElement.dataset.theme,
              navFont:parseFloat(getComputedStyle(links[0]).fontSize),
              imgBroken:[...document.querySelectorAll('main img')].filter(x=>x.getAttribute('src') && x.complete && !x.naturalWidth).slice(0,3).map(x=>x.src)
            };
          });
          assert.ok(result.header,setup.name+' '+name+': cinematic nav missing');
          assert.deepEqual(result.labels,['Timeline','Gallery','People','Discover']);
          assert.equal(result.theme,theme);
          assert.ok(result.overflow<=1,setup.name+' '+name+' '+theme+': horizontal overflow '+result.overflow);
          assert.ok(result.navFont>=10,setup.name+' '+name+': nav font below 10px');
          assert.deepEqual(result.imgBroken,[],setup.name+' '+name+': image failed to decode');
          checks+=6;
        }
      }
      // The redesigned event page must remain functional beyond its hero:
      // the story precedes the gallery, and the large gallery can be explored.
      await page.goto(base+'event.html?id=josie-birthday',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.event-media-preview .event-memory-card',{timeout:15000});
      const eventLayout = await page.evaluate(() => {
        const story = document.querySelector('.event-story');
        const media = document.querySelector('.event-media-section');
        return {
          hero: Boolean(document.querySelector('.event-hero h1')),
          storyBeforeGallery: Boolean(story && media && (story.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING))
        };
      });
      assert.ok(eventLayout.hero,setup.name+': event title missing');
      assert.ok(eventLayout.storyBeforeGallery,setup.name+': story should precede event media');
      assert.equal(await page.locator('.event-media-preview .event-memory-card').count(),5,
        setup.name+': large events should show five highlights first');
      await page.locator('[data-media-expand]').click();
      await page.waitForSelector('.event-media-grid .event-memory-card',{timeout:10000});
      assert.equal(await page.locator('.event-media-grid .event-memory-card').count(),11,
        setup.name+': all available birthday memories should be accessible');
      await page.locator('[data-media-filter="videos"]').click();
      assert.equal(await page.locator('.event-media-grid .event-memory-card').count(),0,
        setup.name+': image-only event should have no video results');
      await page.locator('[data-media-filter="photos"]').click();
      assert.equal(await page.locator('.event-media-grid .event-memory-card').count(),11,
        setup.name+': photo filter should restore all available images');
      await page.locator('.event-media-grid .event-memory-card').first().click();
      await page.waitForSelector('.event-media-viewer[open]',{timeout:5000});
      assert.equal(await page.locator('.event-viewer-stage img').count(),1,
        setup.name+': image viewer did not open');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.event-media-viewer')?.open,{timeout:5000});
      checks+=8;
      // Verify native scroll target and the original hero image.
      await page.goto(base+'index.html',{waitUntil:'domcontentloaded'});
      const hero = await page.locator('.hero-image').evaluate(async el => {
        try { await el.decode(); } catch {}
        const photo=getComputedStyle(el);
        const parent=el.closest('.home-hero').getBoundingClientRect();
        const box=el.getBoundingClientRect();
        return {
          complete:el.complete,naturalWidth:el.naturalWidth,
          naturalHeight:el.naturalHeight,source:el.getAttribute('src'),
          relativeTop:box.top-parent.top,
          renderedHeight:box.height,heroHeight:parent.height
        };
      });
      assert.ok(hero.complete && hero.naturalWidth>0,'Hero photo must decode');
      assert.equal(hero.source,'assets/media/aoms-3-1-hero-wide.jpg');
      assert.equal(hero.naturalWidth,2048,'Approved landscape photo width');
      assert.equal(hero.naturalHeight,1365,'Approved landscape photo height');
      if(setup.size.width<=760) {
        assert.ok(hero.renderedHeight/hero.heroHeight>.76 &&
          hero.renderedHeight/hero.heroHeight<.80,
          'Mobile displays wider group framing rather than square-image zoom');
      } else {
        assert.ok(hero.relativeTop>=85,
          'Wide photograph must stay below cinematic title area');
      }
      console.log('Hero source verified, '+setup.name+
        ': '+hero.naturalWidth+'x'+hero.naturalHeight+
        ', top='+hero.relativeTop.toFixed(1)+
        ', renderHeight='+hero.renderedHeight.toFixed(1));
      assert.equal(await page.locator('.cinema-entry-button').count(),0,'Explore button is gone');

      await page.locator('.hero-scroll-hint').click();
      await page.waitForFunction(()=>location.hash==='#inside-archive',{timeout:3000});
      checks+=4;
      // Decorative rings animate in normal mode, not reduced-motion mode.
      const arc = page.locator('.archive-arc-one');
      const normal = await arc.evaluate(el=>getComputedStyle(el).animationName);
      assert.ok(normal.includes('aoms-orbit-breathe'),'Arc animation missing');
      await page.emulateMedia({reducedMotion:'reduce'});
      const reduced = await arc.evaluate(el=>getComputedStyle(el).animationName);
      assert.equal(reduced,'none','Arc motion not suppressed by reduced-motion');
      checks+=2;
      assert.deepEqual(errors,[],setup.name+': uncaught JavaScript errors');
      checks++;
      await context.close();
      console.log('PASS '+setup.name+' cross-page layouts, images, navigation, and motion');
    }
    console.log('PASS cinematic browser smoke: '+checks+' checks across '+(cases.length*2*targets.length)+' page/viewport/theme cases');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1});
