const id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const privatePath = new RegExp('^incoming/'+id+'/'+id+'$');

export async function removePrivateObject(url, headers, path, fetcher = fetch) {
  if (!privatePath.test(path)) throw Error('Unexpected cleanup path');
  const removed = await fetcher(`${url}/storage/v1/object/aoms-submissions`, {
    method:'DELETE', headers, body:JSON.stringify({prefixes:[path]}), signal:AbortSignal.timeout(30000)
  });
  if (!removed.ok) throw Error('Storage deletion failed; reservation retained');
  // Storage versions differ on HEAD for missing objects. Confirm with an
  // authenticated listing of the exact filename inside its batch folder.
  const separator = path.lastIndexOf('/');
  const prefix = path.slice(0,separator), name = path.slice(separator+1);
  const probe = await fetcher(`${url}/storage/v1/object/list/aoms-submissions`, {
    method:'POST', headers, body:JSON.stringify({prefix,search:name,limit:100}), signal:AbortSignal.timeout(10000)
  });
  if (!probe.ok) throw Error('Storage listing failed; reservation retained');
  const entries = await probe.json();
  if (!Array.isArray(entries) || entries.length >= 100 || entries.some(entry=>!entry || typeof entry.name !== 'string' || entry.name === name)) {
    throw Error('Storage deletion not confirmed; reservation retained');
  }
}
