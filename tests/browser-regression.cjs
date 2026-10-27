
/* Optional browser regression suite. No browser dependency is used by the website.
   PLAYWRIGHT_MODULE, CHROME_BIN, BASE_URL and REVIEW_OUTPUT can override defaults. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const output=process.env.REVIEW_OUTPUT||path.resolve(root,'../outputs/production-review');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'data/timeline.json'))),people=JSON.parse(fs.readFileSync(path.join(root,'data/people.json'))).people;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/media.json'))),media=manifest.media;
const events=[...timeline.events].sort((a,b)=>a.sort.localeCompare(b.sort)),available=media.filter(m=>m.available!==false);
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const searchable=e=>normalize([e.title,e.summary,e.details,e.dateLabel,e.era,...e.categories,...e.storylines,...e.people.flatMap(id=>{const p=people.find(p=>p.id===id);return p?[p.displayName,...p.aliases]:[id];})].join(' '));
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,colorScheme:'dark'});
 const page=await context.newPage(),errors=[],checks=[],playback=[];
 page.on('pageerror',e=>errors.push(e.message));
 const check=(name,value=true)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 const go=async url=>{await page.goto(base+url);await page.waitForFunction(()=>!document.querySelector('.loading-state')&&!document.querySelector('#latest-event.skeleton'));};
 const ids=()=>page.locator('.event-card').evaluateAll(nodes=>nodes.map(e=>e.id));
 const open=async()=>{await page.locator('#search-launch').click();await page.waitForTimeout(330);assert.ok(await page.locator('#search-panel').evaluate(e=>e.open));};
 const close=async()=>{await page.keyboard.press('Escape');await page.waitForTimeout(260);assert.ok(!await page.locator('#search-panel').evaluate(e=>e.open));};
 await go('timeline.html');assert.deepEqual(await ids(),events.map(e=>e.id));check('All '+events.length+' events render chronologically');
 const records=await page.locator('.event-card').evaluateAll(cards=>cards.map(c=>({id:c.id,title:c.querySelector('h3').textContent,summary:c.querySelector('.event-summary').textContent,details:c.querySelector('.event-details-inner>p').textContent,date:c.querySelector('.event-date').textContent})));
 for(const r of records){const e=events.find(e=>e.id===r.id);for(const key of ['title','summary','details'])assert.equal(r[key],e[key]);assert.equal(r.date,e.dateLabel);}
 check('Every timeline title, summary, history and date preserved');
 await open();assert.ok(await page.locator('#timeline-search').evaluate(e=>e===document.activeElement));
 for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#search-panel').contains(document.activeElement)));}
 await close();assert.ok(await page.locator('#search-launch').evaluate(e=>e===document.activeElement));check('Search focus, Tab cycling, Escape and focus return');
 await open();await page.locator('#filter-toggle').click();await page.waitForTimeout(320);
 for(const [key,selector,values]of [['era','#era-filter',timeline.eraOrder],['person','#person-filter',people.map(p=>p.id)],['category','#category-filter',timeline.categoryOrder]]){
  for(const value of values){
   await page.locator(selector).selectOption(value);
   const expected=events.filter(e=>key==='person'?e.people.includes(value):key==='category'?e.categories.includes(value):e.era===value).map(e=>e.id);
   assert.deepEqual(await ids(),expected,key+' '+value);
   assert.equal(new URL(page.url()).searchParams.get(key),value);
  }
  await page.locator(selector).selectOption('');
  check('Every '+key+' filter matches the complete dataset');
 }
 for(const term of ['Close-Up','Cheddar','New York',...people.filter(p=>p.aliases.length).slice(0,5).map(p=>p.aliases[0])]){
  await page.locator('#timeline-search').fill(term);
  assert.deepEqual(await ids(),events.filter(e=>searchable(e).includes(normalize(term))).map(e=>e.id));
 }
 check('Archive title, text, place and alias searches');
 await page.locator('#timeline-search').fill('');
 for(const key of ['importance','certainty']){
  const controls=page.locator('[name='+key+']');
  for(let i=0;i<await controls.count();i++)await controls.nth(i).uncheck();
  assert.equal(await page.locator('.event-card').count(),0);assert.equal(new URL(page.url()).searchParams.get(key),'none');
  for(let i=0;i<await controls.count();i++)await controls.nth(i).check();
 }
 check('Multi-select filters preserve none-selected and all-selected semantics');
 await page.locator('[name=importance][value=minor]').uncheck();
 await page.locator('[name=certainty][value=range]').uncheck();
 const matches=events.filter(e=>e.importance!=='minor'&&e.certainty!=='range');
 assert.deepEqual(await ids(),matches.map(e=>e.id));
 await page.locator('#show-results').click();await page.waitForTimeout(400);
 const query=new URL(page.url()).search;
 const lastChapter=page.locator('#era-nav a').last();const chapter=await lastChapter.getAttribute('data-era-target');
 await lastChapter.click();await page.waitForTimeout(1000);assert.equal(new URL(page.url()).search,query);assert.equal(new URL(page.url()).hash,'#'+chapter);
 check('Chapter jumps preserve filter state');
 await page.locator('.event-actions a').first().click();await page.waitForSelector('.event-header');
 assert.equal(new URL(await page.locator('.event-page-link.next').getAttribute('href'),base).searchParams.get('id'),matches[1].id);
 await page.locator('.event-page-link.next').click();
 assert.equal(new URL(await page.locator('.event-page-link.previous').getAttribute('href'),base).searchParams.get('id'),matches[0].id);
 await page.locator('.event-back').click();await page.waitForSelector('.event-card');assert.deepEqual(await ids(),matches.map(e=>e.id));
 check('Filtered previous/next and return URLs preserve full context');
 await go('timeline.html?importance=none');assert.equal(await page.locator('.event-card').count(),0);
 await go('timeline.html#important-invalid-anchor');assert.equal(await page.locator('.event-card').count(),events.length);
 await page.locator('#expand-all').click();assert.equal(await page.locator('.event-details[data-open=true]').count(),events.length);
 await page.locator('#expand-all').click();assert.equal(await page.locator('.event-details[data-open=true]').count(),0);
 check('Expand/collapse all and direct filter URLs');
 for(const e of events){
  await go('event.html?id='+encodeURIComponent(e.id));
  assert.equal(await page.locator('.event-header h1').textContent(),e.title);
  assert.equal(await page.locator('.event-lede').textContent(),e.summary);
  const renderedParagraphs=await page.locator('.event-prose p').allTextContents();
  const plainProse=(e.details||e.summary).replace(/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g,(_,bold,italic)=>bold??italic);
  assert.equal(renderedParagraphs.join('\n\n'),plainProse);
  if(e.id==='gage-confession')assert.equal(await page.locator('.event-prose em').first().textContent(),'The Wiz');
  const captions=await page.locator('.event-gallery figcaption').allTextContents();
  assert.deepEqual(captions,available.filter(m=>m.eventId===e.id).sort((a,b)=>a.order-b.order).map(m=>m.caption));
 }
 check('All 103 full-event pages retain original narratives and associated available media');
 await go('gallery.html');assert.equal(await page.locator('.media-card').count(),available.length);
 const expectedChapters=timeline.eraOrder.filter(era=>available.some(m=>events.find(e=>e.id===m.eventId)?.era===era));
 assert.deepEqual(await page.locator('.gallery-era-heading h2').allTextContents(),expectedChapters);
 assert.equal(await page.locator('.media-info').count(),0);
 const galleryIndexLabels=await page.locator('.media-button').evaluateAll(buttons=>buttons.map(b=>Number(b.dataset.index)));
 assert.deepEqual([...galleryIndexLabels].sort((a,b)=>a-b),available.map((_,i)=>i));
 check('All '+available.length+' available Gallery records grouped by era with photo-first tiles');
 await page.locator('#gallery-filter-details summary').click();
 assert.ok(await page.locator('#gallery-reset').isVisible());
 for(const [key,selector,values]of [['era','#gallery-era',timeline.eraOrder],['person','#gallery-person',people.map(p=>p.id)],['event','#gallery-event',[...new Set(available.map(m=>m.eventId))]],['type','#gallery-type',['image','video']]]){
  for(const value of values){
   await page.locator(selector).selectOption(value);
   const expected=available.filter(m=>key==='era'?events.find(e=>e.id===m.eventId)?.era===value:key==='person'?m.people.includes(value):key==='event'?m.eventId===value:m.type===value);
   assert.equal(await page.locator('.media-card').count(),expected.length,key+' '+value);
  }
  await page.locator(selector).selectOption('');check('Every Gallery '+key+' filter matches original associations');
 }
 await page.locator('#gallery-sort').selectOption('newest');
 assert.deepEqual(await page.locator('.gallery-era-heading h2').allTextContents(),[...expectedChapters].reverse());
 await page.reload();await page.waitForSelector('.media-card');assert.equal(await page.locator('#gallery-sort').inputValue(),'newest');
 assert.ok(await page.locator('#gallery-filter-details').evaluate(e=>e.open));check('Gallery sorting, chapter order and URL restoration');
 await page.locator('#gallery-reset').click();await page.locator('.media-button').first().click();
 assert.ok(await page.locator('#lightbox-caption').textContent());
 assert.ok((await page.locator('#lightbox-meta').textContent()).includes(' · '));
 assert.ok(await page.locator('.site-header').evaluate(e=>e.inert));
 await page.keyboard.press('ArrowRight');assert.ok((await page.locator('#lightbox-position').textContent()).startsWith('2 '));
 await page.keyboard.press('End');assert.ok((await page.locator('#lightbox-position').textContent()).startsWith('114 '));
 await page.keyboard.press('Home');await page.keyboard.press('Escape');
 assert.ok(await page.locator('#lightbox').evaluate(e=>e.hidden));
 assert.ok(!await page.locator('.site-header').evaluate(e=>e.inert));assert.ok(await page.locator('.media-button').first().evaluate(e=>e===document.activeElement));
 check('Gallery viewer arrows, Home/End, Escape, background isolation and focus restoration');
 await page.locator('#gallery-filter-details summary').click();
 await page.locator('#gallery-type').selectOption('video');
 for(let i=0;i<await page.locator('.media-button').count();i++){
  await page.locator('.media-button').nth(i).click();
  const result=await page.locator('#lightbox video').evaluate(async v=>{
   v.muted=true;
   try{
    await Promise.race([v.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('play timeout')),10000))]);
    await new Promise(r=>setTimeout(r,180));return {src:v.currentSrc,ok:v.currentTime>0&&v.videoWidth>0,width:v.videoWidth};
   }catch(e){return {src:v.currentSrc,ok:false,error:e.message,code:v.error?.code};}
  });
  playback.push(result);assert.ok(result.ok,JSON.stringify(result));
  await page.keyboard.press('Escape');
 }
 check('All '+media.filter(m=>m.available!==false&&m.type==='video').length+' original videos decode and play in Chrome');
 await go('tools/media-manager.html');await page.waitForFunction(()=>!document.querySelector('#manager-download').disabled);
 const download=async()=>{const pending=page.waitForEvent('download');await page.locator('#manager-download').click();const d=await pending;return JSON.parse(fs.readFileSync(await d.path(),'utf8'));};
 assert.deepEqual(await download(),manifest);check('Unedited Media Manager export preserves every original field and record');
 const first=media[0],second=media[1];
 await page.locator('#manager-existing').selectOption(first.id);
 await page.locator('#manager-edit-caption').fill('Regression test caption');
 page.once('dialog',d=>d.dismiss());await page.locator('#manager-existing').selectOption(second.id);
 assert.equal(await page.locator('#manager-existing').inputValue(),first.id);assert.equal(await page.locator('#manager-edit-caption').inputValue(),'Regression test caption');
 let message='';page.once('dialog',async d=>{message=d.message();await d.accept();});await page.locator('#manager-download').click();assert.match(message,/pending form/);
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
 check('Unfinished edits block export, warn on record switch and activate leave protection');
 await page.locator('#manager-save-edit').click();
 const edited=await download();const expected=structuredClone(manifest);expected.media[0].caption='Regression test caption';assert.deepEqual(edited,expected);
 check('Saving one caption changes only that field in export');
 await page.route('**/data/media.json',route=>route.fulfill({json:{...manifest,revision:'changed-elsewhere'}}));
 page.once('dialog',async d=>{message=d.message();await d.accept();});await page.locator('#manager-download').click();assert.match(message,/manifest changed/);
 await page.unroute('**/data/media.json');check('Stale repository manifest blocks unsafe export');
 page.once('dialog',d=>d.accept());await page.locator('#manager-reset-edits').click();assert.deepEqual(await download(),manifest);
 await page.locator('#manager-people-picker summary').click();
 await page.locator('#manager-people-picker [data-people-search]').fill('zzzz-no-person');
 assert.equal(await page.locator('#manager-people-picker .person-option:visible').count(),0);
 assert.ok(await page.locator('#manager-people-picker [data-people-empty]').isVisible());
 await page.locator('#manager-people-picker [data-people-search]').press('Escape');
 assert.equal(await page.locator('#manager-people-picker .person-option:visible').count(),people.length);
 await page.locator('#manager-people-picker summary').click();check('Consolidated people picker retains filtering, empty state and Escape');
 const image=available.find(m=>m.type==='image');const imageBytes=fs.readFileSync(path.join(root,image.path||'assets/media/'+image.file));
 await page.locator('#manager-files').setInputFiles({name:'regression-only.jpg',mimeType:'image/jpeg',buffer:imageBytes});
 await page.locator('#manager-event').selectOption(events[0].id);await page.locator('#manager-add').click();
 const added=await download();assert.deepEqual(added.media.slice(0,media.length),media);assert.equal(added.media.length,media.length+1);
 page.once('dialog',d=>d.accept());await page.locator('#manager-clear').click();await download();
 check('Adding and clearing media preserves all pre-existing records');
 await go('tools/media-diagnostics.html');await page.waitForFunction(()=>document.querySelector('#diag-summary').textContent.includes('manifest mismatches'));
 check('Diagnostics rows and summary agree',!(await page.locator('#diag-summary').textContent()).includes('failed')&&await page.locator('#diag-list .manager-record').count()===media.length);
 const rowMismatches=await page.locator('#diag-list').evaluate(e=>[...e.querySelectorAll('.manager-record')].filter(r=>r.textContent.includes('manifest mismatch')).length);
 assert.ok((await page.locator('#diag-summary').textContent()).includes(rowMismatches+' manifest mismatches'));
 const sizes=[{width:320,height:740},{width:390,height:844},{width:768,height:1024},{width:1440,height:1000},{width:844,height:390}];
 for(const size of sizes){
  await page.setViewportSize(size);
  for(const theme of ['dark','light']){
   await page.evaluate(t=>localStorage.setItem('ms-theme',t),theme);
   for(const url of ['index.html','timeline.html','gallery.html','event.html?id=saint-johns-model-un-2024','tools/media-manager.html','tools/media-diagnostics.html']){
    await go(url);await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),url+' overflow '+JSON.stringify(size)+' '+theme);
    if(url==='timeline.html'){
     await open();let r=await page.locator('#search-panel').boundingBox();
     assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=size.width+1&&r.y+r.height<=size.height+1,'search bounds');
     await page.locator('#filter-toggle').click();await page.waitForTimeout(320);
     await page.locator('#reset-filters').scrollIntoViewIfNeeded();assert.ok(await page.locator('#reset-filters').isVisible());await close();
    }
    if(url==='gallery.html'){
     await page.locator('#gallery-filter-details summary').click();
     await page.locator('#gallery-reset').scrollIntoViewIfNeeded();
     assert.ok(await page.locator('#gallery-reset').isVisible());
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'gallery expanded-filter overflow');
    }
   }
  }
 }
 check('60 page/theme/portrait/landscape layouts without horizontal overflow; complete filters reachable');
 await page.setViewportSize({width:390,height:420});await go('timeline.html');await open();
 assert.ok((await page.locator('.search-panel-scroll').boundingBox()).height>40);await close();check('Short mobile viewport keeps search input and scrollable results reachable');
 await page.emulateMedia({reducedMotion:'reduce'});await go('timeline.html');
 const prompt=await page.locator('#search-prompt').textContent();await page.waitForTimeout(3700);assert.equal(await page.locator('#search-prompt').textContent(),prompt);await open();await close();check('Reduced motion stops rotating prompts and retains search');
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const [device,size]of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})){
  await page.setViewportSize(size);
  for(const theme of ['dark','light']){
   await page.evaluate(t=>localStorage.setItem('ms-theme',t),theme);
   for(const url of ['index.html','timeline.html','gallery.html','event.html?id=graduation','tools/media-manager.html']){
    await go(url);await page.waitForTimeout(700);
    const name=url.split(/[.?/]/).filter(Boolean).at(-1);
    await page.screenshot({path:path.join(output,device+'-'+theme+'-'+url.split(/[.?]/)[0].replace('/','-')+'.png')});
    if(url==='timeline.html'){await open();await page.screenshot({path:path.join(output,device+'-'+theme+'-timeline-expanded.png')});await close();}
   }
  }
 }
 await page.addInitScript(()=>{Element.prototype.animate=()=>{throw Error('simulated animation failure')};window.IntersectionObserver=undefined;});
 await go('timeline.html');await open();await close();assert.equal(await page.locator('.event-card').first().evaluate(e=>getComputedStyle(e).opacity),'1');check('Animation failure leaves content and search functional');
 assert.deepEqual(errors,[]);check('No uncaught JavaScript errors');
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({browser:await browser.version(),checks,playback,layoutCases:60,errors},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

