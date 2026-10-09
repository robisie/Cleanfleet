/* ZIP STORE streaming: one photo and one output chunk at a time. */
(function(root){
  'use strict';
  const enc=new TextEncoder();
  const u16=v=>{const a=new Uint8Array(2);new DataView(a.buffer).setUint16(0,v,true);return a};
  const u32=v=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,v>>>0,true);return a};
  const join=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out};
  const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0});
  function crcUpdate(crc,bytes){for(const b of bytes)crc=(crc>>>8)^crcTable[(crc^b)&255];return crc>>>0}
  function dosDateTime(date){return {time:((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|Math.floor(date.getSeconds()/2),date:((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()}}
  function stripMpoFromJpeg(bytes){
    if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
    let pos=2,scanStart=-1;const mpf=[];
    while(pos+1<bytes.length){
      if(bytes[pos]!==0xff)return null;
      const start=pos;
      while(pos<bytes.length&&bytes[pos]===0xff)pos++;
      if(pos>=bytes.length)return null;
      const marker=bytes[pos++];
      if(marker===0xda){
        if(pos+1>=bytes.length)return null;
        const len=(bytes[pos]<<8)|bytes[pos+1];
        if(len<2||pos+len>bytes.length)return null;
        scanStart=pos+len;
        break;
      }
      if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(pos+1>=bytes.length)return null;
      const len=(bytes[pos]<<8)|bytes[pos+1];
      if(len<2||pos+len>bytes.length)return null;
      const payload=pos+2;
      if(marker===0xe2&&payload+3<bytes.length&&bytes[payload]===0x4d&&bytes[payload+1]===0x50&&bytes[payload+2]===0x46&&bytes[payload+3]===0x00){
        mpf.push([start,pos+len]);
      }
      pos+=len;
    }
    if(!mpf.length||scanStart<0)return null;

    let eoi=-1;
    for(let i=scanStart;i+1<bytes.length;i++){
      if(bytes[i]!==0xff)continue;
      let j=i+1;
      while(j<bytes.length&&bytes[j]===0xff)j++;
      if(j>=bytes.length)break;
      const marker=bytes[j];
      if(marker===0x00){i=j;continue;}
      if(marker===0xd9){eoi=j+1;break;}
      i=j;
    }
    if(eoi<0)return null;

    let removed=0;
    for(const [a,b] of mpf)if(a<eoi)removed+=Math.max(0,Math.min(b,eoi)-a);
    if(!removed)return null;

    const out=new Uint8Array(eoi-removed);
    let from=0,to=0;
    for(const [a,b] of mpf){
      if(a>=eoi)break;
      if(a>from){out.set(bytes.subarray(from,a),to);to+=a-from;}
      from=Math.min(b,eoi);
    }
    if(from<eoi)out.set(bytes.subarray(from,eoi),to);
    return out;
  }


  async function prepare(row){
    const original=row.blob||new Blob([row.bytes],{type:row.mime||'image/jpeg'});
    if(/jpe?g/i.test(row.mime||original.type)){
      const bytes=new Uint8Array(await original.arrayBuffer()),primary=stripMpoFromJpeg(bytes);
      if(primary)return {blob:new Blob([primary],{type:'image/jpeg'}),normalized:true};
    }
    return {blob:original,normalized:false};
  }
  async function* chunks(manifest,getPhoto){
    const central=[];let offset=0,count=0;const dt=dosDateTime(new Date(manifest.createdAt));
    for(const entry of manifest.entries){
      let blob=new Blob([]),path=entry.path;
      if(entry.id){const row=await getPhoto(entry.id);if(!row)throw Error('Brak zdjęcia: '+entry.path);const prepared=await prepare(row);blob=prepared.blob;if(prepared.normalized)path=path.replace(/\.[^.\/]+$/,'.jpg')}
      const name=enc.encode(path),directory=path.endsWith('/'),flags=0x0800|(directory?0:8),start=offset;
      const header=join([u32(0x04034b50),u16(20),u16(flags),u16(0),u16(dt.time),u16(dt.date),u32(0),u32(0),u32(0),u16(name.length),u16(0),name]);
      offset+=header.length;yield header;
      let crc=0xffffffff,size=0;
      // slice caps the memory held by both Blob-backed and legacy ArrayBuffer photos.
      for(let at=0;at<blob.size;at+=65536){const data=new Uint8Array(await blob.slice(at,at+65536).arrayBuffer());crc=crcUpdate(crc,data);size+=data.length;offset+=data.length;yield data}
      crc=(crc^0xffffffff)>>>0;
      if(size>0xffffffff||offset>0xffffffff)throw Error('Paczka przekracza limit ZIP 4 GB. Podziel zdjęcia na mniejsze zestawy.');
      if(!directory){const descriptor=join([u32(0x08074b50),u32(crc),u32(size),u32(size)]);offset+=descriptor.length;yield descriptor}
      central.push(join([u32(0x02014b50),u16(20),u16(20),u16(flags),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(size),u32(size),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(directory?0x10:0),u32(start),name]));count++;
    }
    const centralOffset=offset,centralSize=central.reduce((n,p)=>n+p.length,0);
    for(const data of central)yield data;
    yield join([u32(0x06054b50),u16(0),u16(0),u16(count),u16(count),u32(centralSize),u32(centralOffset),u16(0)]);
  }
  function response(manifest,getPhoto){
    const iterator=chunks(manifest,getPhoto);
    const body=new ReadableStream({async pull(controller){try{const item=await iterator.next();if(item.done)controller.close();else controller.enqueue(item.value)}catch(error){controller.error(error);await iterator.return()}},async cancel(){await iterator.return()}},{highWaterMark:0});
    return new Response(body,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${manifest.name.replace(/[^A-Za-z0-9._-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(manifest.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  root.CFPhotoZipStream={response};
  if(typeof module!=='undefined')module.exports=root.CFPhotoZipStream;
})(typeof self!=='undefined'?self:globalThis);
