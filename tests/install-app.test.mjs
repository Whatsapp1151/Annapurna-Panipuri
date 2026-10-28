import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
// Run with JSDOM_MODULE pointing to an isolated jsdom installation.
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{InstallApp}from'./src/install-app';createRoot(document.getElementById('root')).render(<InstallApp/>);",resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
const tick=()=>new Promise(r=>setTimeout(r,35));
async function setup(ios=false,standalone=false){
 const dom=new JSDOM('<html><head></head><body><div id="root"></div></body></html>',{url:'https://example.com',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;Object.defineProperty(w.navigator,'userAgent',{value:ios?'iPhone':'Android'});w.matchMedia=()=>({matches:standalone,addEventListener(){},removeEventListener(){}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.eval(readFileSync('public/browser-alerts.js','utf8'));w.eval(bundle.outputFiles[0].text);await tick();return w;
}
let w=await setup(true);w.document.querySelector('.ap-install-row button').click();await tick();assert.match(w.document.querySelector('dialog').textContent,/Add to Home Screen/);assert.ok(w.document.querySelector('dialog').open);w.document.querySelector('.ap-install-done').click();await tick();assert.equal(w.document.querySelector('dialog'),null);w.close();
w=await setup(false,true);assert.equal(w.document.querySelector('.ap-install-row'),null);w.close();
w=await setup();let prompts=0;let event=new w.Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{prompts++};event.userChoice=Promise.resolve({outcome:'dismissed'});w.dispatchEvent(event);assert.ok(event.defaultPrevented);w.document.querySelector('.ap-install-row button').click();await tick();assert.equal(prompts,1);assert.ok(w.document.querySelector('.ap-install-row'));w.document.querySelector('.ap-install-row button').click();await tick();assert.equal(prompts,1);assert.ok(w.document.querySelector('dialog'));w.dispatchEvent(new w.Event('appinstalled'));await tick();assert.equal(w.document.querySelector('.ap-install-row'),null);assert.equal(w.document.querySelector('dialog'),null);w.close();
console.log('PASS: iPhone guide and close, standalone hidden, native prompt once, dismissal fallback, installed event hides UI');
