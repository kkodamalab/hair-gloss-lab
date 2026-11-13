'use strict';
const $=id=>document.getElementById(id), colors=['#56b4e9','#e69f00','#009e73','#f0e442','#cc79a7','#d55e00','#aaaaFF','#ffffff','#80dddd'];
const scenes=Array.from({length:9},(_,i)=>({name:String.fromCharCode(65+i),gray:true,visible:true}));let count=2, sources=[],current=null;
const message=t=>$('status').textContent=t;
const button=(label,fn,parent)=>{let b=document.createElement('button');b.textContent=label;b.onclick=fn;parent.append(b);return b};
function invalidate(s){s.result=null;s.roiCanvas=null;renderResults();if(s.roiInfo)updateRoiInfo(s)}
function updateRoiInfo(s){if(!s.roiInfo)return;const r=s.roi;s.roiInfo.textContent=r?`ROI: x=${r.x}, y=${r.y}, ${r.w} × ${r.h} px（面積 ${r.w*r.h} px²） / 解析出力 ${$('resolution').value} × ${$('resolution').value} px`:'ROI: 未設定（解析時は画像中央の正方形を使用）'}
function canvas(w,h){let c=document.createElement('canvas');c.width=w;c.height=h;return c}
function mono(c){let ctx=c.getContext('2d'),im=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<im.data.length;i+=4){let y=Math.round(.2126*im.data[i]+.7152*im.data[i+1]+.0722*im.data[i+2]);im.data[i]=im.data[i+1]=im.data[i+2]=y;im.data[i+3]=255}ctx.putImageData(im,0,0);return im}

// Hair mask: dark connected component in upper image; manual brush correction.
// The mask is for selecting an interior square ROI, not for zero-masking FFT input.
function hairMaskAuto(frame){
 const w=frame.width,h=frame.height,ctx=frame.getContext('2d'),d=ctx.getImageData(0,0,w,h).data;
 const lum=new Uint8Array(w*h),hist=new Uint32Array(256);
 for(let i=0;i<lum.length;i++){const j=i*4;let v=Math.round(.2126*d[j]+.7152*d[j+1]+.0722*d[j+2]);lum[i]=v;hist[v]++}
 // Otsu threshold capped to avoid including gray clothing.
 let sum=0,total=w*h;for(let k=0;k<256;k++)sum+=k*hist[k];
 let b=0,wb=0,best=0,thr=110;
 for(let k=0;k<256;k++){wb+=hist[k];if(!wb||wb===total)continue;b+=k*hist[k];let m0=b/wb,m1=(sum-b)/(total-wb),score=wb*(total-wb)*(m0-m1)**2;if(score>best){best=score;thr=k}}
 thr=Math.max(35,Math.min(135,thr));
 const candidate=new Uint8Array(total),seen=new Uint8Array(total),queue=new Int32Array(total);
 const maxY=Math.floor(h*.83);
 for(let y=0;y<maxY;y++)for(let x=0;x<w;x++){let i=y*w+x;candidate[i]=lum[i]<thr?1:0}
 let bestComponent=[],bestScore=-1;
 // Connected components, prefer upper-central region to avoid dark clothing.
 for(let y=0;y<maxY;y++)for(let x=0;x<w;x++){
  let idx=y*w+x;if(!candidate[idx]||seen[idx])continue;
  let head=0,tail=1,top=y,minX=x,maxX=x;queue[0]=idx;seen[idx]=1;
  while(head<tail){let v=queue[head++],vx=v%w,vy=(v/w)|0;top=Math.min(top,vy);minX=Math.min(minX,vx);maxX=Math.max(maxX,vx);
   for(let q of [v-1,v+1,v-w,v+w]){if(q<0||q>=total||seen[q]||!candidate[q])continue;let qx=q%w,qy=(q/w)|0;if(Math.abs(qx-vx)+Math.abs(qy-vy)!==1)continue;seen[q]=1;queue[tail++]=q}}
  const center=(minX+maxX)/2,score=tail*(top<h*.55?1:0.1)*(Math.abs(center-w/2)<w*.32?1:.25);
  if(score>bestScore){bestScore=score;bestComponent=Array.from(queue.subarray(0,tail))}}
 const mask=new Uint8Array(total);for(const i of bestComponent)mask[i]=1;
 return {mask,w,h,threshold:thr};
}
function maskBrush(s,x,y,add,radius){
 if(!s.hairMask)return;const {mask,w,h}=s.hairMask,r=Math.max(2,radius),x0=Math.max(0,Math.floor(x-r)),x1=Math.min(w-1,Math.ceil(x+r)),y0=Math.max(0,Math.floor(y-r)),y1=Math.min(h-1,Math.ceil(y+r));
 for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++)if((xx-x)**2+(yy-y)**2<=r*r)mask[yy*w+xx]=add?1:0;
}
function maskInteriorSquare(s,n){
 const {mask,w,h}=s.hairMask;
 const inset=Math.max(4,Math.round(Math.min(w,h)*.015));
 // DP: largest square entirely inside the binary mask.
 const prev=new Uint32Array(w+1),cur=new Uint32Array(w+1);let best=0,bx=0,by=0;
 for(let y=0;y<h;y++){cur.fill(0);for(let x=0;x<w;x++)if(mask[y*w+x]){
  const v=1+Math.min(prev[x],prev[x+1],cur[x]);cur[x+1]=v;
  if(v>best){best=v;bx=x-v+1;by=y-v+1}
 }prev.set(cur)}
 const sz=Math.floor(n);
 if(best<sz+2*inset)throw Error('毛髪内に'+sz+'×'+sz+'pxのROIが収まりません（最大 '+Math.max(0,best-2*inset)+'px）。解像度を下げるか手動調整してください。');
 const cx=bx+best/2,cy=by+best/2;
 s.roi={x:Math.round(cx-sz/2),y:Math.round(cy-sz/2),w:sz,h:sz};
 invalidate(s);draw(s);
}
function downloadMask(s,name){
 if(!s.hairMask)return;let {mask,w,h}=s.hairMask,c=canvas(w,h),ctx=c.getContext('2d'),im=ctx.createImageData(w,h);
 for(let i=0;i<mask.length;i++){let j=i*4, v=mask[i]?255:0;im.data[j]=im.data[j+1]=im.data[j+2]=v;im.data[j+3]=255}
 ctx.putImageData(im,0,0);saveCanvas(c,name);
}

