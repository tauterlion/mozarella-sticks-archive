
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await MSArchive.loadAll();
    document.querySelector('#event-stat').textContent = data.events.length;
    document.querySelector('#era-stat').textContent = data.eraOrder.length;
    document.querySelector('#people-stat').textContent = data.people.length;
    document.querySelector('#media-stat').textContent = data.media.length;
    const first = data.events[0];
    const last = data.events.at(-1);
    document.querySelector('#archive-range').textContent = `${first.dateLabel} → ${last.dateLabel}`;
    document.querySelector('#latest-event').classList.remove('skeleton');
    document.querySelector('#latest-event').innerHTML = `
      <div class="latest-date">${MSArchive.escapeHtml(last.dateLabel)}</div>
      <div><h3>${MSArchive.escapeHtml(last.title)}</h3><p>${MSArchive.escapeHtml(last.summary)}</p></div>
      <a class="button secondary" href="event.html?id=${encodeURIComponent(last.id)}">Open event</a>`;
  } catch (error) {
    document.querySelector('#latest-event').innerHTML = MSArchive.errorMarkup(error);
  }
});
