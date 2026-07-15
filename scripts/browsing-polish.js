document.addEventListener('DOMContentLoaded', () => {
  const search = document.querySelector('#timeline-search, #gallery-search');
  const filterToggle = document.querySelector('#filter-toggle');
  const lightbox = document.querySelector('#lightbox');
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
      if (search?.value) {
        search.value = '';
        search.dispatchEvent(new Event('input', {bubbles: true}));
        search.focus();
        return;
      }

      if (filterToggle?.getAttribute('aria-expanded') === 'true') {
        filterToggle.click();
        filterToggle.focus();
      }
    }
  });
});
