document.addEventListener('DOMContentLoaded', async () => {
  const filesInput = document.querySelector('#manager-files');
  const eventSelect = document.querySelector('#manager-event');
  const captionInput = document.querySelector('#manager-caption');
  const addButton = document.querySelector('#manager-add');
  const downloadButton = document.querySelector('#manager-download');
  const existingSelect = document.querySelector('#manager-existing');
  const existingCount = document.querySelector('#manager-existing-count');
  const editor = document.querySelector('#manager-editor');
  const editId = document.querySelector('#manager-edit-id');
  const editFile = document.querySelector('#manager-edit-file');
  const editType = document.querySelector('#manager-edit-type');
  const editOrder = document.querySelector('#manager-edit-order');
  const editEvent = document.querySelector('#manager-edit-event');
  const editCaption = document.querySelector('#manager-edit-caption');
  const saveEditButton = document.querySelector('#manager-save-edit');
  const revertEditButton = document.querySelector('#manager-revert-edit');
  const resetEditsButton = document.querySelector('#manager-reset-edits');
  const editStatus = document.querySelector('#manager-edit-status');
  const list = document.querySelector('#manager-list');
  const count = document.querySelector('#manager-count');

  const managedControls = [
    eventSelect,
    addButton,
    downloadButton,
    existingSelect,
    editEvent,
    editCaption,
    saveEditButton,
    revertEditButton,
    resetEditsButton
  ];

  const setControlsDisabled = disabled => {
    managedControls.forEach(control => {
      control.disabled = disabled;
    });
  };

  const fetchJson = async relativePath => {
    const url = new URL(relativePath, window.location.href);
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) {
      throw new Error(`Could not load ${url.pathname} (${response.status})`);
    }
    return response.json();
  };

  const clonePeople = value => Array.isArray(value) ? [...value] : [];
  const samePeople = (left, right) => {
    const a = new Set(clonePeople(left));
    const b = new Set(clonePeople(right));
    return a.size === b.size && [...a].every(id => b.has(id));
  };

  try {
    setControlsDisabled(true);

    const [timeline, peopleData, mediaData] = await Promise.all([
      fetchJson('../data/timeline.json'),
      fetchJson('../data/people.json'),
      fetchJson('../data/media.json')
    ]);

    const events = (Array.isArray(timeline.events) ? timeline.events : [])
      .map(event => ({...event}))
      .sort((a, b) => String(a.sort || '').localeCompare(String(b.sort || '')));
    const people = (Array.isArray(peopleData.people) ? peopleData.people : [])
      .map(person => ({...person, aliases: clonePeople(person.aliases)}))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Member' ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
    const sourceMedia = (Array.isArray(mediaData) ? mediaData : (mediaData.media || []))
      .map(item => ({...item, people: clonePeople(item.people)}));
    const workingMedia = sourceMedia
      .map(item => ({...item, people: clonePeople(item.people)}));

    if (!events.length) throw new Error('timeline.json loaded, but it contains no events.');
    if (!people.length) throw new Error('people.json loaded, but it contains no people.');

    const eventsById = Object.fromEntries(events.map(event => [event.id, event]));
    const originalById = new Map(sourceMedia.map(item => [item.id || MSArchive.mediaId(item), item]));
    const workingById = new Map(workingMedia.map(item => [item.id || MSArchive.mediaId(item), item]));

    let newRecords = [];
    const editedIds = new Set();
    let nextOrder = Math.max(0, ...workingMedia.map(item => Number(item.order) || 0)) + 1;

    const populateEventSelect = select => {
      const current = select.value;
      select.innerHTML = '<option value="">Choose an event</option>';
      const options = document.createDocumentFragment();
      events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = `${event.dateLabel} · ${event.title}`;
        options.append(option);
      });
      select.append(options);
      if ([...select.options].some(option => option.value === current)) select.value = current;
    };

    populateEventSelect(eventSelect);
    populateEventSelect(editEvent);

    const createPeoplePicker = root => {
      const summary = root.querySelector('[data-people-summary]');
      const search = root.querySelector('[data-people-search]');
      const optionsRoot = root.querySelector('[data-people-options]');
      const allButton = root.querySelector('[data-people-all]');
      const clearButton = root.querySelector('[data-people-clear]');

      optionsRoot.innerHTML = people.map(person => {
        const aliases = person.aliases.join(' ');
        const searchText = `${person.displayName} ${aliases} ${person.status}`.toLocaleLowerCase();
        return `
          <label class="person-option" data-person-search="${MSArchive.escapeHtml(searchText)}">
            <input type="checkbox" value="${MSArchive.escapeHtml(person.id)}">
            <span>${MSArchive.escapeHtml(person.displayName)}</span>
            ${person.status === 'Connected Person' ? '<small>Connected</small>' : ''}
          </label>`;
      }).join('');

      const checkboxes = [...optionsRoot.querySelectorAll('input[type="checkbox"]')];

      const getValue = () => checkboxes.filter(input => input.checked).map(input => input.value);

      const updateSummary = () => {
        const selected = getValue();
        if (!selected.length) {
          summary.textContent = 'No people selected';
          return;
        }
        const names = selected
          .map(id => people.find(person => person.id === id)?.displayName || id);
        summary.textContent = names.length <= 3
          ? names.join(', ')
          : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
      };

      const setValue = ids => {
        const selected = new Set(clonePeople(ids));
        checkboxes.forEach(input => {
          input.checked = selected.has(input.value);
        });
        updateSummary();
      };

      const clear = () => setValue([]);

      optionsRoot.addEventListener('change', updateSummary);
      search.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase();
        optionsRoot.querySelectorAll('.person-option').forEach(option => {
          option.hidden = Boolean(query) && !option.dataset.personSearch.includes(query);
        });
      });
      allButton.addEventListener('click', () => {
        checkboxes.forEach(input => {
          if (!input.closest('.person-option').hidden) input.checked = true;
        });
        updateSummary();
      });
      clearButton.addEventListener('click', clear);
      root.addEventListener('toggle', () => {
        if (root.open) window.setTimeout(() => search.focus(), 0);
      });

      updateSummary();
      return {getValue, setValue, clear};
    };

    const addPeoplePicker = createPeoplePicker(document.querySelector('#manager-people-picker'));
    const editPeoplePicker = createPeoplePicker(document.querySelector('#manager-edit-people-picker'));

    const humanize = file => MSArchive.fileStem(file)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());

    const uniqueId = base => {
      const used = new Set(
        [...workingMedia, ...newRecords].map(item => item.id || MSArchive.mediaId(item))
      );
      if (!used.has(base)) return base;
      let number = 2;
      while (used.has(`${base}-${number}`)) number += 1;
      return `${base}-${number}`;
    };

    const mediaLabel = item => {
      const order = Number.isFinite(Number(item.order)) ? String(item.order).padStart(3, '0') : '—';
      return `${order} · ${item.file} — ${item.caption || 'Untitled'}`;
    };

    const refreshExistingSelect = selectedId => {
      const current = selectedId ?? existingSelect.value;
      existingSelect.innerHTML = '<option value="">Choose media to edit</option>';
      const options = document.createDocumentFragment();
      workingMedia
        .slice()
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .forEach(item => {
          const id = item.id || MSArchive.mediaId(item);
          const option = document.createElement('option');
          option.value = id;
          option.textContent = mediaLabel(item);
          options.append(option);
        });
      existingSelect.append(options);
      existingCount.textContent = `${workingMedia.length} existing records loaded`;
      if (current && workingById.has(current)) existingSelect.value = current;
    };

    const editableChanged = id => {
      const original = originalById.get(id);
      const working = workingById.get(id);
      if (!original || !working) return false;
      return original.caption !== working.caption
        || original.eventId !== working.eventId
        || !samePeople(original.people, working.people);
    };

    const updateEditedState = id => {
      if (editableChanged(id)) editedIds.add(id);
      else editedIds.delete(id);
    };

    const peopleNames = ids => clonePeople(ids)
      .map(id => people.find(person => person.id === id)?.displayName || id)
      .join(', ') || 'No people tagged';

    const renderChanges = () => {
      const pendingTotal = editedIds.size + newRecords.length;
      count.textContent = String(pendingTotal);

      if (!pendingTotal) {
        list.innerHTML = '<div class="empty-state">No changes have been made in this session.</div>';
        return;
      }

      const editedMarkup = [...editedIds].map(id => {
        const item = workingById.get(id);
        return `
          <article class="manager-record">
            <div>
              <span class="record-badge edited">Edited</span>
              <code>${MSArchive.escapeHtml(item.file)}</code>
              <p>ID: ${MSArchive.escapeHtml(id)}</p>
            </div>
            <div>
              <strong>${MSArchive.escapeHtml(item.caption)}</strong>
              <p>${MSArchive.escapeHtml(eventsById[item.eventId]?.title || item.eventId)}</p>
              <p>${MSArchive.escapeHtml(peopleNames(item.people))}</p>
            </div>
            <div class="record-actions">
              <button type="button" data-open-edit="${MSArchive.escapeHtml(id)}">Edit</button>
            </div>
          </article>`;
      }).join('');

      const newMarkup = newRecords.map((item, index) => `
        <article class="manager-record">
          <div>
            <span class="record-badge new">New</span>
            <code>${MSArchive.escapeHtml(item.file)}</code>
            <p>ID: ${MSArchive.escapeHtml(item.id)} · ${MSArchive.escapeHtml(item.type)}</p>
          </div>
          <div>
            <strong>${MSArchive.escapeHtml(item.caption)}</strong>
            <p>${MSArchive.escapeHtml(eventsById[item.eventId]?.title || item.eventId)}</p>
            <p>${MSArchive.escapeHtml(peopleNames(item.people))}</p>
          </div>
          <div class="record-actions">
            <button type="button" data-remove-new="${index}">Remove</button>
          </div>
        </article>`).join('');

      list.innerHTML = `${editedMarkup}${newMarkup}`;

      list.querySelectorAll('[data-remove-new]').forEach(button => {
        button.addEventListener('click', () => {
          newRecords.splice(Number(button.dataset.removeNew), 1);
          renderChanges();
        });
      });

      list.querySelectorAll('[data-open-edit]').forEach(button => {
        button.addEventListener('click', () => {
          existingSelect.value = button.dataset.openEdit;
          existingSelect.dispatchEvent(new Event('change'));
          document.querySelector('#edit-media-heading').scrollIntoView({behavior: 'smooth', block: 'start'});
        });
      });
    };

    const loadEditor = id => {
      const item = workingById.get(id);
      if (!item) {
        editor.hidden = true;
        editStatus.textContent = '';
        return;
      }

      editor.hidden = false;
      editId.textContent = id;
      editFile.textContent = item.file || '—';
      editType.textContent = item.type || MSArchive.mediaType(item) || '—';
      editOrder.textContent = item.order ?? '—';
      editEvent.value = item.eventId || '';
      editCaption.value = item.caption || '';
      editPeoplePicker.setValue(item.people);
      editStatus.textContent = editedIds.has(id) ? 'This record has unsaved session changes.' : '';
    };

    refreshExistingSelect();
    setControlsDisabled(false);

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

      const existingFiles = new Set(
        [...workingMedia, ...newRecords].map(item => String(item.file || '').toLocaleLowerCase())
      );
      const selectedPeople = addPeoplePicker.getValue();
      let accepted = 0;
      let duplicates = 0;

      files.forEach(file => {
        const type = MSArchive.mediaType({file: file.name});
        if (!['image', 'video'].includes(type)) return;
        if (existingFiles.has(file.name.toLocaleLowerCase())) {
          duplicates += 1;
          return;
        }

        const id = uniqueId(MSArchive.slug(MSArchive.fileStem(file.name)));
        const event = eventsById[eventSelect.value];
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
          era: event?.era,
          people: [...selectedPeople],
          order: nextOrder++
        });
        existingFiles.add(file.name.toLocaleLowerCase());
        accepted += 1;
      });

      if (!accepted) {
        alert(duplicates
          ? 'Those filenames already exist in media.json.'
          : 'None of the selected files use a supported image or video format.');
        return;
      }

      filesInput.value = '';
      captionInput.value = '';
      renderChanges();
      if (duplicates) alert(`${duplicates} duplicate filename${duplicates === 1 ? ' was' : 's were'} skipped.`);
    });

    existingSelect.addEventListener('change', () => loadEditor(existingSelect.value));

    saveEditButton.addEventListener('click', () => {
      const id = existingSelect.value;
      const item = workingById.get(id);
      if (!item) return;

      const caption = editCaption.value.trim();
      if (!caption) {
        alert('Caption cannot be blank.');
        return;
      }
      if (!editEvent.value) {
        alert('Choose the related event.');
        return;
      }

      const previousEventId = item.eventId;
      const selectedPeople = editPeoplePicker.getValue();
      item.caption = caption;
      item.eventId = editEvent.value;
      if (!samePeople(item.people, selectedPeople)) item.people = [...selectedPeople];
      if (previousEventId !== item.eventId && Object.hasOwn(item, 'era')) {
        item.era = eventsById[item.eventId]?.era || item.era;
      }

      updateEditedState(id);
      refreshExistingSelect(id);
      renderChanges();
      editStatus.textContent = editedIds.has(id)
        ? 'Saved to this browser session. Download media.json to keep the change.'
        : 'The record now matches the repository version.';
    });

    revertEditButton.addEventListener('click', () => {
      const id = existingSelect.value;
      const original = originalById.get(id);
      const item = workingById.get(id);
      if (!original || !item) return;

      item.caption = original.caption;
      item.eventId = original.eventId;
      item.people = clonePeople(original.people);
      if (Object.hasOwn(original, 'era')) item.era = original.era;
      else delete item.era;

      editedIds.delete(id);
      refreshExistingSelect(id);
      loadEditor(id);
      renderChanges();
      editStatus.textContent = 'Selected record reverted to the repository version.';
    });

    document.querySelector('#manager-clear').addEventListener('click', () => {
      newRecords = [];
      renderChanges();
    });

    resetEditsButton.addEventListener('click', () => {
      if (editedIds.size && !window.confirm('Reset all existing-record edits made in this session?')) return;
      sourceMedia.forEach(original => {
        const id = original.id || MSArchive.mediaId(original);
        const item = workingById.get(id);
        if (!item) return;
        item.caption = original.caption;
        item.eventId = original.eventId;
        item.people = clonePeople(original.people);
        if (Object.hasOwn(original, 'era')) item.era = original.era;
        else delete item.era;
      });
      editedIds.clear();
      refreshExistingSelect(existingSelect.value);
      loadEditor(existingSelect.value);
      renderChanges();
    });

    downloadButton.addEventListener('click', () => {
      const combined = [...workingMedia, ...newRecords];
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

    renderChanges();
  } catch (error) {
    setControlsDisabled(true);
    eventSelect.innerHTML = '<option value="">Events failed to load</option>';
    existingSelect.innerHTML = '<option value="">Media failed to load</option>';
    existingCount.textContent = 'Records failed to load';
    editor.hidden = true;
    list.innerHTML = `
      <div class="error-state">
        <strong>The Media Manager could not load.</strong>
        ${MSArchive.escapeHtml(error.message)}
        <br><br>
        Make sure this page is opened through GitHub Pages or a local server—not directly as a file.
      </div>
    `;
    console.error(error);
  }
});
