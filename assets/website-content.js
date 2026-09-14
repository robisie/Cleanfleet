(() => {
  const API = 'https://nxmrobbhfqijmbjjzbof.supabase.co/functions/v1/website-cms';
  let rows = [];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const br = s => esc(s).replace(/\n/g, '<br>');
  const isMobile = () => innerWidth <= 800;
  const font = f => `${Number(isMobile() ? f.mobile : f.desktop) || 14}px`;
  const set = (el, f, html = false) => { if (!el || !f) return; if (html) el.innerHTML = br(f.text); else el.textContent = f.text ?? ''; el.style.fontSize = font(f); };

  function apply() {
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
    if(f){const s=document.querySelector('.contact');set(s?.querySelector('.tag'),f.tag);set(s?.querySelector('h2'),f.heading,true);set(s?.querySelector('.intro'),f.intro,true);const b=s?.querySelectorAll('.actions .btn')||[];if(b[0]&&f.phone){const sp=b[0].querySelector('span');[...b[0].childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());b[0].prepend(document.createTextNode((f.phone.text??'')+' '));b[0].style.fontSize=font(f.phone);if(sp)b[0].append(sp);}if(b[1]&&f.email){const sp=b[1].querySelector('span');[...b[1].childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());b[1].prepend(document.createTextNode((f.email.text??'')+' '));b[1].style.fontSize=font(f.email);b[1].href='mailto:'+(f.email.text??'');if(sp)b[1].append(sp);}[...(s?.querySelectorAll('.benefits div')||[])].forEach((el,i)=>{const icon=el.querySelector('b'),t=f[`benefit${i+1}`];if(t){[...el.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());el.append(document.createTextNode(t.text??''));el.style.fontSize=font(t);if(icon)el.prepend(icon);}});set(s?.querySelector('.contact-signature'),f.signature,true);}
  }

  async function load(){try{const r=await fetch(API,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);rows=await r.json();apply();}catch(e){console.warn('CleanFleet CMS: błąd pobierania treści',e);}}
  addEventListener('resize',()=>{if(rows.length)apply();});
  load();
})();