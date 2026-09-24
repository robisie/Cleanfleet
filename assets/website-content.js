(() => {
  const API='https://nxmrobbhfqijmbjjzbof.supabase.co/functions/v1/website-cms';
  const FORM_ENDPOINT='https://formsubmit.co/ajax/kontakt@cleanfleet.pl';
  let rows=[];

  const style=document.createElement('style');
  style.textContent=`
    .cf-vcenter{position:absolute;top:50%;transform:translateY(-50%);z-index:3;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;box-sizing:border-box}
    .cf-vcenter>*{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;transform:none!important}
    .problem .cf-vcenter,.solution .cf-vcenter,.services .cf-vcenter{left:clamp(24px,7vw,120px);width:min(640px,76vw);gap:clamp(18px,2.8vh,30px)}
    .problem .cf-vcenter>.content,.solution .cf-vcenter>.content,.services .cf-vcenter>.content{width:100%!important}
    .problem .cf-vcenter>.checks,.solution .cf-vcenter>.checks{width:min(620px,100%)!important;display:grid;gap:clamp(9px,1.25vh,14px)}
    .problem .check,.solution .check{display:flex;align-items:center;line-height:1.22;min-width:0}
    .problem .check:before,.solution .check:before{flex:0 0 auto}
    .services .cf-vcenter>.service-list{width:min(560px,100%)!important;padding:10px 16px;overflow:visible}
    .services .service-list>div{grid-template-columns:minmax(115px,max-content) minmax(0,1fr);min-height:0;padding:7px 0;line-height:1.18}
    .services .service-list b,.services .service-list span{min-width:0;white-space:normal;overflow-wrap:anywhere}

    .fleet .cf-vcenter{left:clamp(24px,7vw,120px);right:7vw;width:auto;gap:clamp(20px,3vh,34px)}
    .fleet .cf-vcenter>.content{width:min(640px,76vw)!important}
    .fleet .cf-vcenter>.vehicle-cards{width:100%!important;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}

    .system .cf-vcenter{left:7vw;width:min(520px,40vw);gap:clamp(22px,3.2vh,34px)}
    .system .cf-vcenter>.system-head{width:100%!important}
    .system .cf-vcenter>.steps{width:min(420px,32vw)!important;display:grid!important;grid-template-columns:1fr!important;gap:clamp(12px,2vh,20px)}
    .system-head h2{margin:10px 0 10px;line-height:.95}
    .system-head .small{margin:0;line-height:1.28;max-width:30vw}
    .step{min-height:0}
    .step b,.step p{line-height:1.18}

    .contact .cf-vcenter{left:clamp(24px,7vw,120px);width:min(560px,46vw);gap:clamp(22px,3vh,34px)}
    .contact .cf-vcenter>.content{width:100%!important}
    .contact .content h2{margin:10px 0 14px;line-height:.9;max-width:100%;overflow-wrap:normal;word-break:normal}
    .contact .intro{line-height:1.22;margin:0 0 18px}
    .contact .actions{margin-top:0;width:min(360px,34vw);gap:10px}
    .contact .btn{padding:12px 15px}
    .contact .benefits{margin-top:22px;gap:18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:min(450px,40vw)}
    .contact .benefits div{max-width:none;min-width:0;line-height:1.12}
    .contact .cf-vcenter>.contact-signature{margin-top:8px;text-align:left!important;line-height:1.15}

    .start>.content{top:50%!important;transform:translateY(-50%)!important}

    /* Contact form: desktop/tablet landscape — opens inside the free right side of slide 07. */
    .cf-mail-overlay{position:fixed;inset:0;z-index:1000;background:transparent;opacity:0;pointer-events:none;transition:opacity .22s ease}
    .cf-mail-overlay.open{opacity:1;pointer-events:none}
    .cf-mail-panel{position:absolute;right:clamp(28px,6vw,96px);top:50%;width:min(560px,42vw);max-height:74svh;background:rgba(6,12,9,.9);border:1px solid rgba(255,255,255,.18);border-radius:22px;box-shadow:0 24px 70px rgba(0,0,0,.5);backdrop-filter:blur(16px);transform:translate(34px,-50%) scale(.985);opacity:0;transition:transform .28s ease,opacity .22s ease;display:flex;flex-direction:column;padding:26px 28px;pointer-events:auto}
    .cf-mail-overlay.open .cf-mail-panel{transform:translate(0,-50%) scale(1);opacity:1}
    .cf-mail-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
    .cf-mail-top h3{margin:0;font:700 28px/1 Space Grotesk,sans-serif}
    .cf-mail-close{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.03);color:#fff;font-size:24px;cursor:pointer;flex:0 0 auto}
    .cf-mail-form{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;overflow:auto;padding-right:2px}
    .cf-mail-form label{display:grid;gap:6px;font-size:12px;color:#aeb8b2}
    .cf-mail-form label:nth-of-type(5){grid-column:1/-1}
    .cf-mail-form input,.cf-mail-form textarea{width:100%;border:1px solid rgba(255,255,255,.16);background:#111813;color:#fff;border-radius:10px;padding:11px 12px;outline:none}
    .cf-mail-form input:focus,.cf-mail-form textarea:focus{border-color:var(--g)}
    .cf-mail-form textarea{min-height:132px;resize:vertical}
    .cf-mail-submit{grid-column:1/-1;border:0;border-radius:10px;background:var(--g);color:#071007;font-weight:800;padding:13px 16px;cursor:pointer;margin-top:2px}
    .cf-mail-status{grid-column:1/-1;min-height:20px;font-size:12px;color:#aeb8b2}
    .cf-mail-status.ok{color:var(--g)}
    .cf-mail-status.bad{color:#ff6b6b}
    .cf-honey{position:absolute!important;left:-9999px!important;opacity:0!important}

    @media(min-width:801px) and (orientation:landscape) and (max-height:760px){
      .problem .cf-vcenter,.solution .cf-vcenter,.services .cf-vcenter{gap:16px}
      .problem .checks,.solution .checks{gap:7px}
      .services .service-list>div{padding:5px 0}
      .system .cf-vcenter{gap:16px}
      .system-head h2{margin:7px 0 7px;line-height:.92}
      .system-head .small{max-width:31vw;line-height:1.18}
      .system .steps{gap:9px}
      .step{padding-bottom:8px}
      .step i{font-size:36px}
      .contact .cf-vcenter{width:min(500px,43vw);gap:16px}
      .contact .content h2{margin:6px 0 9px;line-height:.87}
      .contact .intro{line-height:1.14;margin-bottom:11px}
      .contact .actions{width:min(325px,32vw);gap:7px}
      .contact .btn{padding:9px 12px}
      .contact .benefits{margin-top:12px;gap:10px;width:min(410px,38vw)}
      .contact .cf-vcenter>.contact-signature{margin-top:4px}
      .cf-mail-panel{max-height:78svh;padding:20px 22px}
      .cf-mail-top{margin-bottom:13px}.cf-mail-top h3{font-size:24px}
      .cf-mail-form{gap:9px 12px}.cf-mail-form textarea{min-height:105px}
    }

    @media(max-width:800px){
      .cf-vcenter{left:22px!important;right:22px!important;width:auto!important;top:50%!important;transform:translateY(-50%)!important}
      .problem .cf-vcenter,.solution .cf-vcenter,.services .cf-vcenter{gap:14px}
      .problem .check,.solution .check{line-height:1.18}
      .services .service-list{padding:8px 12px}
      .services .service-list>div{grid-template-columns:minmax(88px,max-content) minmax(0,1fr);gap:10px;padding:5px 0}
      .fleet .cf-vcenter{gap:14px}.fleet .cf-vcenter>.content{width:88vw!important}.fleet .cf-vcenter>.vehicle-cards{gap:8px}
      .system .cf-vcenter{gap:14px}.system .cf-vcenter>.steps{width:100%!important;display:flex!important;gap:10px}.system .step{grid-template-columns:1fr;text-align:center;flex:1}.system .step i{margin:auto;width:auto;font-size:32px}.system .step p{display:none}
      .contact .cf-vcenter{gap:14px}.contact .actions{width:min(340px,80vw)}.contact .benefits{width:100%;gap:12px;margin-top:16px}.contact .cf-vcenter>.contact-signature{font-size:18px!important;margin-top:8px}
      .cf-mail-overlay.open{background:rgba(0,0,0,.48);backdrop-filter:blur(3px);pointer-events:auto}
      .cf-mail-panel{right:12px;left:12px;top:50%;width:auto;max-height:86svh;padding:20px 18px;border-radius:18px;transform:translateY(-46%) scale(.985)}
      .cf-mail-overlay.open .cf-mail-panel{transform:translateY(-50%) scale(1)}
      .cf-mail-form{grid-template-columns:1fr}.cf-mail-form label:nth-of-type(5),.cf-mail-submit,.cf-mail-status{grid-column:1}
    }
  `;
  document.head.appendChild(style);

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const br=s=>esc(s).replace(/\n/g,'<br>');
  const isMobile=()=>innerWidth<=800;
  const font=f=>`${Number(isMobile()?f.mobile:f.desktop)||1.4}vmin`;
  const set=(el,f,html=false)=>{if(!el||!f)return;if(html)el.innerHTML=br(f.text);else el.textContent=f.text??'';el.style.fontSize=font(f)};

  function group(sceneSelector,childSelectors){
    const scene=document.querySelector(sceneSelector);if(!scene||scene.querySelector(':scope>.cf-vcenter'))return;
    const els=childSelectors.map(sel=>scene.querySelector(':scope>'+sel)).filter(Boolean);if(!els.length)return;
    const wrap=document.createElement('div');wrap.className='cf-vcenter';els[0].before(wrap);els.forEach(el=>wrap.appendChild(el));
  }
  function buildCenteredGroups(){
    group('.problem',['.content','.checks']);group('.solution',['.content','.checks']);group('.services',['.content','.service-list']);group('.fleet',['.content','.vehicle-cards']);group('.system',['.system-head','.steps']);group('.contact',['.content','.contact-signature']);
  }

  function buildMailDrawer(){
    if(document.querySelector('.cf-mail-overlay'))return;
    const overlay=document.createElement('div');overlay.className='cf-mail-overlay';
    overlay.innerHTML=`<aside class="cf-mail-panel" role="dialog" aria-modal="true" aria-label="Formularz kontaktowy"><div class="cf-mail-top"><h3>Napisz do CleanFleet</h3><button class="cf-mail-close" type="button" aria-label="Zamknij">×</button></div><form class="cf-mail-form"><label>Imię i nazwisko<input name="name" autocomplete="name" required></label><label>Firma<input name="company" autocomplete="organization"></label><label>Telefon<input name="phone" type="tel" autocomplete="tel"></label><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Wiadomość<textarea name="message" required placeholder="Napisz, czego potrzebujesz..."></textarea></label><input class="cf-honey" name="_honey" tabindex="-1" autocomplete="off"><input type="hidden" name="_subject" value="Nowa wiadomość ze strony CleanFleet"><input type="hidden" name="_template" value="table"><button class="cf-mail-submit" type="submit">Wyślij wiadomość</button><div class="cf-mail-status" aria-live="polite"></div></form></aside>`;
    document.body.appendChild(overlay);
    const close=()=>{overlay.classList.remove('open');document.body.style.removeProperty('overflow')};
    const open=()=>{overlay.classList.add('open');document.body.style.overflow='hidden';setTimeout(()=>overlay.querySelector('input[name=name]')?.focus(),250)};
    overlay.querySelector('.cf-mail-close').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))close()});

    document.addEventListener('click',e=>{
      const a=e.target.closest('.contact .actions a[href^="mailto:"], .quote-cta');
      if(!a)return;e.preventDefault();open();
    });

    overlay.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,status=form.querySelector('.cf-mail-status'),btn=form.querySelector('.cf-mail-submit');
      status.className='cf-mail-status';status.textContent='Wysyłanie…';btn.disabled=true;
      const data=Object.fromEntries(new FormData(form).entries());
      try{
        const r=await fetch(FORM_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)});
        if(!r.ok)throw new Error('send');
        status.className='cf-mail-status ok';status.textContent='Wiadomość wysłana. Dziękujemy.';form.reset();
      }catch(err){status.className='cf-mail-status bad';status.textContent='Nie udało się wysłać wiadomości. Spróbuj ponownie.'}
      finally{btn.disabled=false}
    });
  }

  function apply(){
    buildCenteredGroups();buildMailDrawer();
    const by=Object.fromEntries(rows.map(r=>[r.slide,r.data?.fields||{}]));
    let f=by[1];if(f){const s=document.querySelector('.start');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h1'),f.heading,true);[...(s?.querySelectorAll('.types span')||[])].forEach((el,i)=>set(el,f[`type${i+1}`]));const c=s?.querySelector('.round-next');if(c&&f.cta){const arrow=c.querySelector('i');[...c.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());c.append(document.createTextNode(' '+(f.cta.text??'')));c.style.fontSize=font(f.cta);if(arrow)c.prepend(arrow)}const m=s?.querySelectorAll('.micro')||[];set(m[0],f.microLeft,true);set(m[1],f.microRight,true)}
    f=by[2];if(f){const s=document.querySelector('.problem');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading,true);set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.check')||[])].forEach((el,i)=>set(el,f[`check${i+1}`]))}
    f=by[3];if(f){const s=document.querySelector('.solution');set(s?.querySelector('.tag'),f.tag);const h=s?.querySelector('h2');if(h&&f.heading){const p=String(f.heading.text??'').split('\n');h.innerHTML=`${esc(p[0]||'')}${p.length>1?'<br><em>'+esc(p.slice(1).join(' '))+'</em>':''}`;h.style.fontSize=font(f.heading)}set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.check')||[])].forEach((el,i)=>set(el,f[`check${i+1}`]))}
    f=by[4];if(f){const s=document.querySelector('.services');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading,true);set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.service-list>div')||[])].forEach((r,i)=>{set(r.querySelector('b'),f[`service${i+1}Name`]);set(r.querySelector('span'),f[`service${i+1}Text`])})}
    f=by[5];if(f){const s=document.querySelector('.fleet');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading);set(s?.querySelector('.intro'),f.intro,true);[...(s?.querySelectorAll('.vcard')||[])].forEach((c,i)=>{set(c.querySelector('b'),f[`vehicle${i+1}`]);set(c.querySelector('small'),f[`vehicle${i+1}Text`])})}
    f=by[6];if(f){const s=document.querySelector('.system'),tag=s?.querySelector('.system-head .tag');if(tag){const span=tag.querySelector('span');[...tag.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());tag.prepend(document.createTextNode(f.tagLeft?.text??''));tag.style.fontSize=font(f.tagLeft||{});if(span&&f.tagRight){span.textContent=f.tagRight.text??'';span.style.fontSize=font(f.tagRight)}}set(s?.querySelector('.system-head h2'),f.heading);set(s?.querySelector('.system-head .small'),f.intro);[...(s?.querySelectorAll('.step')||[])].forEach((st,i)=>{set(st.querySelector('b'),f[`step${i+1}Title`]);set(st.querySelector('p'),f[`step${i+1}Text`])})}
    f=by[7];if(f){const s=document.querySelector('.contact');set(s?.querySelector('.tag'),f.tag);const h=s?.querySelector('h2');set(h,f.heading,true);if(h){h.style.maxWidth='100%';h.style.wordBreak='normal';h.style.overflowWrap='normal'}set(s?.querySelector('.intro'),f.intro,true);const b=s?.querySelectorAll('.actions .btn')||[];if(b[0]&&f.phone){const sp=b[0].querySelector('span');[...b[0].childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());b[0].prepend(document.createTextNode((f.phone.text??'')+' '));b[0].style.fontSize=font(f.phone);if(sp)b[0].append(sp)}if(b[1]&&f.email){const sp=b[1].querySelector('span');[...b[1].childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());b[1].prepend(document.createTextNode((f.email.text??'')+' '));b[1].style.fontSize=font(f.email);b[1].href='mailto:'+(f.email.text??'');if(sp)b[1].append(sp)}[...(s?.querySelectorAll('.benefits div')||[])].forEach((el,i)=>{const icon=el.querySelector('b'),t=f[`benefit${i+1}`];if(t){[...el.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());el.append(document.createTextNode(t.text??''));el.style.fontSize=font(t);if(icon)el.prepend(icon)}});set(s?.querySelector('.contact-signature'),f.signature,true)}
  }

  async function load(){try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);rows=await r.json();apply()}catch(e){console.warn('CleanFleet CMS: błąd pobierania treści',e)}}
  addEventListener('resize',()=>{if(rows.length)apply()});
  load();
})();