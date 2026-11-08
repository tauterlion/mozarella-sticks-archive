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
  batch_expired:'This upload session expired. Completed files remain submitted. Reload and choose only the files that were not completed.',
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
function updateButton() { $('#send-files').disabled = !config?.enabled || !config.turnstileSitekey || !token && !batch || busy || !files.some(i=>!i.done && !i.cancelled); }
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
    item.cancelled=true;
    if(item.running) {item.cancelled=true; await item.upload?.abort();item.abortTransfer?.();}
    if(item.id && !item.done) {try {await api('cancel',{id:item.id});item.cancelled=true;} catch(e){setStatus(item,e.message);item.cancelled=false;return;}}
    if(item.running) {setStatus(item,'Cancelled. The private upload will be cleaned up.');return;}
    URL.revokeObjectURL(item.objectURL);files.splice(files.indexOf(item),1);card.remove();updateButton();
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
    if (item.upload) {item.upload.options.onSuccess=resolve;item.upload.options.onError=options.onError;}
    else item.upload=new tus.Upload(item.file,options);
    item.abortTransfer=()=>reject(new Error('Upload cancelled.'));
    item.upload.start();
  });
}
async function sendItem(item) {
  item.running=true;item.locked=true;item.fields.disabled=true;item.apply.disabled=true;item.remove.textContent='Cancel';
  try {
    setStatus(item,'Preparing private upload…');
    const authorized = await api('authorize',item.savedMetadata ||= metadata(item));
    if(authorized.status==='pending') return complete(item,authorized.receipt);
    item.id=authorized.id;
    if(item.cancelled){await api('cancel',{id:item.id});return;}
    // Completion retry first: a lost response after transfer must not upload twice.
    let receipt;
    try { receipt=await api('complete',{id:item.id}); }
    catch(e) {if(e.code!=='upload_not_ready')throw e;}
    if(!receipt) {
      if(item.cancelled)return;
      await transfer(item,authorized.upload);if(item.cancelled)return;
      setStatus(item,'Checking the stored file…');
      receipt=await api('complete',{id:item.id});
    }
    complete(item,receipt.receipt);
  } catch(e) {if(!item.cancelled)setStatus(item,e.message);}
  finally {item.running=false;item.remove.textContent=item.done?'Remove from this page':'Remove';item.abortTransfer=null;}
}
function complete(item,reference) {
  item.done=true;item.progress.value=100;setStatus(item,'Received privately · awaiting review');
  references.add(reference);$('#receipt').hidden=false;$('#receipt-reference').textContent=`Reference${references.size>1?'s':''}: ${[...references].join(', ')}`;
}
$('#files').addEventListener('change',e=>{if(events)choose(e.target.files);e.target.value='';});
for(const name of ['dragenter','dragover'])$('#drop-zone').addEventListener(name,e=>{e.preventDefault();$('#drop-zone').classList.add('dragging');});
$('#drop-zone').addEventListener('dragleave',()=>$('#drop-zone').classList.remove('dragging'));
$('#drop-zone').addEventListener('drop',e=>{e.preventDefault();$('#drop-zone').classList.remove('dragging');if(events)choose(e.dataTransfer.files);});
$('#submission-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy || !config.enabled || !$('#consent').checked)return;
  const queue=files.filter(i=>!i.done&&!i.cancelled);
  if(!queue.length)return;
  for(const item of queue)if(!item.none.checked&&!item.tags.some(t=>t.input.checked)){message(`Select people or “No people to tag” for ${item.file.name}.`);item.none.focus();return;}
  busy=true;updateButton();
  message('Verifying your submission…');
  try {
    if(!batch) {
      capability ||= Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      // Resume recovers a lost batch response without consuming a second token.
      try {batch=await api('resume');} catch(e){if(e.code!=='batch_expired')throw e;}
      if(!batch)batch=await api('batch',{token,consent:true});
    }
    // Sequential transfer is intentional: minimal mobile bandwidth/memory and
    // one server-side validation at a time. The database permits up to three.
    for(const item of queue)if(!item.cancelled)await sendItem(item);
    message('Check each file above. Use Send for review again to retry unfinished files.');
  } catch(e) {message(e.message);if(e.code==='captcha_failed'){token='';window.turnstile?.reset(widget);}}
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
