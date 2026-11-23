import {client} from '../pack/auth.js?v=134';
import {repository} from './storage.mjs';
import {money, parsePrice, validBarcode, shoppingSummary, amountDue} from './model.mjs';

const $ = id => document.getElementById(id);
const db = client();
const state = {user:null, ownerId:null, data:{buyers:[],products:[],rounds:[],items:[],purchases:[]}, roundId:null, view:'home', selectedProducts:new Set(), selectedBuyerId:''};
const store = repository(db,()=>state.ownerId);
const node = (tag, text='', className='') => {const item=document.createElement(tag);item.textContent=text;if(className)item.className=className;return item;};
const btn = (text, action, kind='secondary') => {const item=node('button',text,kind);item.type='button';item.addEventListener('click',action);return item;};
const label = (text, control) => {const item=node('label',text);item.append(control);return item;};
const field = (name,value='',type='text',required=false) => {const item=document.createElement('input');item.name=name;item.type=type;item.value=value;item.required=required;return item;};
const select = (name,rows,value,placeholder) => {const item=document.createElement('select');item.name=name;if(placeholder)item.add(new Option(placeholder,''));for(const row of rows)item.add(new Option(row.name,row.id));item.value=value||'';return item;};
const message = (text,error=false) => {const box=$('notice');box.textContent=text;box.className=error?'error':'success';};
const currentRound = () => state.data.rounds.find(r=>r.id===state.roundId);
const roundItems = () => state.data.items.filter(item=>item.round_id===state.roundId);
const find = (list,id) => state.data[list].find(item=>item.id===id);
const asQty = (input,zero=false) => {const value=Number(input.value);if(!Number.isInteger(value)||value<(zero?0:1)||value>99999)throw Error('Podaj poprawną liczbę sztuk (maksymalnie 99 999).');return value;};
const priceText = cents => (cents/100).toFixed(2).replace('.',',');
const photoCache=new Map();

