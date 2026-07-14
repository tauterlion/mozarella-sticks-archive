document.addEventListener('DOMContentLoaded', async () => {
  const filesInput = document.querySelector('#manager-files');
  const eventSelect = document.querySelector('#manager-event');
  const captionInput = document.querySelector('#manager-caption');
  const list = document.querySelector('#manager-list');
  const count = document.querySelector('#manager-count');
  const addButton = document.querySelector('#manager-add');
  const downloadButton = document.querySelector('#manager-download');

  const fetchJson = async relativePath => {
    const url = new URL(relativePath, window.location.href);
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) {
      throw new Error(`Could not load ${url.pathname} (${response.status})`);
    }
    return response.json();
  };

  try {
    eventSelect.disabled = true;
    addButton.disabled = true;
    downloadButton.disabled = true;

    const [timeline, peopleData, mediaData] = await Promise.all([
      fetchJson('../data/timeline.json'),
      fetchJson('../data/people.json'),
      fetchJson('../data/media.json')
    ]);

    const events = Array.isArray(timeline.events) ? timeline.events : [];
    const eventsById = Object.fromEntries(events.map(event => [event.id, event]));
    const originalMedia = (Array.isArray(mediaData) ? mediaData : (mediaData.media || []))
      .map(item => ({...item}));

    if (!events.length) {
      throw new Error('timeline.json loaded, but it contains no events.');
    }

    let newRecords = [];

    const options = document.createDocumentFragment();
    events.forEach(event => {
      const option = document.createElement('option');
      option.value = event.id;
      option.textContent = `${event.dateLabel} · ${event.title}`;
      options.append(option);
    });
    eventSelect.append(options);

    eventSelect.disabled = false;
    addButton.disabled = false;
    downloadButton.disabled = false;

    const humanize = file => MSArchive.fileStem(file)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());

    const uniqueId = base => {
      const used = new Set(
        [...originalMedia, ...newRecords].map(item => item.id || MSArchive.mediaId(item))
      );
      if (!used.has(base)) return base;
      let number = 2;
      while (used.has(`${base}-${number}`)) number += 1;
      return `${base}-${number}`;
    };

    const render = () => {
      count.textContent = `${newRecords.length} newly added`;

      if (!newRecords.length) {
        list.innerHTML = '<div class="empty-state">No new files have been added in this session.</div>';
        return;
      }

      list.innerHTML = newRecords.map((item, index) => `
        <article class="manager-record">
          <div>
            <code>${MSArchive.escapeHtml(item.file)}</code>
            <p>ID: ${MSArchive.escapeHtml(item.id)} · ${MSArchive.escapeHtml(item.type)}</p>
          </div>
          <div>
            <strong>${MSArchive.escapeHtml(item.caption)}</strong>
            <p>${MSArchive.escapeHtml(eventsById[item.eventId]?.title || item.eventId)}</p>
          </div>
          <button type="button" data-remove="${index}">Remove</button>
        </article>
      `).join('');

      list.querySelectorAll('[data-remove]').forEach(button => {
        button.addEventListener('click', () => {
          newRecords.splice(Number(button.dataset.remove), 1);
          render();
        });
      });
    };

    addButton.addEventListener('click', () => {
      const files = [...filesInput.files];

      if (!files.length) {
        alert('Choose one or more files first.');
        return;
      }

      if (!eventSelect.value) {
        alert('Choose the related event first.');
        return;
      }

      let accepted = 0;

      files.forEach(file => {
        const type = MSArchive.mediaType({file: file.name});
        if (!['image', 'video'].includes(type)) return;

        const id = uniqueId(MSArchive.slug(MSArchive.fileStem(file.name)));

        newRecords.push({
          id,
          file: file.name,
          path: `assets/media/${file.name}`,
          available: true,
          type,
          caption: captionInput.value.trim() && files.length === 1
            ? captionInput.value.trim()
            : humanize(file.name),
          eventId: eventSelect.value,
          people: [],
          order: originalMedia.length + newRecords.length + 1
        });

        accepted += 1;
      });

      if (!accepted) {
        alert('None of the selected files use a supported image or video format.');
        return;
      }

      filesInput.value = '';
      captionInput.value = '';
      render();
    });

    document.querySelector('#manager-clear').addEventListener('click', () => {
      newRecords = [];
      render();
    });

    downloadButton.addEventListener('click', () => {
      const combined = [...originalMedia, ...newRecords];
      const blob = new Blob(
        [JSON.stringify({media: combined}, null, 2) + '\n'],
        {type: 'application/json'}
      );

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'media.json';
      link.click();

      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    render();
  } catch (error) {
    eventSelect.innerHTML = '<option value="">Events failed to load</option>';
    eventSelect.disabled = true;
    addButton.disabled = true;
    downloadButton.disabled = true;

    list.innerHTML = `
      <div class="error-state">
        <strong>The event list could not load.</strong>
        ${MSArchive.escapeHtml(error.message)}
        <br><br>
        Make sure this page is opened through GitHub Pages or a local server—not directly as a file.
      </div>
    `;

    console.error(error);
  }
});
