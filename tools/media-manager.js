document.addEventListener('DOMContentLoaded', async () => {
  const filesInput = document.querySelector('#manager-files');
  const eventSelect = document.querySelector('#manager-event');
  const captionInput = document.querySelector('#manager-caption');
  const list = document.querySelector('#manager-list');
  const count = document.querySelector('#manager-count');

  try {
    const data = await MSArchive.loadAll();
    const originalMedia = data.media.map(item => {
      const clean = {...item};
      delete clean.url;
      delete clean.posterUrl;
      return clean;
    });
    let newRecords = [];

    MSArchive.setOptions(
      eventSelect,
      data.events,
      event => event.id,
      event => `${event.dateLabel} · ${event.title}`
    );

    const humanize = file => MSArchive.fileStem(file)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());

    const uniqueId = base => {
      const used = new Set([...originalMedia, ...newRecords].map(item => MSArchive.mediaId(item)));
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
          <div><code>${MSArchive.escapeHtml(item.file)}</code><p>ID: ${MSArchive.escapeHtml(item.id)} · ${MSArchive.escapeHtml(item.type)}</p></div>
          <div><strong>${MSArchive.escapeHtml(item.caption)}</strong><p>${MSArchive.escapeHtml(data.eventsById[item.eventId]?.title || item.eventId)}</p></div>
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

    document.querySelector('#manager-add').addEventListener('click', () => {
      const files = [...filesInput.files];
      if (!files.length) {
        alert('Choose one or more files first.');
        return;
      }
      if (!eventSelect.value) {
        alert('Choose the related event first.');
        return;
      }

      files.forEach((file, index) => {
        const type = MSArchive.mediaType({file: file.name});
        if (!['image', 'video'].includes(type)) return;

        const id = uniqueId(MSArchive.slug(MSArchive.fileStem(file.name)));
        const record = {
          id,
          file: file.name,
          type,
          caption: captionInput.value.trim() && files.length === 1
            ? captionInput.value.trim()
            : humanize(file.name),
          eventId: eventSelect.value,
          people: [],
          order: originalMedia.length + newRecords.length + 1
        };
        newRecords.push(record);
      });

      filesInput.value = '';
      captionInput.value = '';
      render();
    });

    document.querySelector('#manager-clear').addEventListener('click', () => {
      newRecords = [];
      render();
    });

    document.querySelector('#manager-download').addEventListener('click', () => {
      const combined = [...originalMedia, ...newRecords];
      const blob = new Blob([JSON.stringify({media: combined}, null, 2) + '\n'], {type: 'application/json'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'media.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });

    render();
  } catch (error) {
    list.innerHTML = MSArchive.errorMarkup(error);
  }
});
