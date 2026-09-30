import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const context = { exports: {} };
vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync('src/lib/theme.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context);
const {resolveTheme, readThemePreference} = context.exports;
test('system theme follows OS; explicit choices take priority', () => {
  assert.equal(resolveTheme('system',true),'dark');
  assert.equal(resolveTheme('system',false),'light');
  assert.equal(resolveTheme('light',true),'light');
  assert.equal(resolveTheme('dark',false),'dark');
});
test('missing, malformed, or blocked storage falls back to system', () => {
  for(const storage of [null,{getItem:()=>null},{getItem:()=> 'invalid'},{getItem:()=> {throw Error('blocked')}}]) assert.equal(readThemePreference(storage),'system');
  assert.equal(readThemePreference({getItem:key=>key==='ismira-theme'?'dark':null}),'dark');
});
test('public pages stay light despite an admin dark preference', () => {
  for (const pathname of ['/', '/jobs', '/jobs/embed', '/apply', '/cv/token', '/form/token', '/breezy/positions', '/pipeline', '/admin']) {
    let dark, scheme;
    const browser = {
      location: {pathname}, localStorage:{getItem:()=> 'dark'},
      matchMedia:()=>({matches:true}),
      document:{documentElement:{classList:{toggle:(_name,value)=>{dark=value;}},style:{set colorScheme(value){scheme=value;}}}},
    };
    vm.runInNewContext(context.exports.themeInitScript, browser);
    const admin=['/breezy/positions','/pipeline','/admin'].includes(pathname);
    assert.equal(dark,admin,pathname);
    assert.equal(scheme,admin?'dark':'light',pathname);
  }
});
