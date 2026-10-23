(()=>{
const css=document.createElement('style');
css.textContent=`@keyframes fxw{from{transform:translateY(60px);opacity:0}to{transform:none;opacity:1}}
@keyframes fxr{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}}
@keyframes fxp{0%,100%{box-shadow:0 0 0 9999px rgba(10,20,16,.55),0 0 0 3px var(--fxc)}50%{box-shadow:0 0 0 9999px rgba(10,20,16,.55),0 0 0 9px var(--fxc)}}
@keyframes fxwipe{from{transform:translateX(-101%)}to{transform:translateX(101%)}}`;
const mount=()=>{if(!document.head)return;document.head.append(css)};
document.addEventListener('DOMContentLoaded',mount);mount();
const C='#c9972b';
const L=()=>{let l=document.getElementById('fxlayer');if(!l){l=document.createElement('div');l.id='fxlayer';l.style.cssText='position:fixed;inset:0;z-index:99990;pointer-events:none';document.documentElement.append(l)}return l};
addEventListener('mousedown',e=>{const r=document.createElement('div');r.style.cssText=`position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:64px;height:64px;border-radius:50%;border:4px solid ${C};z-index:99997;pointer-events:none;animation:fxr .6s ease-out forwards`;document.documentElement.append(r);setTimeout(()=>r.remove(),700)},true);
window.__fx={
 title(text,sub,ms,bg){const o=document.createElement('div');o.style.cssText=`position:fixed;inset:0;bottom:0;background:${bg||'#0f3d2e'};z-index:99996;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;transition:transform .5s cubic-bezier(.7,0,.2,1)`;
  const h=document.createElement('div');h.style.cssText='display:flex;flex-wrap:wrap;justify-content:center;gap:0 22px;max-width:1100px;padding:0 40px';
  text.split(' ').forEach((w,i)=>{const s=document.createElement('span');s.textContent=w;s.style.cssText=`font:800 92px/1.05 system-ui,sans-serif;color:#fff;letter-spacing:-2px;opacity:0;animation:fxw .5s ${i*0.12}s cubic-bezier(.2,.8,.2,1) forwards`;h.append(s)});
  o.append(h);if(sub){const p=document.createElement('div');p.textContent=sub;p.style.cssText=`font:500 30px system-ui,sans-serif;color:${C};opacity:0;animation:fxw .5s ${0.2+text.split(' ').length*0.12}s forwards`;o.append(p)}
  document.documentElement.append(o);setTimeout(()=>{o.style.transform='translateY(-101%)'},ms);setTimeout(()=>o.remove(),ms+600)},
 spot(sel,ms,pad){const e=document.querySelector(sel);if(!e)return;const r=e.getBoundingClientRect(),p=pad??10;const o=document.createElement('div');
  o.style.cssText=`position:fixed;left:${r.left-p}px;top:${r.top-p}px;width:${r.width+2*p}px;height:${r.height+2*p}px;border-radius:14px;--fxc:${C};z-index:99991;pointer-events:none;animation:fxp 1s ease-in-out infinite;transition:opacity .3s`;
  document.documentElement.append(o);setTimeout(()=>{o.style.opacity=0},ms);setTimeout(()=>o.remove(),ms+400)},
 zoom(sel,sc,ms){const e=document.querySelector(sel);if(!e)return;const r=e.getBoundingClientRect(),b=document.body;b.style.transformOrigin=(r.left+r.width/2)+'px '+(r.top+r.height/2+scrollY)+'px';b.style.transition='transform .7s cubic-bezier(.3,.7,.2,1)';b.style.transform='scale('+sc+')';setTimeout(()=>{b.style.transform='none'},ms);setTimeout(()=>{b.style.transition='';b.style.transformOrigin=''},ms+800)},
 pop(text,ms){const o=document.createElement('div');o.textContent=text;o.style.cssText=`position:fixed;left:50%;top:92px;transform:translateX(-50%) scale(.6);opacity:0;background:#111;color:#fff;border:3px solid ${C};border-radius:999px;padding:12px 30px;font:800 40px system-ui,sans-serif;z-index:99994;transition:all .35s cubic-bezier(.2,1.4,.3,1)`;document.documentElement.append(o);requestAnimationFrame(()=>{o.style.opacity=1;o.style.transform='translateX(-50%) scale(1)'});setTimeout(()=>{o.style.opacity=0},ms);setTimeout(()=>o.remove(),ms+400)},
 wipe(){const o=document.createElement('div');o.style.cssText=`position:fixed;inset:0;background:${C};z-index:99995;pointer-events:none;animation:fxwipe .55s cubic-bezier(.7,0,.3,1) forwards`;document.documentElement.append(o);setTimeout(()=>o.remove(),600)}
};
})();
