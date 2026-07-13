document.addEventListener('DOMContentLoaded', async () => {
  const summary = document.querySelector('#diag-summary');
  const list = document.querySelector('#diag-list');

  const run = async () => {
    summary.textContent = 'Checking files…';
    list.innerHTML = '';

    try {
      const data = await MSArchive.loadAll();
      const results = await Promise.all(data.media.map(async item => {
        const candidates = MSArchive.mediaUrlCandidates(item);
        const resolved = await MSArchive.firstExistingUrl(candidates);
        return {...item, resolved, candidates};
      }));

      const found = results.filter(item => item.resolved);
      const missing = results.filter(item => !item.resolved);

      summary.textContent = `${found.length} found · ${missing.length} missing`;

      list.innerHTML = results.map(item => `
        <article class="manager-record">
          <div>
            <code>${MSArchive.escapeHtml(item.file)}</code>
            <p>${item.resolved ? 'Found' : 'Missing'}</p>
          </div>
          <div>
            <strong>${MSArchive.escapeHtml(item.caption)}</strong>
            <p>${MSArchive.escapeHtml(item.eventId)}</p>
          </div>
          <span class="badge ${item.resolved ? 'confirmed' : 'major'}">${item.resolved ? 'OK' : 'Missing'}</span>
        </article>
      `).join('');
    } catch (error) {
      summary.textContent = 'Diagnostics failed';
      list.innerHTML = MSArchive.errorMarkup(error);
    }
  };

  document.querySelector('#diag-rerun').addEventListener('click', run);
  run();
});
