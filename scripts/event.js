document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('#event-root');

  const safeTimelineUrl = candidate => {
    if (!candidate) return '';
    try {
      const url = new URL(candidate, location.href);
      const fileName = url.pathname.split('/').pop();
      if (url.origin !== location.origin || fileName !== 'timeline.html') return '';
      return `timeline.html${url.search}${url.hash}`;
    } catch {
      return '';
    }
  };

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const requestedReturnUrl = safeTimelineUrl(params.get('from'));
  let storedReturnUrl = '';

  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const cameFromTimeline = referrer
      && referrer.origin === location.origin
      && referrer.pathname.split('/').pop() === 'timeline.html';
    if (cameFromTimeline) {
      storedReturnUrl = safeTimelineUrl(sessionStorage.getItem('msArchive.timelineReturnUrl'));
    }
  } catch {
    storedReturnUrl = '';
  }

  const returnUrl = requestedReturnUrl || storedReturnUrl || `timeline.html${id ? `#${encodeURIComponent(id)}` : ''}`;
  const returnHasFilters = Boolean(new URL(returnUrl, location.href).search);
  const eventUrl = eventId => {
    const eventParams = new URLSearchParams({id: eventId});
    eventParams.set('from', returnUrl);
    return `event.html?${eventParams}`;
  };

  try {
    const data = await MSArchive.loadAll();
    const event = data.eventsById[id];
    if (!event) {
      root.innerHTML = `<div class="error-state"><strong>Event not found.</strong><a class="text-link" href="${MSArchive.escapeHtml(returnUrl)}">Return to the timeline</a></div>`;
      return;
    }

    document.title = `${event.title} · Mozarella Sticks Archive`;
    const available = await MSArchive.availableMedia(data.media.filter(item => item.eventId === event.id));
    const orderedEvents = [...data.events]
      .sort((a, b) => String(a.sort || '').localeCompare(String(b.sort || '')));
    const index = orderedEvents.findIndex(item => item.id === event.id);
    const previous = orderedEvents[index - 1];
    const next = orderedEvents[index + 1];

    const related = orderedEvents
      .filter(candidate => candidate.id !== event.id)
      .map(candidate => {
        const storylineScore = candidate.storylines.filter(item => event.storylines.includes(item)).length * 5;
        const peopleScore = candidate.people.filter(item => event.people.includes(item)).length;
        return {candidate, score: storylineScore + peopleScore};
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.candidate.sort.localeCompare(b.candidate.sort))
      .slice(0, 6)
      .map(item => item.candidate);

    const people = event.people
      .map(pid => `<a class="chip" href="timeline.html?person=${encodeURIComponent(pid)}">${MSArchive.escapeHtml(MSArchive.personName(pid, data))}</a>`)
      .join('');
    const categories = event.categories
      .map(category => `<a class="chip" href="timeline.html?category=${encodeURIComponent(category)}">${MSArchive.escapeHtml(category)}</a>`)
      .join('');
    const storylines = event.storylines
      .map(story => `<a class="chip" href="timeline.html?q=${encodeURIComponent(story)}">${MSArchive.escapeHtml(story)}</a>`)
      .join('');

    const gallery = available.length
      ? `<section class="event-gallery">${available.map(item => {
          if (item.type === 'video') {
            return `<figure class="video-figure">
              ${MSArchive.mediaPreviewMarkup(item, {controls: true})}
              <figcaption>${MSArchive.escapeHtml(item.caption)}</figcaption>
            </figure>`;
          }
          return `<figure>
            <a href="${MSArchive.escapeHtml(item.url)}" target="_blank" rel="noopener">${MSArchive.mediaPreviewMarkup(item)}</a>
            <figcaption>${MSArchive.escapeHtml(item.caption)}</figcaption>
          </figure>`;
        }).join('')}</section>`
      : '';

    const relatedMarkup = related.length
      ? `<section class="related-section">
          <p class="eyebrow">Related history</p>
          <h2>Connected events</h2>
          <div class="related-grid">${related.map(item => `
            <a class="related-card" href="${MSArchive.escapeHtml(eventUrl(item.id))}">
              <span>${MSArchive.escapeHtml(item.dateLabel)}</span>
              <h3>${MSArchive.escapeHtml(item.title)}</h3>
            </a>`).join('')}</div>
        </section>`
      : '';

    const previousMarkup = previous
      ? `<a class="event-page-link previous" href="${MSArchive.escapeHtml(eventUrl(previous.id))}">
          <span>← Previous event</span>
          <strong>${MSArchive.escapeHtml(previous.title)}</strong>
        </a>`
      : '<span class="event-page-spacer" aria-hidden="true"></span>';
    const nextMarkup = next
      ? `<a class="event-page-link next" href="${MSArchive.escapeHtml(eventUrl(next.id))}">
          <span>Next event →</span>
          <strong>${MSArchive.escapeHtml(next.title)}</strong>
        </a>`
      : '<span class="event-page-spacer" aria-hidden="true"></span>';
    const pagination = `<nav class="event-pagination" aria-label="Event navigation">
      ${previousMarkup}
      <a class="event-page-link timeline-return" href="${MSArchive.escapeHtml(returnUrl)}">
        <span>Back to timeline</span>
        <strong>${returnHasFilters ? 'Return to filtered view' : 'View the chronology'}</strong>
      </a>
      ${nextMarkup}
    </nav>`;

    root.innerHTML = `<a class="event-back" href="${MSArchive.escapeHtml(returnUrl)}">← Back to ${returnHasFilters ? 'filtered timeline' : 'timeline'}</a>
      <article class="event-article">
        <header class="event-header">
          <p class="event-date">${MSArchive.escapeHtml(event.dateLabel)} · ${MSArchive.escapeHtml(event.era)}</p>
          <h1>${MSArchive.escapeHtml(event.title)}</h1>
          <p class="event-lede">${MSArchive.escapeHtml(event.summary)}</p>
          <div class="event-header-meta">
            <span class="badge ${event.importance}">${MSArchive.importanceLabel(event.importance)}</span>
            <span class="badge ${event.certainty}">${MSArchive.certaintyLabel(event.certainty)}</span>
          </div>
        </header>
        <section class="event-prose"><p>${MSArchive.escapeHtml(event.details || event.summary)}</p></section>
        <aside class="event-sidebar">
          ${people ? `<h2>People</h2><div class="chip-list">${people}</div>` : ''}
          <h2>Categories</h2><div class="chip-list">${categories}</div>
          ${storylines ? `<h2>Storylines</h2><div class="chip-list">${storylines}</div>` : ''}
        </aside>
        ${gallery}
        ${relatedMarkup}
        ${pagination}
      </article>`;
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
