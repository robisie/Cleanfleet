import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Build every local dependency from one checkout, rather than reusing files
// from a previous deployment. The returned paths preserve relative imports.
export async function edgeSource(root,name){
 if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid function name');
 root=path.resolve(root);
 const entrypoint_path=`supabase/functions/${name}/index.ts`,files=new Map();
 async function visit(name){
  const absolute=path.resolve(root,name);
  if(!absolute.startsWith(root+path.sep))throw Error('Dependency outside repository');
  name=path.relative(root,absolute).split(path.sep).join('/');
  if(files.has(name))return;
  const content=await readFile(absolute,'utf8');files.set(name,{name,content});
  const imports=[...content.matchAll(/^\s*(?:import|export)\s+(?:[^;'"\n]*?\sfrom\s*)?['"]([^'"]+)['"]/gm),...content.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
  for(const match of imports)if(match[1].startsWith('.'))await visit(path.posix.join(path.posix.dirname(name),match[1].split('?')[0]));
 }
 await visit(entrypoint_path);
 return {name,entrypoint_path,files:[...files.values()].sort((a,b)=>a.name.localeCompare(b.name))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url));
 console.log(JSON.stringify(await edgeSource(root,process.argv[2]||'cleanfleet-bill')));
}
