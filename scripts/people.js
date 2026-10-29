document.addEventListener('DOMContentLoaded',async()=>{
 const MS=MSArchive, track=document.querySelector('#portrait-track'), search=document.querySelector('#people-search'), suggestions=document.querySelector('#people-suggestions');
 try{
  const {people}=await MS.loadJson('people');
  const collator=new Intl.Collator('en',{sensitivity:'base'});
  const groups=Object.fromEntries(['Member','Connected Person'].map(status=>[status,people.filter(p=>p.status===status).sort((a,b)=>collator.compare(a.fullName,b.fullName)||a.id.localeCompare(b.id))]));
  let category='Member',selected=null,matches=[],suggestionIndex=-1;
  const memory={},cards=new Map();
  const closeSuggestions=()=>{suggestions.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');suggestionIndex=-1;};
  for(const person of people){
   const card=document.createElement('button');card.type='button';card.className='person-card';card.dataset.person=person.id;card.tabIndex=-1;
   MS.applyPeoplePalette(card,person);
   const portrait=MS.createPortrait(person);card.append(portrait);
   const identity=document.createElement('span');identity.className='card-identity';identity.innerHTML=`<span class="card-name">${MS.escapeHtml(person.fullName)}</span><span class="card-status">${MS.escapeHtml(MS.peopleStatus(person))}</span><span class="card-traits">${MS.peopleTags(person,2)}</span>`;card.append(identity);
   card.addEventListener('click',()=>selected?.id===person.id?location.assign(profileUrl(person)):select(person));
   cards.set(person.id,{card,portrait});track.append(card);
  }
  const profileUrl=p=>MS.siteUrl(`person.html?id=${encodeURIComponent(p.id)}`);
  function select(person){
   if(!person)return;
   const restoreCardFocus=Boolean(document.activeElement?.closest('.person-card'));
   const changed=selected?.id!==person.id;selected=person;category=person.status;memory[category]=person.id;
   const roster=groups[category],index=roster.indexOf(person);
   for(const p of people){
    const {card,portrait}=cards.get(p.id);const i=roster.indexOf(p);
    let offset=i-index;
    if(offset>roster.length/2)offset-=roster.length;if(offset< -roster.length/2)offset+=roster.length;
    const visible=i>=0&&Math.abs(offset)<=3;
    card.dataset.offset=String(offset);card.dataset.selected=String(p.id===person.id);
    card.style.setProperty('--offset',offset);card.style.setProperty('--distance',Math.abs(offset));
    card.style.zIndex=String(10-Math.abs(offset));card.classList.toggle('outside',!visible);card.inert=!visible;card.tabIndex=p.id===person.id?0:-1;
    card.setAttribute('aria-label',`${p.fullName}, ${MS.peopleStatus(p)}. ${p.id===person.id?'View profile':'Select person'}`);
    if(visible)portrait.load();
   }
   if(restoreCardFocus)cards.get(person.id).card.focus({preventScroll:true});
   MS.applyPeoplePalette(document.body,person);
   document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
   document.querySelector('#view-profile').href=profileUrl(person);
   document.querySelector('#selection-status').textContent=`${person.fullName} · ${index+1} / ${roster.length}`;
   const url=new URL(location.href);url.searchParams.set('person',person.id);history.replaceState(null,'',url);
   if(changed&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const identity=cards.get(person.id).card.querySelector('.card-identity');
    identity.getAnimations().forEach(a=>a.cancel());identity.animate?.([{opacity:.25,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
   }
  }
  const move=delta=>{const roster=groups[category];select(roster[(roster.indexOf(selected)+delta+roster.length)%roster.length]);};
  document.querySelector('.previous').addEventListener('click',()=>move(-1));document.querySelector('.next').addEventListener('click',()=>move(1));
  document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{closeSuggestions();select(people.find(p=>p.id===memory[b.dataset.category])||groups[b.dataset.category][0]);}));
  function choose(person){select(person);closeSuggestions();search.value='';search.focus();}
  search.addEventListener('input',()=>{
   const query=MS.normalize(search.value.trim());matches=query?people.filter(p=>MS.normalize([p.fullName,p.displayName,...p.aliases].join(' ')).includes(query)).sort((a,b)=>Number([b.fullName,b.displayName,...b.aliases].some(n=>MS.normalize(n)===query))-Number([a.fullName,a.displayName,...a.aliases].some(n=>MS.normalize(n)===query))||collator.compare(a.fullName,b.fullName)).slice(0,8):[];
   suggestions.replaceChildren();suggestionIndex=-1;
   if(!query){closeSuggestions();return;}
   for(const [i,p]of matches.entries()){
    const option=document.createElement('div');option.id='person-option-'+i;option.role='option';option.setAttribute('aria-selected','false');option.textContent=`${p.fullName} · ${p.status}`;option.addEventListener('mousedown',e=>e.preventDefault());option.addEventListener('click',()=>choose(p));suggestions.append(option);
   }
   if(!matches.length){const empty=document.createElement('p');empty.textContent='No matching people';suggestions.append(empty);}
   suggestions.hidden=false;search.setAttribute('aria-expanded','true');search.removeAttribute('aria-activedescendant');
  });
  search.addEventListener('keydown',event=>{
   if(event.key==='Escape'){closeSuggestions();return;}
   if(event.key==='Enter'){event.preventDefault();if(!suggestions.hidden&&matches.length)choose(matches[Math.max(0,suggestionIndex)]);return;}
   if(['ArrowDown','ArrowUp'].includes(event.key)&&!suggestions.hidden&&matches.length){event.preventDefault();suggestionIndex=(suggestionIndex+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;suggestions.querySelectorAll('[role=option]').forEach((o,i)=>o.setAttribute('aria-selected',String(i===suggestionIndex)));search.setAttribute('aria-activedescendant','person-option-'+suggestionIndex);document.getElementById('person-option-'+suggestionIndex).scrollIntoView({block:'nearest'});}
  });
  search.addEventListener('blur',closeSuggestions);
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.people-search'))closeSuggestions();});
  document.addEventListener('keydown',event=>{
   if(event.target.closest('input,textarea,select,[contenteditable=true]'))return;
   if(event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}
   if(event.key==='Enter'&&!event.target.closest('button,a'))location.assign(profileUrl(selected));
   if(event.key==='Escape')closeSuggestions();
  });
  let gesture=null,suppressClickUntil=0;const carousel=document.querySelector('.carousel');
  carousel.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;gesture={x:e.clientX,y:e.clientY};});
  carousel.addEventListener('pointerup',e=>{if(!gesture)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4){suppressClickUntil=performance.now()+350;move(dx<0?1:-1);}});
  carousel.addEventListener('pointercancel',()=>{gesture=null;});
  carousel.addEventListener('click',e=>{if(performance.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}},true);
  const restore=()=>select(people.find(p=>p.id===new URLSearchParams(location.search).get('person'))||groups.Member[0]);
  window.addEventListener('popstate',restore);restore();
 }catch(error){document.querySelector('#people-error').innerHTML=MS.errorMarkup(error);}
});
