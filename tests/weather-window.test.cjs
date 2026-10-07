const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const documentEvents=new Map(),windowEvents=new Map();let document;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attributes={};this.events=new Map();this.inert=false;this.isConnected=true;this.contentWindow=tag==='iframe'?{}:undefined;}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){this.events.set(type,fn);}
  remove(){this.parent.children=this.parent.children.filter(node=>node!==this);this.isConnected=false;}
  focus(options){this.focusOptions=options;document.activeElement=this;}
 }
 const all=root=>[root,...root.children.flatMap(all)];
 const body=new Element('body'),head=new Element('head'),screen=new Element('main'),button=new Element('button');
 screen.value='selected company and filters';screen.scrollTop=380;screen.append(button);body.append(screen);
 document={body,head,activeElement:button,createElement:tag=>new Element(tag),getElementById:id=>[...all(body),...all(head)].find(node=>node.id===id),addEventListener:(type,fn)=>documentEvents.set(type,fn),removeEventListener:(type,fn)=>{if(documentEvents.get(type)===fn)documentEvents.delete(type);}};
 const window={location:{origin:'https://cleanfleet.pl'},addEventListener:(type,fn)=>windowEvents.set(type,fn),removeEventListener:(type,fn)=>{if(windowEvents.get(type)===fn)windowEvents.delete(type);}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/weather-window.js'),'utf8'),{document,window});
 return {document,window,screen,button,documentEvents,windowEvents,all};
}
test('return closes only the weather window and preserves previous view, scroll and focus',()=>{
 const f=fixture();f.window.cfOpenFullWeather();f.window.cfOpenFullWeather();assert.equal(f.document.body.children.length,2);assert.equal(f.screen.inert,true);
 const overlay=f.document.getElementById('cfFullWeatherOverlay'),back=overlay.children[0].children[0].children[0];
 const frame=overlay.children[0].children[1];assert.match(frame.src,/weather.html\?embedded=1/);
 back.events.get('click')();assert.equal(f.document.body.children.length,1);assert.equal(f.document.body.children[0],f.screen);assert.equal(f.screen.value,'selected company and filters');assert.equal(f.screen.scrollTop,380);assert.equal(f.screen.inert,false);assert.equal(f.document.activeElement,f.button);assert.equal(f.button.focusOptions.preventScroll,true);assert.equal(f.windowEvents.size,0);assert.equal(f.documentEvents.size,0);
});
test('close messages must come from the forecast frame and the application origin',()=>{
 const f=fixture();f.window.cfOpenFullWeather();const overlay=f.document.getElementById('cfFullWeatherOverlay'),frame=overlay.children[0].children[1],message=f.windowEvents.get('message');
 message({origin:'https://other.example',source:frame.contentWindow,data:{type:'cf-weather-close'}});assert.equal(f.document.body.children.length,2);
 message({origin:f.window.location.origin,source:{},data:{type:'cf-weather-close'}});assert.equal(f.document.body.children.length,2);
 message({origin:f.window.location.origin,source:frame.contentWindow,data:{type:'cf-weather-close'}});assert.equal(f.document.body.children.length,1);
});
test('Escape closes forecast and stops the key from closing the previous modal',()=>{
 const f=fixture();f.window.cfOpenFullWeather();let prevented=false,stopped=false;
 f.documentEvents.get('keydown')({key:'Escape',preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
 assert(prevented&&stopped);assert.equal(f.document.body.children.length,1);f.window.cfOpenFullWeather();assert.equal(f.document.body.children.length,2);
});
