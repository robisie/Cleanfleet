import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
const settings=()=>({markup:35,company:{name:'Test'},catalog:[{id:'a',name:'Usługa A',category:'Prace',unit:'m²',base:100},{id:'b',name:'Usługa B',category:'Prace',unit:'szt.',base:19.99}]});
test('nowa inwestycja kopiuje bazę, lokalne podwyższenie nie zmienia głównego ani innej inwestycji',()=>{
 const master=settings(),one=C.captureCatalog(master,C.newProject('A','Test')),two=C.captureCatalog(master,C.newProject('B','Test'));
 one.markup=50;one.catalog[0].base=10;
 assert.equal(master.markup,35);assert.equal(two.markup,35);assert.equal(master.catalog[0].base,100);assert.equal(two.catalog[0].base,100);
 assert.equal(C.catalogMarkup(master,one),50);
});
test('korekta jest trwała, sumuje się procentowo, zachowuje ceny poprzednich inwestycji i dokumentów',()=>{
 const master=settings(),old=C.captureCatalog(master,{offer:[{price:135,qty:1}],acceptedOffers:[{lines:[{price:135}]}]});
 const corrected=C.correctCatalog(master,'5','Roczna korekta','2026-10-10T10:00:00Z');
 assert.equal(corrected.catalog[0].base,105);assert.equal(corrected.catalog[1].base,20.99);assert.equal(corrected.markup,35);
 const twice=C.correctCatalog(corrected,5);assert.equal(twice.catalog[0].base,110.25);
 assert.equal(C.projectCatalog(twice,old)[0].base,100);assert.equal(old.offer[0].price,135);assert.equal(old.acceptedOffers[0].lines[0].price,135);
 assert.equal(C.captureCatalog(twice,{}).catalog[0].base,110.25);assert.equal(master.catalog[0].base,100);
 assert.equal(corrected.catalogCorrections[0].reason,'Roczna korekta');
});
test('wspólny katalog udostępnia nowe usługi i nazwy bez zmiany starych cen bazowych',()=>{
 const master=settings(),old=C.captureCatalog(master,{});
 master.catalog[0].name='Nowa nazwa';master.catalog[0].base=150;master.catalog.push({id:'c',name:'Nowa usługa',category:'Inne',unit:'kpl',base:80});
 const result=C.projectCatalog(master,old);assert.equal(result.length,3);assert.equal(result[0].name,'Nowa nazwa');assert.equal(result[0].base,100);assert.equal(result[2].base,80);
 const captured=C.captureCatalog(master,old);master.catalog[2].base=100;assert.equal(C.projectCatalog(master,captured)[2].base,80);
});
test('cofnięcie zachowuje późniejsze nowe usługi, a nie nadpisuje ręcznych zmian ceny',()=>{
 const corrected=C.correctCatalog(settings(),5);corrected.catalog.push({id:'c',name:'Nowa usługa',base:70});
 const undone=C.undoCatalogCorrection(corrected,'2026-10-10T12:00:00Z');assert.equal(undone.catalog[0].base,100);assert.equal(undone.catalog[2].base,70);assert.equal(undone.catalogCorrections[0].undoneAt,'2026-10-10T12:00:00Z');assert.equal(C.lastCatalogCorrection(undone),undefined);
 corrected.catalog[0].base=120;assert.throws(()=>C.undoCatalogCorrection(corrected),/nadpisałoby/);
});
test('korekta obsługuje obniżkę i przecinek, odrzuca niepoprawny procent',()=>{
 assert.equal(C.correctCatalog(settings(),'-5,5').catalog[0].base,94.5);
 for(const value of ['',0,-100,-101,Infinity,'abc',1001])assert.throws(()=>C.correctCatalog(settings(),value));
});
