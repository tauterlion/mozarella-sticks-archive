(function eventGalleryModule() {
  'use strict';
  const MS = window.MSArchive;
  const escape = MS.escapeHtml;
  const FEATURE_LIMIT = 5;
  const EXPAND_AFTER = 8;
  const BATCH_SIZE = 24;

  MS.mountEventGallery = (mount, media, data) => {
    if (!mount || !media.length) return;
    let expanded = false;
    let activeFilter = 'all';
    let displayed = BATCH_SIZE;
    let currentIndex = 0;
    let viewerItems = media;
    let lastOpener = null;
    let previousOverflow = '';
    let startTouch = null;

    const photoCount = media.filter(item => item.type === 'image').length;
    const videoCount = media.length - photoCount;
    const word = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
    const countLabel = word(media.length, 'memory', 'memories');
    const featured = [
      ...media.filter(item => item.featured === true),
      ...media.filter(item => item.featured !== true)
    ].slice(0, media.length > EXPAND_AFTER ? FEATURE_LIMIT : media.length);
    const indexFor = item => media.indexOf(item);
    const currentFilterItems = () => activeFilter === 'all'
      ? media
      : media.filter(item => item.type === (activeFilter === 'photos' ? 'image' : 'video'));

    const cardMarkup = (item, featuredCard = false) => {
      const index = indexFor(item);
      const isVideo = item.type === 'video';
      const visual = isVideo
        ? (item.posterUrl
          ? `<img src="${escape(item.posterUrl)}" alt="" loading="lazy" decoding="async">`
          : '<span class="event-memory-placeholder" aria-hidden="true">Video</span>')
        : `<img src="${escape(item.url)}" alt="" loading="lazy" decoding="async">`;
      return `<button type="button" class="event-memory-card${isVideo ? ' is-video' : ''}${featuredCard ? ' is-featured' : ''}" data-memory-index="${index}"
        aria-label="View ${isVideo ? 'video' : 'photo'}: ${escape(item.caption)}">
          ${visual}
          ${isVideo ? '<span class="event-memory-play" aria-hidden="true">▶</span>' : ''}
          <span class="event-memory-caption">${escape(item.caption)}</span>
        </button>`;
    };

    const filterButton = (value, label, count) =>
      `<button type="button" class="event-media-filter${value === 'all' ? ' is-active' : ''}" data-media-filter="${value}" aria-pressed="${value === 'all'}">${label} <span>${count}</span></button>`;

    mount.innerHTML = `
      <header class="event-media-heading">
        <div>
          <p class="eyebrow">Captured memories</p>
          <h2 id="event-media-title">Photos &amp; videos</h2>
        </div>
        <span class="event-media-total">${countLabel}</span>
      </header>
      <div class="event-media-preview${media.length <= EXPAND_AFTER ? ' is-compact' : ''}${featured.length === 1 ? ' is-single' : ''}" data-media-preview>
        ${featured.map(item => cardMarkup(item, true)).join('')}
      </div>
      <div class="event-media-expand" data-media-expand-wrap${media.length <= EXPAND_AFTER ? ' hidden' : ''}>
        <button class="event-media-expand-button" type="button" data-media-expand aria-expanded="false">
          Explore all ${countLabel} <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div class="event-media-expanded" data-media-expanded hidden>
        <div class="event-media-tools">
          <div class="event-media-filters" role="group" aria-label="Filter event media">
            ${filterButton('all', 'All', media.length)}
            ${filterButton('photos', 'Photos', photoCount)}
            ${filterButton('videos', 'Videos', videoCount)}
          </div>
          <button type="button" class="event-media-collapse" data-media-collapse>Show highlights ↑</button>
        </div>
        <div class="event-media-grid" data-media-grid></div>
        <p class="event-media-progress" role="status" aria-live="polite" data-media-progress></p>
        <div class="event-media-load-wrap">
          <button type="button" class="event-media-load" data-media-load hidden>Load more memories</button>
        </div>
      </div>
      <dialog class="event-media-viewer" aria-label="Memory viewer" data-media-viewer>
        <div class="event-viewer-top">
          <span data-viewer-position></span>
          <button type="button" class="event-viewer-close" data-viewer-close aria-label="Close memory viewer">Close <span aria-hidden="true">×</span></button>
        </div>
        <div class="event-viewer-frame">
          <button type="button" class="event-viewer-arrow event-viewer-prev" data-viewer-prev aria-label="Previous memory">‹</button>
          <div class="event-viewer-stage" data-viewer-stage></div>
          <button type="button" class="event-viewer-arrow event-viewer-next" data-viewer-next aria-label="Next memory">›</button>
        </div>
        <div class="event-viewer-info">
          <p class="event-viewer-caption" data-viewer-caption></p>
          <p class="event-viewer-people" data-viewer-people hidden></p>
        </div>
      </dialog>`;

    const preview = mount.querySelector('[data-media-preview]');
    const expandedArea = mount.querySelector('[data-media-expanded]');
    const expandWrap = mount.querySelector('[data-media-expand-wrap]');
    const expandButton = mount.querySelector('[data-media-expand]');
    const grid = mount.querySelector('[data-media-grid]');
    const status = mount.querySelector('[data-media-progress]');
    const loadButton = mount.querySelector('[data-media-load]');
    const viewer = mount.querySelector('[data-media-viewer]');
    const stage = mount.querySelector('[data-viewer-stage]');
    const viewerCaption = mount.querySelector('[data-viewer-caption]');
    const viewerPeople = mount.querySelector('[data-viewer-people]');
    const viewerPosition = mount.querySelector('[data-viewer-position]');
    const previousButton = mount.querySelector('[data-viewer-prev]');
    const nextButton = mount.querySelector('[data-viewer-next]');
    const closeButton = mount.querySelector('[data-viewer-close]');

    const updateProgress = () => {
      const total = currentFilterItems().length;
      status.textContent = total
        ? `Showing ${Math.min(displayed, total)} of ${word(total, 'memory', 'memories')}`
        : 'No memories match this filter.';
      loadButton.hidden = displayed >= total;
    };

    const renderFiltered = () => {
      const items = currentFilterItems();
      grid.innerHTML = items.length
        ? items.slice(0, displayed).map(item => cardMarkup(item)).join('')
        : '<p class="event-media-empty">No media of this type has been added to this event.</p>';
      updateProgress();
      mount.querySelectorAll('[data-media-filter]').forEach(button => {
        const active = button.dataset.mediaFilter === activeFilter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };

    const clearStage = () => {
      stage.querySelector('video')?.pause();
      stage.replaceChildren();
    };

    const showMemory = index => {
      currentIndex = (index + viewerItems.length) % viewerItems.length;
      const item = viewerItems[currentIndex];
      clearStage();
      if (item.type === 'video') {
        // No video element or source is created until the visitor opens a clip.
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        if (item.posterUrl) video.poster = item.posterUrl;
        const source = document.createElement('source');
        source.src = item.url;
        source.type = MS.mediaMime(item);
        video.append(source);
        stage.append(video);
      } else {
        const image = document.createElement('img');
        image.src = item.url;
        image.alt = item.caption;
        image.decoding = 'async';
        stage.append(image);
      }
      viewerCaption.textContent = item.caption;
      const names = (item.people || []).map(id => MS.personName(id, data));
      viewerPeople.textContent = names.length ? `People: ${names.join(', ')}` : '';
      viewerPeople.hidden = !names.length;
      viewerPosition.textContent = `${currentIndex + 1} / ${viewerItems.length}`;
      previousButton.disabled = viewerItems.length < 2;
      nextButton.disabled = viewerItems.length < 2;
      viewer.setAttribute('aria-label', `${item.caption} — memory ${currentIndex + 1} of ${viewerItems.length}`);
    };

    const openMemory = (index, opener) => {
      const item = media[index];
      if (!item || !viewer.showModal) return;
      viewerItems = expanded ? currentFilterItems() : media;
      const inViewIndex = viewerItems.indexOf(item);
      if (inViewIndex === -1) return;
      lastOpener = opener;
      previousOverflow = document.body.style.overflow;
      showMemory(inViewIndex);
      viewer.showModal();
      document.body.style.overflow = 'hidden';
      closeButton.focus();
    };

    mount.addEventListener('click', event => {
      const mediaButton = event.target.closest('[data-memory-index]');
      if (mediaButton) {
        openMemory(Number(mediaButton.dataset.memoryIndex), mediaButton);
        return;
      }
      if (event.target.closest('[data-media-expand]')) {
        expanded = true;
        preview.hidden = true;
        expandWrap.hidden = true;
        expandedArea.hidden = false;
        expandButton.setAttribute('aria-expanded', 'true');
        displayed = BATCH_SIZE;
        renderFiltered();
        mount.querySelector('[data-media-filter="all"]').focus({preventScroll: true});
        return;
      }
      if (event.target.closest('[data-media-collapse]')) {
        expanded = false;
        expandedArea.hidden = true;
        preview.hidden = false;
        expandWrap.hidden = false;
        expandButton.setAttribute('aria-expanded', 'false');
        expandButton.focus({preventScroll: true});
        return;
      }
      const filter = event.target.closest('[data-media-filter]');
      if (filter) {
        activeFilter = filter.dataset.mediaFilter;
        displayed = BATCH_SIZE;
        renderFiltered();
        return;
      }
      if (event.target.closest('[data-media-load]')) {
        const items = currentFilterItems();
        const next = Math.min(displayed + BATCH_SIZE, items.length);
        grid.insertAdjacentHTML('beforeend', items.slice(displayed, next).map(item => cardMarkup(item)).join(''));
        displayed = next;
        updateProgress();
        if (loadButton.hidden) grid.querySelectorAll('[data-memory-index]')[displayed - 1]?.focus({preventScroll: true});
        return;
      }
      if (event.target.closest('[data-viewer-close]')) viewer.close();
      if (event.target.closest('[data-viewer-prev]')) showMemory(currentIndex - 1);
      if (event.target.closest('[data-viewer-next]')) showMemory(currentIndex + 1);
    });

    viewer.addEventListener('click', event => {
      if (event.target === viewer) viewer.close();
    });
    viewer.addEventListener('close', () => {
      clearStage();
      document.body.style.overflow = previousOverflow;
      if (lastOpener?.isConnected) lastOpener.focus({preventScroll: true});
    });
    viewer.addEventListener('keydown', event => {
      if (event.target.closest('video')) return; // Keep native video keyboard controls.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        showMemory(currentIndex + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    });
    stage.addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || event.target.closest('video')) return;
      startTouch = {x: event.touches[0].clientX, y: event.touches[0].clientY};
    }, {passive: true});
    stage.addEventListener('touchend', event => {
      if (!startTouch || !event.changedTouches.length) return;
      const deltaX = event.changedTouches[0].clientX - startTouch.x;
      const deltaY = event.changedTouches[0].clientY - startTouch.y;
      startTouch = null;
      if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4 && viewerItems.length > 1) {
        showMemory(currentIndex + (deltaX < 0 ? 1 : -1));
      }
    }, {passive: true});
  };
})();
