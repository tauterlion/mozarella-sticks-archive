
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('#event-root');
  try {
    const data = await MSArchive.loadAll();
    const id = new URLSearchParams(location.search).get('id');
    const event = data.eventsById[id];
    if (!event) {
      root.innerHTML = '<div class="error-state"><strong>Event not found.</strong><a class="text-link" href="timeline.html">Return to the timeline</a></div>';
      return;
    }
    document.title = `${event.title} · Mozarella Sticks Archive`;
    const available = await MSArchive.availableMedia(data.media.filter(item => item.eventId === event.id));
    const index = data.events.findIndex(item => item.id === event.id);
    const previous = data.events[index - 1];
    const next = data.events[index + 1];
    const related = data.events.filter(candidate => candidate.id !== event.id).map(candidate => {
      const storylineScore = candidate.storylines.filter(item => event.storylines.includes(item)).length * 5;
      const peopleScore = candidate.people.filter(item => event.people.includes(item)).length;
      return {candidate, score: storylineScore + peopleScore};
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.candidate.sort.localeCompare(b.candidate.sort)).slice(0, 6).map(item => item.candidate);

    const people = event.people.map(pid => `<a class="chip" href="timeline.html?person=${encodeURIComponent(pid)}">${MSArchive.escapeHtml(MSArchive.personName(pid, data))}</a>`).join('');
    const categories = event.categories.map(category => `<span class="chip">${MSArchive.escapeHtml(category)}</span>`).join('');
    const storylines = event.storylines.map(story => `<a class="chip" href="timeline.html?q=${encodeURIComponent(story)}">${MSArchive.escapeHtml(story)}</a>`).join('');
    const gallery = available.length ? `<section class="event-gallery">${available.map(item => `<figure><a href="assets/images/${encodeURIComponent(item.file)}" target="_blank" rel="noopener"><img src="assets/images/${encodeURIComponent(item.file)}" alt="${MSArchive.escapeHtml(item.caption)}"></a><figcaption>${MSArchive.escapeHtml(item.caption)}</figcaption></figure>`).join('')}</section>` : '';
    const relatedMarkup = related.length ? `<section class="related-section"><p class="eyebrow">Related history</p><h2>Connected events</h2><div class="related-grid">${related.map(item => `<a class="related-card" href="event.html?id=${encodeURIComponent(item.id)}"><span>${MSArchive.escapeHtml(item.dateLabel)}</span><h3>${MSArchive.escapeHtml(item.title)}</h3></a>`).join('')}</div></section>` : '';
    const pagination = `<nav class="event-pagination" aria-label="Previous and next events">${previous ? `<a href="event.html?id=${encodeURIComponent(previous.id)}">← Previous<strong>${MSArchive.escapeHtml(previous.title)}</strong></a>` : '<span></span>'}${next ? `<a href="event.html?id=${encodeURIComponent(next.id)}">Next →<strong>${MSArchive.escapeHtml(next.title)}</strong></a>` : ''}</nav>`;

    root.innerHTML = `<a class="event-back" href="timeline.html#${encodeURIComponent(event.id)}">← Back to timeline</a><article class="event-article">
      <header class="event-header"><p class="event-date">${MSArchive.escapeHtml(event.dateLabel)} · ${MSArchive.escapeHtml(event.era)}</p><h1>${MSArchive.escapeHtml(event.title)}</h1><p class="event-lede">${MSArchive.escapeHtml(event.summary)}</p><div class="event-header-meta"><span class="badge ${event.importance}">${MSArchive.importanceLabel(event.importance)}</span><span class="badge ${event.certainty}">${MSArchive.certaintyLabel(event.certainty)}</span></div></header>
      <section class="event-prose"><p>${MSArchive.escapeHtml(event.details || event.summary)}</p></section>
      <aside class="event-sidebar">${people ? `<h2>People</h2><div class="chip-list">${people}</div>` : ''}<h2>Categories</h2><div class="chip-list">${categories}</div>${storylines ? `<h2>Storylines</h2><div class="chip-list">${storylines}</div>` : ''}</aside>
      ${gallery}${relatedMarkup}${pagination}
    </article>`;
  } catch (error) {
    root.innerHTML = MSArchive.errorMarkup(error);
  }
});
