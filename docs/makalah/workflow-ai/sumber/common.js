const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const p=(t,a,b)=>cl((t-a)/(b-a));
const eo=x=>1-Math.pow(1-x,3);
const eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const back=x=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)};
const lerp=(a,b,x)=>a+(b-a)*x;
const $=id=>document.getElementById(id);
function set(el,o){for(const k in o)el.style[k]=o[k]}
const ICONS={
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 id:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c1-2 5-2 6 0M14 10h4M14 14h3"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>',
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
 shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
 check:'<path d="m5 12 5 5 9-10"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 building:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
 brief:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 link:'<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
 money:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
 db:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
 badge:'<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
 flow:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/>',
 question:'<path d="M4 5h16v11H9l-5 4z"/><path d="M10 9a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.3M12 14h.01"/>',
 image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
 scale:'<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
 flag:'<path d="M5 21V4h11l-2 4 2 4H5"/>',
 spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
 form:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 camera:'<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
 bank:'<path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
 megaphone:'<path d="M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 0 1 0 6"/>',
 router:'<circle cx="12" cy="12" r="3"/><path d="M12 9V4M12 15v5M9 12H4M15 12h5"/>',
};
function icon(name,size=28,color='currentColor',sw=2){return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`}
function frame(step,label){
  const s=$('stage');
  s.insertAdjacentHTML('beforeend',`<div id="hdr" class="abs"><div class="n">${step}</div><div class="l">${label}</div></div><div id="prog" class="abs">${[1,2,3,4,5,6,7,8].map(i=>`<i class="${i<step?'done':i==step?'on':''}"></i>`).join('')}</div>`);
}
function frameRender(t,dur){
  const k=eo(p(t,0,.5)); set($('hdr'),{opacity:k,transform:`translateY(${(1-k)*-16}px)`});
  const f=p(t,dur-.35,dur); $('stage').style.opacity=1-f*0;
}
// gauge: v in [0,1]
function gaugeSVG(id,size=360){return `<svg id="${id}" width="${size}" height="${size*0.62}" viewBox="0 0 200 124">
 <path d="M20 110 A80 80 0 0 1 66 38" fill="none" stroke="#2e9e5b" stroke-width="18"/>
 <path d="M70 36 A80 80 0 0 1 130 36" fill="none" stroke="#e0a526" stroke-width="18"/>
 <path d="M134 38 A80 80 0 0 1 180 110" fill="none" stroke="#c9372c" stroke-width="18"/>
 <g id="${id}-n"><path d="M100 110 L100 42" stroke="#14213d" stroke-width="6" stroke-linecap="round"/></g>
 <circle cx="100" cy="110" r="10" fill="#14213d"/></svg>`}
function setGauge(id,v){$(id+'-n').setAttribute('transform',`rotate(${-90+180*v} 100 110)`)}
