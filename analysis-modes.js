'use strict';
// Three ROI modes. No zero-filled mask is passed to the standard square-ROI PSD/DBC.
// Whole-hair mode is explicitly exploratory; masked spectral and DBC estimators are not standard.
function modeCanvas(frame,r,n){const c=canvas(n,n);c.getContext('2d').drawImage(frame,r.x,r.y,r.w,r.h,0,0,n,n);const im=mono(c);return {c,v:Float64Array.from({length:n*n},(_,j)=>im.data[j*4]/255)}}
function maskBounds(h){let {mask,w,h:height}=h,minX=w,minY=height,maxX=-1,maxY=-1,area=0;for(let y=0;y<height;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){area++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}if(!area)throw Error('毛髪マスクが空です');return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,area}}
function allHairPixels(frame,h){const d=frame.getContext('2d').getImageData(0,0,h.w,h.h).data,vals=[];for(let i=0;i<h.mask.length;i++)if(h.mask[i])vals.push(Math.round(.2126*d[4*i]+.7152*d[4*i+1]+.0722*d[4*i+2])/255);const m=vals.reduce((a,b)=>a+b,0)/vals.length;return {mean:m,sd:Math.sqrt(vals.reduce((a,b)=>a+(b-m)**2,0)/vals.length),count:vals.length}}
function interiorPatches(h,side,step){const {mask,w,h:height}=h;const prefix=new Uint32Array((w+1)*(height+1));for(let y=0;y<height;y++)for(let x=0;x<w;x++)prefix[(y+1)*(w+1)+x+1]=mask[y*w+x]+prefix[y*(w+1)+x+1]+prefix[(y+1)*(w+1)+x]-prefix[y*(w+1)+x];const patches=[];for(let y=0;y+side<=height;y+=step)for(let x=0;x+side<=w;x+=step){let a=y*(w+1)+x,b=y*(w+1)+x+side,c=(y+side)*(w+1)+x,d=(y+side)*(w+1)+x+side;if(prefix[d]-prefix[b]-prefix[c]+prefix[a]===side*side)patches.push({x,y,w:side,h:side})}return patches}
function stats(arr){if(!arr.length)return {mean:null,sd:null};const mean=arr.reduce((a,b)=>a+b,0)/arr.length;return {mean,sd:Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/arr.length)}}
function runPatchMode(s,n){if(!s.hairMask)throw Error('毛髪マスクを自動抽出してください');const side=+$('patchSize').value,step=Math.max(1,Math.floor(side*(1-(+$('patchOverlap').value)/100)));let patches=interiorPatches(s.hairMask,side,step);if(!patches.length)throw Error('マスク内部に完全な'+side+'pxパッチがありません');if(patches.length>300)throw Error('パッチが300個を超えました。サイズを上げるか重複率を下げてください');const rows=patches.map(r=>{const z=modeCanvas(s.frame,r,side);return {roi:r,psd:psd(z.v,side),dbc:dbc(z.v,side)}});const bp=stats(rows.map(z=>z.psd.value).filter(Number.isFinite)),dp=stats(rows.map(z=>z.dbc.value).filter(Number.isFinite));const meanPoints=(key)=>{const first=rows[0][key].points;return first.map((p,i)=>{const linear=rows.map(z=>z[key].points[i]?10**z[key].points[i][1]:NaN).filter(Number.isFinite);return [p[0],linear.length?Math.log10(linear.reduce((a,b)=>a+b,0)/linear.length):NaN]}).filter(p=>p.every(Number.isFinite))};const psdPoints=meanPoints('psd'),dbcPoints=meanPoints('dbc');const fitP=regress(psdPoints.filter(p=>p[0]>=Math.log10(4/side)&&p[0]<=Math.log10(.25)));const fitD=regress(dbcPoints);return {psd:{value:bp.mean,fit:{r2:fitP.r2,slope:fitP.slope,intercept:fitP.intercept},points:psdPoints,fitRange:[Math.log10(4/side),Math.log10(.25)]},dbc:{value:dp.mean,fit:{r2:fitD.r2,slope:fitD.slope,intercept:fitD.intercept},points:dbcPoints,fitRange:[dbcPoints[0][0],dbcPoints.at(-1)[0]]},patches:rows,patchSize:side,patchStep:step,analysisN:side,psdSD:bp.sd,dbcSD:dp.sd,patchCount:rows.length,roi:maskBounds(s.hairMask)}}
// Exploratory whole-mask analysis: outside-mask pixels are harmonically inpainted,
// then conventional FFT/DBC run on the bounding square. This is NOT a mask-unbiased estimator.
function runMaskMode(s,n){if(!s.hairMask)throw Error('毛髪マスクを自動抽出してください');const b=maskBounds(s.hairMask),side=Math.max(b.w,b.h),x=Math.max(0,Math.min(s.frame.width-side,Math.round(b.x+(b.w-side)/2))),y=Math.max(0,Math.min(s.frame.height-side,Math.round(b.y+(b.h-side)/2)));if(side>Math.min(s.frame.width,s.frame.height))throw Error('マスクの縦横比が大きすぎます。複数パッチ方式をご利用ください');const z=modeCanvas(s.frame,{x,y,w:side,h:side},n),m=new Uint8Array(n*n);for(let yy=0;yy<n;yy++)for(let xx=0;xx<n;xx++){const sx=Math.min(s.frame.width-1,Math.floor(x+(xx+.5)*side/n)),sy=Math.min(s.frame.height-1,Math.floor(y+(yy+.5)*side/n));m[yy*n+xx]=s.hairMask.mask[sy*s.hairMask.w+sx]}let mean=0,count=0;for(let i=0;i<m.length;i++)if(m[i]){mean+=z.v[i];count++}if(count<64)throw Error('有効な毛髪画素が不足しています');mean/=count;let v=Float64Array.from(z.v,(a,i)=>m[i]?a:mean);for(let it=0;it<100;it++){let next=v.slice();for(let yy=1;yy<n-1;yy++)for(let xx=1;xx<n-1;xx++){let i=yy*n+xx;if(!m[i])next[i]=(v[i-1]+v[i+1]+v[i-n]+v[i+n])*.25}v=next}return {psd:psd(v,n),dbc:dbc(v,n),roi:b,maskPixels:b.area,maskCoverage:count/(n*n),method:'exploratory-harmonic-inpaint-v1',warning:'探索的：マスク外補間と境界の影響を含む。真の全毛髪PSD/DBCではない。'} }
function runSingleMode(s,n){const z=Math.min(s.frame.width,s.frame.height),r=s.roi||{x:Math.floor((s.frame.width-z)/2),y:Math.floor((s.frame.height-z)/2),w:z,h:z};if(r.w<5||r.h<5)throw Error('ROIが小さすぎます');const {c,v}=modeCanvas(s.frame,r,n);return {psd:psd(v,n),dbc:dbc(v,n),roi:r,roiCanvas:c}}

