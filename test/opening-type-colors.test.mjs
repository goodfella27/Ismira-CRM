import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
function load(path, imports = {}) {
  const context = {exports:{},require:key=>imports[key]}; vm.createContext(context);
  vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports;
}
const colors=load('src/lib/opening-type-colors.ts',{'./breezy-priority-types':load('src/lib/breezy-priority-types.ts')});
test('opening colors follow meaning regardless of list order and legacy keys',()=>{
  const types=[{key:'ongoing-interview',label:'REGULAR OPENING'},{key:'urgent-joining',label:'URGENT OPENING'},{key:'on-hold',label:'COMING SOON'}];
  for(const list of [types,[...types].reverse()]){
    assert.equal(colors.getOpeningTypeColor('ongoing-interview',list),'sky');
    assert.equal(colors.getOpeningTypeColor('urgent-joining',list),'orange');
    assert.equal(colors.getOpeningTypeColor('on-hold',list),'violet');
  }
  assert.equal(colors.getOpeningTypeColor('regular-opening'),'sky');
  assert.equal(colors.getOpeningTypeColor('urgent-opening'),'orange');
  assert.equal(colors.getOpeningTypeColor('coming-soon'),'violet');
  assert.match(colors.getPriorityBadgeClass('urgent-opening'),/shadow-orange/);
  assert.match(colors.getPriorityBadgeClass('regular-opening'),/shadow-sky/);
  assert.equal(colors.getPriorityTextClass('urgent-opening'),'text-[#f28714]');
  assert.equal(colors.getPriorityTextClass('regular-opening'),'text-[#1d9bd7]');
});

const priorities=load('src/lib/breezy-priority-types.ts');
test('tooltip defaults, custom explanations and explicit removal survive normalization',()=>{
  assert.match(priorities.getPriorityTooltip({key:'urgent-joining',label:'URGENT OPENING'}),/urgent requisition/);
  assert.match(priorities.getPriorityTooltip({key:'ongoing-interview',label:'ACTIVE HIRING'}),/Interviews/);
  assert.match(priorities.getPriorityTooltip({key:'on-hold',label:'COMING SOON'}),/Not open yet/);
  const base={key:'urgent-joining',label:'URGENT OPENING',sortOrder:0,showOnFrontpage:true};
  for(const tooltip of ['', 'Custom explanation']) {
    const [result]=priorities.dedupePriorityTypes([{...base,tooltip}]);
    assert.equal(priorities.getPriorityTooltip(result),tooltip);
  }
  assert.equal(priorities.getPriorityTooltip({key:'custom',label:'Custom'}),'');
});
