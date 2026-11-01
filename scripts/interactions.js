
/* Shared motion, search panel, shortcuts and scrolling. All content starts visible. */
(() => {
 const MS = window.MSArchive;
 const reduced = MS.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
 const seen = new WeakSet(), running = new Set(), watched = new Set();
 const animate = (el, frames, duration) => {
  if(reduced.matches || !el?.animate) return null;
  try {
   const animation = el.animate(frames,{duration,easing:'cubic-bezier(.16,1,.3,1)'});
   running.add(animation);animation.finished.catch(()=>{}).finally(()=>running.delete(animation));
   return animation;
  } catch { return null; }
 };

 // All content remains visible even if scripts, animation, or IntersectionObserver fail.
 // Animate individual headings, thumbnails and captions, rather than entire event cards:
 // event filtering, profile carousels and Gallery hover transforms must remain usable.
 const revealTargets = [
  'main h1','main h2','main h3',
  'main img:not(.hero-image)','main video',
  'main .eyebrow','main .event-date','main .event-summary',
  'main .event-media-item figcaption','main .media-caption',
  'main .profile-event-title','main .profile-event-date',
  'main .scrapbook-photo span','main .feature>p:not(.eyebrow)',
  'main .cinema-kicker','main .cinema-rule','main .cinema-tagline',
  'main .cinema-entry-button','main .stat-grid strong'
 ].join(',');
 const skipReveal = el => Boolean(el.closest(
  '.person-card, .lightbox, dialog, [hidden], [aria-hidden="true"]'
 ));
 const observer = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver(entries => {
   for(const {target,isIntersecting} of entries){
    if(!isIntersecting) continue;
    observer.unobserve(target);watched.delete(target);
    if(seen.has(target))continue;seen.add(target);
    const image=target.matches('img,video');
    animate(target,[
     {opacity:image?.32:.18,transform:'translateY(-22px)'},
     {opacity:1,transform:'translateY(0px)'}
    ], image?950:1080);
   }
  },{threshold:.06,rootMargin:'0px 0px -3% 0px'}) : null;
 MS.reveal = (root=document) => {
  if(reduced.matches||!observer)return;
  for(const el of [...watched]){
   if(!el.isConnected){observer.unobserve(el);watched.delete(el);}
  }
  root.querySelectorAll(revealTargets).forEach(el => {
   if(seen.has(el)||watched.has(el)||skipReveal(el))return;
   if(el.matches('h1,h2,h3,.event-date,.event-summary,.profile-event-title,.media-caption'))
    el.classList.add('aoms-motion-drift');
   observer.observe(el);watched.add(el);
  });
 };
 reduced.addEventListener('change',()=>{
  if(reduced.matches){
   observer?.disconnect();running.forEach(a=>a.cancel());
   document.documentElement.style.removeProperty('--aoms-scroll-drift');
  }else MS.reveal();
 });

 // Lazy UI content (timeline cards, Gallery results, profiles) appears after initial load.
 // Observe additions without repeatedly scanning on every individual mutation.
 let scanFrame=0;
 const queueReveal=()=>{
  if(scanFrame)return;
  scanFrame=requestAnimationFrame(()=>{scanFrame=0;MS.reveal();});
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const main=document.querySelector('main');
  if(main&&typeof MutationObserver==='function'){
   const mutations=new MutationObserver(records=>{
    if(records.some(record=>record.addedNodes.length))queueReveal();
   });
   mutations.observe(main,{childList:true,subtree:true});
  }
  MS.reveal();
 });

 // Directional scroll lag: text follows an upward scroll a little more strongly,
 // then returns to its normal position. Purely visual, capped and reduced-motion safe.
 let previousY=window.scrollY, drift=0, desired=0, driftFrame=0;
 const driftTick=()=>{
  drift+=(desired-drift)*.20;
  desired*=.80;
  if(Math.abs(drift)<.06&&Math.abs(desired)<.06){
   drift=0;desired=0;driftFrame=0;
   document.documentElement.style.removeProperty('--aoms-scroll-drift');
   return;
  }
  document.documentElement.style.setProperty('--aoms-scroll-drift',drift.toFixed(2)+'px');
  driftFrame=requestAnimationFrame(driftTick);
 };
 window.addEventListener('scroll',()=>{
  const y=window.scrollY, change=y-previousY;
  previousY=y;
  if(reduced.matches||!change||document.hidden)return;
  desired=Math.max(-18,Math.min(9,desired+change*(change<0?.30:.13)));
  if(!driftFrame)driftFrame=requestAnimationFrame(driftTick);
 },{passive:true});

 MS.setupTimelineSearch = ({data,search,choosePerson}) => {
  const $ = selector => document.querySelector(selector);
  const panel=$('#search-panel'),launch=$('#search-launch'),prompt=$('#search-prompt');
  let restore=false,closing=false,active=[],matches=[],index=0,timer;
  const searchable=data.events.map(e=>MS.eventSearchText(e,data));
  const terms=['Close-Up','Alejandro','Cheddar','New York','Travel',...data.eraOrder]
    .filter(term=>searchable.some(text=>text.includes(MS.normalize(term)))).slice(0,7);
  const promptText=()=>{prompt.textContent=search.value.trim()?'Search: '+search.value.trim():active.length?'Search · '+active.length+' filters':'Search “'+(terms[index]||'the archive')+'”';};
  const stop=()=>{clearInterval(timer);timer=null;};
  const rotate=()=>{
   stop();promptText();
   if(reduced.matches||panel.open||document.hidden||active.length)return;
   timer=setInterval(()=>{index=(index+1)%terms.length;promptText();animate(prompt,[{opacity:.3,transform:'translateY(4px)'},{opacity:1,transform:'none'}],280);},3500);
  };
  const open=()=>{
   if(panel.open||closing||restore)return;
   stop();panel.showModal();document.body.style.overflow='hidden';
   document.body.classList.add('search-is-open');launch.setAttribute('aria-expanded','true');
   animate(panel,[{opacity:.2,transform:'translateY(22px) scale(.96)'},{opacity:1,transform:'none'}],280);
   search.focus({preventScroll:true});
  };
  const close=async(showResults=false)=>{
   if(!panel.open||closing)return;closing=true;
   const motion=animate(panel,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(16px) scale(.97)'}],160);
   if(motion)await Promise.race([motion.finished.catch(()=>{}),new Promise(r=>setTimeout(r,220))]);
   restore=true;panel.close();document.body.style.overflow='';document.body.classList.remove('search-is-open');
   launch.setAttribute('aria-expanded','false');closing=false;
   const target=showResults?$('#timeline-root'):launch;
   target.focus({preventScroll:true});
   if(showResults)target.scrollIntoView({block:'start',behavior:reduced.matches?'instant':'smooth'});
   setTimeout(()=>restore=false,0);rotate();
  };
  launch.addEventListener('click',open);launch.addEventListener('focus',open);
  $('#search-close').addEventListener('click',()=>close());
  $('#show-results').addEventListener('click',()=>close(true));
  search.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();close(true);}});
  panel.addEventListener('cancel',e=>{e.preventDefault();close();});
  panel.addEventListener('click',e=>{if(e.target!==panel)return;const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
  panel.addEventListener('keydown',e=>{
   if(e.key!=='Tab')return;
   const items=[...panel.querySelectorAll('button,input,select,a[href]')].filter(el=>!el.disabled&&!el.closest('[inert]')&&el.getClientRects().length);
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  $('#search-people').addEventListener('click',e=>{const b=e.target.closest('[data-search-person]');if(b){choosePerson(b.dataset.searchPerson);search.focus();}});
  document.addEventListener('visibilitychange',rotate);reduced.addEventListener('change',rotate);
  const viewport=()=>{
   const v=window.visualViewport;
   document.documentElement.style.setProperty('--visual-height',(v?.height||innerHeight)+'px');
   document.documentElement.style.setProperty('--keyboard-inset',Math.max(0,innerHeight-(v?v.height+v.offsetTop:innerHeight))+'px');
  };
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
  window.addEventListener('resize',viewport);viewport();
  MS.openSearch=open;
  return {update(items,timelineUrl,filters){
   matches=items;active=filters;
   $('#search-total').textContent=items.length;
   launch.setAttribute('aria-label','Search and filter the archive. '+items.length+' matching events');
   $('#search-status').textContent=items.length+' matching events · Oldest first';
   $('#show-results').textContent='View '+items.length+' events →';
   $('#search-matches').innerHTML=items.slice(0,5).map(e=>'<a class="search-match" href="event.html?id='+encodeURIComponent(e.id)+'&amp;from='+encodeURIComponent(timelineUrl(e.id))+'"><small>'+MS.escapeHtml(e.dateLabel)+'</small><strong>'+MS.highlightText(e.title,search.value)+'</strong></a>').join('')||'<p class="empty-state">No matching events.</p>';
   const query=MS.normalize(search.value.trim());
   $('#search-people').innerHTML=query.length>1?data.people.filter(p=>MS.normalize([p.displayName,...p.aliases].join(' ')).includes(query)).slice(0,3).map(p=>'<button data-search-person="'+MS.escapeHtml(p.id)+'">'+MS.escapeHtml(p.displayName)+' ↗</button>').join(''):'';
   rotate();
  }};
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const header=document.querySelector('.site-header');
  const measure=()=>document.documentElement.style.setProperty('--header-height',(header?.getBoundingClientRect().height||0)+'px');
  if(header&&typeof ResizeObserver==='function')new ResizeObserver(measure).observe(header);
  window.addEventListener('resize',measure);measure();
  const button=document.createElement('button');button.className='back-to-top';button.hidden=true;
  button.setAttribute('aria-label','Back to top');button.innerHTML='<span aria-hidden="true">↑</span><span>Top</span>';document.body.append(button);
  button.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'}));
  window.addEventListener('scroll',()=>button.hidden=scrollY<650,{passive:true});
  let shortcuts=true;try{shortcuts=localStorage.getItem('ms-shortcuts')!=='off';}catch{}
  const footer=document.querySelector('.site-footer');
  if(footer){
   const label=document.createElement('label');label.className='shortcuts-control';
   label.innerHTML='<input type="checkbox"> Keyboard shortcuts';const input=label.querySelector('input');input.checked=shortcuts;
   input.addEventListener('change',()=>{shortcuts=input.checked;try{localStorage.setItem('ms-shortcuts',shortcuts?'on':'off');}catch{}});
   footer.append(label);
  }
  document.addEventListener('keydown',e=>{
   if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||!shortcuts)return;
   if(document.querySelector('dialog[open]')||document.querySelector('#lightbox:not([hidden])'))return;
   const gallerySearch=document.querySelector('#gallery-search');
   if(e.key==='Escape'&&gallerySearch?.value&&(e.target===gallerySearch||!e.target.closest('input,textarea,select,[contenteditable=true]'))){
    e.preventDefault();gallerySearch.value='';gallerySearch.dispatchEvent(new Event('input',{bubbles:true}));gallerySearch.focus();return;
   }
   if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;
   const search=document.querySelector('#timeline-search,#gallery-search');
   if(e.key==='/'&&search){e.preventDefault();MS.openSearch?.();search.focus();search.select();}
   if(e.key.toLowerCase()==='f'&&MS.openSearch){e.preventDefault();MS.openSearch();const toggle=document.querySelector('#filter-toggle');if(toggle.getAttribute('aria-expanded')!=='true')toggle.click();toggle.focus();}
   if(e.key.toLowerCase()==='t'&&!button.hidden){e.preventDefault();button.click();}
  });
  MS.reveal();
 });
})();