function patchSpatialRows(result,mask){
 if(!result?.patches||!mask)return [];
 const {w,h}=mask;
 return result.patches.map((z,i)=>({id:i+1,cx:(z.roi.x+z.roi.w/2)/w,cy:(z.roi.y+z.roi.h/2)/h,x:z.roi.x,y:z.roi.y,beta:z.psd.value,D:z.dbc.value}));
}
function comparePatchSizes(scene,sizes=[64,128],overlap=50){
 if(!scene.hairMask)throw Error('毛髪マスクが必要です');
 const priorSize=$('patchSize').value,priorOverlap=$('patchOverlap').value;
 const rows=[];
 try{ $('patchOverlap').value=String(overlap);
 for(const size of sizes){$('patchSize').value=String(size);const r=runPatchMode(scene,size);const area=maskBounds(scene.hairMask).area;
 const coverage=new Uint8Array(scene.hairMask.w*scene.hairMask.h);
 for(const z of r.patches)for(let y=z.roi.y;y<z.roi.y+size;y++)for(let x=z.roi.x;x<z.roi.x+size;x++)coverage[y*scene.hairMask.w+x]=1;
 let covered=0;for(const a of coverage)covered+=a;
 rows.push({size,patchCount:r.patchCount,coverage:covered/area,beta:r.psd.value,betaSD:r.psdSD,D:r.dbc.value,DSD:r.dbcSD,psdR2:r.psd.fit.r2,dbcR2:r.dbc.fit.r2,analysisN:size,dbcScales:Math.floor(Math.log2(size/4))});}
 }finally{$('patchSize').value=priorSize;$('patchOverlap').value=priorOverlap}
 return rows;
}
function videoSeek(video,time){return new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{video.removeEventListener('seeked',ok);video.removeEventListener('error',bad)};const ok=()=>{if(settled)return;settled=true;cleanup();resolve()};const bad=()=>{if(settled)return;settled=true;cleanup();reject(Error('動画シーク失敗'))};video.addEventListener('seeked',ok,{once:true});video.addEventListener('error',bad,{once:true});video.currentTime=time;if(Math.abs(video.currentTime-time)<.00001&&!video.seeking){cleanup();resolve()}})}
function temporalSummary(rows,key){const valid=rows.map(r=>r[key]).filter(Number.isFinite);return {...stats(valid),n:valid.length}}

