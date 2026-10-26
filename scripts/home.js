
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await MSArchive.loadAll();
    document.querySelector('#event-stat').textContent = data.events.length;
    document.querySelector('#era-stat').textContent = data.eraOrder.length;
    document.querySelector('#people-stat').textContent = data.people.length;
    const available = await MSArchive.availableMedia(data.media);
    document.querySelector('#media-stat').textContent = available.length;
    const ordered = MSArchive.orderedEvents(data.events);
    const first = ordered[0];
    const last = ordered.at(-1);
    document.querySelector('#archive-range').textContent = `${first.dateLabel} → ${last.dateLabel}`;
    document.querySelector('#latest-event').classList.remove('skeleton');
    document.querySelector('#latest-event').innerHTML = `
      <div class="latest-date">${MSArchive.escapeHtml(last.dateLabel)}</div>
      <div><h3>${MSArchive.escapeHtml(last.title)}</h3><p>${MSArchive.escapeHtml(last.summary)}</p></div>
      <a class="button secondary" href="event.html?id=${encodeURIComponent(last.id)}">Open event</a>`;
    const escape = MSArchive.escapeHtml;
    const hero = available.find(item => item.id === 'statue-groupphoto') || available.find(item => item.type === 'image');
    if(hero) document.querySelector('#hero-photo').innerHTML = '<a href="event.html?id='+encodeURIComponent(hero.eventId)+'"><img src="'+escape(hero.url)+'" alt="'+escape(hero.caption)+'" fetchpriority="high"></a><figcaption>'+escape(hero.caption)+'</figcaption>';
    document.querySelector('#featured-events').innerHTML = ['cheddar-becomes-mascot','graduation','nico-todd-peru-trip'].map(id => data.eventsById[id]).filter(Boolean).map(event => {
      const image = available.find(item => item.eventId === event.id && item.type === 'image');
      const href = 'event.html?id='+encodeURIComponent(event.id);
      return '<article class="feature">'+(image?'<a class="feature-image" href="'+href+'">'+MSArchive.mediaPreviewMarkup(image)+'</a>':'')+'<p class="eyebrow">'+escape(event.dateLabel)+'</p><h3><a href="'+href+'">'+escape(event.title)+'</a></h3><p>'+escape(event.summary)+'</p><a class="text-link" href="'+href+'">Read event →</a></article>';
    }).join('');
    const photographs = ['todd-shane-sunset','beach-party-everyone','kate-lorena-victory','group-picture-kamilos-birthday'].map(id=>available.find(item=>item.id===id)).filter(Boolean);
    document.querySelector('#home-photographs').innerHTML = photographs.map(item=>'<a class="scrapbook-photo" href="gallery.html?event='+encodeURIComponent(item.eventId)+'">'+MSArchive.mediaPreviewMarkup(item)+'<span>'+escape(item.caption)+'</span></a>').join('');
    MSArchive.reveal();
  } catch (error) {
    document.querySelector('#latest-event').innerHTML = MSArchive.errorMarkup(error);
  }
});
