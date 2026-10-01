import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/application-job-options.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const {applicationJobOptions}=context.exports;
const jobs=[{name:'Waiter',department:'RESTAURANT'},{name:'waiter',department:'BAR'},{name:'Engineer',department:'TECHNICAL'},{name:'Unknown',department:'GENERAL APPLICATION'},{name:'Hidden',department:'BAR',state:'closed'},{name:'Pool',department:'BAR',org_type:'pool'}];
test('suggestions separate departments and deduplicate public job titles',()=>{
 assert.equal(applicationJobOptions(jobs,'Hotel').length,1);
 assert.equal(applicationJobOptions(jobs,'Technical').join(','),'Engineer');
 assert.equal(applicationJobOptions(jobs,'').length,0);
});
test('unknown departments do not become hotel roles by default',()=>{
 assert.equal(applicationJobOptions([{name:'Unclassified'}],'Hotel').length,0);
});
