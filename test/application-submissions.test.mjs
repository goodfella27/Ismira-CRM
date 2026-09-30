import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
const values={firstName:'Test',lastName:'Applicant',email:'test@example.com',phone:'+37061234567',department:'Hotel',desiredPosition:'Waiter',experience:'Some experience (under 2 years)',isAdult:'Yes',citizenship:'IN',englishLevel:'B2',consent:true};
function service({uploadError=null,rpcError=null,enabled=true}={}){
 const calls=[];
 const context={exports:{},Buffer,require:name=>({
  '@/lib/supabase/admin':{createSupabaseAdminClient:()=>({storage:{from:bucket=>({upload:async(path,bytes,options)=>{calls.push({upload:{bucket,path,options,size:bytes.length}});return {error:uploadError};}})},rpc:async(name,args)=>{calls.push({rpc:{name,args}});return {data:rpcError?null:args.p_application.id,error:rpcError};}})},
  '@/lib/application-mailerlite':{readApplicationRoutingSettings:async()=>({enabled}),buildApplicationDelivery:(v,id,s)=>s.enabled?{id:'queued',group_id:'group',bucket:'country_followup',payload:{email:v.email}}:null},
 }[name]??require(name))};vm.createContext(context);vm.runInContext(ts.transpileModule(fs.readFileSync('src/lib/application-submissions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return {save:context.exports.saveApplication,calls};
}
test('all answers and delivery snapshot are committed through one RPC, including language and consent',async()=>{
 const {save,calls}=service();const saved=await save(values,null,'lt','position-reference');assert.equal(calls.length,1);const {name,args}=calls[0].rpc;assert.equal(name,'save_application_submission');assert.equal(args.p_application.email,values.email);assert.equal(args.p_application.citizenship,'IN');assert.equal(args.p_application.language,'lt');assert.equal(args.p_application.position_id,'position-reference');assert.equal(args.p_application.cv_path,null);assert.equal(args.p_delivery.id,'queued');assert.equal(saved.applicationId,args.p_application.id);
});
test('CV is stored in a private bucket before saving its metadata; retries use the same identity',async()=>{
 const {save,calls}=service();const cv=new File(['test document'],'my-cv.pdf',{type:'application/pdf'});const a=await save(values,cv,'en',null);const b=await save(values,cv,'en',null);assert.equal(a.applicationId,b.applicationId);assert.equal(calls[0].upload.bucket,'application-cvs');assert.equal(calls[0].upload.options.upsert,false);assert.equal(calls[1].rpc.args.p_application.cv_name,'my-cv.pdf');assert.equal(calls[1].rpc.args.p_application.cv_path,calls[0].upload.path);
});
test('storage failures never return success and existing identical CV uploads are accepted',async()=>{
 const cv=new File(['document'],'cv.pdf');const failed=service({uploadError:{statusCode:'500'}});await assert.rejects(()=>failed.save(values,cv,'en',null));assert.equal(failed.calls.length,1);
 const retry=service({uploadError:{statusCode:'409'}});assert.ok((await retry.save(values,cv,'en',null)).applicationId);
 const db=service({rpcError:{message:'offline'}});await assert.rejects(()=>db.save(values,null,'en',null));
 const paused=service({enabled:false});const saved=await paused.save(values,null,'en',null);assert.equal(saved.deliveryId,null);assert.equal(paused.calls[0].rpc.args.p_delivery,null);
});
test('migration stores consent and outbox transactionally and does not grant client access',()=>{
 const sql=fs.readFileSync('supabase/migrations/20260930120515_application_communication_routing.sql','utf8');assert.match(sql,/consent_at timestamptz not null default now\(\)/);assert.match(sql,/application_submissions enable row level security/);assert.match(sql,/security invoker/);assert.match(sql,/revoke all on function public.save_application_submission\(jsonb, jsonb\) from public, anon, authenticated/);
});
