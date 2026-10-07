const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/dojazdy.js'),'utf8'),{window});
const {calculate,number}=window.CFDojazdy;
test('kilometers, fuel and cost are calculated without rounding intermediate values',()=>{
 const result=calculate(150000,9,6.5);
 assert.equal(result.km,150);assert.equal(result.liters,13.5);assert.equal(result.cost,87.75);
 const real=calculate(44685.4,9,6.5);assert.equal(real.cost,44685.4/1000*9/100*6.5);
});
test('Polish decimal comma and invalid values',()=>{
 assert.equal(number(' 6,50 '),6.5);assert.equal(number('9.5'),9.5);
 assert(Number.isNaN(number('6,5,0')));
 for(const args of [[150000,0,6.5],[150000,9,-1],[NaN,9,6.5],[150000,9,Infinity],[-1,9,6.5]])assert.throws(()=>calculate(...args));
});
