class Node {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.handlers={};this.classList={add(){}};this.textContent='';}
 appendChild(node){this.children.push(node);return node;}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,handler){this.handlers[type]=handler;}
 emit(type){this.handlers[type]?.({target:this});}
}
function walk(root){return [root,...root.children.flatMap(walk)];}
module.exports={Node,walk,document:{createElement:tag=>new Node(tag)}};