async function photo(path) {
  if (!path) return '';
  const cached=photoCache.get(path);
  if (cached&&cached.expires>Date.now()) return cached.url;
  const url=await store.imageUrl(path);photoCache.set(path,{url,expires:Date.now()+50*60*1000});return url;
}
function picture(path,alt) {
  const img=node('img');img.className='product-thumb';img.alt=alt;img.src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"%3E%3Ctext x="40" y="52" text-anchor="middle" font-size="35"%3E%F0%9F%9B%92%3C/text%3E%3C/svg%3E';
  if(path)photo(path).then(url=>{if(img.isConnected)img.src=url;}).catch(()=>{});
  return img;
}
function openEditor(title,body) {$('editorTitle').textContent=title;$('editorStatus').textContent='';$('editorBody').replaceChildren(body);if(!$('editor').open)$('editor').showModal();}
function errorInDialog(error) {$('editorStatus').textContent=error.message||String(error);$('editorStatus').className='error';}
async function submit(form,work,after) {
  const button=form.querySelector('button[type=submit]');button.disabled=true;$('editorStatus').textContent='Zapisywanie…';$('editorStatus').className='';
  try{await work();$('editor').close();await refresh();if(after)after();message('Zapisano.');}catch(error){errorInDialog(error);}finally{button.disabled=false;}
}
async function refresh() {
  state.data=await store.load();
  for(const id of state.selectedProducts)if(!find('products',id))state.selectedProducts.delete(id);
  if(!state.data.rounds.some(r=>r.id===state.roundId))state.roundId=state.data.rounds[0]?.id||null;
  render();
}
function render() {
  const round=$('roundSelect');round.replaceChildren();if(!state.data.rounds.length)round.add(new Option('Brak tur zakupów',''));
  for(const item of state.data.rounds)round.add(new Option(item.title,item.id));round.value=state.roundId||'';
  for(const view of ['home','buyers','products','orders','shopping','dispatch','settlements'])$(view+'View').hidden=view!==state.view;
  $('homeButton').hidden=state.view==='home';
  $('roundStatus').textContent=currentRound()?({open:'Zbieranie zamówień',shopping:'W trakcie zakupów',closed:'Zamknięta'}[currentRound().status]):'';
  renderDashboard();renderShopping();renderBuyers();renderBuyerSections();renderProducts();
}
function setView(view) {state.view=view;message('');render();}
function showRoundForm() {
  const form=node('form');const title=field('title','Zakupy — '+new Date().toLocaleDateString('pl-PL'), 'text',true);title.maxLength=120;form.append(label('Nazwa tury zakupów',title));
  const actions=node('div');actions.className='form-actions';actions.append(btn('Anuluj',()=>$('editor').close()));
  const save=node('button','Utwórz','primary');save.type='submit';actions.append(save);form.append(actions);
  form.onsubmit=event=>{event.preventDefault();submit(form,async()=>{const created=await store.saveRound({title:title.value.trim()});state.roundId=created.id;});};openEditor('Nowa tura zakupów',form);
}
function showBuyerForm(buyer) {
  const form=node('form');form.className='form-grid';const name=field('name',buyer?.name||'','text',true);name.maxLength=120;const note=document.createElement('textarea');note.value=buyer?.note||'';
  form.append(label('Imię i nazwisko / nazwa',name),label('Notatka',note));const save=node('button',buyer?'Zapisz zmiany':'Dodaj osobę');save.type='submit';form.append(save);
  form.onsubmit=event=>{event.preventDefault();submit(form,()=>store.saveBuyer({...buyer,name:name.value.trim(),note:note.value.trim()}));};openEditor(buyer?'Edytuj zamawiającego':'Dodaj zamawiającego',form);
}
const zxing=()=>{if(!window.ZXingBrowser?.BrowserMultiFormatReader)throw Error('Nie udało się wczytać czytnika kodów. Odśwież stronę.');return new window.ZXingBrowser.BrowserMultiFormatReader();};
async function normalizedImage(file,kind) {
  if(!file.type.startsWith('image/'))throw Error('Wybierz plik zdjęcia.');
  const source=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=source;await image.decode();
    const limit=1600,scale=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.83));
    if(!blob)throw Error('Nie udało się przygotować zdjęcia.');
    return new File([blob],`${kind}.jpg`,{type:'image/jpeg'});
  }finally{URL.revokeObjectURL(source);}
}
async function suggestProduct(code,name,description,preview,status) {
  status.textContent='Szukam opisu produktu…';
  try {
    const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_pl,product_name_it,generic_name,brands,quantity,image_front_url`,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Katalog produktów jest chwilowo niedostępny.');
    const result=await response.json(),product=result.product;
    if(result.status!==1||!product)throw Error('Nie znaleziono tego produktu w zewnętrznym katalogu. Uzupełnij dane ręcznie.');
    const suggestedName=product.product_name_pl||product.product_name_it||product.product_name;
    if(suggestedName&&!name.value)name.value=suggestedName;
    const detail=[product.brands,product.generic_name,product.quantity].filter(Boolean).join(' · ');
    if(detail&&!description.value)description.value=detail;
    if(product.image_front_url){preview.src=product.image_front_url;preview.hidden=false;}
    status.textContent='Znaleziono propozycję. Sprawdź nazwę, wariant i zdjęcie przed zapisem.';
  } catch(error){status.textContent=error.message||'Nie udało się pobrać danych. Uzupełnij je ręcznie.';}
}
let scanControls=null,scanToken=0;
async function scanLive(onCode,{continuous=false}={}) {
  if($('scanner').open)return;
  const token=++scanToken;let accepted=false,lastCode='',lastAt=0;
  $('scanner').showModal();$('scanStatus').textContent='Uruchamiam aparat…';
  try{
    const controls=await zxing().decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},$('scanVideo'),(result,error,activeControls)=>{
      if(!result||accepted||token!==scanToken)return;
      try{
        const code=validBarcode(result.getText());
        if(continuous){
          const now=Date.now();if(code===lastCode&&now-lastAt<1800)return;
          lastCode=code;lastAt=now;
          $('scanStatus').textContent=onCode(code)||`Odczytano ${code}. Skanuj następny produkt albo zamknij aparat.`;
        }else{accepted=true;activeControls?.stop();closeScanner();onCode(code);}
      }
      catch(problem){$('scanStatus').textContent=problem.message;}
    });
    if(token!==scanToken||accepted){controls.stop();return;}
    scanControls=controls;$('scanStatus').textContent='Umieść kod kreskowy w ramce.';
  }catch(error){$('scanStatus').textContent='Nie udało się uruchomić aparatu. Wybierz produkt z listy lub wpisz numer ręcznie.';}
}
function closeScanner(){scanToken++;scanControls?.stop();scanControls=null;if($('scanner').open)$('scanner').close();}

function showProductForm(product) {
  const form=node('form');form.className='form-grid';const id=product?.id||crypto.randomUUID();
  const name=field('name',product?.name||'','text',true),description=document.createElement('textarea');description.value=product?.description||'';
  const barcode=field('barcode',product?.barcode||'','text'),unit=field('unit',product?.unit||'szt.','text',true),price=field('price',priceText(product?.price_cents||0),'text',true);
  barcode.inputMode='numeric';barcode.placeholder='8–14 cyfr';name.maxLength=160;unit.maxLength=30;price.inputMode='decimal';
  const productPhoto=field('photo','','file');productPhoto.accept='image/*';
  const readStatus=node('p','Kod zapisujemy jako tekst. Sprawdź odczyt przed zapisem.','small muted');readStatus.className='wide small muted';
  const preview=node('img');preview.className='image-preview wide';preview.alt='Zdjęcie znalezione w zewnętrznym katalogu';preview.hidden=true;
  const duplicateButton=btn('Otwórz istniejący produkt',()=>{});duplicateButton.className='wide secondary';duplicateButton.hidden=true;
  const acceptCode=code=>{
    barcode.value=code;const existing=state.data.products.find(p=>p.barcode===code&&p.id!==id);
    if(existing){readStatus.textContent=`Ten kod należy już do produktu „${existing.name}”.`;duplicateButton.hidden=false;duplicateButton.onclick=()=>showProductForm(existing);return;}
    duplicateButton.hidden=true;void suggestProduct(code,name,description,preview,readStatus);
  };
  const scan=btn('▣ Skanuj aparatem',()=>scanLive(acceptCode));scan.className='wide secondary';
  const lookup=btn('Szukaj nazwy i opisu po kodzie',()=>{try{void suggestProduct(validBarcode(barcode.value),name,description,preview,readStatus);}catch(error){readStatus.textContent=error.message;}});lookup.className='wide secondary';
  form.append(scan,label('Kod kreskowy',barcode),lookup,readStatus,duplicateButton,preview,label('Nazwa produktu',name),label('Opis / wariant',description),label('Jednostka',unit),label('Cena za jednostkę (zł)',price),label('Zdjęcie produktu',productPhoto));
  if(product?.photo_path){const box=node('div');box.className='wide';box.append(node('p','Obecne zdjęcie produktu','small'),picture(product.photo_path,product.name));form.append(box);}
  const save=node('button',product?'Zapisz produkt':'Dodaj do katalogu');save.type='submit';form.append(save);
  form.onsubmit=event=>{event.preventDefault();submit(form,async()=>{
    const code=barcode.value.trim()?validBarcode(barcode.value):null;
    const duplicate=state.data.products.find(p=>p.barcode===code&&p.id!==id&&code);if(duplicate)throw Error(`Kod jest już przypisany do produktu „${duplicate.name}”.`);
    const values={id,name:name.value.trim(),description:description.value.trim(),barcode:code,unit:unit.value.trim(),price_cents:parsePrice(price.value),photo_path:product?.photo_path||null};
    if(!values.name||!values.unit)throw Error('Wpisz nazwę i jednostkę.');
    const uploaded=[];
    try{if(productPhoto.files[0]){values.photo_path=await store.uploadImage(state.ownerId,id,'product',await normalizedImage(productPhoto.files[0],'product'));uploaded.push(values.photo_path);}
      await store.saveProduct(values);
      if(product?.photo_path&&values.photo_path!==product.photo_path)await store.removeImage(product.photo_path).catch(()=>{});
    }catch(error){for(const path of uploaded)await store.removeImage(path).catch(()=>{});throw error;}
  });};openEditor(product?'Edytuj produkt':'Dodaj produkt',form);
}

function showAddItem(buyer,extra=false,preferredProductId='') {
  if(!currentRound())return message('Najpierw utwórz turę zakupów.',true);
  if(currentRound().status==='closed')return message('Tura jest zamknięta. Otwórz ją przed zmianami.',true);
  const form=node('form');form.className='form-grid';const product=select('product',state.data.products,preferredProductId,'Wybierz produkt');product.required=true;
  const qty=field('qty','1','number',true);qty.min=1;qty.max=99999;const price=field('price','0,00','text',true);price.inputMode='decimal';
  product.onchange=()=>{price.value=priceText(find('products',product.value)?.price_cents||0);};product.dispatchEvent(new Event('change'));
  const scanStatus=node('p','','wide small muted');
  const useCode=code=>{const found=state.data.products.find(p=>p.barcode===code);if(found){product.value=found.id;product.dispatchEvent(new Event('change'));scanStatus.textContent=`Znaleziono: ${found.name}`;}else scanStatus.textContent=`Brak produktu z kodem ${code}. Dodaj go najpierw do katalogu.`;};
  const scan=btn('▣ Znajdź po kodzie',()=>scanLive(useCode));scan.className='wide secondary';
  form.append(label('Produkt',product),scan,scanStatus,label(extra?'Wydana ilość':'Zamówiona ilość',qty),label('Cena za jednostkę (zł)',price));
  const save=node('button',extra?'Dodaj do rozliczenia':'Dodaj do zamówienia');save.type='submit';form.append(save);
  form.onsubmit=event=>{event.preventDefault();submit(form,async()=>{
    if(!product.value)throw Error('Wybierz produkt z katalogu.');const quantity=asQty(qty),cents=parsePrice(price.value);
    const existing=!extra&&roundItems().find(item=>item.buyer_id===buyer.id&&item.product_id===product.value&&item.source==='order');
    if(existing){await store.saveItem({...existing,ordered_qty:existing.ordered_qty+quantity});return;}
    await store.saveItem({round_id:state.roundId,buyer_id:buyer.id,product_id:product.value,source:extra?'extra':'order',ordered_qty:extra?0:quantity,received:extra,delivered_qty:extra?quantity:0,price_cents:cents});
  },()=>showBuyerOrder(buyer));};openEditor(extra?'Produkt dobrany przy odbiorze':`Zamówienie — ${buyer.name}`,form);
}

function showOrderBuilder(buyer,productIds=[],afterSave) {
  if(!currentRound())return message('Najpierw utwórz turę zakupów.',true);
  if(currentRound().status==='closed')return message('Tura jest zamknięta. Otwórz ją przed zmianami.',true);
  if(!state.data.products.length)return message('Dodaj najpierw produkty w Towarach.',true);
  const picks=new Map();
  for(const id of productIds){const product=find('products',id);if(product)picks.set(id,{qty:'1',price:priceText(product.price_cents),id:crypto.randomUUID()});}
  const form=node('form');form.className='order-builder';
  form.append(node('p',`Klient: ${buyer.name} · tura: ${currentRound().title}`,'muted'));
  const scan=btn('▣ Skanuj kolejne kody',()=>scanLive(code=>{
    const product=state.data.products.find(item=>item.barcode===code);
    if(!product)return `Kod ${code} nie jest w katalogu. Możesz skanować dalej.`;
    const pick=picks.get(product.id);
    if(pick)pick.qty=String(Number(pick.qty||0)+1);
    else picks.set(product.id,{qty:'1',price:priceText(product.price_cents),id:crypto.randomUUID()});
    renderChoices();return `${product.name}: ${picks.get(product.id).qty} ${product.unit}. Skanuj następny kod.`;
  },{continuous:true}),'primary');scan.className='scan-more';form.append(scan);
  const search=field('search','','search');search.placeholder='Szukaj nazwy lub kodu';search.autocomplete='off';form.append(label('Lub wybierz z listy',search));
  const count=node('p','','selection-count');const chosen=node('div');chosen.className='order-picks';
  const available=node('div');available.className='order-available';
  const save=node('button');save.type='submit';save.className='order-save';
  form.append(count,chosen,available,save);
  function renderChoices(){
    count.textContent=`Wybrane produkty: ${picks.size}`;
    save.textContent=`Dodaj do zamówienia (${picks.size})`;save.disabled=picks.size===0;
    chosen.replaceChildren();
    for(const [id,pick] of picks){const product=find('products',id);if(!product)continue;
      const row=node('div');row.className='order-pick';
      const title=node('div');title.append(node('strong',product.name),node('small',` · ${product.unit}`,'muted'));row.append(title);
      const controls=node('div');controls.className='pick-fields';
      const qty=field('qty',pick.qty,'number',true);qty.min=1;qty.max=99999;qty.inputMode='numeric';qty.oninput=()=>{pick.qty=qty.value;};
      const price=field('price',pick.price,'text',true);price.inputMode='decimal';price.oninput=()=>{pick.price=price.value;};
      controls.append(label('Ilość',qty),label('Cena za szt. (zł)',price));row.append(controls);
      row.append(btn('Usuń z wyboru',()=>{picks.delete(id);renderChoices();},'quiet destructive'));chosen.append(row);
    }
    const query=search.value.trim().toLocaleLowerCase('pl');available.replaceChildren();
    for(const product of state.data.products.filter(p=>!query||p.name.toLocaleLowerCase('pl').includes(query)||p.barcode?.includes(query))){
      const row=node('div');row.className='catalog-choice';const info=node('div');info.className='item-main';info.append(picture(product.photo_path,product.name));
      const detail=node('div');detail.append(node('strong',product.name),node('small',`${money(product.price_cents)} / ${product.unit}`,'muted'));info.append(detail);
      const selected=picks.has(product.id);row.append(info,btn(selected?'✓ Wybrano':'＋ Wybierz',()=>{
        if(selected)picks.delete(product.id);else picks.set(product.id,{qty:'1',price:priceText(product.price_cents),id:crypto.randomUUID()});renderChoices();
      },selected?'secondary':'primary'));available.append(row);
    }
    if(!available.childElementCount)available.append(node('p','Brak produktów o tej nazwie lub kodzie.','empty'));
  }
  search.oninput=renderChoices;renderChoices();
  form.onsubmit=async event=>{event.preventDefault();if(!picks.size)return;
    let rows;
    try{rows=[...picks].map(([id,pick])=>({product_id:id,qty:asQty({value:pick.qty}),price_cents:parsePrice(pick.price),newId:pick.id}));}
    catch(error){errorInDialog(error);return;}
    save.disabled=true;$('editorStatus').textContent='Zapisuję zamówienie…';$('editorStatus').className='';
    try{
      for(const row of rows){
        const existing=roundItems().find(item=>item.buyer_id===buyer.id&&item.product_id===row.product_id&&item.source==='order');
        await store.saveItem({...(existing||{id:row.newId,round_id:state.roundId,buyer_id:buyer.id,product_id:row.product_id,source:'order',received:false,delivered_qty:0}),ordered_qty:(existing?.ordered_qty||0)+row.qty,price_cents:row.price_cents});
      }
      await refresh();afterSave?.();showBuyerOrder(buyer);message(`Dodano ${rows.length} produktów do zamówienia.`);
    }catch(error){errorInDialog(error);}
    finally{save.disabled=false;}
  };
  openEditor(`Dodaj do zamówienia — ${buyer.name}`,form);
}

function showBuyerOrder(buyer) {
  if(!currentRound())return message('Najpierw utwórz turę zakupów.',true);
  const card=node('div');const info=node('p',`Tura: ${currentRound().title}`,'muted');card.append(info,node('p','Przy każdym produkcie zaznacz wydanie, wpisz ilość i cenę, a następnie naciśnij Zapisz.','small muted'));
  const items=roundItems().filter(item=>item.buyer_id===buyer.id);
  if(!items.length)card.append(node('p','Ta osoba nie ma jeszcze produktów w tej turze.','empty'));
  for(const item of items){
    const product=find('products',item.product_id);const row=node('div');row.className='card';row.dataset.productId=item.product_id;
    const title=node('h3',product?.name||'Produkt usunięty');row.append(title,node('p',item.source==='extra'?'Dobrane przy odbiorze':`Zamówiono: ${item.ordered_qty} ${product?.unit||'szt.'}`,'muted'));
    const controls=node('div');controls.className='form-grid delivery-fields';const check=field('received','','checkbox');check.checked=item.received;const quantity=field('quantity',String(item.delivered_qty||item.ordered_qty||1),'number');quantity.min=0;quantity.max=99999;quantity.inputMode='numeric';quantity.disabled=!check.checked;
    const defaultPrice=item.received?item.price_cents:(product?.price_cents??item.price_cents);
    const price=field('price',priceText(defaultPrice),'text');price.inputMode='decimal';price.disabled=!check.checked;
    check.onchange=()=>{quantity.disabled=price.disabled=!check.checked;if(check.checked&&Number(quantity.value)===0)quantity.value=String(item.ordered_qty||1);};
    const receivedLabel=label('Produkt wydany',check);receivedLabel.className='check delivery-check';
    controls.append(receivedLabel,label('Wydano sztuk',quantity),label('Cena za szt. (zł)',price));row.append(controls);
    const line=node('div');line.className='row-actions';const amount=node('strong',money(item.received?item.delivered_qty*item.price_cents:0),'amount');line.append(amount);
    line.append(btn('Zapisz',async()=>{try{const delivered=check.checked?asQty(quantity,true):0;await store.saveItem({...item,received:check.checked&&delivered>0,delivered_qty:delivered,price_cents:check.checked?parsePrice(price.value):item.price_cents});await refresh();showBuyerOrder(buyer);message('Wydanie zapisane.');}catch(error){errorInDialog(error);}},'primary'));
    line.append(btn('Usuń pozycję',async()=>{if(!confirm('Usunąć tę pozycję z zamówienia?'))return;try{await store.removeItem(item.id);await refresh();showBuyerOrder(buyer);}catch(error){errorInDialog(error);}},'secondary destructive'));row.append(line);card.append(row);
  }
  const total=node('div');total.className='total';total.append(node('span','Do zapłaty za faktycznie wydane'),node('strong',money(amountDue(items))));card.append(total);
  const actions=node('div');actions.className='actions';
  actions.append(btn('▣ Skanuj przy wydaniu',()=>scanLive(code=>{
    const product=state.data.products.find(p=>p.barcode===code);
    if(!product){errorInDialog(Error(`Kod ${code} nie jest jeszcze w katalogu. Dodaj produkt w Towarach.`));return;}
    const rows=[...card.querySelectorAll('[data-product-id]')];const match=rows.find(row=>row.dataset.productId===product.id&&row.textContent.includes('Zamówiono'))||rows.find(row=>row.dataset.productId===product.id);
    if(match){match.scrollIntoView?.({block:'center',behavior:'smooth'});match.classList.add('scan-match');setTimeout(()=>match.classList.remove('scan-match'),2500);$('editorStatus').textContent=`Znaleziono: ${product.name}. Wpisz wydaną ilość i cenę.`;}
    else showAddItem(buyer,true,product.id);
  }),'primary'));
  actions.append(btn('＋ Dodaj do zamówienia',()=>showOrderBuilder(buyer)),btn('＋ Dobrany przy odbiorze',()=>showAddItem(buyer,true)));
  actions.classList.add('buyer-tools');card.insertBefore(actions,card.children[2]);
  openEditor(`Zamówienie — ${buyer.name}`,card);
}

function renderShopping() {
  const content=$('shoppingContent'),actions=$('roundActions');content.replaceChildren();actions.replaceChildren();const round=currentRound();
  if(!round){content.append(node('p','Utwórz pierwszą turę zakupów, a potem dodaj zamawiających i produkty.','empty'));return;}
  const next={open:['Rozpocznij zakupy','shopping'],shopping:['Zamknij turę','closed'],closed:['Otwórz ponownie','open']}[round.status];
  actions.append(btn(next[0],async()=>{try{await store.saveRound({...round,status:next[1]});await refresh();}catch(error){message(error.message,true);}}));
  const groups=shoppingSummary(roundItems(),state.data.products);
  if(!groups.length){content.append(node('p','W tej turze nie ma jeszcze zamówień. Otwórz Zamawiających, aby dodać produkty.','empty'));return;}
  for(const group of groups){const product=group.product,card=node('article');card.className='summary-row';
    const main=node('div');main.className='item-main';main.append(picture(product?.photo_path,product?.name||'Produkt'));
    const details=node('div');details.append(node('h3',product?.name||'Produkt'),node('small',product?.barcode||'Bez kodu','muted'));main.append(details);card.append(main);
    const quantity=node('div');quantity.append(node('span','Do kupienia ','muted'),node('strong',`${group.total} ${product?.unit||'szt.'}`,'qty'));card.append(quantity);
    const purchase=state.data.purchases.find(p=>p.round_id===round.id&&p.product_id===product?.id);const purchased=field('purchased',String(purchase?.purchased_qty??0),'number');purchased.min=0;purchased.max=99999;purchased.style.maxWidth='100px';
    const save=btn('Zapisz zakup',async()=>{try{await store.savePurchase({round_id:round.id,product_id:product.id,purchased_qty:asQty(purchased,true)});await refresh();message('Zakup zapisany.');}catch(error){message(error.message,true);}});
    const bought=node('div');bought.className='inline';bought.append(label('Kupiono',purchased),save);card.append(bought);
    const disclosure=node('details');disclosure.className='detail';disclosure.append(node('summary','Komu i ile się należy'));
    for(const item of group.people){const buyer=find('buyers',item.buyer_id);disclosure.append(node('p',`${buyer?.name||'Nieznany'} — ${item.ordered_qty} ${product?.unit||'szt.'}`));}
    const wrap=node('div');wrap.dataset.productId=product?.id||'';wrap.append(card,disclosure);content.append(wrap);
  }
}
function renderDashboard() {
  const items=roundItems(),ordered=items.filter(item=>item.source==='order');
  const products=new Set(ordered.map(item=>item.product_id));
  const pending=new Set(ordered.filter(item=>!item.received||item.delivered_qty<item.ordered_qty).map(item=>item.buyer_id));
  const due=amountDue(items);
  $('buyersBadge').textContent=`${state.data.buyers.length} osób`;
  $('productsBadge').textContent=`${state.data.products.length} produktów`;
  $('ordersBadge').textContent=`${ordered.length} pozycji w turze`;
  $('shoppingBadge').textContent=`${products.size} produktów do kupienia`;
  $('dispatchBadge').textContent=`${pending.size} osób z zamówieniem do wydania`;
  $('settlementsBadge').textContent=money(due)+' do zapłaty';
  const metrics=$('homeMetrics');metrics.replaceChildren();
  for(const [title,value] of [['Zamówienia',String(ordered.length)],['Do kupienia',String(products.size)],['Do wydania',String(pending.size)],['Należności',money(due)]]){
    const card=node('div');card.className='metric';card.append(node('small',title),node('strong',value));metrics.append(card);
  }
}
function renderBuyers() {
  const content=$('buyersContent');content.replaceChildren();if(!state.data.buyers.length){content.append(node('p','Dodaj pierwszą osobę, dla której robisz zakupy.','empty'));return;}
  const grid=node('div');grid.className='grid';for(const buyer of state.data.buyers){const card=node('article');card.className='buyer-card';card.append(node('h3',buyer.name));if(buyer.note)card.append(node('p',buyer.note,'muted small'));
    const items=roundItems().filter(item=>item.buyer_id===buyer.id);card.append(node('p',`${items.length} pozycji · do zapłaty ${money(amountDue(items))}`,'small'));
    card.append(btn('Otwórz zamówienie',()=>showBuyerOrder(buyer),'primary'),btn('Edytuj',()=>showBuyerForm(buyer)));grid.append(card);}content.append(grid);
}
function renderBuyerSections() {
  const items=roundItems();
  for(const [view,contentId] of [['orders','ordersContent'],['dispatch','dispatchContent'],['settlements','settlementsContent']]){
    const content=$(contentId);content.replaceChildren();
    if(!currentRound()){content.append(node('p','Najpierw utwórz turę zakupów.','empty'));continue;}
    if(!state.data.buyers.length){content.append(node('p','Najpierw dodaj klienta w kafelku Klienci.','empty'));continue;}
    const grid=node('div');grid.className='grid';
    for(const buyer of state.data.buyers){
      const entries=items.filter(item=>item.buyer_id===buyer.id),orders=entries.filter(item=>item.source==='order');
      if(view!=='orders'&&!entries.length)continue;
      const card=node('article');card.className='buyer-card';card.append(node('h3',buyer.name));
      const detail=view==='orders'?`${orders.length} zamówionych pozycji`:view==='dispatch'?`${entries.filter(item=>item.received).length} wydanych pozycji · ${orders.length} zamówionych`:`Do zapłaty: ${money(amountDue(entries))}`;
      card.append(node('p',detail,'small muted'),btn(view==='settlements'?'Otwórz rozliczenie':view==='dispatch'?'Wydaj produkty':'Otwórz zamówienie',()=>showBuyerOrder(buyer),'primary'));
      grid.append(card);
    }
    content.append(grid.children.length?grid:node('p','Brak zamówień w tej turze.','empty'));
  }
}
function renderProducts() {
  const content=$('productsContent'),search=$('productSearch').value.trim().toLocaleLowerCase('pl');content.replaceChildren();const products=state.data.products.filter(p=>!search||p.name.toLocaleLowerCase('pl').includes(search)||p.barcode?.includes(search));
  renderCatalogSelection();
  if(!products.length){content.append(node('p',search?'Nie znaleziono produktu o tej nazwie lub kodzie.':'Dodaj pierwszy produkt do katalogu.','empty'));return;}
  for(const product of products){const card=node('article');card.className='list-row catalog-row';const main=node('div');main.className='item-main';main.append(picture(product.photo_path,product.name));
    const text=node('div');text.append(node('h3',product.name),node('p',product.description||'','muted small'),node('small',`${product.barcode||'Bez kodu'} · ${money(product.price_cents)} / ${product.unit}`,'muted'));main.append(text);
    const check=field('selected','','checkbox');check.checked=state.selectedProducts.has(product.id);check.onchange=()=>{if(check.checked)state.selectedProducts.add(product.id);else state.selectedProducts.delete(product.id);renderCatalogSelection();};
    const choice=label('Do zamówienia',check);choice.className='check catalog-check';card.append(main,choice,btn('Edytuj',()=>showProductForm(product)));content.append(card);}
}
function renderCatalogSelection(){
  const box=$('catalogSelection');box.replaceChildren();box.hidden=state.selectedProducts.size===0;if(box.hidden)return;
  const count=node('strong',`Zaznaczono: ${state.selectedProducts.size}`);box.append(count);
  const buyer=select('buyer',state.data.buyers,state.selectedBuyerId,'Wybierz klienta');buyer.required=true;buyer.onchange=()=>{state.selectedBuyerId=buyer.value;};box.append(label('Dodaj do zamówienia klienta',buyer));
  const add=btn('Przejdź do ilości',()=>{
    const chosen=find('buyers',buyer.value);if(!chosen)return message('Wybierz klienta dla zaznaczonych produktów.',true);
    showOrderBuilder(chosen,[...state.selectedProducts],()=>{state.selectedProducts.clear();state.selectedBuyerId='';renderProducts();});
  },'primary');add.disabled=!state.data.buyers.length||!currentRound()||currentRound().status==='closed';box.append(add);
  box.append(btn('Wyczyść wybór',()=>{state.selectedProducts.clear();state.selectedBuyerId='';renderProducts();},'quiet'));
}
function lookup(code) {const product=state.data.products.find(p=>p.barcode===code);setView('products');$('productSearch').value=code;renderProducts();if(!product)message(`Nie ma produktu z kodem ${code}. Możesz dodać go do katalogu.`,true);else message(`Znaleziono: ${product.name}.`);}
function gate(text='Zaloguj się kontem administratora CiaoPack.') {state.user=null;state.ownerId=null;$('app').hidden=true;$('setup').hidden=true;$('login').hidden=false;$('loginForm').hidden=false;$('loginInfo').textContent=text;$('logout').hidden=true;}
async function start() {
  const {data,error}=await db.auth.getUser();if(error||!data?.user)return gate();
  if(new URLSearchParams(location.search).get('setup')==='1'){
    $('login').hidden=true;$('app').hidden=true;$('setup').hidden=false;$('setupEmail').textContent=`Konto: ${data.user.email||''}`;$('logout').hidden=false;return;
  }
  const role=await db.rpc('ciaopack_owner_id');if(role.error)throw Error('Nie można sprawdzić uprawnień CiaoPack. Spróbuj ponownie.');
  if(!role.data)return gate('To konto nie ma dostępu do CiaoPack.');
  state.user=data.user;state.ownerId=role.data;$('login').hidden=true;$('setup').hidden=true;$('app').hidden=false;$('logout').hidden=false;await refresh();
}

document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').id==='scanner'?closeScanner():$('editor').close());
$('scanner').addEventListener('close',()=>{scanToken++;scanControls?.stop();scanControls=null;});
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
$('homeButton').onclick=()=>setView('home');
$('newRound').onclick=showRoundForm;$('newBuyer').onclick=()=>showBuyerForm();$('newProduct').onclick=()=>showProductForm();
$('roundSelect').onchange=event=>{state.roundId=event.target.value;render();};$('productSearch').oninput=renderProducts;
$('scanProduct').onclick=()=>scanLive(lookup);
$('scanShopping').onclick=()=>scanLive(code=>{const product=state.data.products.find(p=>p.barcode===code);const card=product&&[...$('shoppingContent').children].find(el=>el.dataset.productId===product.id);if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.querySelector('details').open=true;message(`Znaleziono na liście: ${product.name}.`);}else message(`Kod ${code} nie występuje na tej liście zakupów.`,true);});
$('loginForm').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button'),email=form.elements.namedItem('email').value.trim(),password=form.elements.namedItem('password').value;button.disabled=true;$('loginError').textContent='';form.elements.namedItem('password').value='';try{const result=await db.auth.signInWithPassword({email,password});if(result.error)throw Error('Nieprawidłowy e-mail lub hasło.');await start();}catch(error){gate();$('loginError').textContent=error.message;}finally{button.disabled=false;}};
$('setupForm').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button'),password=form.elements.namedItem('password').value,confirm=form.elements.namedItem('confirm').value;
  if(password!==confirm){$('setupError').textContent='Hasła nie są takie same.';return;}
  button.disabled=true;$('setupError').textContent='';
  try{const result=await db.auth.updateUser({password});if(result.error)throw result.error;
    history.replaceState(null,'',location.pathname);form.reset();await start();
  }catch(error){$('setupError').textContent=error.message||'Nie udało się zapisać hasła.';}
  finally{button.disabled=false;}
};
$('logout').onclick=async()=>{await db.auth.signOut();gate('Wylogowano.');};
db.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'||state.user&&session?.user?.id!==state.user.id)gate('Sesja została zakończona. Zaloguj się ponownie.');
  else if(event==='SIGNED_IN'&&new URLSearchParams(location.search).get('setup')==='1')setTimeout(()=>start().catch(error=>gate(error.message)),0);
});
start().catch(error=>gate(error.message));
