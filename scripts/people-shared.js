/* Shared profile presentation. Portraits are discovered by stable ID, never registered. */
(() => {
  const MS = window.MSArchive;
  const palettes = [['#67435e','#26394f','#a66e43'],['#745237','#482d49','#40585d'],['#285c60','#344761','#8e625d'],['#704655','#3f375a','#796344']];
  MS.peoplePalette = person => palettes[[...person.id].reduce((n,c)=>n+c.charCodeAt(0),0)%palettes.length];
  MS.applyPeoplePalette = (element, person) => MS.peoplePalette(person).forEach((color,i)=>element.style.setProperty('--person-color-'+i,color));
  MS.portraitPath = person => MS.siteUrl(`assets/portraits/${encodeURIComponent(person.id)}.jpg`);
  MS.createPortrait = (person, {eager=false}={}) => {
    const frame=document.createElement('div'); frame.className='person-portrait';
    MS.applyPeoplePalette(frame,person);
    const fallback=document.createElement('span');fallback.className='portrait-silhouette';fallback.setAttribute('role','img');fallback.setAttribute('aria-label',`Portrait not yet available for ${person.fullName}`);
    const image=document.createElement('img'); image.alt=`Portrait of ${person.fullName}`; image.loading=eager?'eager':'lazy';image.decoding='async';image.hidden=true;
    image.addEventListener('load',()=>{image.hidden=false;fallback.hidden=true;frame.dataset.loaded='true';});
    image.addEventListener('error',()=>{image.hidden=true;fallback.hidden=false;frame.dataset.loaded='false';});
    frame.append(fallback,image);
    // No persistent negative cache: a newly uploaded JPG is retried on every page load.
    frame.load=()=>{if(!image.hasAttribute('src')){image.loading='eager';image.src=MS.portraitPath(person);}};
    if(eager)frame.load();
    return frame;
  };
  MS.peopleStatus = p => `${p.status}${p.isOG?' · OG':''}`;
  MS.peopleTags = (person,limit=Infinity) => {
    const tags=person.knownFor||[];
    const icons=['◇','✧','○'];
    return tags.slice(0,limit).map((tag,i)=>`<span class="people-tag"><span aria-hidden="true">${icons[i%icons.length]}</span> ${MS.escapeHtml(tag)}</span>`).join('')+(tags.length>limit?`<span class="extra-traits" aria-label="${tags.length-limit} more traits">+${tags.length-limit}</span>`:'');
  };
})();
