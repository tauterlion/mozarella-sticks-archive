document.addEventListener('DOMContentLoaded',async()=>{
 const MS=MSArchive,root=document.querySelector('#person-root'),esc=MS.escapeHtml;
 try{
  const data=await MS.loadAll(),id=new URLSearchParams(location.search).get('id'),person=data.peopleById[id];
  if(!person){root.innerHTML='<div class="empty-state"><h1>Person not found</h1><p>Choose someone from the People directory.</p></div>';return;}
  document.title=`${person.fullName} · Mozarella Sticks Archive`;
  document.querySelector('#back-to-people').href=`people.html?person=${encodeURIComponent(id)}`;
  MS.applyPeoplePalette(document.body,person);
  const aliases=[...new Set([person.displayName,...person.aliases])].filter(a=>MS.normalize(a)!==MS.normalize(person.fullName));
  root.innerHTML=`<section class="profile-hero" aria-labelledby="person-name"><div id="profile-portrait"></div><div class="profile-copy"><h1 id="person-name">${esc(person.fullName)}</h1><p class="profile-status">${esc(MS.peopleStatus(person))}</p><div class="profile-traits">${MS.peopleTags(person)}</div>${person.biography?`<p class="profile-biography">${esc(person.biography)}</p>`:''}</div><aside class="identity-panel" aria-label="Identity"><h2>Identity</h2><dl><dt>Full Name</dt><dd>${esc(person.fullName)}</dd>${aliases.length?`<dt>Also Known As</dt><dd>${aliases.map(esc).join(', ')}</dd>`:''}<dt>Affiliation</dt><dd>Mozarella Sticks</dd></dl></aside></section>
  <section class="profile-section" aria-labelledby="appearances-heading"><div class="profile-section-heading"><h2 id="appearances-heading">In the archive</h2><a class="text-link" href="timeline.html?person=${encodeURIComponent(id)}">View all appearances →</a></div><div class="profile-events" id="profile-events"></div></section>
  <section class="profile-section" aria-labelledby="media-heading"><div class="profile-section-heading"><h2 id="media-heading">Photos & videos</h2><a class="text-link" href="gallery.html?person=${encodeURIComponent(id)}">View all media →</a></div><div class="profile-media" id="profile-media"></div></section>`;
  document.querySelector('#profile-portrait').append(MS.createPortrait(person,{eager:true}));
  const available=await MS.availableMedia(data.media.filter(m=>m.available===true));
  // Stable editorial selection: major entries first, then chronological, ID tie-break.
  const events=data.events.filter(e=>(e.people||[]).includes(id)).sort((a,b)=>(Number(b.importance==='major')-Number(a.importance==='major'))||String(a.sort).localeCompare(String(b.sort))||a.id.localeCompare(b.id)).slice(0,3);
  const eventRoot=document.querySelector('#profile-events');
  for(const event of events){
   const photos=available.filter(m=>m.eventId===event.id&&m.type==='image').sort((a,b)=>Number(b.people.includes(id))-Number(a.people.includes(id))||a.order-b.order);
   const link=document.createElement('a');link.className='profile-event';link.href=`event.html?id=${encodeURIComponent(event.id)}`;link.dataset.event=event.id;
   link.innerHTML=`<span class="event-fallback-icon" aria-hidden="true">✧</span>${photos[0]?`<img src="${esc(photos[0].url)}" alt="${esc(photos[0].caption)}" loading="lazy">`:''}<span class="profile-event-copy"><span class="profile-event-title">${esc(event.title)}</span><span class="profile-event-date">${esc(event.dateLabel)}</span></span><span class="event-arrow" aria-hidden="true">↗</span>`;
   link.querySelector('img')?.addEventListener('error',e=>e.target.remove());eventRoot.append(link);
  }
  if(!events.length)eventRoot.innerHTML='<p class="empty-state">No documented appearances yet.</p>';
  const media=available.filter(m=>m.people.includes(id)),mediaRoot=document.querySelector('#profile-media');
  const viewer=document.querySelector('#person-viewer'),stage=document.querySelector('#person-viewer-stage');let index=0,opener=null;
  const clear=()=>{stage.querySelectorAll('video').forEach(v=>v.pause());stage.replaceChildren();};
  function show(i){
   index=(i+media.length)%media.length;clear();const item=media[index];stage.innerHTML=MS.mediaPreviewMarkup(item,{controls:true});
   stage.querySelector('img,video')?.addEventListener('error',()=>{stage.innerHTML='<p class="empty-state">This media file could not be loaded.</p>';});
   document.querySelector('#person-viewer-caption').textContent=`${index+1} / ${media.length} · ${item.caption}`;
   if(!viewer.open){opener=document.activeElement;viewer.showModal();viewer.querySelector('[data-viewer=close]').focus();}
  }
  media.slice(0,10).forEach((item,i)=>{
   const button=document.createElement('button');button.type='button';button.className='profile-media-item';button.dataset.media=item.id;button.setAttribute('aria-label',`View ${item.type==='video'?'video':'photo'}: ${item.caption}`);
   // Video thumbnails use a poster or an honest play tile, not 10 eager video downloads.
   const thumbnail=item.type==='image'?item.url:item.posterUrl;
   button.innerHTML=`${thumbnail?`<img src="${esc(thumbnail)}" alt="${esc(item.caption)}" loading="lazy">`:''}${item.type==='video'?'<span class="video-indicator" aria-hidden="true">▶</span>':''}<span class="media-caption">${esc(item.caption)}</span>`;
   button.querySelector('img')?.addEventListener('error',e=>e.target.remove());button.addEventListener('click',()=>show(i));mediaRoot.append(button);
  });
  if(!media.length)mediaRoot.innerHTML='<p class="empty-state">No tagged photos or videos yet.</p>';
  viewer.querySelector('[data-viewer=close]').addEventListener('click',()=>viewer.close());
  viewer.querySelector('[data-viewer=previous]').addEventListener('click',()=>show(index-1));viewer.querySelector('[data-viewer=next]').addEventListener('click',()=>show(index+1));
  viewer.addEventListener('close',()=>{clear();opener?.focus();});
  viewer.addEventListener('click',e=>{if(e.target===viewer){const r=viewer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)viewer.close();}});
  viewer.addEventListener('keydown',e=>{if(e.target.closest('video'))return;const actions={ArrowLeft:()=>show(index-1),ArrowRight:()=>show(index+1),Home:()=>show(0),End:()=>show(media.length-1)};if(actions[e.key]){e.preventDefault();actions[e.key]();}});
 }catch(error){root.innerHTML=MS.errorMarkup(error);}
});
