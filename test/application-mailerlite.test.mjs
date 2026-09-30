import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url);const ts=require('typescript');
function load(path,imports={}){const context={exports:{},require:n=>imports[n]??require(n),Intl,Date,AbortSignal};vm.createContext(context);vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const form=load('src/lib/application-form.ts');const routing=load('src/lib/application-routing.ts',{'@/lib/application-form':form,'@/app/apply/countries':load('src/app/apply/countries.ts'),'@/lib/application-country-segments':load('src/lib/application-country-segments.ts')});
const valid={firstName:'Jonas',lastName:'Test',email:'TEST@example.com',phone:'+37061234567',department:'Hotel',desiredPosition:'Waiter',experience:form.APPLICATION_EXPERIENCE[0],isAdult:'Yes',citizenship:'IN',englishLevel:'B2',consent:true};
function makeService({fetcher=async()=>Response.json({data:{id:'subscriber'}}),claimed=true,queueError=false}={}){
 const writes=[];const requests=[];
 const db={from(){return {upsert(row,options){writes.push({upsert:row,options});return Promise.resolve({error:queueError?{message:'failed'}:null});},update(row){writes.push({update:row});return {eq(){return {then(resolve){resolve({error:null});},or(){return {select(){return {maybeSingle:async()=>({data:claimed?{payload:{email:valid.email},attempts:2}:null,error:null})};}};}};}};}};}};
 const service=load('src/lib/application-mailerlite.ts',{'@/lib/supabase/admin':{createSupabaseAdminClient:()=>db},'@/lib/mailerlite':{mailerliteFetch:async(...args)=>{requests.push(args);return fetcher(...args);}},'@/lib/application-routing':routing});return {service,writes,requests};
}
test('subscriber mapping includes original form fields without forcing active or removing memberships',()=>{
 const {service}=makeService();const p=service.buildApplicationSubscriber(valid,'115789940210534235');assert.equal(p.email,'test@example.com');assert.equal(p.fields.country,'India');assert.equal(p.fields.phone,valid.phone);assert.equal(p.fields.submission_count,'Hotel');assert.equal(p.fields.what_experience_do_you_have,valid.experience);assert.equal(p.status,undefined);assert.equal(p.resubscribe,false);assert.equal(p.groups.join(','),'115789940210534235');
});
test('delivery snapshot is deterministic and disabled routing creates no delivery',()=>{
 const {service}=makeService();const settings={enabled:true,groups:{country_followup:'100'}};
 const a=service.buildApplicationDelivery(valid,'application',settings);const b=service.buildApplicationDelivery(valid,'application',settings);assert.equal(a.id,b.id);assert.equal(a.group_id,'100');assert.equal(a.bucket,'country_followup');
 assert.equal(service.buildApplicationDelivery(valid,'application',{enabled:false}),null);
});
test('upstream failure is recorded for retry and a successful retry records subscriber ID',async()=>{
 const failed=makeService({fetcher:async()=>Response.json({error:'bad'},{status:429})});assert.equal(await failed.service.deliverApplicationCommunication('id'),'failed');assert.equal(failed.writes[1].update.status,'failed');assert.equal(failed.writes[1].update.attempts,3);assert.match(failed.writes[1].update.last_error,/429/);
 const sent=makeService();assert.equal(await sent.service.deliverApplicationCommunication('id'),'sent');assert.equal(sent.writes[1].update.subscriber_id,'subscriber');assert.equal(sent.requests[0][1].method,'POST');
 const offline=makeService({fetcher:async()=>{throw new Error('network');}});assert.equal(await offline.service.deliverApplicationCommunication('id'),'failed');
 const busy=makeService({claimed:false});assert.equal(await busy.service.deliverApplicationCommunication('id'),'skipped');assert.equal(busy.requests.length,0);
});
test('group loading follows pagination and does not truncate destinations',async()=>{
 const {service,requests}=makeService({fetcher:async path=>path.includes('page=1')?Response.json({data:[{id:'1',name:'One'}],links:{next:'next'}}):Response.json({data:[{id:'2',name:'Two'}],links:{next:null}})});
 assert.equal((await service.listApplicationMailerLiteGroups()).length,2);assert.equal(requests.length,2);
});
test('unauthenticated/non-admin routing requests cannot read settings, save mappings or retry',async()=>{
 for(const [path,method] of [['src/app/api/application-routing/route.ts','GET'],['src/app/api/application-routing/route.ts','PUT'],['src/app/api/application-routing/retry/route.ts','POST']]){
  const route=load(path,{'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},'@/lib/auth/access':{requireCurrentAdmin:async()=>{throw new Error('forbidden');}},'@/lib/supabase/admin':{createSupabaseAdminClient:()=>{throw new Error('must not touch storage');}},'@/lib/application-mailerlite':{},'@/lib/application-routing':routing});
  assert.equal((await route[method](new Request('http://localhost/api/application-routing',{method:method==='GET'?'GET':'POST'}))).status,403);
 }
});
