(() => {
  const API = 'https://nxmrobbhfqijmbjjzbof.supabase.co/functions/v1/website-cms';
  let rows = [];

  const style = document.createElement('style');
  style.textContent = `
    .problem .checks,.solution .checks{
      bottom:max(78px,8vh);
      width:min(620px,78vw);
      gap:clamp(8px,1.2vh,14px);
    }
    .problem .check,.solution .check{
      display:flex;
      align-items:center;
      line-height:1.22;
      min-width:0;
    }
    .problem .check:before,.solution .check:before{flex:0 0 auto}

    .services .service-list{
      width:min(560px,44vw);
      bottom:max(72px,6.5vh);
      padding:10px 16px;
      overflow:visible;
    }
    .services .service-list>div{
      grid-template-columns:minmax(115px,max-content) minmax(0,1fr);
      min-height:0;
      padding:7px 0;
      line-height:1.18;
    }
    .services .service-list b,.services .service-list span{
      min-width:0;
      white-space:normal;
      overflow-wrap:anywhere;
    }

    /* 06: heading + steps are one block anchored to the bottom */
    .system-copy{
      position:absolute;
      left:7vw;
      bottom:max(68px,7vh);
      width:min(460px,36vw);
      z-index:3;
    }
    .system-copy .system-head,
    .system-copy .steps{
      position:static !important;
      inset:auto !important;
      width:100% !important;
      max-width:none !important;
    }
    .system-copy .system-head h2{margin:8px 0 7px;line-height:.94}
    .system-copy .system-head .small{margin:0 0 18px;line-height:1.2;max-width:100%}
    .system-copy .steps{display:grid !important;grid-template-columns:1fr !important;gap:8px !important}
    .system-copy .step{display:grid;grid-template-columns:72px 1fr;gap:14px;align-items:center;min-height:0;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.09)}
    .system-copy .step:last-child{border-bottom:0}
    .system-copy .step i{width:72px;margin:0;font-size:38px}
    .system-copy .step b,.system-copy .step p{line-height:1.15}
    .system-copy .step p{display:block;margin:3px 0 0}

    /* 07: the complete contact block is anchored to the same lower baseline */
    .contact .content{
      top:auto !important;
      bottom:max(68px,7vh) !important;
      left:clamp(24px,7vw,120px);
      width:min(520px,44vw);
      transform:none !important;
    }
    .contact .content h2{margin:6px 0 9px;line-height:.88;max-width:100%;overflow-wrap:normal;word-break:normal}
    .contact .intro{line-height:1.13;margin:0 0 9px}
    .contact .actions{margin-top:9px;width:min(340px,34vw);gap:6px}
    .contact .btn{padding:9px 13px}
    .contact .benefits{margin-top:10px;gap:10px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:min(430px,39vw)}
    .contact .benefits div{max-width:none;min-width:0;line-height:1.05}

    @media(min-width:801px) and (orientation:landscape) and (max-height:760px){
      .system-copy{bottom:64px;width:min(430px,35vw)}
      .system-copy .system-head .small{margin-bottom:12px}
      .system-copy .step{padding:5px 0}
      .system-copy .step i{font-size:34px}
      .contact .content{bottom:64px !important;width:min(470px,41vw)}
      .contact .content h2{margin:4px 0 7px;line-height:.85}
      .contact .intro{line-height:1.08;margin-bottom:7px}
      .contact .actions{margin-top:7px;width:min(315px,31vw);gap:5px}
      .contact .btn{padding:8px 11px}
      .contact .benefits{margin-top:7px;gap:7px;width:min(400px,36vw)}
    }

    @media(min-width:801px) and (orientation:landscape) and (max-height:650px){
      .system-copy{bottom:60px;width:min(405px,34vw)}
      .system-copy .system-head h2{margin:4px 0 4px;line-height:.9}
      .system-copy .system-head .small{margin-bottom:8px;line-height:1.08}
      .system-copy .steps{gap:4px !important}
      .system-copy .step{padding:3px 0}
      .system-copy .step p{margin-top:2px}
      .contact .content{bottom:60px !important;width:min(440px,39vw)}
      .contact .content h2{margin:2px 0 5px;line-height:.82}
      .contact .intro{line-height:1.04;margin-bottom:5px}
      .contact .actions{margin-top:5px;width:min(292px,29vw);gap:4px}
      .contact .btn{padding:7px 10px}
      .contact .benefits{margin-top:5px;gap:6px;width:min(375px,34vw)}
    }

    @media(max-width:800px){
      .problem .checks,.solution .checks{left:22px;right:22px;width:auto;bottom:7vh}
      .problem .check,.solution .check{line-height:1.18}
      .services .service-list{left:22px;right:22px;width:auto;bottom:6.5vh;padding:8px 12px}
      .services .service-list>div{grid-template-columns:minmax(88px,max-content) minmax(0,1fr);gap:10px;padding:5px 0}
      .system-copy{left:22px;right:22px;width:auto;bottom:7vh}
      .system-copy .system-head .small{margin-bottom:10px}
      .contact .content{left:22px;right:22px;width:auto;bottom:7vh !important}
    }

    @media(min-width:801px) and (max-height:760px){
      .problem .content,.solution .content,.services .content{top:18%}
      .problem .checks,.solution .checks{bottom:70px;gap:7px}
      .services .service-list{bottom:66px}
      .services .service-list>div{padding:5px 0}
    }
  `;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const br = s => esc(s).replace(/\n/g, '<br>');
  const isMobile = () => innerWidth <= 800;

  const font = f => {
    const base = Number(isMobile() ? f.mobile : f.desktop) || 1.4;
    return `${base}vmin`;
  };
  const set = (el, f, html = false) => {
    if (!el || !f) return;
    if (html) el.innerHTML = br(f.text); else el.textContent = f.text ?? '';
    el.style.fontSize = font(f);
  };

  function ensureSystemGroup(){
    const s=document.querySelector('.system');
    if(!s || s.querySelector('.system-copy')) return;
    const head=s.querySelector('.system-head');
    const steps=s.querySelector('.steps');
    if(!head || !steps) return;
    const wrap=document.createElement('div');
    wrap.className='system-copy';
    head.before(wrap);
    wrap.append(head,steps);
  }

  function apply() {
    ensureSystemGroup();
    const by = Object.fromEntries(rows.map(r => [r.slide, r.data?.fields || {}]));
    let f = by[1];
    if (f) { const s=document.querySelector('.start'); set(s?.querySelector('.tag'),f.tag); set(s?.querySelector('h1'),f.heading,true); [...(s?.querySelectorAll('.types span')||[])].forEach((el,i)=>set(el,f[`type${i+1}`])); const cta=s?.querySelector('.round-next'); if(cta&&f.cta){const arrow=cta.querySelector('i');[...cta.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());cta.append(document.createTextNode(' '+(f.cta.text??'')));cta.style.fontSize=font(f.cta);if(arrow)cta.prepend(arrow);} const m=s?.querySelectorAll('.micro')||[];set(m[0],f.microLeft,true);set(m[1],f.microRight,true); }
    f=by[2];
    if(f){const s=document.querySelector('.problem');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading,true);set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.check')||[])].forEach((el,i)=>set(el,f[`check${i+1}`]));}
    f=by[3];
    if(f){const s=document.querySelector('.solution');set(s?.querySelector('.tag'),f.tag);const h=s?.querySelector('h2');if(h&&f.heading){const p=String(f.heading.text??'').split('\n');h.innerHTML=`${esc(p[0]||'')}${p.length>1?'<br><em>'+esc(p.slice(1).join(' '))+'</em>':''}`;h.style.fontSize=font(f.heading);}set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.check')||[])].forEach((el,i)=>set(el,f[`check${i+1}`]));}
    f=by[4];
    if(f){const s=document.querySelector('.services');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading,true);set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.service-list>div')||[])].forEach((r,i)=>{set(r.querySelector('b'),f[`service${i+1}Name`]);set(r.querySelector('span'),f[`service${i+1}Text`]);});}
    f=by[5];
    if(f){const s=document.querySelector('.fleet');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading);set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.vcard')||[])].forEach((c,i)=>{set(c.querySelector('b'),f[`vehicle${i+1}`]);set(c.querySelector('small'),f[`vehicle${i+1}Text`]);});}
    f=by[6];
    if(f){const s=document.querySelector('.system'),tag=s?.querySelector('.system-head .tag');if(tag){const span=tag.querySelector('span');[...tag.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());tag.prepend(document.createTextNode(f.tagLeft?.text??''));tag.style.fontSize=font(f.tagLeft||{});if(span&&f.tagRight){span.textContent=f.tagRight.text??'';span.style.fontSize=font(f.tagRight);}}set(s?.querySelector('.system-head h2'),f.heading);set(s?.querySelector('.system-head .small'),f.intro);[...(s?.querySelectorAll('.step')||[])].forEach((st,i)=>{set(st.querySelector('b'),f[`step${i+1}Title`]);set(st.querySelector('p'),f[`step${i+1}Text`]);});}
    f=by[7];
    if(f){const s=document.querySelector('.contact');set(s?.querySelector('.tag'),f.tag);const h=s?.querySelector('h2');set(h,f.heading,true);if(h){h.style.maxWidth='100%';h.style.wordBreak='normal';h.style.overflowWrap='normal';}set(s?.querySelector('.intro'),f.intro,true);const b=s?.querySelectorAll('.actions .btn')||[];if(b[0]&&f.phone){const sp=b[0].querySelector('span');[...b[0].childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());b[0].prepend(document.createTextNode((f.phone.text??'')+' '));b[0].style.fontSize=font(f.phone);if(sp)b[0].append(sp);}if(b[1]&&f.email){const sp=b[1].querySelector('span');[...b[1].childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());b[1].prepend(document.createTextNode((f.email.text??'')+' '));b[1].style.fontSize=font(f.email);b[1].href='mailto:'+(f.email.text??'');if(sp)b[1].append(sp);}[...(s?.querySelectorAll('.benefits div')||[])].forEach((el,i)=>{const icon=el.querySelector('b'),t=f[`benefit${i+1}`];if(t){[...el.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());el.append(document.createTextNode(t.text??''));el.style.fontSize=font(t);if(icon)el.prepend(icon);}});set(s?.querySelector('.contact-signature'),f.signature,true);}
  }

  async function load(){try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);rows=await r.json();apply();}catch(e){console.warn('CleanFleet CMS: błąd pobierania treści',e);}}
  addEventListener('resize',()=>{if(rows.length)apply();});
  load();
})();