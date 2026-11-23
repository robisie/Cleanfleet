export const money = cents => new Intl.NumberFormat('pl-PL', {style:'currency', currency:'PLN'}).format(cents / 100);

export function parsePrice(value) {
  const clean = String(value).trim().replace(',', '.');
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(clean)) throw Error('Podaj poprawną cenę, np. 12,50.');
  return Math.round(Number(clean) * 100);
}

export function validBarcode(value) {
  const code = String(value || '').replace(/\s/g, '');
  if (!/^\d{8,14}$/.test(code)) throw Error('Kod kreskowy powinien mieć od 8 do 14 cyfr.');
  if ([8, 12, 13, 14].includes(code.length)) {
    const digits = [...code].map(Number), check = digits.pop();
    const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    if ((10 - sum % 10) % 10 !== check) throw Error('Cyfra kontrolna kodu jest nieprawidłowa. Sprawdź zdjęcie lub popraw numer.');
  }
  return code;
}

export function shoppingSummary(items, products) {
  const groups = new Map();
  for (const item of items) {
    if (item.source !== 'order') continue;
    const group = groups.get(item.product_id) || {product:products.find(p => p.id === item.product_id), total:0, people:[]};
    group.total += item.ordered_qty;
    group.people.push(item);
    groups.set(item.product_id, group);
  }
  return [...groups.values()].sort((a,b) => (a.product?.name || '').localeCompare(b.product?.name || '', 'pl'));
}

export const amountDue = items => items.reduce((sum,item) => sum + (item.received ? item.delivered_qty * item.price_cents : 0), 0);
