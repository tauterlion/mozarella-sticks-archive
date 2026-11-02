#!/usr/bin/env node
/* Lightweight cross-page Chromium smoke test for Revision 3.1.
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
          if(name==='event') await page.waitForSelector('.event-header',{timeout:15000});
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
              imgBroken:[...document.querySelectorAll('main img')].filter(x=>x.complete && !x.naturalWidth).slice(0,3).map(x=>x.src)
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
      // Verify native scroll target and the original hero image.
      await page.goto(base+'index.html',{waitUntil:'domcontentloaded'});
      const hero = await page.locator('.hero-image').evaluate(async el => {
        if (!el.complete) await new Promise(resolve => {
          el.addEventListener('load',resolve,{once:true});
          el.addEventListener('error',resolve,{once:true});
        });
        const canvas=document.createElement('canvas');
        canvas.width=9;canvas.height=8;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        if (!el.naturalWidth) return {complete:el.complete,naturalWidth:0,source:el.getAttribute('src')};
        ctx.drawImage(el,0,0,9,8);
        const image=ctx.getImageData(0,0,9,8).data;
        const gray=(x,y)=>{
          const i=(y*9+x)*4;
          return image[i]*.299+image[i+1]*.587+image[i+2]*.114;
        };
        let bits=0n,bit=0n;
        for(let y=0;y<8;y++)for(let x=0;x<8;x++){
          if(gray(x,y)>gray(x+1,y))bits |= 1n<<bit;
          bit++;
        }
        return {complete:el.complete,naturalWidth:el.naturalWidth,
          source:el.getAttribute('src'),dhash:bits.toString(16).padStart(16,'0')};
      });
      assert.ok(hero.complete && hero.naturalWidth>0,'Hero photo must decode');
      assert.equal(hero.source,'assets/media/beach-party-everyone.jpg');
      if(setup.name==='desktop'){
        const approved=0xaaf9b1b358146b0fn;
        const difference=BigInt('0x'+hero.dhash)^approved;
        const hamming=[...difference.toString(2)].filter(b=>b==='1').length;
        console.log('Hero visual fingerprint: '+hero.dhash+
          '; distance from owner-approved PNG: '+hamming+'/64 (lower is closer)');
      }
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
