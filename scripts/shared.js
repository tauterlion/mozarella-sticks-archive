(() => {
  const MS = window.MSArchive = window.MSArchive || {};
  const SCRIPT_URL = document.currentScript?.src || '';
  const SITE_ROOT = SCRIPT_URL ? new URL('../', SCRIPT_URL) : new URL('./', location.href);

  MS.siteUrl = path => new URL(path, SITE_ROOT).href;

  const DATA_PATHS = {
    timeline: MS.siteUrl('data/timeline.json'),
    people: MS.siteUrl('data/people.json'),
    media: MS.siteUrl('data/media.json')
  };

  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif']);
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv']);
  const MEDIA_DIRECTORIES = ['assets/media/', 'assets/images/'];

  MS.normalize = (value = '') => value.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  MS.escapeHtml = (value = '') => value.toString().replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  MS.slug = (value = '') => MS.normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  MS.certaintyLabel = value => ({confirmed: 'Confirmed', approximate: 'Approximate', range: 'Date range'}[value] || value);
  MS.importanceLabel = value => value ? value[0].toUpperCase() + value.slice(1) : '';

  MS.fileExtension = (file = '') => {
    const clean = file.split('?')[0].split('#')[0];
    const dot = clean.lastIndexOf('.');
    return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
  };

  MS.fileStem = (file = '') => {
    const base = file.split('/').pop().split('?')[0].split('#')[0];
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(0, dot) : base;
  };

  MS.mediaType = item => {
    if (item?.type === 'image' || item?.type === 'video') return item.type;
    const extension = MS.fileExtension(item?.file || '');
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (VIDEO_EXTENSIONS.has(extension)) return 'video';
    return 'unknown';
  };

  MS.mediaMime = item => {
    const extension = MS.fileExtension(item?.file || '');
    const types = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      avif: 'image/avif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogv: 'video/ogg'
    };
    return types[extension] || '';
  };

  MS.mediaId = item => item?.id || MS.slug(MS.fileStem(item?.file || 'media'));

  MS.loadJson = async key => {
    const response = await fetch(DATA_PATHS[key], {cache: 'no-store'});
    if (!response.ok) throw new Error(`Could not load ${DATA_PATHS[key]} (${response.status})`);
    return response.json();
  };

  MS.loadAll = async () => {
    const [timeline, people, mediaData] = await Promise.all([
      MS.loadJson('timeline'), MS.loadJson('people'), MS.loadJson('media')
    ]);
    const peopleById = Object.fromEntries(people.people.map(person => [person.id, person]));
    const eventsById = Object.fromEntries(timeline.events.map(event => [event.id, event]));

    const rawMedia = Array.isArray(mediaData) ? mediaData : (mediaData.media || []);
    const normalizedMedia = rawMedia.map((item, index) => {
      const event = eventsById[item.eventId];
      return {
        ...item,
        id: MS.mediaId(item),
        type: MS.mediaType(item),
        caption: item.caption || MS.fileStem(item.file).replace(/[-_]+/g, ' '),
        people: Array.isArray(item.people) ? item.people : [],
        era: item.era || event?.era || '',
        order: Number.isFinite(item.order) ? item.order : index + 1
      };
    });

    return {
      ...timeline,
      people: people.people,
      peopleById,
      media: normalizedMedia,
      eventsById
    };
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

  MS.mediaUrlCandidates = item => {
    if (!item?.file) return [];
    if (/^(?:https?:)?\/\//i.test(item.file) || item.file.startsWith('/')) return [item.file];
    if (item.path) return [MS.siteUrl(item.path)];
    return MEDIA_DIRECTORIES.map(directory => MS.siteUrl(`${directory}${item.file}`));
  };

  MS.posterUrlCandidates = item => {
    if (!item?.poster) return [];
    if (/^(?:https?:)?\/\//i.test(item.poster) || item.poster.startsWith('/')) return [item.poster];
    if (item.posterPath) return [MS.siteUrl(item.posterPath)];
    return MEDIA_DIRECTORIES.map(directory => MS.siteUrl(`${directory}${item.poster}`));
  };

  const checkUrl = async src => {
    try {
      const head = await fetch(src, {
        method: 'HEAD',
        cache: 'no-store'
      });
      if (head.ok) return true;

      // Some static hosts may not support HEAD consistently.
      const fallback = await fetch(src, {
        method: 'GET',
        headers: {'Range': 'bytes=0-0'},
        cache: 'no-store'
      });
      return fallback.ok || fallback.status === 206;
    } catch {
      return false;
    }
  };

  MS.mediaExists = src => checkUrl(src);

  MS.firstExistingUrl = async candidates => {
    for (const candidate of candidates) {
      if (await MS.mediaExists(candidate)) return candidate;
    }
    return '';
  };

  MS.resolveMedia = async item => {
    if (!['image', 'video'].includes(item.type)) return null;
    if (item.available === false) return null;

    const candidates = MS.mediaUrlCandidates(item);
    const url = item.available === true
      ? (candidates[0] || '')
      : await MS.firstExistingUrl(candidates);

    if (!url) return null;

    let posterUrl = '';
    if (item.type === 'video' && item.poster && item.posterAvailable !== false) {
      const posterCandidates = MS.posterUrlCandidates(item);
      posterUrl = item.posterAvailable === true
        ? (posterCandidates[0] || '')
        : await MS.firstExistingUrl(posterCandidates);
    }

    return {...item, url, posterUrl};
  };

  MS.availableMedia = async media => {
    const resolved = await Promise.all(media.map(item => MS.resolveMedia(item)));
    return resolved.filter(Boolean).sort((a, b) => a.order - b.order);
  };

  MS.mediaPreviewMarkup = (item, options = {}) => {
    const className = options.className || '';
    const controls = options.controls !== false;
    const autoplay = Boolean(options.autoplay);
    const muted = Boolean(options.muted);
    const poster = item.posterUrl ? ` poster="${MS.escapeHtml(item.posterUrl)}"` : '';
    const controlAttr = controls ? ' controls' : '';
    const autoplayAttr = autoplay ? ' autoplay' : '';
    const mutedAttr = muted ? ' muted' : '';

    if (item.type === 'video') {
      return `<video class="${MS.escapeHtml(className)}" preload="metadata" playsinline${controlAttr}${autoplayAttr}${mutedAttr}${poster}>
        <source src="${MS.escapeHtml(item.url)}" type="${MS.escapeHtml(MS.mediaMime(item))}">
        Your browser does not support this video.
      </video>`;
    }

    return `<img class="${MS.escapeHtml(className)}" src="${MS.escapeHtml(item.url)}" alt="${MS.escapeHtml(item.caption)}" loading="lazy">`;
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
