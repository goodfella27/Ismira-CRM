import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require=createRequire(import.meta.url), ts=require('typescript');
test('desktop/mobile bells and rapid remounts own separate realtime channels',()=>{
  const channels=new Map(), removed=[], effects=[];
  const client={channel(name){
    if(channels.has(name)) return channels.get(name);
    const channel={subscribed:false,handlers:[],on(type,filter,callback){assert.equal(this.subscribed,false,'cannot add callbacks after subscribe');this.handlers.push({filter,callback});return this;},subscribe(){this.subscribed=true;return this;}};
    channels.set(name,channel);return channel;
  },removeChannel(channel){removed.push(channel);return new Promise(()=>{});}};
  let stateIndex=0;
  const react={useCallback:f=>f,useMemo:f=>f(),useRef:value=>({current:value}),useState:value=>[stateIndex++ === 0 ? 'test-user' : value,()=>{}],useEffect:f=>effects.push(f)};
  const context={exports:{},crypto:{randomUUID},require:name=>name==='react'?react:name==='next/navigation'?{useRouter:()=>({}),usePathname:()=>'/pipeline'}:name==='@/lib/supabase/client'?{createSupabaseBrowserClient:()=>client}:name==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}: {}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/task-notification-bell.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  context.exports.TaskNotificationBell({});
  const subscribe=effects.find(f=>f.toString().includes('postgres_changes'));
  assert.ok(subscribe);
  const cleanupDesktop=subscribe(), cleanupMobile=subscribe();
  cleanupDesktop();
  const cleanupRemount=subscribe(); // removal can still be pending
  assert.equal(channels.size,3);
  for(const channel of channels.values()) assert.equal(channel.handlers.length,2);
  cleanupMobile();cleanupRemount();
  assert.equal(new Set(removed).size,3);
});
