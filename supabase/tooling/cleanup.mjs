import { removePrivateObject } from './private-object-cleanup.mjs';

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
 await removePrivateObject(url,headers,item.path);
 await rpc('cleanup_done',{id:item.id});purged++;
}
console.log(JSON.stringify({purged}));