function draw(s){let c=s.display,f=s.frame;if(!f)return;c.width=f.width;c.height=f.height;c.getContext('2d').drawImage(f,0,0);if(s.gray)mono(c);if(s.hairMask){let {mask,w,h}=s.hairMask,overlay=canvas(w,h),ox=overlay.getContext('2d'),im=ox.createImageData(w,h);for(let i=0;i<mask.length;i++)if(mask[i]){let j=i*4;im.data[j]=0;im.data[j+1]=220;im.data[j+2]=180;im.data[j+3]=65}ox.putImageData(im,0,0);c.getContext('2d').drawImage(overlay,0,0)}if(s.result?.patches){let ctx=c.getContext('2d');ctx.strokeStyle='#ffce53';ctx.lineWidth=Math.max(1,c.width/700);for(const item of s.result.patches){const r=item.roi;ctx.strokeRect(r.x,r.y,r.w,r.h)}}if(s.roi){let r=s.roi,x=c.getContext('2d');x.strokeStyle='#00ffb3';x.lineWidth=Math.max(2,c.width/250);x.strokeRect(r.x,r.y,r.w,r.h)}}
function render(){ $('scenes').replaceChildren();scenes.slice(0,count).forEach((s,i)=>{let p=document.createElement('div');p.className='panel';$('scenes').append(p);let title=document.createElement('h3');title.textContent=String.fromCharCode(65+i);p.append(title);let name=document.createElement('input');name.value=s.name;name.setAttribute('aria-label','シーン名');name.oninput=()=>{s.name=name.value;renderResults()};p.append(name);button('現在の入力を登録',()=>{try{let src=current?.type==='video'?$('video'):$('image');if(!current||!src.complete&&current.type==='image'||current.type==='video'&&(src.readyState<2||src.seeking))throw Error('入力の読み込み／シーク完了を待ってください');let w=src.videoWidth||src.naturalWidth,h=src.videoHeight||src.naturalHeight;if(!w||!h)throw Error('画像をデコードできません');s.frame=canvas(w,h);let ctx=s.frame.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.drawImage(src,0,0);s.file=current.file.name;s.time=current.type==='video'?src.currentTime:null;s.roi=null;s.hairMask=null;invalidate(s);draw(s)}catch(e){message(e.message)}},p);let g=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=s.gray;check.onchange=()=>{s.gray=check.checked;draw(s)};g.append(check,'モノクロ表示');p.append(g);let vis=document.createElement('input');vis.type='checkbox';vis.checked=s.visible;vis.onchange=()=>{s.visible=vis.checked;renderResults()};p.append(vis,'曲線表示');button('ROI解除',()=>{s.roi=null;invalidate(s);draw(s)},p);button('削除',()=>{s.frame=null;s.roi=null;s.hairMask=null;invalidate(s);render()},p);button('次と入れ替え',()=>{let j=(i+1)%count;[scenes[i],scenes[j]]=[scenes[j],scenes[i]];render();renderResults()},p);let maskbar=document.createElement('div');maskbar.className='controls';p.append(maskbar);
 button('毛髪を自動抽出',()=>{if(!s.frame)return message('先に画像を登録してください');s.hairMask=hairMaskAuto(s.frame);s.editMask=false;invalidate(s);draw(s);message('緑の領域を確認し、必要に応じてブラシで修正してください')},maskbar);
 let edit=document.createElement('input');edit.type='checkbox';edit.onchange=()=>s.editMask=edit.checked;maskbar.append(Object.assign(document.createElement('label'),{textContent:'ブラシ編集'}));maskbar.lastChild.prepend(edit);
 let mode=document.createElement('select');mode.add(new Option('領域を追加','add'));mode.add(new Option('領域を削除','erase'));maskbar.append(mode);
 let radius=document.createElement('input');radius.type='range';radius.min='3';radius.max='90';radius.value='20';radius.title='ブラシ半径（元画像px）';maskbar.append(radius);
 button('毛髪内に正方形ROI',()=>{try{if(!s.hairMask)throw Error('先に毛髪を抽出してください');maskInteriorSquare(s,+$('resolution').value)}catch(e){message(e.message)}},maskbar);
 button('マスクPNG',()=>downloadMask(s,String.fromCharCode(65+i)+'_hair_mask.png'),maskbar);
 let info=document.createElement('div');info.style.cssText='margin:8px 0;color:#d9efff;font-size:14px';s.roiInfo=info;p.append(info);updateRoiInfo(s);let c=canvas(640,360);s.display=c;p.append(c);let start;const point=e=>{let r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)*c.width/r.width)),y:Math.max(0,Math.min(c.height,(e.clientY-r.top)*c.height/r.height))}};c.onpointerdown=e=>{if(!s.frame)return;start=point(e);c.setPointerCapture(e.pointerId);if(s.editMask&&s.hairMask){maskBrush(s,start.x,start.y,mode.value==='add',+radius.value);invalidate(s);draw(s)}};c.onpointermove=e=>{if(!start)return;let q=point(e);if(s.editMask&&s.hairMask){maskBrush(s,q.x,q.y,mode.value==='add',+radius.value);invalidate(s);draw(s);return}let z=Math.min(Math.abs(q.x-start.x),Math.abs(q.y-start.y));s.roi={x:Math.round(Math.min(start.x,q.x)),y:Math.round(Math.min(start.y,q.y)),w:Math.floor(z),h:Math.floor(z)};if(q.x<start.x)s.roi.x=Math.round(start.x-z);if(q.y<start.y)s.roi.y=Math.round(start.y-z);invalidate(s);draw(s)};c.onpointerup=c.onpointercancel=()=>start=null;draw(s);updateRoiInfo(s);updateRoiInfo(s);if(s.roiCanvas){let preview=canvas(s.roiCanvas.width,s.roiCanvas.height);preview.getContext('2d').drawImage(s.roiCanvas,0,0);p.append('解析入力（保存PNGと同じ）',preview);button('ROI PNG',()=>saveCanvas(s.roiCanvas,String.fromCharCode(65+i)+'_roi.png'),p)}})}
