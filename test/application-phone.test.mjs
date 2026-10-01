import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const context={exports:{},require};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/application-phone.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const {applicationPhone}=context.exports;
test('country selection supplies international dialing code',()=>{
 assert.equal(applicationPhone('61234567','LT'),'+37061234567');
 assert.equal(applicationPhone('07700900123','GB'),'+447700900123');
 assert.equal(applicationPhone('501 234 567','PL'),'+48501234567');
});
test('international paste keeps its own prefix and empty input stays empty',()=>{
 assert.equal(applicationPhone('+49 1512 3456789','LT'),'+4915123456789');
 assert.equal(applicationPhone('','LT'),'');
});
