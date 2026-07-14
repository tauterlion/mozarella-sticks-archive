document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('#timeline-root');

  try {
    const data = await MSArchive.loadAll();
    const availableMedia = await MSArchive.availableMedia(data.media);
    const mediaByEvent = availableMedia.reduce((map, item) => {
      (map[item.eventId] ||= []).push(item);
      return map;
    }, {});

    const search = document.querySelector('#timeline-search');
    const suggestion = document.querySelector('#search-suggestion');
    const searchShell = document.querySelector('.search-oval');
    const eraFilter = document.querySelector('#era-filter');
    const personFilter = document.querySelector('#person-filter');
    const categoryFilter = document.querySelector('#category-filter');
    const importanceChecks = [...document.querySelectorAll('[name="importance"]')];
    const certaintyChecks = [...document.querySelectorAll('[name="certainty"]')];
    const filterToggle = document.querySelector('#filter-toggle');
    const filterDrawer = document.querySelector('#filter-drawer');
    const activeFilterCount = document.querySelector('#active-filter-count');

    MSArchive.setOptions(eraFilter, data.eraOrder);
    MSArchive.setOptions(
      personFilter,
      data.people,
      person => person.id,
      person => `${person.displayName}${person.status === 'Connected Person' ? ' · Connected' : ''}`
    );
    MSArchive.setOptions(categoryFilter, data.categoryOrder);

    const params = new URLSearchParams(location.search);
    search.value = params.get('q') || '';
    eraFilter.value = params.get('era') || '';
    personFilter.value = params.get('person') || '';
    categoryFilter.value = params.get('category') || '';

    if (params.get('importance')) {
      const allowed = new Set(params.get('importance').split(','));
      importanceChecks.forEach(input => input.checked = allowed.has(input.value));
    }

    if (params.get('certainty')) {
      const allowed = new Set(params.get('certainty').split(','));
      certaintyChecks.forEach(input => input.checked = allowed.has(input.value));
    }

    const searchPrompts = [
      'Try “Close-Up”',
      'Try “Model U.N.”',
      'Try “Spirit Week”',
      'Try “France”',
      'Try “Samantha”'
    ];
    let promptIndex = 0;

    const updateSearchState = () => {
      searchShell.classList.toggle('has-value', Boolean(search.value.trim()));
    };

    const rotateSuggestion = () => {
      if (document.hidden || search.value.trim() || document.activeElement === search) return;
      suggestion.classList.remove('swap');
      void suggestion.offsetWidth;
      suggestion.classList.add('swap');
      window.setTimeout(() => {
        promptIndex = (promptIndex + 1) % searchPrompts.length;
        suggestion.textContent = searchPrompts[promptIndex];
      }, 210);
    };

    window.setInterval(rotateSuggestion, 2600);

    const setFilterDrawer = open => {
      filterDrawer.dataset.open = open.toString();
      filterDrawer.setAttribute('aria-hidden', (!open).toString());
      filterDrawer.inert = !open;
      filterToggle.setAttribute('aria-expanded', open.toString());
    };

    filterToggle.addEventListener('click', () => {
      setFilterDrawer(filterToggle.getAttribute('aria-expanded') !== 'true');
    });

    const activePanelFilterCount = () => {
      let count = 0;
      if (eraFilter.value) count += 1;
      if (personFilter.value) count += 1;
      if (categoryFilter.value) count += 1;
      count += 3 - importanceChecks.filter(input => input.checked).length;
      count += 3 - certaintyChecks.filter(input => input.checked).length;
      activeFilterCount.textContent = count;
      activeFilterCount.hidden = count === 0;
    };

    const eventMarkup = (event, media) => {
      const people = event.people
        .map(id => `<a class="chip" href="timeline.html?person=${encodeURIComponent(id)}">${MSArchive.escapeHtml(MSArchive.personName(id, data))}</a>`)
        .join('');
      const categories = event.categories
        .map(category => `<span class="chip">${MSArchive.escapeHtml(category)}</span>`)
        .join('');
      const images = media.slice(0, 2)
        .map(item => {
          if (item.type === 'video') {
            return `<figure class="event-media-item video-item">
              ${MSArchive.mediaPreviewMarkup(item, {controls: true})}
              <figcaption>${MSArchive.escapeHtml(item.caption)}</figcaption>
            </figure>`;
          }
          return `<a class="event-media-item" href="gallery.html?event=${encodeURIComponent(event.id)}">${MSArchive.mediaPreviewMarkup(item)}</a>`;
        })
        .join('');

      return `<article class="event-card" id="${MSArchive.escapeHtml(event.id)}" data-importance="${event.importance}">
        <div class="event-main">
          <div class="event-topline">
            <div class="event-date">${MSArchive.escapeHtml(event.dateLabel)}</div>
            <div class="event-badges">
              <span class="badge ${event.importance}">${MSArchive.importanceLabel(event.importance)}</span>
              <span class="badge ${event.certainty}">${MSArchive.certaintyLabel(event.certainty)}</span>
            </div>
          </div>
          <h3>${MSArchive.escapeHtml(event.title)}</h3>
          <p class="event-summary">${MSArchive.escapeHtml(event.summary)}</p>
          <div class="event-actions">
            <button type="button" data-expand="${event.id}" aria-expanded="false" aria-controls="details-${event.id}">View more</button>
            <a href="event.html?id=${encodeURIComponent(event.id)}">Full event page →</a>
          </div>
        </div>

        <div class="event-details" id="details-${event.id}" data-open="false" aria-hidden="true" inert>
          <div class="event-details-inner">
            <p>${MSArchive.escapeHtml(event.details)}</p>
            <div class="event-meta">
              ${people ? `<div class="meta-row"><span class="meta-label">People</span><div class="chip-list">${people}</div></div>` : ''}
              <div class="meta-row"><span class="meta-label">Tags</span><div class="chip-list">${categories}</div></div>
            </div>
            ${images ? `<div class="event-media">${images}</div>` : ''}
          </div>
        </div>
      </article>`;
    };

    const setPanel = (button, open) => {
      const panel = document.querySelector(`#details-${CSS.escape(button.dataset.expand)}`);
      if (!panel) return;
      panel.dataset.open = open.toString();
      panel.setAttribute('aria-hidden', (!open).toString());
      panel.inert = !open;
      button.textContent = open ? 'Show less' : 'View more';
      button.setAttribute('aria-expanded', open.toString());
    };

    const render = () => {
      const query = MSArchive.normalize(search.value.trim());
      const allowedImportance = new Set(importanceChecks.filter(input => input.checked).map(input => input.value));
      const allowedCertainty = new Set(certaintyChecks.filter(input => input.checked).map(input => input.value));

      const filtered = [...data.events]
        .sort((a, b) => a.sort.localeCompare(b.sort))
        .filter(event => {
          if (query && !MSArchive.eventSearchText(event, data).includes(query)) return false;
          if (eraFilter.value && event.era !== eraFilter.value) return false;
          if (personFilter.value && !event.people.includes(personFilter.value)) return false;
          if (categoryFilter.value && !event.categories.includes(categoryFilter.value)) return false;
          if (!allowedImportance.has(event.importance)) return false;
          if (!allowedCertainty.has(event.certainty)) return false;
          return true;
        });

      document.querySelector('#visible-count').textContent = filtered.length;
      activePanelFilterCount();
      updateSearchState();

      const grouped = data.eraOrder
        .map(era => [era, filtered.filter(event => event.era === era)])
        .filter(([, events]) => events.length);

      document.querySelector('#era-nav').innerHTML = grouped
        .map(([era, events]) => `<a href="#${MSArchive.slug(era)}">${MSArchive.escapeHtml(era)} <span>(${events.length})</span></a>`)
        .join('');

      if (!filtered.length) {
        root.innerHTML = '<div class="empty-state no-results"><strong>No events match those filters.</strong>Try clearing one or more filters.</div>';
      } else {
        root.innerHTML = grouped.map(([era, events]) => `
          <section class="timeline-era" id="${MSArchive.slug(era)}">
            <header class="era-heading">
              <h2>${MSArchive.escapeHtml(era)}</h2>
              <span class="era-count">${events.length} event${events.length === 1 ? '' : 's'}</span>
            </header>
            <div class="event-list">
              ${events.map(event => eventMarkup(event, mediaByEvent[event.id] || [])).join('')}
            </div>
          </section>
        `).join('');
      }

      const nextParams = new URLSearchParams();
      if (search.value.trim()) nextParams.set('q', search.value.trim());
      if (eraFilter.value) nextParams.set('era', eraFilter.value);
      if (personFilter.value) nextParams.set('person', personFilter.value);
      if (categoryFilter.value) nextParams.set('category', categoryFilter.value);
      if (allowedImportance.size !== 3) nextParams.set('importance', [...allowedImportance].join(','));
      if (allowedCertainty.size !== 3) nextParams.set('certainty', [...allowedCertainty].join(','));

      history.replaceState(
        null,
        '',
        `${location.pathname}${nextParams.size ? `?${nextParams}` : ''}${location.hash}`
      );

      root.querySelectorAll('[data-expand]').forEach(button => {
        button.addEventListener('click', () => {
          setPanel(button, button.getAttribute('aria-expanded') !== 'true');
        });
      });

      if (location.hash) {
        requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({block: 'center'}));
      }
    };

    [search, eraFilter, personFilter, categoryFilter, ...importanceChecks, ...certaintyChecks]
      .forEach(control => control.addEventListener(control === search ? 'input' : 'change', render));

    document.querySelector('#reset-filters').addEventListener('click', () => {
      search.value = '';
      eraFilter.value = '';
      personFilter.value = '';
      categoryFilter.value = '';
      [...importanceChecks, ...certaintyChecks].forEach(input => input.checked = true);
      render();
    });

    document.querySelector('#expand-all').addEventListener('click', event => {
      const buttons = [...root.querySelectorAll('[data-expand]')];
      const shouldOpen = buttons.some(button => button.getAttribute('aria-expanded') !== 'true');
      buttons.forEach(button => setPanel(button, shouldOpen));
      event.currentTarget.textContent = shouldOpen ? 'Collapse all' : 'Expand all';
    });

    updateSearchState();
    render();
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
