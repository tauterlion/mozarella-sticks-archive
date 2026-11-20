import test from 'node:test';
import assert from 'node:assert/strict';
import {removePrivateObject} from '../tooling/private-object-cleanup.mjs';

const url='http://localhost:54321';
const folder='incoming/11111111-1111-4111-8111-111111111111';
const name='22222222-2222-4222-8222-222222222222', object=folder+'/'+name;

test('cleanup deletes exactly one object and confirms its absence',async()=>{
 const calls=[];
 await removePrivateObject(url,{},object,async (route,request)=>{
  calls.push([route,request.method,JSON.parse(request.body)]);
  return Response.json(request.method==='DELETE'?[]:[{name:'unrelated'}]);
 });
 assert.deepEqual(calls,[[url+'/storage/v1/object/aoms-submissions','DELETE',{prefixes:[object]}],[url+'/storage/v1/object/list/aoms-submissions','POST',{prefix:folder,search:name,limit:100}]]);
});

test('cleanup requires exact generated object path',async()=>{
 await assert.rejects(removePrivateObject(url,{},folder,()=>assert.fail('must not contact Storage')),/Unexpected cleanup path/);
});

for(const [label,result] of [
 ['object remains',()=>Response.json([{name}])],
 ['invalid response',()=>Response.json({message:'not a list'})],
 ['incomplete listing',()=>Response.json(Array.from({length:100},()=>({name:'unrelated'})))],
 ['listing failed',()=>new Response(null,{status:503})],
]) test('cleanup retains reservation if '+label,async()=>{
 await assert.rejects(removePrivateObject(url,{},object,async (_route,request)=>request.method==='DELETE'?Response.json([]):result()),/reservation retained/);
});

test('cleanup stops if Storage delete fails',async()=>{
 await assert.rejects(removePrivateObject(url,{},object,async (_route,request)=>{
  assert.equal(request.method,'DELETE');return new Response(null,{status:503});
 }),/reservation retained/);
});

import {runRetention,retentionAlerts} from '../tooling/cleanup.mjs';

test('scheduled command defaults to aggregate report with no deletion',async()=>{
 const report={reservedBytes:80,budgetBytes:100,stalledCleanup:1};
 const output=await runRetention({rpc:async action=>{assert.equal(action,'report');return report;},remove:()=>assert.fail('report touched Storage')});
 assert.deepEqual(output,{mode:'report',...report,alerts:['capacity_at_or_above_80_percent','cleanup_needs_attention']});
 assert.deepEqual(retentionAlerts({reservedBytes:79,budgetBytes:100,stalledCleanup:0,oldestUnconfirmedSeconds:1800}),[]);
});

test('cleanup reports partial failure and acknowledges only exact confirmed removals',async()=>{
 const batchId=folder.split('/')[1], id2='33333333-3333-4333-8333-333333333333';
 const completed=[];
 const result=await runRetention({apply:true,rpc:async(action,args)=>{
   if (action==='claim') return {items:[{id:name,batchId,path:object},{id:id2,batchId,path:folder+'/'+id2},{id:id2,batchId,path:object}],lease:'fixture-lease',expiredBatches:2,expiredRateWindows:4};
   completed.push(args);return {released:true};
 },remove:async file=>{if(file!==object)throw Error('Simulated Storage outage');}});
 assert.deepEqual(completed,[{id:name,lease:'fixture-lease'}]);
 assert.deepEqual(result,{mode:'apply',claimed:3,released:1,failed:2,unconfirmed:0,expiredBatches:2,expiredRateWindows:4});
});

test('losing a lease after deletion reports unconfirmed capacity',async()=>{
 const result=await runRetention({apply:true,rpc:async action=>action==='claim'?{items:[{id:name,batchId:folder.split('/')[1],path:object}],lease:'stale'}:{released:false},remove:async()=>{}});
 assert.equal(result.released,0);assert.equal(result.unconfirmed,1);
});
