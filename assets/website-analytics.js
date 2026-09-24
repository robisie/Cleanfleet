(()=>{
  'use strict';
  const ENDPOINT='https://nxmrobbhfqijmbjjzbof.supabase.co/functions/v1/website-analytics';
  const EXCLUDE_KEY='cf_website_analytics_exclude';
  if(localStorage.getItem(EXCLUDE_KEY)==='1') return;

  const EVENT_KEY='cf_wa_sid';
  let sid=sessionStorage.getItem(EVENT_KEY);
  if(!sid){
    sid=(crypto?.randomUUID?.()||('00000000-0000-4000-8000-'+Math.random().toString(16).slice(2,14).padEnd(12,'0'))).slice(0,36);
    try{sessionStorage.setItem(EVENT_KEY,sid)}catch(_){}
  }

  const qs=new URLSearchParams(location.search);
  const utm={
    utm_source:(qs.get('utm_source')||'').slice(0,100),
    utm_medium:(qs.get('utm_medium')||'').slice(0,100),
    utm_campaign:(qs.get('utm_campaign')||'').slice(0,120)
  };
  let ref='';
  try{ref=document.referrer?new URL(document.referrer).hostname.replace(/^www\./,''):''}catch(_){}
  const source=(()=>{
    if(utm.utm_source) return utm.utm_source;
    if(!ref) return 'direct';
    if(/(^|\.)google\./i.test(ref)) return 'google';
    if(/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(ref)) return 'facebook';
    if(/(^|\.)instagram\.com$/i.test(ref)) return 'instagram';
    if(/(^|\.)linkedin\.com$/i.test(ref)) return 'linkedin';
    if(/(^|\.)bing\.com$/i.test(ref)) return 'bing';
    return ref;
  })();
  const device=(()=>{
    const min=Math.min(screen.width||innerWidth,screen.height||innerHeight);
    if((navigator.maxTouchPoints||0)>1 && min>=600) return 'tablet';
    if(innerWidth<=767) return 'mobile';
    return 'desktop';
  })();

  function track(event_name,extra={}){
    const payload={
      session_id:sid,event_name,page_path:location.pathname||'/',source,
      referrer_domain:ref||null,device,...utm,...extra
    };
    try{
      fetch(ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        keepalive:true,
        credentials:'omit',
        cache:'no-store'
      }).catch(()=>{});
    }catch(_){}
  }
  window.CFWebsiteAnalytics={track};

  function currentSlide(){
    const scenes=[...document.querySelectorAll('.scene')];
    const active=scenes.findIndex(x=>x.classList.contains('is-active'));
    return active>=0?active+1:(scenes.length?1:null);
  }
  const seenSlides=new Set();
  function trackSlide(){
    const slide=currentSlide();
    if(!slide||seenSlides.has(slide)) return;
    seenSlides.add(slide);
    track('slide_view',{slide});
  }

  track('page_view');
  trackSlide();
  setTimeout(()=>{if(document.visibilityState==='visible')track('engaged_30s')},30000);

  const scenes=[...document.querySelectorAll('.scene')];
  if(scenes.length){
    const mo=new MutationObserver(trackSlide);
    scenes.forEach(s=>mo.observe(s,{attributes:true,attributeFilter:['class']}));
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest?.('a,button');
    if(!a) return;
    const href=(a.getAttribute?.('href')||'').trim();
    if(a.classList?.contains('quote-cta')) track('quote_click',{meta:{label:'Poproś o wycenę'}});
    else if(href.startsWith('tel:')) track('phone_click',{meta:{label:(a.textContent||'').trim().slice(0,80)}});
    else if(href.startsWith('mailto:')) track('email_click',{meta:{label:(a.textContent||'').trim().slice(0,80)}});
    const service=a.closest?.('[data-service-cta]')?.getAttribute?.('data-service-cta');
    if(service) track('service_cta',{meta:{service:String(service).slice(0,80)}});
  },true);

  let formOpened=false,formStarted=false,formResult='';
  function inspectForm(){
    const overlay=document.querySelector('.cf-mail-overlay');
    const form=overlay?.querySelector('.cf-mail-form');
    if(overlay?.classList.contains('open')&&!formOpened){formOpened=true;track('form_open')}
    if(form && !form.dataset.cfAnalyticsBound){
      form.dataset.cfAnalyticsBound='1';
      form.addEventListener('input',()=>{if(!formStarted){formStarted=true;track('form_start')}},{once:true});
      const status=form.querySelector('.cf-mail-status');
      if(status){
        new MutationObserver(()=>{
          const state=status.classList.contains('ok')?'ok':status.classList.contains('bad')?'bad':'';
          if(!state||state===formResult)return;
          formResult=state;
          track(state==='ok'?'form_submit':'form_error');
        }).observe(status,{attributes:true,childList:true,subtree:true});
      }
    }
  }
  new MutationObserver(inspectForm).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  inspectForm();
})();