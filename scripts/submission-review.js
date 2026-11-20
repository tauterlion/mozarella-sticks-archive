/* Private data and Auth sessions stay in memory. No localStorage or URL tokens. */
(async () => {
  const $ = id => document.getElementById(id);
  let client, config, factorId, page = 0, selected, epoch = 0, previewTimer, sessionTimer, qrURL;
  let dirty = false, mutating = false, retryOperation = null, catalog;
  const say = text => { $('review-message').textContent = text; };
  const clearPreview = () => { clearTimeout(previewTimer); $('preview').replaceChildren(); };
  const clearQR = () => { if (qrURL) URL.revokeObjectURL(qrURL); qrURL = null; $('qr').removeAttribute('src'); $('qr-panel').hidden = true; };
  function clearPrivate() {
    epoch++; selected = null; dirty = false; retryOperation = null; $('history').replaceChildren(); $('edit-form').reset(); $('reject-reason').value = '';  clearPreview(); clearQR(); clearInterval(sessionTimer);
    $('queue').replaceChildren(); $('metadata').replaceChildren(); $('pending-count').textContent = '';
    $('review-panel').hidden = $('detail').hidden = $('mfa-panel').hidden = true;
    $('password').value = $('code').value = '';
  }
  async function api(action, payload = {}) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('unauthorized');
    const response = await fetch(config.endpoint, { method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'review_unavailable');
    return data;
  }
  async function fail(error) {
    if (['unauthorized','forbidden','mfa_required'].includes(error.message)) {
      clearPrivate(); await client.auth.signOut({ scope: 'local' }).catch(() => {});
      $('login-panel').hidden = false; $('sign-out').hidden = true;
      say('Access ended or is not authorized. Sign in with the enrolled moderator account.');
    } else {
      const messages = { conflict: 'This submission changed in another tab. Your edits remain here; reload saved details before trying again.', request_reused: 'This retry no longer matches the original action. Reload saved details.', invalid_state: 'This submission is no longer editable in its current state.', unavailable: 'This file is being removed or is unavailable.', event_required: 'Map the proposal to an existing archive event before approval.', invalid_metadata: 'Check the caption, event and people tags. The server did not save these changes.', invalid_request: 'Check all required fields and your people selection.' };
      const message = messages[error.message] || 'Unable to complete that request. Please try again.';
      say(message); $('edit-status').textContent = message;
    }
  }
  async function run(button, task) {
    button.disabled = true;
    try { await task(); } catch (error) { await fail(error); }
    finally { button.disabled = false; }
  }
  async function queue() {
    const generation = ++epoch; selected = null; clearPreview(); $('detail').hidden = true;
    const data = await api('list', { status: $('queue-status').value, page });
    if (generation !== epoch) return;
    $('queue').replaceChildren(); $('pending-count').textContent = `${data.pendingCount} pending`;
    for (const item of data.items) {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.textContent = `${item.caption} — ${item.original_filename}`;
      button.addEventListener('click', () => { if (canLeave()) run(button, () => detail(item.id)); });
      li.append(button); $('queue').append(li);
    }
    if (!data.items.length) { const li = document.createElement('li'); li.textContent = 'No submissions in this queue.'; $('queue').append(li); }
    $('previous').disabled = page === 0; $('next').disabled = (page + 1) * 25 >= data.total;
    $('page-number').textContent = `Page ${page + 1}`;
    say('Private queue loaded.');
  }
  async function detail(id) {
    const generation = ++epoch; clearPreview(); $('detail').hidden = true;
    const { item } = await api('detail', { id }); if (generation !== epoch) return;
    selected = item; dirty = false; retryOperation = null; $('edit-status').textContent = ''; $('metadata').replaceChildren();
    for (const [label, value] of Object.entries({ Caption: item.caption, Status: item.status, File: item.original_filename,
      Type: item.mime_type, Bytes: item.file_size, Event: item.event_id || item.proposed_event_title,
      'Proposed date': item.proposed_event_date, 'Proposal details': item.proposed_event_details,
      People: item.no_people_to_tag ? 'No people tagged' : item.people_ids.join(', ') })) {
      if (value == null) continue;
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = String(value); $('metadata').append(dt, dd);
    }
    await fillEditor(item, generation); if (generation !== epoch) return;
    $('detail').hidden = false; $('preview-button').hidden = item.status === 'removed'; $('detail-heading').focus();
  }
  function canLeave() {
    if (mutating) return false;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return false;
    dirty = false; retryOperation = null; return true;
  }
  async function fillEditor(item, generation) {
    if (!catalog) {
      const [timeline, people] = await Promise.all(['timeline','people'].map(async name => {
        const response = await fetch(`../data/${name}.json`); if (!response.ok) throw new Error('catalog_unavailable'); return response.json();
      }));
      if (generation !== epoch) return;
      catalog = { events: timeline.events, people: people.people };
      const proposal = new Option('Propose an event', '__proposal'); $('edit-event').append(proposal);
      for (const event of catalog.events) $('edit-event').append(new Option(event.title, event.id));
      for (const person of catalog.people) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.value = person.id; label.append(input, document.createTextNode(' ' + person.displayName)); $('edit-people').append(label);
      }
    }
    $('edit-caption').value = item.caption; $('edit-event').value = item.event_id || '__proposal';
    $('edit-title').value = item.proposed_event_title || ''; $('edit-date').value = item.proposed_event_date || ''; $('edit-details').value = item.proposed_event_details || '';
    $('edit-none').checked = item.no_people_to_tag;
    for (const input of $('edit-people').querySelectorAll('input')) input.checked = item.people_ids.includes(input.value);
    $('reject-reason').value = item.review_notes || '';
    toggleProposal(); $('edit-fields').disabled = item.status !== 'pending';
    $('approve').disabled = item.status !== 'pending'; $('reject').disabled = !['pending','approved'].includes(item.status);
    $('reject-reason').disabled = $('reject').disabled;
    const { actions } = await api('history', { id: item.id });
    if (generation !== epoch) return;
    $('history').replaceChildren();
    for (const action of actions) {
      const li = document.createElement('li'); li.textContent = `${action.action} · ${new Date(action.created_at).toLocaleString()} · version ${action.version} · moderator ${action.actor_id}`; $('history').append(li);
    }
    if (!actions.length) { const li = document.createElement('li'); li.textContent = 'No moderator actions yet.'; $('history').append(li); }
  }
  function toggleProposal() {
    const proposal = $('edit-event').value === '__proposal'; $('proposal-fields').hidden = !proposal;
    $('edit-title').required = $('edit-details').required = proposal;
  }
  function editedMetadata() {
    const proposal = $('edit-event').value === '__proposal';
    return { caption: $('edit-caption').value.trim(), eventId: proposal ? null : $('edit-event').value,
      people: [...$('edit-people').querySelectorAll('input:checked')].map(input => input.value), noPeople: $('edit-none').checked,
      proposedTitle: proposal ? $('edit-title').value.trim() : null, proposedDate: proposal ? $('edit-date').value || null : null,
      proposedDetails: proposal ? $('edit-details').value.trim() : null };
  }
  async function mutate(action, extra = {}) {
    if (!selected || mutating) return;
    const generation = epoch, id = selected.id, payload = { id, version: selected.version, ...extra };
    const fingerprint = JSON.stringify({ action, ...payload });
    if (!retryOperation || retryOperation.fingerprint !== fingerprint) retryOperation = { fingerprint, requestId: crypto.randomUUID() };
    payload.requestId = retryOperation.requestId; mutating = true;
    $('edit-fields').disabled = true; $('approve').disabled = $('reject').disabled = true;
    try {
      await api(action, payload); if (generation !== epoch) return;
      dirty = false; retryOperation = null; await queue(); await detail(id);
      const message = action === 'edit' ? 'Metadata saved.' : action === 'approve' ? 'Approved. The file remains private and is not published.' : 'Rejected. The file remains private.';
      say(message); $('edit-status').textContent = message;
    } finally {
      mutating = false;
      if (selected) { $('edit-fields').disabled = selected.status !== 'pending'; $('approve').disabled = selected.status !== 'pending'; $('reject').disabled = !['pending','approved'].includes(selected.status); }
    }
  }
  async function enter() {
    await api('session'); clearQR(); $('mfa-panel').hidden = true; $('review-panel').hidden = false;
    await queue(); sessionTimer = setInterval(() => api('session').catch(fail), 60000);
  }
  try {
    config = await (await fetch('../data/moderation-config.json', { cache: 'no-store' })).json();
    if (!config.enabled) { say('Moderator review is not enabled in this environment.'); return; }
    if (!config.supabaseUrl || !config.publishableKey || !config.endpoint) throw new Error('configuration');
    client = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
    });
    client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { clearPrivate(); $('login-panel').hidden = false; $('sign-out').hidden = true; } });
    $('login-panel').hidden = false; say('Sign in to access private submissions.');
    $('login-form').addEventListener('submit', event => {
      event.preventDefault(); run(event.submitter, async () => {
        const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
        $('password').value = ''; if (error) throw new Error('login_failed');
        $('login-panel').hidden = true; $('sign-out').hidden = false;
        const { data, error: factorsError } = await client.auth.mfa.listFactors(); if (factorsError) throw factorsError;
        factorId = data.totp.find(f => f.status === 'verified')?.id;
        $('mfa-panel').hidden = false; $('enroll').hidden = !!factorId; $('mfa-form').hidden = !factorId;
        say(factorId ? 'Enter the code from your authenticator.' : 'Set up your authenticator before accessing the queue.');
      });
    });
    $('enroll').addEventListener('click', () => run($('enroll'), async () => {
      const { data: factors, error: listError } = await client.auth.mfa.listFactors(); if (listError) throw listError;
      for (const factor of factors.totp.filter(f => f.status === 'unverified')) {
        const { error } = await client.auth.mfa.unenroll({ factorId: factor.id }); if (error) throw error;
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AoMS moderator' }); if (error) throw error;
      factorId = data.id; clearQR(); qrURL = URL.createObjectURL(new Blob([data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, '')], { type: 'image/svg+xml' }));
      $('qr').src = qrURL; $('qr-panel').hidden = false; $('mfa-form').hidden = false; $('enroll').hidden = true;
    }));
    $('mfa-form').addEventListener('submit', event => {
      event.preventDefault(); run(event.submitter, async () => {
        const code = $('code').value; $('code').value = '';
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw new Error('verification_failed');
        await enter();
      });
    });
    $('sign-out').addEventListener('click', () => run($('sign-out'), async () => {
      clearPrivate(); const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) { say('Private view cleared. Session revocation failed; reconnect and sign out again.'); return; }
      $('login-panel').hidden = false; $('sign-out').hidden = true; say('Signed out.');
    }));
    $('queue-status').addEventListener('change', () => { if (canLeave()) { page = 0; queue().catch(fail); } });
    $('refresh').addEventListener('click', () => canLeave() && run($('refresh'), queue));
    $('previous').addEventListener('click', () => { if (canLeave()) { page = Math.max(0, page - 1); queue().catch(fail); } });
    $('next').addEventListener('click', () => { if (canLeave()) { page++; queue().catch(fail); } });
    $('preview-button').addEventListener('click', () => run($('preview-button'), async () => {
      if (!selected) return; const generation = epoch, item = selected;
      const { url } = await api('preview', { id: item.id }); if (generation !== epoch) return;
      clearPreview(); const media = document.createElement(item.mime_type.startsWith('video/') ? 'video' : 'img');
      if (media.tagName === 'VIDEO') { media.controls = true; media.preload = 'metadata'; } else media.alt = item.caption;
      media.src = url; media.referrerPolicy = 'no-referrer'; $('preview').append(media);
      previewTimer = setTimeout(clearPreview, 60000); say('Private preview available for one minute. Reload it if needed.');
    }));
    $('edit-form').addEventListener('input', () => { dirty = true; });
    $('edit-event').addEventListener('change', toggleProposal);
    $('edit-none').addEventListener('change', () => { if ($('edit-none').checked) for (const input of $('edit-people').querySelectorAll('input')) input.checked = false; });
    $('edit-people').addEventListener('change', () => { if ($('edit-people').querySelector('input:checked')) $('edit-none').checked = false; });
    $('edit-form').addEventListener('submit', event => { event.preventDefault(); if (!mutating && $('edit-form').reportValidity()) mutate('edit', editedMetadata()).catch(fail); });
    $('reload-detail').addEventListener('click', () => { if (selected && canLeave()) detail(selected.id).catch(fail); });
    $('approve').addEventListener('click', () => {
      if (dirty) { say('Save your metadata changes before approving.'); return; }
      if (window.confirm('Approve this submission? It will remain private until a separate publication step.')) mutate('approve').catch(fail);
    });
    $('reject').addEventListener('click', () => {
      if (dirty) { say('Save or discard metadata changes before rejecting.'); return; }
      if (window.confirm('Reject this submission? It will remain private and follow the rejection retention policy.')) mutate('reject', { reason: $('reject-reason').value.trim() }).catch(fail);
    });
    window.addEventListener('beforeunload', event => { if (dirty || mutating) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('pagehide', clearPrivate);
  } catch { say('Moderator review configuration is unavailable.'); }
})();
