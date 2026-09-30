import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(import.meta.url); const ts=require('typescript');
function load(path,imports={}){const context={exports:{},require:n=>imports[n]??require(n),Intl,Set};vm.createContext(context);vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const countries=load('src/app/apply/countries.ts');
const form=load('src/lib/application-form.ts');
const lists=load('src/lib/application-country-segments.ts');
const routing=load('src/lib/application-routing.ts',{'@/lib/application-form':form,'@/app/apply/countries':countries,'@/lib/application-country-segments':lists});
const valid={citizenship:'LT',isAdult:'Yes',experience:form.APPLICATION_EXPERIENCE[0],englishLevel:'B2'};
test('PDF sets are complete, disjoint, and preserve its three unlisted countries',()=>{
 assert.equal(lists.PDF_PRIMARY_COUNTRIES.length,50); assert.equal(lists.PDF_FOLLOWUP_COUNTRIES.length,196);
 assert.equal(new Set([...lists.PDF_PRIMARY_COUNTRIES,...lists.PDF_FOLLOWUP_COUNTRIES]).size,246);
 assert.equal(countries.applicationCountryCodes.filter(c=>!lists.PDF_PRIMARY_COUNTRIES.includes(c)&&!lists.PDF_FOLLOWUP_COUNTRIES.includes(c)).join(','),'AT,KH,PM');
 assert.ok(lists.PDF_PRIMARY_COUNTRIES.includes('AU'));assert.ok(lists.PDF_FOLLOWUP_COUNTRIES.includes('EG'));
});
test('all experience/English combinations have exactly one communication destination',()=>{
 for(const experience of form.APPLICATION_EXPERIENCE)for(const englishLevel of form.APPLICATION_LEVELS){
  const expected=experience===form.APPLICATION_EXPERIENCE[2]||['A1','A2'].includes(englishLevel)?'improvement':'main';
  assert.equal(routing.classifyApplicationCommunication({...valid,experience,englishLevel}),expected);
 }
});
test('country and age communication segments have explicit priority without rejecting applications',()=>{
 assert.equal(routing.classifyApplicationCommunication({...valid,citizenship:'IN'}),'country_followup');
 assert.equal(routing.classifyApplicationCommunication({...valid,citizenship:'AT'}),'unlisted');
 assert.equal(routing.classifyApplicationCommunication({...valid,isAdult:'No'}),'age_followup');
 assert.equal(routing.classifyApplicationCommunication({...valid,citizenship:'AU'}),'main');
 assert.equal(routing.classifyApplicationCommunication({...valid,citizenship:'EG'}),'country_followup');
 assert.throws(()=>routing.classifyApplicationCommunication({...valid,citizenship:'XX'}));
 assert.equal(form.validateApplication({...form.EMPTY_APPLICATION,...valid,isAdult:'No'},2).isAdult,undefined);
});
test('settings must cover all buckets and use string group IDs to avoid integer rounding',()=>{
 const settings={enabled:true,groups:Object.fromEntries(routing.COMMUNICATION_BUCKETS.map(b=>[b.key,'115789940210534235']))};
 assert.equal(routing.parseRoutingSettings(settings).groups.main,'115789940210534235');
 assert.throws(()=>routing.parseRoutingSettings({...settings,groups:{...settings.groups,main:115789940210534235}}));
 assert.throws(()=>routing.parseRoutingSettings({...settings,groups:{...settings.groups,main:''}}));
 assert.equal(routing.parseRoutingSettings({enabled:false,groups:{}}).enabled,false);
});
