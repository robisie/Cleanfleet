(() => {
  const API = 'https://nxmrobbhfqijmbjjzbof.supabase.co/functions/v1/website-cms';
  let rows = [];

  const style = document.createElement('style');
  style.textContent = `
    /* One rule for the whole site: the main text composition of every slide
       is vertically centered in the viewport. */
    .cf-vcenter{
      position:absolute;
      top:50%;
      transform:translateY(-50%);
      z-index:3;
      display:flex;
      flex-direction:column;
      align-items:flex-start;
      justify-content:center;
      box-sizing:border-box;
    }
    .cf-vcenter > *{
      position:relative !important;
      top:auto !important;
      right:auto !important;
      bottom:auto !important;
      left:auto !important;
      transform:none !important;
    }

    .problem .cf-vcenter,.solution .cf-vcenter,.services .cf-vcenter{
      left:clamp(24px,7vw,120px);
      width:min(640px,76vw);
      gap:clamp(16px,2.6vh,28px);
    }
    .problem .cf-vcenter > .content,
    .solution .cf-vcenter > .content,
    .services .cf-vcenter > .content{width:100% !important}

    .problem .cf-vcenter > .checks,
    .solution .cf-vcenter > .checks{
      width:min(620px,100%) !important;
      display:grid;
      gap:clamp(8px,1.2vh,14px);
    }
    .problem .check,.solution .check{
      display:flex;
      align-items:center;
      line-height:1.22;
      min-width:0;
    }
    .problem .check:before,.solution .check:before{flex:0 0 auto}

    .services .cf-vcenter > .service-list{
      width:min(560px,100%) !important;
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

    .fleet .cf-vcenter{
      left:clamp(24px,7vw,120px);
      right:7vw;
      width:auto;
      gap:clamp(18px,3vh,34px);
    }
    .fleet .cf-vcenter > .content{width:min(640px,76vw) !important}
    .fleet .cf-vcenter > .vehicle-cards{
      width:100% !important;
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:18px;
    }

    .system .cf-vcenter{
      left:7vw;
      width:min(520px,40vw);
      gap:clamp(18px,3vh,30px);
    }
    .system .cf-vcenter > .system-head{width:100% !important}
    .system .cf-vcenter > .steps{
      width:min(420px,32vw) !important;
      display:grid !important;
      grid-template-columns:1fr !important;
      gap:clamp(10px,2vh,18px);
    }
    .system-head h2{margin:9px 0 8px;line-height:.95}
    .system-head .small{margin:0;line-height:1.28;max-width:30vw}
    .step{min-height:0}
    .step b,.step p{line-height:1.18}

    .contact .cf-vcenter{
      left:clamp(24px,7vw,120px);
      width:min(520px,44vw);
      gap:clamp(10px,1.7vh,18px);
    }
    .contact .cf-vcenter > .content{width:100% !important}
    .contact .content h2{margin:7px 0 10px;line-height:.88;max-width:100%;overflow-wrap:normal;word-break:normal}
    .contact .intro{line-height:1.16;margin:0 0 10px}
    .contact .actions{margin-top:10px;width:min(340px,34vw);gap:7px}
    .contact .btn{padding:10px 14px}
    .contact .benefits{margin-top:12px;gap:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:min(430px,39vw)}
    .contact .benefits div{max-width:none;min-width:0;line-height:1.08}
    .contact .cf-vcenter > .contact-signature{
      margin-top:4px;
      text-align:left !important;
    }

    /* Start was already one block, but force true vertical centering here too. */
    .start > .content{
      top:50% !important;
      transform:translateY(-50%) !important;
    }

    @media(min-width:801px) and (orientation:landscape) and (max-height:760px){
      .problem .cf-vcenter,.solution .cf-vcenter,.services .cf-vcenter{gap:14px}
      .problem .checks,.solution .checks{gap:7px}
      .services .service-list>div{padding:5px 0}

      .system .cf-vcenter{gap:14px}
      .system-head h2{margin:7px 0 6px;line-height:.92}
      .system-head .small{max-width:31vw;line-height:1.18}
      .system .steps{gap:9px}
      .step{padding-bottom:9px}
      .step i{font-size:36px}

      .contact .cf-vcenter{width:min(480px,42vw);gap:8px}
      .contact .content h2{margin:5px 0 8px;line-height:.86}
      .contact .intro{line-height:1.12;margin-bottom:8px}
      .contact .actions{margin-top:8px;gap:6px;width:min(315px,32vw)}
      .contact .btn{padding:9px 12px}
      .contact .benefits{margin-top:9px;gap:9px;width:min(400px,37vw)}
    }

    @media(min-width:801px) and (orientation:landscape) and (max-height:650px){
      .system .cf-vcenter{gap:10px}
      .system-head .tag{margin-bottom:2px}
      .system-head h2{line-height:.9;margin:5px 0 4px}
      .system-head .small{line-height:1.12}
      .system .steps{gap:7px}
      .step{padding-bottom:7px}
      .step p{margin-top:3px}

      .contact .cf-vcenter{width:min(450px,40vw);gap:6px}
      .contact .content h2{margin:3px 0 6px;line-height:.84}
      .contact .intro{line-height:1.08;margin-bottom:6px}
      .contact .actions{margin-top:6px;width:min(295px,30vw);gap:5px}
      .contact .btn{padding:8px 11px}
      .contact .benefits{margin-top:7px;gap:7px;width:min(380px,35vw)}
      .contact .benefits div{line-height:1.02}
    }

    @media(max-width:800px){
      .cf-vcenter{
        left:22px !important;
        right:22px !important;
        width:auto !important;
        top:50% !important;
        transform:translateY(-50%) !important;
      }
      .problem .cf-vcenter,.solution .cf-vcenter,.services .cf-vcenter{gap:14px}
      .problem .check,.solution .check{line-height:1.18}
      .services .service-list{padding:8px 12px}
      .services .service-list>div{grid-template-columns:minmax(88px,max-content) minmax(0,1fr);gap:10px;padding:5px 0}
      .fleet .cf-vcenter{gap:14px}
      .fleet .cf-vcenter > .content{width:88vw !important}
      .fleet .cf-vcenter > .vehicle-cards{gap:8px}
      .system .cf-vcenter{gap:14px}
      .system .cf-vcenter > .steps{width:100% !important;display:flex !important;gap:10px}
      .system .step{grid-template-columns:1fr;text-align:center;flex:1}
      .system .step i{margin:auto;width:auto;font-size:32px}
      .system .step p{display:none}
      .contact .cf-vcenter{gap:8px}
      .contact .actions{width:min(340px,80vw)}
      .contact .benefits{width:100%}
      .contact .cf-vcenter > .contact-signature{font-size:18px!important;margin-top:2px}
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

  function group(sceneSelector, childSelectors){
    const scene=document.querySelector(sceneSelector);
    if(!scene || scene.querySelector(':scope > .cf-vcenter')) return;
    const els=childSelectors.map(sel=>scene.querySelector(':scope > '+sel)).filter(Boolean);
    if(!els.length) return;
    const wrap=document.createElement('div');
    wrap.className='cf-vcenter';
    els[0].before(wrap);
    els.forEach(el=>wrap.appendChild(el));
  }

  function buildCenteredGroups(){
    group('.problem',['.content','.checks']);
    group('.solution',['.content','.checks']);
    group('.services',['.content','.service-list']);
    group('.fleet',['.content','.vehicle-cards']);
    group('.system',['.system-head','.steps']);
    group('.contact',['.content','.contact-signature']);
  }

  function apply() {
    buildCenteredGroups();
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