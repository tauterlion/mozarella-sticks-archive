document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('#gallery-root');

  try {
    const data = await MSArchive.loadAll();
    const available = await MSArchive.availableMedia(data.media);
    const search = document.querySelector('#gallery-search');
    const eraFilter = document.querySelector('#gallery-era');
    const personFilter = document.querySelector('#gallery-person');
    const eventFilter = document.querySelector('#gallery-event');
    const typeFilter = document.querySelector('#gallery-type');
    const sortSelect = document.querySelector('#gallery-sort');
    const lightbox = document.querySelector('#lightbox');
    const stage = document.querySelector('#lightbox-stage');
    const caption = document.querySelector('#lightbox-caption');
    const eventLink = document.querySelector('#lightbox-event-link');
    const closeButton = document.querySelector('.lightbox-close');
    const previousButton = document.querySelector('.lightbox-prev');
    const nextButton = document.querySelector('.lightbox-next');

    let visibleItems = [];
    let currentIndex = 0;
    let lastFocusedElement = null;

    const clonePeople = value => Array.isArray(value) ? value : [];
    const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const highlightText = (value, rawQuery) => {
      const text = String(value || '');
      const terms = [...new Set(String(rawQuery || '').trim().split(/\s+/).filter(Boolean))]
        .sort((a, b) => b.length - a.length);
      if (!terms.length) return MSArchive.escapeHtml(text);

      const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
      return text.split(pattern).map((part, index) => index % 2
        ? `<mark class="search-highlight">${MSArchive.escapeHtml(part)}</mark>`
        : MSArchive.escapeHtml(part)).join('');
    };

    MSArchive.setOptions(eraFilter, data.eraOrder);
    MSArchive.setOptions(
      personFilter,
      data.people,
      person => person.id,
      person => `${person.displayName}${person.status === 'Connected Person' ? ' · Connected' : ''}`
    );
    MSArchive.setOptions(
      eventFilter,
      [...data.events]
        .filter(event => available.some(item => item.eventId === event.id))
        .sort((a, b) => String(a.sort || '').localeCompare(String(b.sort || ''))),
      event => event.id,
      event => `${event.dateLabel} · ${event.title}`
    );

    const validOptionValue = (select, value, fallback = '') =>
      [...select.options].some(option => option.value === value) ? value : fallback;

    const applyUrlState = () => {
      const params = new URLSearchParams(location.search);
      search.value = params.get('q') || '';
      eraFilter.value = validOptionValue(eraFilter, params.get('era') || '');
      personFilter.value = validOptionValue(personFilter, params.get('person') || '');
      eventFilter.value = validOptionValue(eventFilter, params.get('event') || '');
      typeFilter.value = validOptionValue(typeFilter, params.get('type') || '', '');
      sortSelect.value = validOptionValue(sortSelect, params.get('sort') || 'manifest', 'manifest');
    };

    const syncUrl = () => {
      const params = new URLSearchParams();
      if (search.value.trim()) params.set('q', search.value.trim());
      if (eraFilter.value) params.set('era', eraFilter.value);
      if (personFilter.value) params.set('person', personFilter.value);
      if (eventFilter.value) params.set('event', eventFilter.value);
      if (typeFilter.value) params.set('type', typeFilter.value);
      if (sortSelect.value !== 'manifest') params.set('sort', sortSelect.value);
      history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    };

    applyUrlState();

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

    const manifestOrder = item => Number.isFinite(Number(item.order)) ? Number(item.order) : Number.MAX_SAFE_INTEGER;
    const eventSort = item => String(data.eventsById[item.eventId]?.sort || '');
    const sortItems = items => items.sort((left, right) => {
      if (sortSelect.value === 'newest') {
        return eventSort(right).localeCompare(eventSort(left)) || manifestOrder(left) - manifestOrder(right);
      }
      if (sortSelect.value === 'oldest') {
        return eventSort(left).localeCompare(eventSort(right)) || manifestOrder(left) - manifestOrder(right);
      }
      return manifestOrder(left) - manifestOrder(right);
    });

    const clearStage = () => {
      stage.querySelector('video')?.pause();
      stage.replaceChildren();
    };

    const closeLightbox = ({restoreFocus = true} = {}) => {
      if (lightbox.hidden) return;
      clearStage();
      lightbox.hidden = true;
      document.body.style.overflow = '';
      if (restoreFocus && lastFocusedElement?.isConnected) lastFocusedElement.focus();
    };

    const openLightbox = (index, {preserveOpener = false, preserveViewerFocus = false} = {}) => {
      if (!visibleItems.length) return;
      const viewerFocus = preserveViewerFocus
        && document.activeElement instanceof HTMLElement
        && lightbox.contains(document.activeElement)
        ? document.activeElement
        : null;

      currentIndex = Math.max(0, Math.min(index, visibleItems.length - 1));
      const item = visibleItems[currentIndex];
      if (!preserveOpener && document.activeElement instanceof HTMLElement) {
        lastFocusedElement = document.activeElement;
      }
      clearStage();

      stage.innerHTML = item.type === 'video'
        ? MSArchive.mediaPreviewMarkup(item, {controls: true, autoplay: true})
        : MSArchive.mediaPreviewMarkup(item);

      caption.textContent = item.caption;
      eventLink.href = `event.html?id=${encodeURIComponent(item.eventId)}`;
      lightbox.setAttribute('aria-label', `Media viewer: ${item.caption}`);
      previousButton.setAttribute('aria-label', `Previous media item. ${currentIndex + 1} of ${visibleItems.length}`);
      nextButton.setAttribute('aria-label', `Next media item. ${currentIndex + 1} of ${visibleItems.length}`);
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';

      const focusTarget = viewerFocus?.isConnected ? viewerFocus : closeButton;
      focusTarget.focus();
    };

    const move = delta => {
      if (!visibleItems.length) return;
      openLightbox(
        (currentIndex + delta + visibleItems.length) % visibleItems.length,
        {preserveOpener: true, preserveViewerFocus: true}
      );
    };

    const render = ({syncHistory = true} = {}) => {
      const rawQuery = search.value.trim();
      const query = MSArchive.normalize(rawQuery);

      visibleItems = sortItems(available.filter(item => {
        const event = data.eventsById[item.eventId];
        const people = clonePeople(item.people);
        const text = MSArchive.normalize([
          item.caption,
          item.file,
          item.type,
          event?.title,
          event?.dateLabel,
          event?.era,
          ...people.map(id => MSArchive.personSearchText(id, data))
        ].join(' '));

        if (query && !text.includes(query)) return false;
        if (eraFilter.value && (event?.era || item.era) !== eraFilter.value) return false;
        if (personFilter.value && !people.includes(personFilter.value)) return false;
        if (eventFilter.value && item.eventId !== eventFilter.value) return false;
        if (typeFilter.value && item.type !== typeFilter.value) return false;
        return true;
      }));

      document.querySelector('#gallery-count').textContent = visibleItems.length;
      if (syncHistory) syncUrl();

      if (!available.length) {
        root.innerHTML = '<div class="empty-state gallery-empty"><strong>No media files have been added yet.</strong>Place approved images or MP4 videos in <code>assets/media/</code>, then add a simple record to <code>data/media.json</code>. Missing files remain invisible.</div>';
      } else if (!visibleItems.length) {
        root.innerHTML = '<div class="empty-state"><strong>No media matches those filters.</strong>Try resetting the gallery filters.</div>';
      } else {
        root.innerHTML = visibleItems.map((item, index) => {
          const event = data.eventsById[item.eventId];
          const eventTitle = event?.title || item.eventId;
          const dateLabel = event?.dateLabel || '';
          return `<article class="media-card" data-type="${MSArchive.escapeHtml(item.type)}">
            <button class="media-button" type="button" data-index="${index}" aria-label="Open ${MSArchive.escapeHtml(item.caption)}, item ${index + 1} of ${visibleItems.length}">
              ${cardMediaMarkup(item)}
            </button>
            <div class="media-info">
              <p>${highlightText(item.caption, rawQuery)}</p>
              <a class="media-event" href="event.html?id=${encodeURIComponent(item.eventId)}">${highlightText(eventTitle, rawQuery)}${dateLabel ? ` · ${highlightText(dateLabel, rawQuery)}` : ''}</a>
            </div>
          </article>`;
        }).join('');
      }

      root.querySelectorAll('[data-index]').forEach(button => {
        button.addEventListener('click', () => openLightbox(Number(button.dataset.index)));
      });
    };

    closeButton.addEventListener('click', () => closeLightbox());
    previousButton.addEventListener('click', () => move(-1));
    nextButton.addEventListener('click', () => move(1));
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', event => {
      if (lightbox.hidden) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
        return;
      }

      const keyboardTarget = event.target instanceof Element ? event.target : document.activeElement;
      const usingMediaControls = keyboardTarget instanceof Element
        && Boolean(keyboardTarget.closest('video[controls], audio[controls]'));
      if (usingMediaControls && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        openLightbox(0, {preserveOpener: true, preserveViewerFocus: true});
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        openLightbox(visibleItems.length - 1, {preserveOpener: true, preserveViewerFocus: true});
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...lightbox.querySelectorAll('button:not([disabled]), a[href], video[controls]')]
        .filter(element => !element.hidden && element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    [search, eraFilter, personFilter, eventFilter, typeFilter, sortSelect].forEach(control => {
      control.addEventListener(control === search ? 'input' : 'change', () => {
        closeLightbox({restoreFocus: false});
        render();
      });
    });

    document.querySelector('#gallery-reset').addEventListener('click', () => {
      closeLightbox({restoreFocus: false});
      search.value = '';
      eraFilter.value = '';
      personFilter.value = '';
      eventFilter.value = '';
      typeFilter.value = '';
      sortSelect.value = 'manifest';
      render();
      search.focus();
    });

    window.addEventListener('popstate', () => {
      closeLightbox({restoreFocus: false});
      applyUrlState();
      render({syncHistory: false});
    });

    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      applyUrlState();
      render();
    });

    render();
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
