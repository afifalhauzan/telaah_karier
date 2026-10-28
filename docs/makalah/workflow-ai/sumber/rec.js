const {chromium}=require('playwright');
(async()=>{const [,,html,out,fps,dur,only]=process.argv;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('file://'+html);await p.evaluate(()=>document.fonts.ready);
const N=Math.round(+fps*+dur);const list=only?only.split(',').map(Number):[...Array(N).keys()];
for(const i of list){await p.evaluate(t=>render(t),i/+fps);await p.screenshot({path:`${out}/f${String(i).padStart(4,'0')}.png`});}
await b.close();})();
