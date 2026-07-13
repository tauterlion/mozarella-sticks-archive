
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('#gallery-root');
  try {
    const data = await MSArchive.loadAll();
    const available = await MSArchive.availableMedia(data.media);
    const search = document.querySelector('#gallery-search');
    const eraFilter = document.querySelector('#gallery-era');
    const personFilter = document.querySelector('#gallery-person');
    const eventFilter = document.querySelector('#gallery-event');
    const lightbox = document.querySelector('#lightbox');
    let visibleItems = [];
    let currentIndex = 0;

    MSArchive.setOptions(eraFilter, data.eraOrder);
    MSArchive.setOptions(personFilter, data.people, p => p.id, p => `${p.displayName}${p.status === 'Connected Person' ? ' · Connected' : ''}`);
    MSArchive.setOptions(eventFilter, data.events.filter(event => available.some(item => item.eventId === event.id)), e => e.id, e => e.title);

    const params = new URLSearchParams(location.search);
    eventFilter.value = params.get('event') || '';
    personFilter.value = params.get('person') || '';
    eraFilter.value = params.get('era') || '';

    const render = () => {
      const query = MSArchive.normalize(search.value.trim());
      visibleItems = available.filter(item => {
        const event = data.eventsById[item.eventId];
        const text = MSArchive.normalize([item.caption, event?.title, event?.dateLabel, ...item.people.map(id => MSArchive.personSearchText(id, data))].join(' '));
        if (query && !text.includes(query)) return false;
        if (eraFilter.value && item.era !== eraFilter.value) return false;
        if (personFilter.value && !item.people.includes(personFilter.value)) return false;
        if (eventFilter.value && item.eventId !== eventFilter.value) return false;
        return true;
      });
      document.querySelector('#gallery-count').textContent = visibleItems.length;
      if (!available.length) {
        root.innerHTML = '<div class="empty-state gallery-empty"><strong>No image files have been added yet.</strong>Rename approved photos to match entries in <code>data/media.json</code>, place them in <code>assets/images/</code>, and they will appear automatically.</div>';
      } else if (!visibleItems.length) {
        root.innerHTML = '<div class="empty-state"><strong>No images match those filters.</strong>Try resetting the gallery filters.</div>';
      } else {
        root.innerHTML = visibleItems.map((item, index) => {
          const event = data.eventsById[item.eventId];
          return `<article class="media-card"><button class="media-button" type="button" data-index="${index}"><img src="assets/images/${encodeURIComponent(item.file)}" alt="${MSArchive.escapeHtml(item.caption)}" loading="lazy"></button><div class="media-info"><p>${MSArchive.escapeHtml(item.caption)}</p><a class="media-event" href="event.html?id=${encodeURIComponent(item.eventId)}">${MSArchive.escapeHtml(event.title)} · ${MSArchive.escapeHtml(event.dateLabel)}</a></div></article>`;
        }).join('');
      }
      root.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', () => openLightbox(Number(button.dataset.index))));
    };

    const openLightbox = index => {
      currentIndex = index;
      const item = visibleItems[currentIndex];
      document.querySelector('#lightbox-image').src = `assets/images/${item.file}`;
      document.querySelector('#lightbox-image').alt = item.caption;
      document.querySelector('#lightbox-caption').textContent = item.caption;
      document.querySelector('#lightbox-event-link').href = `event.html?id=${encodeURIComponent(item.eventId)}`;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      document.querySelector('.lightbox-close').focus();
    };
    const closeLightbox = () => { lightbox.hidden = true; document.body.style.overflow = ''; };
    const move = delta => { if (!visibleItems.length) return; openLightbox((currentIndex + delta + visibleItems.length) % visibleItems.length); };
    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-prev').addEventListener('click', () => move(-1));
    document.querySelector('.lightbox-next').addEventListener('click', () => move(1));
    lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', event => {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    });

    [search, eraFilter, personFilter, eventFilter].forEach(control => control.addEventListener(control === search ? 'input' : 'change', render));
    document.querySelector('#gallery-reset').addEventListener('click', () => { search.value = ''; eraFilter.value = ''; personFilter.value = ''; eventFilter.value = ''; render(); });
    render();
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
