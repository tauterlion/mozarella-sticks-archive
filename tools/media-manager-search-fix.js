(() => {
  'use strict';

  const setupPeopleSearch = root => {
    const search = root.querySelector('[data-people-search]');
    const optionsRoot = root.querySelector('[data-people-options]');
    if (!search || !optionsRoot) return;

    const emptyState = document.createElement('p');
    emptyState.className = 'people-search-empty';
    emptyState.dataset.peopleEmpty = '';
    emptyState.hidden = true;
    emptyState.setAttribute('role', 'status');
    emptyState.setAttribute('aria-live', 'polite');
    emptyState.textContent = 'No people found.';
    optionsRoot.after(emptyState);

    const options = () => [...optionsRoot.querySelectorAll('.person-option')];

    const updateEmptyState = () => {
      const query = search.value.trim();
      const currentOptions = options();
      const hasVisibleMatch = currentOptions.some(option => !option.hidden);
      emptyState.hidden = !query || !currentOptions.length || hasVisibleMatch;
    };

    search.addEventListener('input', () => {
      window.requestAnimationFrame(updateEmptyState);
    });

    search.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        search.value = '';
        search.dispatchEvent(new Event('input', {bubbles: true}));
        return;
      }

      if (event.key !== 'Enter') return;

      event.preventDefault();
      const firstVisible = options().find(option => !option.hidden);
      const checkbox = firstVisible?.querySelector('input[type="checkbox"]');
      if (!checkbox) return;

      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    });

    root.addEventListener('toggle', () => {
      if (root.open) window.requestAnimationFrame(updateEmptyState);
    });

    new MutationObserver(updateEmptyState).observe(optionsRoot, {childList: true});
    updateEmptyState();
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.people-picker').forEach(setupPeopleSearch);
  });
})();