for(let i=2;i<=9;i++)$('count').add(new Option(String(i),String(i)));$('count').value=String(count);$('count').onchange=()=>{count=+$('count').value;render();renderResults()};$('gray').onchange=()=>{scenes.forEach(s=>s.gray=$('gray').checked);render()};$('resolution').onchange=()=>{scenes.forEach(invalidate);render()};
$('files').onchange=e=>{for(let file of e.target.files){let type=file.type.startsWith('video/')||/\.(mov|mp4|m4v|webm)$/i.test(file.name)?'video':'image';sources.push({file,type,url:URL.createObjectURL(file)});$('source').add(new Option(file.name,sources.length-1))}if(sources.length)loadSource(+$('source').value)};
function loadSource(i){current=sources[i];$('video').pause();$('video').removeAttribute('src');$('image').removeAttribute('src');$('video').hidden=current.type!=='video';$('image').hidden=current.type!=='image';$(current.type).src=current.url;message('読み込み中: '+current.file.name)}
$('source').onchange=()=>loadSource(+$('source').value);$('image').onload=()=>message('画像読み込み完了。各シーンへ登録してください。');$('video').onloadeddata=()=>message('動画読み込み完了。再生・シーク後に登録してください。');for(let id of ['image','video'])$(id).onerror=()=>message('このブラウザではデコードできません。HEICはPNG/JPEG、HEVCのMOVはH.264 MP4などへ変換してください。');
$('run').onclick=()=>{let errors=[];const mode=$('analysisMode').value;for(let [i,s] of scenes.slice(0,count).entries()){invalidate(s);if(!s.frame)continue;try{let n=+$('resolution').value;const result=mode==='single'?runSingleMode(s,n):mode==='patch'?runPatchMode(s,n):runMaskMode(s,n);s.roiCanvas=result.roiCanvas||null;s.result={file:s.file,time:s.time,resolution:n,mode,...result};}catch(e){errors.push(String.fromCharCode(65+i)+': '+e.message)}}render();renderResults();message(errors.length?errors.join(' / '):'解析完了（'+$('analysisMode').selectedOptions[0].text+'）。')};

