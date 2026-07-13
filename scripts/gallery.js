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
    const stage = document.querySelector('#lightbox-stage');
    let visibleItems = [];
    let currentIndex = 0;

    MSArchive.setOptions(eraFilter, data.eraOrder);
    MSArchive.setOptions(personFilter, data.people, p => p.id, p => `${p.displayName}${p.status === 'Connected Person' ? ' · Connected' : ''}`);
    MSArchive.setOptions(
      eventFilter,
      data.events.filter(event => available.some(item => item.eventId === event.id)),
      event => event.id,
      event => event.title
    );

    const params = new URLSearchParams(location.search);
    eventFilter.value = params.get('event') || '';
    personFilter.value = params.get('person') || '';
    eraFilter.value = params.get('era') || '';

    const cardMediaMarkup = item => {
      if (item.type === 'video') {
        return `<div class="video-card-preview">
          ${MSArchive.mediaPreviewMarkup(item, {controls: false, muted: true})}
          <span class="play-badge" aria-hidden="true">▶</span>
          <span class="media-type-label">Video</span>
        </div>`;
      }
      return MSArchive.mediaPreviewMarkup(item);
    };

    const render = () => {
      const query = MSArchive.normalize(search.value.trim());

      visibleItems = available.filter(item => {
        const event = data.eventsById[item.eventId];
        const text = MSArchive.normalize([
          item.caption,
          item.type,
          event?.title,
          event?.dateLabel,
          ...item.people.map(id => MSArchive.personSearchText(id, data))
        ].join(' '));

        if (query && !text.includes(query)) return false;
        if (eraFilter.value && item.era !== eraFilter.value) return false;
        if (personFilter.value && !item.people.includes(personFilter.value)) return false;
        if (eventFilter.value && item.eventId !== eventFilter.value) return false;
        return true;
      });

      document.querySelector('#gallery-count').textContent = visibleItems.length;

      if (!available.length) {
        root.innerHTML = '<div class="empty-state gallery-empty"><strong>No media files have been added yet.</strong>Place approved images or MP4 videos in <code>assets/media/</code>, then add a simple record to <code>data/media.json</code>. Missing files remain invisible.</div>';
      } else if (!visibleItems.length) {
        root.innerHTML = '<div class="empty-state"><strong>No media matches those filters.</strong>Try resetting the gallery filters.</div>';
      } else {
        root.innerHTML = visibleItems.map((item, index) => {
          const event = data.eventsById[item.eventId];
          return `<article class="media-card" data-type="${item.type}">
            <button class="media-button" type="button" data-index="${index}" aria-label="Open ${MSArchive.escapeHtml(item.caption)}">
              ${cardMediaMarkup(item)}
            </button>
            <div class="media-info">
              <p>${MSArchive.escapeHtml(item.caption)}</p>
              <a class="media-event" href="event.html?id=${encodeURIComponent(item.eventId)}">${MSArchive.escapeHtml(event.title)} · ${MSArchive.escapeHtml(event.dateLabel)}</a>
            </div>
          </article>`;
        }).join('');
      }

      root.querySelectorAll('[data-index]').forEach(button => {
        button.addEventListener('click', () => openLightbox(Number(button.dataset.index)));
      });
    };

    const clearStage = () => {
      stage.querySelector('video')?.pause();
      stage.replaceChildren();
    };

    const openLightbox = index => {
      currentIndex = index;
      const item = visibleItems[currentIndex];
      clearStage();

      if (item.type === 'video') {
        stage.innerHTML = MSArchive.mediaPreviewMarkup(item, {controls: true, autoplay: true});
      } else {
        stage.innerHTML = MSArchive.mediaPreviewMarkup(item);
      }

      document.querySelector('#lightbox-caption').textContent = item.caption;
      document.querySelector('#lightbox-event-link').href = `event.html?id=${encodeURIComponent(item.eventId)}`;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      document.querySelector('.lightbox-close').focus();
    };

    const closeLightbox = () => {
      clearStage();
      lightbox.hidden = true;
      document.body.style.overflow = '';
    };

    const move = delta => {
      if (!visibleItems.length) return;
      openLightbox((currentIndex + delta + visibleItems.length) % visibleItems.length);
    };

    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-prev').addEventListener('click', () => move(-1));
    document.querySelector('.lightbox-next').addEventListener('click', () => move(1));
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', event => {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    });

    [search, eraFilter, personFilter, eventFilter].forEach(control => {
      control.addEventListener(control === search ? 'input' : 'change', render);
    });

    document.querySelector('#gallery-reset').addEventListener('click', () => {
      search.value = '';
      eraFilter.value = '';
      personFilter.value = '';
      eventFilter.value = '';
      render();
    });

    render();
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
