// Opt-in, loopback only. Creates and removes uniquely named synthetic Storage fixtures.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { crc32 } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = 'http://localhost:54321';
const limit = 50 * 1024 * 1024, chunkSize = 6 * 1024 * 1024;
const tusHeaders = { 'Tus-Resumable': '1.0.0' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function snapshot() {
  const sql = "select json_agg(o order by name) from (select name,id,metadata from storage.objects where bucket_id='aoms-submissions') o";
  return execFileSync('docker',['exec','supabase_db_aoms-local','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8'}).trim();
}
function pngAtLimit() {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
  // An ancillary tEXt chunk pads the 1px PNG without adding decoded pixels.
  const ancillary = Buffer.alloc(limit-png.length, 32);
  ancillary.writeUInt32BE(ancillary.length-12);
  ancillary.write('tEXtNote',4);
  ancillary[12] = 0;
  ancillary.writeUInt32BE(crc32(ancillary.subarray(4,-4)),ancillary.length-4);
  return Buffer.concat([png.subarray(0,33),ancillary,png.subarray(33)]);
}
async function main() {
  if(process.env.AOMS_LOCAL_STORAGE_TEST!=='1') throw Error('Opt in with AOMS_LOCAL_STORAGE_TEST=1');
  const status=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../work/aoms-local/status.json'),'utf8').replace(/^\uFEFF/,''));
  assert.ok([base,'http://127.0.0.1:54321'].includes(status.API_URL));
  const {inspectMedia}=await import('../functions/community-submit/validation.mjs');
  const {removePrivateObject}=await import('../tooling/private-object-cleanup.mjs');
  const key=status.SERVICE_ROLE_KEY;
  assert.ok(key);
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const bucket='aoms-submissions';
  const before=snapshot(), prefix='incoming/'+randomUUID()+'/';
  const object=prefix+randomUUID(), oversized=prefix+randomUUID(), racing=prefix+randomUUID();
  const request=(route,options={})=>fetch(base+route,{signal:AbortSignal.timeout(20000),...options});
  async function sign(objectName) {
    const res=await request('/storage/v1/object/upload/sign/'+bucket+'/'+objectName,{method:'POST',headers,body:'{}'});
    assert.ok(res.ok,'sign failed: '+res.status);
    const token=new URL((await res.json()).url,base).searchParams.get('token');
    assert.ok(token);return token;
  }
  async function create(token,objectName,size,options={}) {
    const metadata=Object.entries({bucketName:bucket,objectName,contentType:'image/png'}).map(([k,v])=>k+' '+Buffer.from(v).toString('base64')).join(',');
    return request('/storage/v1/upload/resumable/sign',{method:'POST',headers:{...tusHeaders,'x-signature':token,'Upload-Length':String(size),'Upload-Metadata':metadata,...options}});
  }
  try {
    const data=pngAtLimit();
    assert.equal(inspectMedia(data,'image/png',limit),'image/png');
    const tooBig=await create(await sign(oversized),oversized,limit+1);
    assert.equal(tooBig.status,413,'Storage must reject 50 MiB + 1');
    console.log('PASS signed TUS rejects 50 MiB + 1 before transfer');
    const token=await sign(object), made=await create(token,object,limit);
    assert.equal(made.status,201);
    const location=new URL(made.headers.get('location'),base).pathname;
    assert.match(location,/^\/storage\/v1\/upload\/resumable\/sign\//);
    const scoped={...tusHeaders,'x-signature':token};
    for(let offset=0;offset<data.length;offset+=chunkSize) {
      if(offset===chunkSize){
        const resume=await request(location,{method:'HEAD',headers:scoped});
        assert.equal(resume.status,200);assert.equal(Number(resume.headers.get('upload-offset')),offset);
        console.log('PASS independent TUS HEAD resumes at stored offset after first chunk');
      }
      const piece=data.subarray(offset,offset+chunkSize);
      const result=await request(location,{method:'PATCH',headers:{...scoped,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},body:piece});
      assert.equal(result.status,204,'Storage chunk failed: '+result.status);
      assert.equal(Number(result.headers.get('upload-offset')),offset+piece.length);
    }
    const route='/storage/v1/object/authenticated/'+bucket+'/'+object;
    const folder=prefix.slice(0,-1), filename=object.slice(prefix.length);
    const listing=await request('/storage/v1/object/list/'+bucket,{method:'POST',headers,body:JSON.stringify({prefix:folder,search:filename,limit:100})});
    assert.ok(listing.ok && (await listing.json()).some(entry=>entry.name===filename),'Exact cleanup listing must find a present object');
    const downloaded=await request(route,{headers});assert.ok(downloaded.ok);
    assert.equal(digest(Buffer.from(await downloaded.arrayBuffer())),digest(data));
    console.log('PASS real signed 50 MiB transfer and byte-for-byte download');
    const otherPath=await create(token,oversized,8);
    assert.ok(otherPath.status>=400 && otherPath.status<500,'A signed token must be scoped to its own object');
    for (const options of [{},{'x-upsert':'true'}]) {
      const duplicate=await create(token,object,8,options);
      if (duplicate.status===201) {
        const retryPath=new URL(duplicate.headers.get('location'),base).pathname;
        const replay=await request(retryPath,{method:'PATCH',headers:{...scoped,...options,'Content-Type':'application/offset+octet-stream','Upload-Offset':'0'},body:Buffer.alloc(8)});
        assert.ok([400,403,409].includes(replay.status),'Completed object must reject a duplicate writer: '+replay.status);
      } else assert.ok([400,403,409].includes(duplicate.status),'Completed object must reject duplicate creation: '+duplicate.status);
    }
    const stillOriginal=await request(route,{headers});assert.ok(stillOriginal.ok);
    assert.equal(digest(Buffer.from(await stillOriginal.arrayBuffer())),digest(data));
    console.log('PASS signed object scope and no-overwrite remain enforced when upsert is requested');
    const raceToken=await sign(racing);
    const smallPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
    const contenders=await Promise.all([create(raceToken,racing,smallPng.length),create(raceToken,racing,smallPng.length)]);
    assert.ok(contenders.every(r=>r.status===201),'Two upload sessions should be creatable before completion');
    const results=await Promise.all(contenders.map(r=>request(new URL(r.headers.get('location'),base).pathname,{
      method:'PATCH',headers:{...tusHeaders,'x-signature':raceToken,'Content-Type':'application/offset+octet-stream','Upload-Offset':'0'},body:smallPng
    })));
    assert.equal(results.filter(r=>r.status===204).length,1,'Expected exactly one concurrent winner: '+results.map(r=>r.status));
    assert.ok(results.every(r=>[204,400,409,423].includes(r.status)));
    console.log('PASS concurrent signed uploads have one winner for a disposable path');
    const anonymous=await request('/storage/v1/object/public/'+bucket+'/'+object);
    assert.ok(anonymous.status>=400&&anonymous.status<500);
    const browserRole={apikey:status.ANON_KEY,Authorization:'Bearer '+status.ANON_KEY};
    const list=await request('/rest/v1/media_submissions?select=id',{headers:browserRole});
    assert.equal(list.status,401,'anonymous submission query should be denied');
    const moderator=await request('/functions/v1/community-review',{method:'POST',headers:{Origin:'http://localhost:8766','Content-Type':'application/json'},body:JSON.stringify({action:'list'})});
    assert.equal(moderator.status,401);
    console.log('PASS anonymous object, submission rows and moderator list denied');
  } finally {
    for(const fixture of [object,oversized,racing]) await removePrivateObject(base,headers,fixture);
    assert.equal(snapshot(),before,'Storage snapshot must match after exact fixture deletion');
    console.log('PASS only disposable fixtures removed through Storage API; original metadata unchanged');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
