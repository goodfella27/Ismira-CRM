import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/application-form.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {validateApplicationStage,validateApplication,EMPTY_APPLICATION,APPLICATION_EXPERIENCE}=context.exports;
test('work preferences can advance before answering experience',()=>{
 const values={...EMPTY_APPLICATION,department:'Hotel',desiredPosition:'Waiter'};
 assert.equal(Object.keys(validateApplicationStage(values,1)).length,0);
 assert.equal(validateApplicationStage(values,2).experience,'required');
 assert.equal(validateApplication(values,1).experience,'required');
});
test('experience stage validates only experience and rejects invalid options',()=>{
 assert.equal(Object.keys(validateApplicationStage({...EMPTY_APPLICATION,experience:APPLICATION_EXPERIENCE[0]},2)).length,0);
 assert.equal(validateApplicationStage({...EMPTY_APPLICATION,experience:'unknown'},2).experience,'invalid');
});
test('eligibility and consent retain validation after moving stages',()=>{
 assert.equal(validateApplicationStage(EMPTY_APPLICATION,3).citizenship,'required');
 assert.equal(validateApplicationStage(EMPTY_APPLICATION,4).consent,'required');
});
