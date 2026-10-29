/* Optional Playwright verification for explicit palettes and uploaded portraits. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),base=process.env.BASE_URL||'http://127.0.0.1:8765/',out=process.env.REVIEW_OUTPUT||path.resolve(root,'../outputs/personalized-palettes');
const expected={lucas:['#153F32','#246D4E','#70B88D'],maria:['#123E50','#1D7185','#4CB0B6'],josie:['#75641B','#B6A13D','#F4DE86'],jeidenne:['#063D73','#007DD8','#15D9F4'],alejandro:['#392056','#643B91','#AA79D1'],libby:['#5A254A','#A64A83','#E9A3CA']};
const people=JSON.parse(fs.readFileSync(path.join(root,'data/people.json'))).people;
const originals=people.filter(p=>fs.existsSync(path.join(root,'assets/portraits',p.id+'.jpg')));
const defaults=[['#67435e','#26394f','#a66e43'],['#745237','#482d49','#40585d'],['#285c60','#344761','#8e625d'],['#704655','#3f375a','#796344']];
const context={window:{MSArchive:{}}};vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/people-shared.js'),'utf8'),context);
const resolve=p=>Array.from(context.window.MSArchive.peoplePalette(p));
for(const p of people)assert.deepEqual(resolve(p),expected[p.id]||defaults[[...p.id].reduce((sum,c)=>sum+c.charCodeAt(0),0)%4]);
for(const palette of [null,[],['#fff','#000','#111'],['#123456','#234567','red'],['#123456','#234567','#345678','#456789'],'#123456'])assert.deepEqual(resolve({id:'lucas',palette}),resolve({id:'lucas'}));
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
 const page=await browser.newPage({viewport:{width:1672,height:941},colorScheme:'dark'}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 const check=s=>{checks.push(s);console.log('PASS '+s);};check('Six exact overrides, all unchanged deterministic defaults, malformed-array fallback');
 const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ')+')';
 const vars=selector=>page.locator(selector).evaluate(n=>[0,1,2].map(i=>getComputedStyle(n).getPropertyValue('--person-color-'+i).trim()));
 for(const theme of ['dark','light'])for(const [device,width,height]of [['desktop',1672,941],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.goto(base+'people.html');await page.evaluate(t=>localStorage.setItem('ms-theme',t),theme);await page.reload();await page.waitForSelector('.person-card[data-selected=true]');await page.waitForTimeout(1000);
  for(const [id,palette]of Object.entries(expected)){
   const before=await page.locator('.ambient i').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));
   await page.locator('#people-search').fill(people.find(p=>p.id===id).fullName);await page.locator('#people-search').press('Enter');
   assert.equal(await page.locator('.person-card[data-selected=true]').getAttribute('data-person'),id);
   await page.waitForTimeout(130);const middle=await page.locator('.ambient i').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));
   await page.waitForTimeout(1000);const after=await page.locator('.ambient i').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));
   assert.deepEqual(after,palette.map(rgb));assert.notDeepEqual(before,after);assert.notDeepEqual(middle,before);assert.notDeepEqual(middle,after);
   assert.deepEqual(await vars('body'),palette);assert.deepEqual(await vars('.person-card[data-selected=true] .person-portrait'),palette);
   assert.ok(await page.locator('.ambient i').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).animationName==='ambient-drift'&&getComputedStyle(n).maskImage!=='none')));
   const outline=await page.locator('.person-card[data-selected=true]').evaluate(n=>({color:getComputedStyle(n).borderTopColor,gold:getComputedStyle(n).getPropertyValue('--gold').trim()}));assert.equal(outline.color,rgb(outline.gold));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.locator('#people-search').blur();await page.screenshot({path:path.join(out,`${id}-${device}-${theme}.png`),fullPage:true});
  }
  check(`Six interpolated palette transitions and screenshots: ${device}, ${theme}`);
  for(const [id,palette]of Object.entries(expected)){
   await page.goto(base+'person.html?id='+id);await page.waitForSelector('#person-name');assert.deepEqual(await vars('body'),palette);assert.deepEqual(await vars('#profile-portrait .person-portrait'),palette);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  check(`Six editorial palette accents and silhouettes: ${device}, ${theme}`);
 }
 
 for(const p of originals)for(const route of ['people.html?person='+p.id,'person.html?id='+p.id]){
  await page.goto(base+route);const selector=route.startsWith('people')?'.person-card[data-selected=true] .person-portrait':'#profile-portrait .person-portrait';await page.waitForSelector(selector+'[data-loaded=true]');assert.ok(await page.locator(selector+' img').evaluate(n=>n.naturalWidth>0));
 }check(`All ${originals.length} uploaded original JPGs load on both pages`);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'people.html');await page.waitForSelector('.person-card[data-selected=true]');
 for(const [id,palette]of Object.entries(expected)){await page.locator('#people-search').fill(people.find(p=>p.id===id).fullName);await page.keyboard.press('Enter');assert.deepEqual(await vars('body'),palette);assert.equal(await page.locator('.ambient i').first().evaluate(n=>getComputedStyle(n).animationName),'none');assert.equal(await page.locator('.ambient i').first().evaluate(n=>getComputedStyle(n).transitionDuration),'0s');}
 check('All six palettes remain functional with reduced motion');assert.deepEqual(errors,[]);check('No JavaScript errors');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,portraits:originals.map(p=>p.id)},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
