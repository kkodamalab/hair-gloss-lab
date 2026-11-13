const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements={patchSize:{value:'64'},patchOverlap:{value:'50'}},$=id=>elements[id];
function canvas(w,h){return {width:w,height:h,getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray(w*h*4)}}}}}}
function mono(c){return c.getContext('2d').getImageData()}
const context=vm.createContext({console,Float64Array,Uint8Array,Uint32Array,Math,Number,Array,Error,canvas,mono,$});
vm.runInContext(fs.readFileSync('analysis.js','utf8'),context);
vm.runInContext(fs.readFileSync('analysis-modes.js','utf8'),context);
function run(expr){return vm.runInContext(expr,context)}
const makePsd=(n,beta)=>({points:Array.from({length:n/2-2},(_,i)=>{const r=i+2;return [Math.log10(r/n),-beta*Math.log10(r/n)+3]})});
context.p64=makePsd(64,2.5);context.p128=makePsd(128,2.5);
let r64=run('refitPsdBand(p64)'),r128=run('refitPsdBand(p128)');
assert.ok(Math.abs(r64.beta-2.5)<1e-10);
assert.ok(Math.abs(r128.beta-2.5)<1e-10);
assert.equal(r64.nBins,12);assert.equal(r128.nBins,24);
assert.equal(r64.r2,1);assert.equal(r128.r2,1);
context.mixed={patches:[{roi:{x:0,y:0,w:64,h:64},psd:makePsd(64,2)},{roi:{x:32,y:0,w:64,h:64},psd:makePsd(64,4)}]};
let sum=run('commonPsdPatchSummary(mixed)');
assert.ok(Math.abs(sum.beta-3)<1e-10);assert.ok(Math.abs(sum.betaSD-1)<1e-10);
const scene={frame:canvas(256,256),hairMask:{w:256,h:256,mask:new Uint8Array(256*256).fill(1)}};
context.scene=scene;
const rows=run('commonPsdSizeComparison(scene)');
assert.equal(rows.length,2);
assert.equal(rows[0].size,64);assert.equal(rows[1].size,128);
assert.equal(rows[0].commonBins,12);assert.equal(rows[1].commonBins,24);
assert.equal(elements.patchSize.value,'64');
assert.equal(elements.patchOverlap.value,'50');
console.log('PASS: common PSD band, 64/128 bin counts, per-patch mean/SD, UI restoration');
