
(() => {
  const MS = window.MSArchive = window.MSArchive || {};
  const DATA_PATHS = {
    timeline: 'data/timeline.json',
    people: 'data/people.json',
    media: 'data/media.json'
  };

  MS.normalize = (value = '') => value.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  MS.escapeHtml = (value = '') => value.toString().replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  MS.slug = (value = '') => MS.normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  MS.certaintyLabel = value => ({confirmed: 'Confirmed', approximate: 'Approximate', range: 'Date range'}[value] || value);
  MS.importanceLabel = value => value ? value[0].toUpperCase() + value.slice(1) : '';

  MS.loadJson = async key => {
    const response = await fetch(DATA_PATHS[key]);
    if (!response.ok) throw new Error(`Could not load ${DATA_PATHS[key]} (${response.status})`);
    return response.json();
  };

  MS.loadAll = async () => {
    const [timeline, people, media] = await Promise.all([
      MS.loadJson('timeline'), MS.loadJson('people'), MS.loadJson('media')
    ]);
    const peopleById = Object.fromEntries(people.people.map(person => [person.id, person]));
    const eventsById = Object.fromEntries(timeline.events.map(event => [event.id, event]));
    return {...timeline, people: people.people, peopleById, media: media.media, eventsById};
  };

  MS.personName = (id, data) => data.peopleById[id]?.displayName || id;
  MS.personSearchText = (id, data) => {
    const person = data.peopleById[id];
    return person ? [person.displayName, ...person.aliases].join(' ') : id;
  };

  MS.eventSearchText = (event, data) => MS.normalize([
    event.title, event.summary, event.details, event.dateLabel, event.era,
    ...event.categories, ...event.storylines,
    ...event.people.map(id => MS.personSearchText(id, data))
  ].join(' '));

  MS.setOptions = (select, items, getValue = item => item, getLabel = item => item) => {
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = getValue(item);
      option.textContent = getLabel(item);
      fragment.append(option);
    });
    select.append(fragment);
  };

  MS.imageExists = src => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = src;
  });

  MS.availableMedia = async media => {
    const checks = await Promise.all(media.map(async item => ({item, exists: await MS.imageExists(`assets/images/${item.file}`)})));
    return checks.filter(result => result.exists).map(result => result.item);
  };

  MS.errorMarkup = error => {
    const localHint = location.protocol === 'file:'
      ? '<br><br>This multi-file site must be previewed through a local web server. Run <code>python -m http.server</code> in the project folder, then open the supplied localhost address.'
      : '';
    return `<div class="error-state"><strong>The archive could not load.</strong>${MS.escapeHtml(error.message)}${localHint}</div>`;
  };

  const storedTheme = localStorage.getItem('ms-theme');
  const preferredTheme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = storedTheme || preferredTheme;

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    document.querySelector(`[data-nav="${page}"]`)?.setAttribute('aria-current', 'page');
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('ms-theme', next);
    });
  });
})();