function graph(id){let c=$(id),x=c.getContext('2d');x.fillStyle='#0d1a2b';x.fillRect(0,0,c.width,c.height);let entries=scenes.slice(0,count).map((s,i)=>({s,i,r:s.result?.[id]})).filter(o=>o.r&&o.s.visible),points=entries.flatMap(o=>o.r.points);if(!points.length)return;let xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),a=Math.min(...xs),b=Math.max(...xs),d=Math.min(...ys),e=Math.max(...ys);let px=v=>75+(v-a)/(b-a||1)*690,py=v=>360-(v-d)/(e-d||1)*250;x.strokeStyle='#52657d';x.strokeRect(75,110,690,250);x.font='12px sans-serif';x.fillStyle='white';for(let j=0;j<=4;j++){let xx=a+(b-a)*j/4,yy=d+(e-d)*j/4;x.fillText((10**xx).toPrecision(3),px(xx)-15,385);x.fillText((10**yy).toPrecision(3),5,py(yy))}x.fillText(id==='psd'?'frequency (cycles/pixel) / power — log axes':'1/r / N(r) — log axes',75,420);entries.forEach(({s,i,r},j)=>{x.strokeStyle=x.fillStyle=colors[i];x.setLineDash([]);x.beginPath();r.points.forEach(([u,v],k)=>k?x.lineTo(px(u),py(v)):x.moveTo(px(u),py(v)));x.stroke();if($('fits').checked&&r.fit.slope!==null){x.setLineDash([6,4]);x.beginPath();r.fitRange.forEach((u,k)=>k?x.lineTo(px(u),py(r.fit.slope*u+r.fit.intercept)):x.moveTo(px(u),py(r.fit.slope*u+r.fit.intercept)));x.stroke()}if($('legend').checked)x.fillText(String.fromCharCode(65+i)+' '+s.name,75+(j%3)*235,20+Math.floor(j/3)*25)});x.setLineDash([])}
const fmt=v=>Number.isFinite(v)?v.toFixed(4):'—';function renderResults(){$('results').replaceChildren();scenes.slice(0,count).forEach((s,i)=>{let tr=document.createElement('tr'),r=s.result;for(let v of [String.fromCharCode(65+i)+' '+s.name,s.file? s.file+(s.time===null?'':' @ '+s.time.toFixed(3)+'s'):'未登録',fmt(r?.psd.value),fmt(r?.psd.fit.r2),fmt(r?.dbc.value),fmt(r?.dbc.fit.r2),r?.mode||'—',r?.patchCount??'—',fmt(r?.psdSD),fmt(r?.dbcSD)]){let td=document.createElement('td');td.textContent=v;tr.append(td)}$('results').append(tr)});graph('psd');graph('dbc');let c=$('metrics'),x=c.getContext('2d');x.fillStyle='#0d1a2b';x.fillRect(0,0,c.width,c.height);x.font='14px sans-serif';scenes.slice(0,count).forEach((s,i)=>{x.fillStyle=colors[i];x.fillText(String.fromCharCode(65+i),25+i*108,25);['psd','dbc'].forEach((k,j)=>{let v=s.result?.[k].value;x.fillText((j?'D ':'β ')+fmt(v),25+i*108,55+j*110);if(Number.isFinite(v))x.fillRect(25+i*108,85+j*110,Math.min(90,Math.abs(v)*15),12)})})}
$('legend').onchange=$('fits').onchange=renderResults;
function save(name,data,type){let u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)}function saveCanvas(c,name){c.toBlob(b=>b&&save(name,b,'image/png'))}
const metadata=(s,i)=>{let r=s.result,box=r.roi;return [String.fromCharCode(65+i),s.name,r.file,r.time,box.x,box.y,box.w,box.h,r.resolution,r.mode,r.patchCount??'',r.patchSize??'',r.patchStep??'',r.psdSD??'',r.dbcSD??'',r.maskPixels??'',r.maskCoverage??'',r.method??'',r.warning??'']};const base=['scene','name','file','time_seconds','roi_x','roi_y','roi_width','roi_height','resolution','mode','patch_count','patch_size','patch_step','beta_sd','D_sd','mask_pixels','mask_coverage','method','warning'];function csv(rows){return rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n')}
for(let kind of ['summary','psd','dbc'])button(kind+' CSV',()=>{let rows=[[...base,...(kind==='summary'?['beta','psd_r2','D','dbc_r2']:kind==='psd'?['frequency','power','used_in_fit']:['box_size','N','used_in_fit'])]];scenes.slice(0,count).forEach((s,i)=>{let r=s.result;if(!r)return;if(kind==='summary')rows.push([...metadata(s,i),r.psd.value,r.psd.fit.r2,r.dbc.value,r.dbc.fit.r2]);else for(let [x,y] of r[kind].points)rows.push([...metadata(s,i),kind==='psd'?10**x:Math.round(r.resolution/10**x),kind==='psd'?10**y:Math.round(10**y),x>=Math.min(...r[kind].fitRange)-1e-12&&x<=Math.max(...r[kind].fitRange)+1e-12])});save(kind+'.csv',csv(rows),'text/csv;charset=utf-8')},$('exports'));
button('パッチ別 CSV',()=>{const rows=[['scene','name','patch_id','x','y','width','height','beta','psd_r2','D','dbc_r2']];scenes.slice(0,count).forEach((s,i)=>s.result?.patches?.forEach((z,j)=>rows.push([String.fromCharCode(65+i),s.name,j+1,z.roi.x,z.roi.y,z.roi.w,z.roi.h,z.psd.value,z.psd.fit.r2,z.dbc.value,z.dbc.fit.r2])));save('patches.csv',csv(rows),'text/csv;charset=utf-8')},$('exports'));
button('設定・結果JSON',()=>save('analysis.json',JSON.stringify({version:'0.4',parameters:{luminance:'round(0.2126R+0.7152G+0.0722B)/255; encoded RGB, no linearization',window:'separable symmetric Hann',meanRemoval:'before window',fft:'unnormalized',radialBins:'floor(radius), 2 <= radius < N/2',psdFit:'4/N <= f <= 0.25',dbc:'s=2..N/4 dyadic; height=s/N; floor(max/height)-floor(min/height)+1',resize:'browser Canvas drawImage; saved PNG is authoritative'},scenes:scenes.slice(0,count).map((s,i)=>({id:String.fromCharCode(65+i),name:s.name,grayscaleDisplay:s.gray,...s.result}))},null,2),'application/json'),$('exports'));
button('全ROI PNG',()=>scenes.slice(0,count).forEach((s,i)=>s.roiCanvas&&saveCanvas(s.roiCanvas,String.fromCharCode(65+i)+'_roi.png')),$('exports'));button('比較グラフ PNG',()=>['psd','dbc','metrics'].forEach(id=>saveCanvas($(id),id+'.png')),$('exports'));render();renderResults();
