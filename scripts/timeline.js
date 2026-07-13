
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
    const eraFilter = document.querySelector('#era-filter');
    const personFilter = document.querySelector('#person-filter');
    const categoryFilter = document.querySelector('#category-filter');
    const importanceChecks = [...document.querySelectorAll('[name="importance"]')];
    const certaintyChecks = [...document.querySelectorAll('[name="certainty"]')];

    MSArchive.setOptions(eraFilter, data.eraOrder);
    MSArchive.setOptions(personFilter, data.people, p => p.id, p => `${p.displayName}${p.status === 'Connected Person' ? ' · Connected' : ''}`);
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

    const render = () => {
      const query = MSArchive.normalize(search.value.trim());
      const allowedImportance = new Set(importanceChecks.filter(i => i.checked).map(i => i.value));
      const allowedCertainty = new Set(certaintyChecks.filter(i => i.checked).map(i => i.value));
      const filtered = data.events.filter(event => {
        if (query && !MSArchive.eventSearchText(event, data).includes(query)) return false;
        if (eraFilter.value && event.era !== eraFilter.value) return false;
        if (personFilter.value && !event.people.includes(personFilter.value)) return false;
        if (categoryFilter.value && !event.categories.includes(categoryFilter.value)) return false;
        if (!allowedImportance.has(event.importance)) return false;
        if (!allowedCertainty.has(event.certainty)) return false;
        return true;
      });

      document.querySelector('#visible-count').textContent = filtered.length;
      const grouped = data.eraOrder.map(era => [era, filtered.filter(event => event.era === era)]).filter(([, events]) => events.length);
      document.querySelector('#era-nav').innerHTML = grouped.map(([era, events]) => `<a href="#${MSArchive.slug(era)}">${MSArchive.escapeHtml(era)} <span>(${events.length})</span></a>`).join('');

      if (!filtered.length) {
        root.innerHTML = '<div class="empty-state no-results"><strong>No events match those filters.</strong>Try clearing one or more filters.</div>';
      } else {
        root.innerHTML = grouped.map(([era, events]) => `
          <section class="timeline-era" id="${MSArchive.slug(era)}">
            <header class="era-heading"><h2>${MSArchive.escapeHtml(era)}</h2><span class="era-count">${events.length} event${events.length === 1 ? '' : 's'}</span></header>
            <div class="event-list">${events.map(event => eventMarkup(event, data, mediaByEvent[event.id] || [])).join('')}</div>
          </section>`).join('');
      }

      const nextParams = new URLSearchParams();
      if (search.value.trim()) nextParams.set('q', search.value.trim());
      if (eraFilter.value) nextParams.set('era', eraFilter.value);
      if (personFilter.value) nextParams.set('person', personFilter.value);
      if (categoryFilter.value) nextParams.set('category', categoryFilter.value);
      if (allowedImportance.size !== 3) nextParams.set('importance', [...allowedImportance].join(','));
      history.replaceState(null, '', `${location.pathname}${nextParams.size ? `?${nextParams}` : ''}${location.hash}`);

      root.querySelectorAll('[data-expand]').forEach(button => button.addEventListener('click', () => {
        const panel = document.querySelector(`#details-${CSS.escape(button.dataset.expand)}`);
        const opening = panel.hidden;
        panel.hidden = !opening;
        button.textContent = opening ? 'Show less' : 'View more';
        button.setAttribute('aria-expanded', opening.toString());
      }));

      if (location.hash) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({block: 'center'}));
    };

    const eventMarkup = (event, data, media) => {
      const people = event.people.map(id => `<a class="chip" href="timeline.html?person=${encodeURIComponent(id)}">${MSArchive.escapeHtml(MSArchive.personName(id, data))}</a>`).join('');
      const categories = event.categories.map(category => `<span class="chip">${MSArchive.escapeHtml(category)}</span>`).join('');
      const images = media.slice(0, 2).map(item => `<a href="gallery.html?event=${encodeURIComponent(event.id)}"><img src="assets/images/${encodeURIComponent(item.file)}" alt="${MSArchive.escapeHtml(item.caption)}" loading="lazy"></a>`).join('');
      return `<article class="event-card" id="${MSArchive.escapeHtml(event.id)}" data-importance="${event.importance}">
        <div class="event-main">
          <div class="event-topline"><div class="event-date">${MSArchive.escapeHtml(event.dateLabel)}</div><div class="event-badges"><span class="badge ${event.importance}">${MSArchive.importanceLabel(event.importance)}</span><span class="badge ${event.certainty}">${MSArchive.certaintyLabel(event.certainty)}</span></div></div>
          <h3>${MSArchive.escapeHtml(event.title)}</h3><p class="event-summary">${MSArchive.escapeHtml(event.summary)}</p>
          <div class="event-meta">${people ? `<div class="meta-row"><span class="meta-label">People</span><div class="chip-list">${people}</div></div>` : ''}<div class="meta-row"><span class="meta-label">Tags</span><div class="chip-list">${categories}</div></div></div>
          <div class="event-actions"><button type="button" data-expand="${event.id}" aria-expanded="false">View more</button><a href="event.html?id=${encodeURIComponent(event.id)}">Full event page →</a></div>
        </div>
        <div class="event-details" id="details-${event.id}" hidden><p>${MSArchive.escapeHtml(event.details)}</p>${images ? `<div class="event-media">${images}</div>` : ''}</div>
      </article>`;
    };

    [search, eraFilter, personFilter, categoryFilter, ...importanceChecks, ...certaintyChecks].forEach(control => control.addEventListener(control === search ? 'input' : 'change', render));
    document.querySelector('#reset-filters').addEventListener('click', () => {
      search.value = ''; eraFilter.value = ''; personFilter.value = ''; categoryFilter.value = '';
      [...importanceChecks, ...certaintyChecks].forEach(input => input.checked = true);
      render();
    });
    document.querySelector('#expand-all').addEventListener('click', event => {
      const panels = [...root.querySelectorAll('.event-details')];
      const shouldOpen = panels.some(panel => panel.hidden);
      panels.forEach(panel => panel.hidden = !shouldOpen);
      root.querySelectorAll('[data-expand]').forEach(button => { button.textContent = shouldOpen ? 'Show less' : 'View more'; button.setAttribute('aria-expanded', shouldOpen.toString()); });
      event.currentTarget.textContent = shouldOpen ? 'Collapse all' : 'Expand all';
    });

    render();
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
