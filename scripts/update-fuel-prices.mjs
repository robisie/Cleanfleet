import {fetchPrices} from './fuel-prices-core.mjs';
import {writeFile} from 'node:fs/promises';
const prices=await fetchPrices();
await writeFile(new URL('../app/fuel-prices.json',import.meta.url),JSON.stringify(prices,null,2)+'\n');
console.log('Updated fuel prices: '+prices.as_of);
