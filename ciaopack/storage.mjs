const ensure = ({data,error}) => { if (error) throw error; return data; };
const bucket = 'ciaopack-products';
async function allRows(table) {
  const rows=[];
  for(let start=0;;start+=500){
    const page=ensure(await table.select('*').order('id').range(start,start+499));
    rows.push(...page);if(page.length<500)return rows;
  }
}

export function repository(db, ownerId) {
  const table = name => db.from('ciaopack_' + name);
  return {
    async load() {
      const [buyers,products,rounds,items,purchases] = await Promise.all(
        ['buyers','products','rounds','order_items','purchases'].map(name=>allRows(table(name)))
      );
      return {
        buyers:buyers.sort((a,b)=>a.name.localeCompare(b.name,'pl')),
        products:products.sort((a,b)=>a.name.localeCompare(b.name,'pl')),
        rounds:rounds.sort((a,b)=>b.created_at.localeCompare(a.created_at)),
        items:items.sort((a,b)=>a.created_at.localeCompare(b.created_at)),purchases
      };
    },
    async saveBuyer(values) { return ensure(await table('buyers').upsert({...values,owner_id:ownerId()}).select().single()); },
    async saveRound(values) { return ensure(await table('rounds').upsert({...values,owner_id:ownerId()}).select().single()); },
    async saveProduct(values) { return ensure(await table('products').upsert({...values,owner_id:ownerId()}).select().single()); },
    async saveItem(values) { return ensure(await table('order_items').upsert({...values,owner_id:ownerId()}).select().single()); },
    async removeItem(id) { ensure(await table('order_items').delete().eq('id',id)); },
    async savePurchase(values) { return ensure(await table('purchases').upsert({...values,owner_id:ownerId()},{onConflict:'owner_id,round_id,product_id'}).select().single()); },
    async uploadImage(ownerId,productId,kind,file) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('Wybierz zdjęcie JPG, PNG lub WebP do 5 MB.');
      const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      const path = `${ownerId}/${productId}/${kind}-${crypto.randomUUID()}.${ext}`;
      ensure(await db.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false}));
      return path;
    },
    async removeImage(path) { if (path) ensure(await db.storage.from(bucket).remove([path])); },
    async imageUrl(path) { if (!path) return ''; return ensure(await db.storage.from(bucket).createSignedUrl(path,3600)).signedUrl; }
  };
}
