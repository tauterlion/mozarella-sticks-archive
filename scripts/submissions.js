// No API keys, login, attribution, persistent capabilities or private preview URLs.
const $ = selector => document.querySelector(selector);
const MAX = 52428800, TYPES = ['image/jpeg','image/png','image/webp','video/mp4','video/webm'];
const files = [], references = new Set();
let config, events, people, token = '', widget, capability, batch, busy = false;
const message = text => { $('#selection-message').textContent = text; $('#send-status').textContent = text; };
const errors = {
  intake_disabled:'Submissions are not open yet. Your files have not been sent.',
  quota_exhausted:'The private inbox is at capacity. Please try again later.',
  rate_limited:'The archive is receiving too many requests. Please wait a minute and retry.',
  busy:'Another file is being checked. Please wait a moment and retry.',
  batch_expired:'This upload session expired. Checking which files can continue…',
  recovery_unavailable:'An earlier file could not be confirmed. Keep this page open and retry the check before resending it.',
  captcha_failed:'The security check expired or failed. Please complete it again.',
  invalid_media:'This file did not pass the media checks. It has not been submitted for review.',
  invalid_request:'Please check the caption, event and people selections. The request was not accepted.',
  upload_unavailable:'This file is no longer available for this upload session.',
  upload_not_ready:'The upload is not complete yet. Retry to continue.',
};
async function api(action, payload = {}) {
  const response = await fetch(config.endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,capability,...payload}),signal:AbortSignal.timeout(120000)});
  const data = await response.json();
  if (!response.ok) { const error = new Error(errors[data.error] || 'The connection was interrupted. Please retry.'); error.code = data.error; throw error; }
  return data;
}
function node(tag, text, attrs = {}) { const el = document.createElement(tag); if (text) el.textContent = text; for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value); return el; }
function field(parent, title, tag, attrs = {}) { const label = node('label',title), input = node(tag,'',{'aria-label':title,...attrs}); label.append(input); parent.append(label); return input; }
function checkbox(parent, title) { const label = node('label','',{class:'people-choice'}), input = node('input','',{type:'checkbox'}); label.append(input,node('span',title)); parent.append(label); return input; }
function setStatus(item, text) { item.status.textContent = text; $('#send-status').textContent = `${item.file.name}: ${text}`; }
function updateButton() { $('#send-files').disabled = !config?.enabled || !config.turnstileSitekey || !token && !batch || busy || !files.some(i=>!i.done && !i.terminal); }
function metadata(item) {
  const proposed = item.event.value === '__propose';
  return { clientFileId:item.clientId,filename:item.file.name,mime:item.file.type,size:item.file.size,
    caption:item.caption.value.trim(),eventId:proposed?null:item.event.value,people:item.tags.filter(t=>t.input.checked).map(t=>t.id),noPeople:item.none.checked,
    proposedTitle:proposed?item.title.value.trim():null,proposedDate:proposed?item.date.value||null:null,proposedDetails:proposed?item.details.value.trim():null,consent:$('#consent').checked };
}
function addFile(file) {
  if (!TYPES.includes(file.type) || !file.size || file.size > MAX) return `${file.name}: choose an allowed file between 1 byte and 50 MiB.`;
  if (files.some(i=>i.file.name===file.name && i.file.size===file.size && i.file.lastModified===file.lastModified)) return `${file.name} is already selected.`;
  const item = {file,clientId:crypto.randomUUID()}, card = node('article','',{class:'submission-file'});
  item.card = card;
  const header = node('header'), visual = node(file.type.startsWith('video/')?'video':'img','',{class:'submission-preview'});
  item.objectURL = URL.createObjectURL(file); visual.src = item.objectURL;
  if (visual.tagName === 'IMG') visual.alt = ''; else { visual.muted = true; visual.preload = 'metadata'; }
  const heading = node('div'); heading.append(node('h2',file.name),node('p',`${(file.size/1048576).toFixed(2)} MiB`,{class:'submission-small'}));
  header.append(visual,heading); card.append(header);
  const fields = node('fieldset'); item.fields = fields; card.append(fields);
  fields.append(node('legend',`Details for ${file.name}`,{class:'sr-only'}));
  item.caption = field(fields,'Caption','textarea',{required:'',maxlength:'500',rows:'2'});
  item.event = field(fields,'Event','select',{required:''});
  item.event.append(new Option('Choose an event',''),new Option('Propose an event…','__propose'));
  for (const event of events) item.event.append(new Option(`${event.title} · ${event.dateLabel}`,event.id));
  const proposal = node('div'); proposal.hidden = true; fields.append(proposal);
  item.title = field(proposal,'Proposed event title','input',{maxlength:'160'});
  item.date = field(proposal,'Date (optional)','input',{type:'date'});
  item.details = field(proposal,'Tell us about the event','textarea',{maxlength:'2000'});
  item.event.addEventListener('change',()=>{proposal.hidden=item.event.value!=='__propose';item.title.required=item.details.required=!proposal.hidden;});
  fields.append(node('p','Who is shown?'));
  item.none = checkbox(fields,'No people to tag');
  const search = field(fields,'Find people','input',{type:'search',placeholder:'Search the directory',autocomplete:'off'});
  const tags = node('div','',{class:'submission-people'}); fields.append(tags);
  item.tags = people.map(person=>({id:person.id,person,input:checkbox(tags,person.displayName)}));
  search.addEventListener('input',()=>{ const q=search.value.toLocaleLowerCase(); for(const tag of item.tags) tag.input.parentElement.hidden=![tag.person.displayName,...(tag.person.aliases||[])].join(' ').toLocaleLowerCase().includes(q); });
  item.none.addEventListener('change',()=>{for(const tag of item.tags) {tag.input.disabled=item.none.checked;if(item.none.checked)tag.input.checked=false;}});
  item.progress = node('progress','',{max:'100',value:'0','aria-label':`Upload progress for ${file.name}`});
  item.status = node('p','Ready to add details.',{class:'submission-file-status',role:'status','aria-live':'polite'});
  const actions = node('div','',{class:'submission-actions'});
  const apply = node('button','Apply details to all',{type:'button'});
  apply.addEventListener('click',()=>{for(const other of files.filter(i=>!i.locked && i!==item)) {
    for(const key of ['caption','event','title','date','details']) other[key].value=item[key].value;
    other.event.dispatchEvent(new Event('change')); other.none.checked=item.none.checked; other.none.dispatchEvent(new Event('change'));
    for(const tag of other.tags) tag.input.checked=item.tags.some(t=>t.id===tag.id && t.input.checked);
  } message('Details copied to all files that have not started uploading.');});
  const remove = node('button','Remove',{type:'button'});
  remove.addEventListener('click',async()=>{
    if (item.done || item.terminal || !item.attempted && !item.running) {
      URL.revokeObjectURL(item.objectURL); files.splice(files.indexOf(item),1); card.remove(); updateButton();
      return;
    }
    if (item.finalizing || item.cancelRequested) return;
    item.cancelRequested = true;
    remove.disabled = true;
    setStatus(item,'Cancelling…');
    if (item.running) {
      await item.upload?.abort().catch(()=>{});
      item.abortTransfer?.();
      return;
    }
    try { await cancelItem(item); }
    catch(e) { setStatus(item,e.message); }
    finally { updateButton(); }
  });
  item.remove = remove; item.apply = apply;
  actions.append(apply,remove);card.append(item.progress,item.status,actions);$('#submission-files').append(card);files.push(item);updateButton();return '';
}
function choose(selected) { const messages = Array.from(selected,addFile).filter(Boolean); message(messages.join(' ') || `${files.length} file${files.length===1?'':'s'} selected. Add a caption, event and people for each.`); }
function transfer(item, upload) {
  return new Promise((resolve,reject)=>{
    const options = {endpoint:upload.endpoint,headers:{'x-signature':upload.token},chunkSize:6*1024*1024,
      retryDelays:[0,1000,3000,5000],storeFingerprintForResuming:false,removeFingerprintOnSuccess:true,
      metadata:{bucketName:upload.bucket,objectName:upload.path,contentType:upload.mime,cacheControl:'3600'},
      onProgress:(sent,total)=>{item.progress.value=sent/total*100;setStatus(item,`Uploading · ${Math.round(sent/total*100)}%`);},
      onError:()=>reject(new Error('Transfer interrupted. Retry to continue this file.')),onSuccess:resolve};
    if (item.upload) Object.assign(item.upload.options, { headers: options.headers, onSuccess: resolve, onError: options.onError });
    else item.upload=new tus.Upload(item.file,options);
    item.abortTransfer=()=>reject(new Error('Upload cancelled.'));
    item.upload.start();
  });
}
async function cancelItem(item) {
  if (!item.id) {
    setStatus(item,'Cancellation requested. Use Send for review to reconcile the earlier request first.');
    return;
  }
  await api('cancel',{id:item.id});
  markStopped(item,'Cancelled. The private upload will be cleaned up.');
}
function markStopped(item,status) {
  item.terminal=true;item.remove.disabled=false;item.remove.textContent='Remove from this page';
  setStatus(item,status);
}
async function finalize(item) {
  item.finalizing=true;item.remove.disabled=true;
  try { return await api('complete',{id:item.id}); }
  finally { item.finalizing=false;item.remove.disabled=Boolean(item.cancelRequested); }
}
async function sendItem(item) {
  item.running=true;item.locked=true;item.fields.disabled=true;item.apply.disabled=true;
  item.remove.textContent='Cancel';item.remove.disabled=Boolean(item.cancelRequested);
  try {
    if (item.cancelRequested && item.id) return await cancelItem(item);
    setStatus(item,'Preparing private upload…');
    item.attempted=true;
    const authorized = await api('authorize',item.savedMetadata ||= metadata(item));
    if(authorized.status==='pending') return complete(item,authorized.receipt);
    item.id=authorized.id;
    if(item.cancelRequested) return await cancelItem(item);
    // Reconcile a lost completion response before sending any more bytes.
    let receipt;
    try { receipt=await finalize(item); }
    catch(e) {if(e.code!=='upload_not_ready')throw e;}
    if(!receipt) {
      try { await transfer(item,authorized.upload); }
      catch(e) { if (!item.cancelRequested) throw e; }
      if(item.cancelRequested) return await cancelItem(item);
      setStatus(item,'Checking the stored file…');
      receipt=await finalize(item);
    }
    complete(item,receipt.receipt);
  } catch(e) {
    if (e.code === 'invalid_media') { markStopped(item,e.message); return; }
    setStatus(item,e.message);
    throw e;
  } finally {
    item.running=false;item.abortTransfer=null;
    item.remove.disabled=Boolean(item.cancelRequested && !item.done && !item.terminal);
    item.remove.textContent=item.done||item.terminal?'Remove from this page':'Cancel';
  }
}
async function rollover() {
  for (const item of files.filter(i=>i.attempted&&!i.done&&!i.terminal)) {
    const result=await api('recover',{clientFileId:item.clientId});
    if (result.status==='received') complete(item,result.receipt);
    else if (item.cancelRequested) markStopped(item,'Cancelled. The private upload will be cleaned up.');
    else if (result.status==='failed') markStopped(item,'The previous upload failed. Remove it and choose a valid file to try again.');
    else if (result.status==='retry') {
      item.attempted=false;item.id=null;item.upload=null;item.progress.value=0;
      setStatus(item,'Ready for the next upload session.');
    } else throw new Error(errors.recovery_unavailable);
  }
  // A fresh challenge is required for a fresh batch. Keep the queue and receipts.
  batch=null;capability=null;token='';window.turnstile?.reset(widget);
  message(files.some(i=>!i.done&&!i.terminal)
    ? 'Complete a new security check, then use Send for review to continue the remaining files.'
    : 'All remaining files have been checked.');
}
function complete(item,reference) {
  item.done=true;item.remove.disabled=false;item.progress.value=100;setStatus(item,'Received privately · awaiting review');
  references.add(reference);$('#receipt').hidden=false;$('#receipt-reference').textContent=`Reference${references.size>1?'s':''}: ${[...references].join(', ')}`;
}
$('#files').addEventListener('change',e=>{if(events)choose(e.target.files);e.target.value='';});
for(const name of ['dragenter','dragover'])$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.add('dragging');});
$('#drop-zone').addEventListener('dragleave',()=>$('#drop-zone').classList.remove('dragging'));
$('#drop-zone').addEventListener('drop',e=>{e.preventDefault();$('#drop-zone').classList.remove('dragging');if(events)choose(e.dataTransfer.files);});
$('#submission-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy || !config.enabled || !$('#consent').checked)return;
  const queue=files.filter(i=>!i.done&&!i.terminal);
  if(!queue.length)return;
  for(const item of queue)if(!item.none.checked&&!item.tags.some(t=>t.input.checked)){message(`Select people or “No people to tag” for ${item.file.name}.`);item.none.focus();return;}
  busy=true;updateButton();
  message('Verifying your submission…');
  try {
    if(batch && Date.parse(batch.expiresAt)<=Date.now()) { await rollover(); return; }
    if(!batch) {
      capability ||= Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      // Resume recovers a lost batch response without consuming a second token.
      try {batch=await api('resume');} catch(e){if(e.code!=='batch_expired')throw e;}
      if(!batch)batch=await api('batch',{token,consent:true});
      token='';
    }
    // Sequential transfer is intentional: minimal mobile bandwidth/memory and
    // one server-side validation at a time. The database permits up to three.
    for(const item of queue) {
      if(Date.parse(batch.expiresAt)<=Date.now()) { await rollover(); return; }
      if(!item.terminal && files.includes(item)) await sendItem(item);
    }
    message(files.some(i=>!i.done&&!i.terminal)?'Check each file above and retry unfinished files.':'Finished checking the selected files.');
  } catch(e) {
    if(e.code==='batch_expired' && batch) {
      try { await rollover(); } catch(recoveryError) {message(recoveryError.message);}
    } else {
      message(e.message);
      if(e.code==='captcha_failed') { token='';window.turnstile?.reset(widget); }
    }
  }
  finally {busy=false;updateButton();}
});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
try {
  const results=await Promise.all(['data/submissions-config.json','data/timeline.json','data/people.json'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error();return r.json();}));
  [config]=results;events=results[1].events;people=results[2].people;
  if(config.enabled&&config.turnstileSitekey) {
    $('#intake-notice').textContent='Files are sent to a private inbox. Nothing appears in the Gallery without review.';
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.onload=()=>{widget=window.turnstile.render('#turnstile',{sitekey:config.turnstileSitekey,action:'aoms_submission',theme:'auto',callback:value=>{token=value;updateButton();},'expired-callback':()=>{token='';updateButton();},'error-callback':()=>{token='';message('The security check could not load. Please retry later.');updateButton();}});};
    script.onerror=()=>message('The security check could not load. Submissions remain unavailable.');document.head.append(script);
  }
} catch {message('The archive details could not load. Refresh to try again.');$('#files').disabled=true;}
