import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
function render(disabled=false) {
 const picked=[];
 const jsx=(type,props)=>({type,props});
 const context={exports:{},Intl,require:name=>name==='react'?{useEffect:()=>{},useId:()=> 'help',useRef:value=>({current:value}),useState:value=>[value,()=>{}]}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.endsWith('.css')?{default:{}}:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/apply/cv-dropzone.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const tree=context.exports.CvDropzone({file:null,onChange:file=>picked.push(file),language:'en',uploadLabel:'Choose',removeLabel:'Remove',help:'8 MB',disabled});
 return {zone:tree.props.children[0],picked};
}
function drop(files) {return {preventDefault(){this.prevented=true;},dataTransfer:{files,types:['Files']}};}
test('drop accepts exactly one file and prevents browser navigation',()=>{
 const {zone,picked}=render();const file={name:'cv.pdf',size:20};const event=drop([file]);
 zone.props.onDrop(event);assert.equal(event.prevented,true);assert.deepEqual(picked,[file]);
});
test('multi-file drops and disabled controls never replace the CV',()=>{
 for(const [disabled,files] of [[false,[{name:'one.pdf'},{name:'two.pdf'}]],[true,[{name:'cv.pdf'}]],[false,[]]]) {
  const {zone,picked}=render(disabled);zone.props.onDrop(drop(files));assert.equal(picked.length,0);
 }
});
test('text drags are ignored; file drags expose copy feedback',()=>{
 const {zone}=render();const text=drop([]);text.dataTransfer.types=['text/plain'];zone.props.onDragOver(text);assert.equal(text.prevented,undefined);
 const file=drop([]);zone.props.onDragOver(file);assert.equal(file.prevented,true);assert.equal(file.dataTransfer.dropEffect,'copy');
});
