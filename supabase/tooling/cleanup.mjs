// Trusted operator/scheduler only. Never ship or invoke from the website.
// Schedule only after real Storage deletion and late-token tests have passed.
const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url))throw Error('Server environment is not configured');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function rpc(action,payload={}) {
 const r=await fetch(`${url}/rest/v1/rpc/submission_intake`,{method:'POST',headers,body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Cleanup database request failed');return r.json();
}
const {items}=await rpc('cleanup_candidates');let purged=0;
for(const item of items) {
 if(!/^incoming\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(item.path))throw Error('Unexpected cleanup path');
 const r=await fetch(`${url}/storage/v1/object/aoms-submissions`,{method:'DELETE',headers,body:JSON.stringify({prefixes:[item.path]}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Storage deletion failed; reservation retained');
 // Confirm absence through Storage before releasing reserved capacity.
 const exists=await fetch(`${url}/storage/v1/object/authenticated/aoms-submissions/${item.path}`,{method:'HEAD',headers,signal:AbortSignal.timeout(10000)});
 if(exists.status!==404)throw Error('Storage deletion not confirmed; reservation retained');
 await rpc('cleanup_done',{id:item.id});purged++;
}
console.log(JSON.stringify({purged}));
