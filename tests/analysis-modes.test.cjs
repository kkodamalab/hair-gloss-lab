const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements={patchSize:{value:'64'},patchOverlap:{value:'50'}};
const $=id=>elements[id];
function canvas(w,h){return {width:w,height:h,getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray(w*h*4)}}}}}}
function mono(c){return c.getContext('2d').getImageData()}
const context=vm.createContext({console,Float64Array,Uint8Array,Uint32Array,Math,Number,Array,Error,canvas,mono,$});
vm.runInContext(fs.readFileSync('analysis.js','utf8'),context);
vm.runInContext(fs.readFileSync('analysis-modes.js','utf8'),context);
const run=(s)=>vm.runInContext(s,context);
assert.equal(run('interiorPatches({w:128,h:128,mask:new Uint8Array(128*128).fill(1)},64,32).length'),9);
assert.equal(run('interiorPatches({w:128,h:128,mask:new Uint8Array(128*128).fill(1)},128,64).length'),1);
const frame=canvas(256,256),scene={frame,hairMask:{w:256,h:256,mask:new Uint8Array(256*256).fill(1)}};
context.scene=scene;
let r=run('runPatchMode(scene,256)');
assert.equal(r.patchSize,64);assert.equal(r.analysisN,64);assert.equal(r.patchCount,49);
assert.equal(r.patches[0].roi.w,64);
assert.equal(r.patches[0].psd.fitRange[0],Math.log10(4/64));
assert.ok(Number.isFinite(r.dbc.value));
elements.patchSize.value='128';
r=run('runPatchMode(scene,256)');
assert.equal(r.analysisN,128);assert.equal(r.patchCount,9);
assert.equal(r.patches[0].psd.fitRange[0],Math.log10(4/128));
const spatial=run('patchSpatialRows({patches:[{roi:{x:0,y:0,w:64,h:64},psd:{value:2},dbc:{value:2.4}}]},{w:256,h:256})');
assert.equal(spatial[0].cx,.125);assert.equal(spatial[0].cy,.125);
context.temporalRows=[{beta:1,D:2},{beta:3,D:4}];
const temporal=run("temporalSummary(temporalRows,'beta')");
assert.equal(temporal.mean,2);assert.equal(temporal.sd,1);
console.log('PASS: native 64/128, patch count, fit frequency, spatial centers, temporal aggregation');
