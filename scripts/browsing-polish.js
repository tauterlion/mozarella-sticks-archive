document.addEventListener('DOMContentLoaded', () => {
  const search = document.querySelector('#timeline-search, #gallery-search');
  const filterToggle = document.querySelector('#filter-toggle');
  const lightbox = document.querySelector('#lightbox');
  const timelineToolbar = document.querySelector('.timeline-toolbar');
  const activeFilters = document.querySelector('#active-filters');
  const timelineRoot = document.querySelector('#timeline-root');
  const expandAllButton = document.querySelector('#expand-all');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const backToTop = document.createElement('button');
  backToTop.className = 'back-to-top';
  backToTop.type = 'button';
  backToTop.hidden = true;
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.setAttribute('aria-keyshortcuts', 't');
  backToTop.innerHTML = '<span aria-hidden="true">↑</span><span>Top</span>';
  document.body.append(backToTop);

  const updateBackToTop = () => {
    backToTop.hidden = window.scrollY < 650;
  };

  backToTop.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: reducedMotion.matches ? 'auto' : 'smooth'
    });
  });

  window.addEventListener('scroll', updateBackToTop, {passive: true});
  updateBackToTop();

  let stickyFrame = 0;
  const updateTimelineStickyOffsets = () => {
    stickyFrame = 0;
    if (!timelineToolbar) return;

    const toolbarHeight = Math.ceil(timelineToolbar.getBoundingClientRect().height);
    const filterBarHeight = activeFilters && !activeFilters.hidden
      ? Math.ceil(activeFilters.getBoundingClientRect().height)
      : 0;

    document.documentElement.style.setProperty('--timeline-toolbar-height', `${toolbarHeight}px`);
    document.documentElement.style.setProperty('--timeline-filter-bar-height', `${filterBarHeight}px`);
  };

  const scheduleTimelineStickyOffsets = () => {
    if (stickyFrame) return;
    stickyFrame = window.requestAnimationFrame(updateTimelineStickyOffsets);
  };

  if (timelineToolbar) {
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(scheduleTimelineStickyOffsets);
      resizeObserver.observe(timelineToolbar);
      if (activeFilters) resizeObserver.observe(activeFilters);
    }

    if (activeFilters) {
      const filterObserver = new MutationObserver(scheduleTimelineStickyOffsets);
      filterObserver.observe(activeFilters, {
        attributes: true,
        attributeFilter: ['hidden'],
        childList: true
      });
    }

    window.addEventListener('resize', scheduleTimelineStickyOffsets);
    scheduleTimelineStickyOffsets();
  }

  if (timelineRoot && expandAllButton) {
    const timelineRenderObserver = new MutationObserver(() => {
      expandAllButton.textContent = 'Expand all';
    });
    timelineRenderObserver.observe(timelineRoot, {childList: true});
  }

  const isEditableTarget = target => target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (lightbox && !lightbox.hidden) return;

    const editable = isEditableTarget(event.target);

    if (event.key === '/' && !editable && search) {
      event.preventDefault();
      search.focus();
      search.select();
      return;
    }

    if (event.key.toLowerCase() === 't' && !editable && !backToTop.hidden) {
      event.preventDefault();
      backToTop.click();
      return;
    }

    if (event.key.toLowerCase() === 'f' && !editable && filterToggle) {
      event.preventDefault();
      filterToggle.click();
      return;
    }

    if (event.key === 'Escape') {
      const searchFocused = event.target === search;
      if (editable && !searchFocused) return;

      if (search?.value) {
        event.preventDefault();
        search.value = '';
        search.dispatchEvent(new Event('input', {bubbles: true}));
        search.focus();
        return;
      }

      if (filterToggle?.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        filterToggle.click();
        filterToggle.focus();
      }
    }
  });
});
