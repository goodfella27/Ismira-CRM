import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, imports = {}) {
  const context = { exports: {}, require: name => imports[name] ?? require(name), process, Buffer, Date, FormData, File, Request, Response };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context.exports;
}
const form = load('src/lib/application-form.ts');
const challenge = load('src/lib/application-challenge.ts');
const valid = {firstName:'María',lastName:'Иванова',email:'applicant@example.com',phone:'+37061234567',department:'Hotel',desiredPosition:'Официант',experience:form.APPLICATION_EXPERIENCE[0],isAdult:'Yes',citizenship:'Lithuania',englishLevel:'A2',consent:true};
test('each step validates its own fields and supports multilingual names',()=>{
  for(let step=0;step<4;step++) assert.equal(Object.keys(form.validateApplication(valid,step)).length,0);
  assert.equal(Object.keys(form.validateApplication(form.EMPTY_APPLICATION,0)).length,4);
  assert.equal(form.validateApplication({...valid,email:'not-email'},0).email,'email');
  assert.equal(form.validateApplication({...valid,isAdult:'No'},2).isAdult,undefined);
  assert.equal(form.validateApplication({...valid,consent:false},3).consent,'required');
});
test('all five CEFR values are valid; CV is optional but checked when supplied',()=>{
  for(const level of ['A1','A2','B1','B2','C1']) assert.equal(Object.keys(form.validateApplication({...valid,englishLevel:level},2)).length,0);
  assert.equal(form.validateApplicationCV(null),null);
  assert.equal(form.validateApplicationCV({name:'cv.pdf',size:100}),null);
  assert.equal(form.validateApplicationCV({name:'cv.exe',size:100}),'fileType');
  assert.equal(form.validateApplicationCV({name:'cv.pdf',size:9*1024*1024}),'fileSize');
});
test('security question accepts only the signed answer and rejects tampering',()=>{
  const item=challenge.createApplicationChallenge();
  const answer=item.question.split(' + ').map(Number).reduce((a,b)=>a+b,0);
  assert.equal(challenge.verifyApplicationChallenge(item.token,String(answer)),true);
  assert.equal(challenge.verifyApplicationChallenge(item.token,String(answer+1)),false);
  assert.equal(challenge.verifyApplicationChallenge('0.'+item.token.split('.').slice(1).join('.'),String(answer)),false);
  assert.equal(challenge.verifyApplicationChallenge(item.token,'abc'),false);
});
test('translations cover every English field and all options',()=>{
  const {applicationTranslations:t}=load('src/app/apply/translations.ts');
  assert.deepEqual(Object.keys(t).sort(), ['de','en','lt','pl','ru','uk']);
  for(const lang of ['lt','pl','uk','de','ru']) {
    assert.deepEqual(Object.keys(t[lang]).sort(),Object.keys(t.en).sort());
    assert.deepEqual(Object.keys(t[lang].errors).sort(),Object.keys(t.en.errors).sort());
    assert.equal(t[lang].levels.length,5); assert.equal(t[lang].steps.length,4); assert.equal(t[lang].experienceOptions.length,3);
  }
});

async function submitLocal(overrides={},save=async()=>({applicationId:'local-id',deliveryId:null})) {
 const stored=[];
 const route=load('src/app/api/jobs/form/submit/route.ts',{
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/application-form':form,'@/lib/application-challenge':challenge,
  '@/app/apply/countries':load('src/app/apply/countries.ts'),
  '@/lib/application-submissions':{saveApplication:async(...args)=>{stored.push(args);return save(...args);}},
  '@/lib/application-mailerlite':{deliverApplicationCommunication:async()=>{throw new Error('offline');}},
 });
 const item=challenge.createApplicationChallenge();const payload=new FormData();
 for(const [key,value] of Object.entries({...valid,...overrides}))payload.set(key,typeof value==='boolean'?'yes':value);
 payload.set('formVersion','multistep');payload.set('challengeToken',item.token);payload.set('challengeAnswer',String(item.question.split(' + ').map(Number).reduce((a,b)=>a+b,0)));
 const response=await route.POST(new Request('http://localhost/api/jobs/form/submit',{method:'POST',body:payload}));
 return {response,stored};
}
test('every communication segment saves all fields locally without any Breezy dependency',async()=>{
 for(const [citizenship,isAdult] of [['IN','Yes'],['LT','Yes'],['AT','Yes'],['ZW','No']]){
  const {response,stored}=await submitLocal({citizenship,isAdult});
  assert.equal(response.status,200);assert.equal((await response.json()).applicationId,'local-id');
  assert.equal(stored.length,1);assert.equal(stored[0][0].citizenship,citizenship);assert.equal(stored[0][0].isAdult,isAdult);assert.equal(stored[0][0].email,valid.email);assert.equal(stored[0][0].desiredPosition,valid.desiredPosition);
 }
});
test('invalid citizenship and missing required fields are rejected before storage',async()=>{
 for(const bad of [{citizenship:'XX'},{email:'broken'},{firstName:''}]){const {response,stored}=await submitLocal(bad);assert.equal(response.status,400);assert.equal(stored.length,0);}
});
test('MailerLite failure does not fail a locally saved application; storage failure does',async()=>{
 const ok=await submitLocal({},async()=>({applicationId:'local-id',deliveryId:'queued'}));assert.equal(ok.response.status,200);
 const failed=await submitLocal({},async()=>{throw new Error('database offline');});assert.equal(failed.response.status,503);
});