const COMMON_PSD_BAND=[4/64,0.25]; // cycles / original image pixel
function refitPsdBand(psdResult,band=COMMON_PSD_BAND){
 const [low,high]=band;
 if(!(low>0&&high>low&&high<=0.5))throw Error('PSD帯域が不正です');
 const points=psdResult.points.filter(p=>p[0]>=Math.log10(low)-1e-12&&p[0]<=Math.log10(high)+1e-12);
 const fit=regress(points);
 return {beta:fit.slope===null?null:-fit.slope,r2:fit.r2,nBins:points.length,fit,band:[low,high]};
}
function commonPsdPatchSummary(result,band=COMMON_PSD_BAND){
 const rows=result.patches.map(z=>({...refitPsdBand(z.psd,band),roi:z.roi}));
 const valid=rows.map(z=>z.beta).filter(Number.isFinite);
 const summary=stats(valid);
 return {beta:summary.mean,betaSD:summary.sd,patchCount:valid.length,totalPatches:rows.length,r2Mean:stats(rows.map(z=>z.r2).filter(Number.isFinite)).mean,nBins:rows[0]?.nBins??0,band,rows};
}
function commonPsdSizeComparison(scene,sizes=[64,128],overlap=50,band=COMMON_PSD_BAND){
 if(!scene.hairMask)throw Error('毛髪マスクが必要です');
 const originalSize=$('patchSize').value,originalOverlap=$('patchOverlap').value;
 const results=[];
 try{
 $('patchOverlap').value=String(overlap);
 for(const size of sizes){
 $('patchSize').value=String(size);
 const analysis=runPatchMode(scene,size);
 const summary=commonPsdPatchSummary(analysis,band);
 const area=maskBounds(scene.hairMask).area,covered=new Uint8Array(scene.hairMask.w*scene.hairMask.h);
 for(const z of analysis.patches){const r=z.roi;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)covered[y*scene.hairMask.w+x]=1}
 let count=0;for(const a of covered)count+=a;
 results.push({size,commonBeta:summary.beta,commonBetaSD:summary.betaSD,commonR2:summary.r2Mean,commonBins:summary.nBins,originalBeta:analysis.psd.value,originalBetaSD:analysis.psdSD,deltaBeta:summary.beta-analysis.psd.value,patchCount:summary.patchCount,coverage:count/area,bandLow:band[0],bandHigh:band[1],patches:summary.rows});
 }
 }finally{$('patchSize').value=originalSize;$('patchOverlap').value=originalOverlap}
 return results;
}
