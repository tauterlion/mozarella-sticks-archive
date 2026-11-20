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
