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
    const activeFilters = document.querySelector('#active-filters');
    const eraNav = document.querySelector('#era-nav');
    const currentEraStatus = document.querySelector('#current-era-status');
    const currentEraName = currentEraStatus.querySelector('strong');

    const importanceLabels = {
      major: 'Major',
      supporting: 'Supporting',
      minor: 'Minor'
    };
    const certaintyLabels = {
      confirmed: 'Confirmed',
      approximate: 'Approximate',
      range: 'Range'
    };

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
    MSArchive.setOptions(categoryFilter, data.categoryOrder);

    const validOptionValue = (select, value) =>
      [...select.options].some(option => option.value === value) ? value : '';

    const applyMultiValue = (params, key, controls) => {
      const raw = params.get(key);
      if (raw === null) {
        controls.forEach(input => input.checked = true);
        return;
      }

      const allowedValues = new Set(controls.map(input => input.value));
      const selected = raw === 'none'
        ? new Set()
        : new Set(raw.split(',').filter(value => allowedValues.has(value)));
      if (raw !== 'none' && selected.size === 0) {
        controls.forEach(input => input.checked = true);
        return;
      }
      controls.forEach(input => input.checked = selected.has(input.value));
    };

    const applyUrlState = () => {
      const params = new URLSearchParams(location.search);
      search.value = params.get('q') || '';
      eraFilter.value = validOptionValue(eraFilter, params.get('era') || '');
      personFilter.value = validOptionValue(personFilter, params.get('person') || '');
      categoryFilter.value = validOptionValue(categoryFilter, params.get('category') || '');
      applyMultiValue(params, 'importance', importanceChecks);
      applyMultiValue(params, 'certainty', certaintyChecks);
    };

    const selectedValues = controls => controls
      .filter(input => input.checked)
      .map(input => input.value);

    const buildStateParams = () => {
      const params = new URLSearchParams();
      const allowedImportance = selectedValues(importanceChecks);
      const allowedCertainty = selectedValues(certaintyChecks);

      if (search.value.trim()) params.set('q', search.value.trim());
      if (eraFilter.value) params.set('era', eraFilter.value);
      if (personFilter.value) params.set('person', personFilter.value);
      if (categoryFilter.value) params.set('category', categoryFilter.value);
      if (allowedImportance.length !== importanceChecks.length) {
        params.set('importance', allowedImportance.length ? allowedImportance.join(',') : 'none');
      }
      if (allowedCertainty.length !== certaintyChecks.length) {
        params.set('certainty', allowedCertainty.length ? allowedCertainty.join(',') : 'none');
      }

      return params;
    };

    const currentAnchor = () => {
      try {
        return decodeURIComponent(location.hash.slice(1));
      } catch {
        return '';
      }
    };

    const buildTimelineUrl = (anchor = '') => {
      const params = buildStateParams();
      const query = params.toString();
      const hash = anchor ? `#${encodeURIComponent(anchor)}` : '';
      return `timeline.html${query ? `?${query}` : ''}${hash}`;
    };

    const syncTimelineUrl = anchor => {
      const relativeUrl = buildTimelineUrl(anchor);
      const browserUrl = `${location.pathname}${relativeUrl.slice('timeline.html'.length)}`;
      history.replaceState(null, '', browserUrl);
      try {
        sessionStorage.setItem('msArchive.timelineReturnUrl', relativeUrl);
      } catch (error) {
        console.warn('Timeline state could not be saved for this session.', error);
      }
      return relativeUrl;
    };

    applyUrlState();

    const searchPrompts = [
      'Try “Close-Up”',
      'Try “Model U.N.”',
      'Try “Spirit Week”',
      'Try “France”',
      'Try “Samantha”'
    ];
    let promptIndex = 0;
    let hasAppliedInitialHash = false;
    let renderedEraSections = [];
    let eraFrame = 0;

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

    setFilterDrawer(false);

    filterToggle.addEventListener('click', () => {
      setFilterDrawer(filterToggle.getAttribute('aria-expanded') !== 'true');
    });

    const setAllChecked = (controls, checked) => {
      controls.forEach(input => input.checked = checked);
    };

    const resetAllFilters = () => {
      search.value = '';
      eraFilter.value = '';
      personFilter.value = '';
      categoryFilter.value = '';
      setAllChecked(importanceChecks, true);
      setAllChecked(certaintyChecks, true);
    };

    const activeFilterDefinitions = () => {
      const filters = [];
      const importance = selectedValues(importanceChecks);
      const certainty = selectedValues(certaintyChecks);

      if (search.value.trim()) filters.push({key: 'q', label: `Search: ${search.value.trim()}`});
      if (eraFilter.value) filters.push({key: 'era', label: `Era: ${eraFilter.value}`});
      if (personFilter.value) {
        const personName = data.peopleById[personFilter.value]?.displayName || personFilter.value;
        filters.push({key: 'person', label: `Person: ${personName}`});
      }
      if (categoryFilter.value) filters.push({key: 'category', label: `Category: ${categoryFilter.value}`});
      if (importance.length !== importanceChecks.length) {
        const label = importance.length
          ? importance.map(value => importanceLabels[value] || value).join(', ')
          : 'None';
        filters.push({key: 'importance', label: `Importance: ${label}`});
      }
      if (certainty.length !== certaintyChecks.length) {
        const label = certainty.length
          ? certainty.map(value => certaintyLabels[value] || value).join(', ')
          : 'None';
        filters.push({key: 'certainty', label: `Date: ${label}`});
      }

      return filters;
    };

    const renderActiveFilters = () => {
      const filters = activeFilterDefinitions();
      activeFilterCount.textContent = filters.length;
      activeFilterCount.hidden = filters.length === 0;
      activeFilters.hidden = filters.length === 0;
      activeFilters.innerHTML = filters.length
        ? `${filters.map(filter => `
            <button class="active-filter-chip" type="button" data-clear-filter="${filter.key}" aria-label="Remove ${MSArchive.escapeHtml(filter.label)} filter">
              <span>${MSArchive.escapeHtml(filter.label)}</span><span aria-hidden="true">×</span>
            </button>`).join('')}
            <button class="clear-all-filters" type="button" data-clear-filter="all">Clear all</button>`
        : '';
    };

    const updateCurrentEra = () => {
      eraFrame = 0;
      if (!renderedEraSections.length) {
        currentEraStatus.hidden = true;
        return;
      }

      const marker = Math.min(window.innerHeight * .34, 260);
      let current = renderedEraSections[0];
      renderedEraSections.forEach(section => {
        if (section.getBoundingClientRect().top <= marker) current = section;
      });

      const eraId = current.id;
      const eraName = current.querySelector('.era-heading h2')?.textContent || eraId;
      eraNav.querySelectorAll('a').forEach(link => {
        const active = link.dataset.eraTarget === eraId;
        link.toggleAttribute('aria-current', active);
        if (active) link.setAttribute('aria-current', 'location');
      });
      currentEraName.textContent = eraName;
      currentEraStatus.hidden = false;
    };

    const scheduleCurrentEra = () => {
      if (eraFrame) return;
      eraFrame = window.requestAnimationFrame(updateCurrentEra);
    };

    const eventMarkup = (event, media, rawQuery) => {
      const people = event.people
        .map(id => {
          const name = MSArchive.personName(id, data);
          return `<a class="chip" href="timeline.html?person=${encodeURIComponent(id)}">${highlightText(name, rawQuery)}</a>`;
        })
        .join('');
      const categories = event.categories
        .map(category => `<span class="chip">${highlightText(category, rawQuery)}</span>`)
        .join('');
      const images = media.slice(0, 2)
        .map(item => {
          if (item.type === 'video') {
            return `<figure class="event-media-item video-item">
              ${MSArchive.mediaPreviewMarkup(item, {controls: true})}
              <figcaption>${highlightText(item.caption, rawQuery)}</figcaption>
            </figure>`;
          }
          return `<a class="event-media-item" href="gallery.html?event=${encodeURIComponent(event.id)}">${MSArchive.mediaPreviewMarkup(item)}</a>`;
        })
        .join('');
      const returnUrl = buildTimelineUrl(event.id);
      const eventUrl = `event.html?id=${encodeURIComponent(event.id)}&from=${encodeURIComponent(returnUrl)}`;

      return `<article class="event-card" id="${MSArchive.escapeHtml(event.id)}" data-importance="${event.importance}">
        <div class="event-main">
          <div class="event-topline">
            <div class="event-date">${highlightText(event.dateLabel, rawQuery)}</div>
            <div class="event-badges">
              <span class="badge ${event.importance}">${MSArchive.importanceLabel(event.importance)}</span>
              <span class="badge ${event.certainty}">${MSArchive.certaintyLabel(event.certainty)}</span>
            </div>
          </div>
          <h3>${highlightText(event.title, rawQuery)}</h3>
          <p class="event-summary">${highlightText(event.summary, rawQuery)}</p>
          <div class="event-actions">
            <button type="button" data-expand="${event.id}" aria-expanded="false" aria-controls="details-${event.id}">View more</button>
            <a href="${MSArchive.escapeHtml(eventUrl)}">Full event page →</a>
          </div>
        </div>

        <div class="event-details" id="details-${event.id}" data-open="false" aria-hidden="true" inert>
          <div class="event-details-inner">
            <p>${highlightText(event.details, rawQuery)}</p>
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

    const render = ({preserveHash = false, syncHistory = true} = {}) => {
      const rawQuery = search.value.trim();
      const query = MSArchive.normalize(rawQuery);
      const allowedImportance = new Set(selectedValues(importanceChecks));
      const allowedCertainty = new Set(selectedValues(certaintyChecks));
      const anchor = preserveHash ? currentAnchor() : '';

      const filtered = [...data.events]
        .sort((a, b) => String(a.sort || '').localeCompare(String(b.sort || '')))
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
      renderActiveFilters();
      updateSearchState();

      if (syncHistory) syncTimelineUrl(anchor);

      const grouped = data.eraOrder
        .map(era => [era, filtered.filter(event => event.era === era)])
        .filter(([, events]) => events.length);

      eraNav.innerHTML = grouped
        .map(([era, events]) => {
          const eraId = MSArchive.slug(era);
          return `<a href="#${eraId}" data-era-target="${eraId}">${MSArchive.escapeHtml(era)} <span>(${events.length})</span></a>`;
        })
        .join('');

      if (!filtered.length) {
        root.innerHTML = '<div class="empty-state no-results"><strong>No events match those filters.</strong>Try clearing one or more filters.</div>';
      } else {
        root.innerHTML = grouped.map(([era, events]) => `
          <section class="timeline-era" id="${MSArchive.slug(era)}">
            <header class="era-heading">
              <h2>${highlightText(era, rawQuery)}</h2>
              <span class="era-count">${events.length} event${events.length === 1 ? '' : 's'}</span>
            </header>
            <div class="event-list">
              ${events.map(event => eventMarkup(event, mediaByEvent[event.id] || [], rawQuery)).join('')}
            </div>
          </section>
        `).join('');
      }

      renderedEraSections = [...root.querySelectorAll('.timeline-era')];
      scheduleCurrentEra();

      root.querySelectorAll('[data-expand]').forEach(button => {
        button.addEventListener('click', () => {
          setPanel(button, button.getAttribute('aria-expanded') !== 'true');
        });
      });

      if (anchor && !hasAppliedInitialHash) {
        hasAppliedInitialHash = true;
        requestAnimationFrame(() => {
          const target = document.getElementById(anchor);
          target?.scrollIntoView({block: 'center'});
          target?.classList.add('returned-event');
          window.setTimeout(() => target?.classList.remove('returned-event'), 1800);
          scheduleCurrentEra();
        });
      }
    };

    [search, eraFilter, personFilter, categoryFilter, ...importanceChecks, ...certaintyChecks]
      .forEach(control => control.addEventListener(control === search ? 'input' : 'change', () => {
        hasAppliedInitialHash = true;
        render({preserveHash: false});
      }));

    activeFilters.addEventListener('click', event => {
      const button = event.target.closest('[data-clear-filter]');
      if (!button) return;

      switch (button.dataset.clearFilter) {
        case 'q': search.value = ''; break;
        case 'era': eraFilter.value = ''; break;
        case 'person': personFilter.value = ''; break;
        case 'category': categoryFilter.value = ''; break;
        case 'importance': setAllChecked(importanceChecks, true); break;
        case 'certainty': setAllChecked(certaintyChecks, true); break;
        case 'all': resetAllFilters(); break;
        default: return;
      }

      hasAppliedInitialHash = true;
      render({preserveHash: false});
    });

    document.querySelector('#reset-filters').addEventListener('click', () => {
      resetAllFilters();
      hasAppliedInitialHash = true;
      render({preserveHash: false});
    });

    document.querySelector('#expand-all').addEventListener('click', event => {
      const buttons = [...root.querySelectorAll('[data-expand]')];
      const shouldOpen = buttons.some(button => button.getAttribute('aria-expanded') !== 'true');
      buttons.forEach(button => setPanel(button, shouldOpen));
      event.currentTarget.textContent = shouldOpen ? 'Collapse all' : 'Expand all';
    });

    window.addEventListener('scroll', scheduleCurrentEra, {passive: true});
    window.addEventListener('resize', scheduleCurrentEra);

    window.addEventListener('popstate', () => {
      applyUrlState();
      hasAppliedInitialHash = false;
      render({preserveHash: true, syncHistory: false});
    });

    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      applyUrlState();
      hasAppliedInitialHash = false;
      render({preserveHash: true});
    });

    updateSearchState();
    render({preserveHash: true});
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
