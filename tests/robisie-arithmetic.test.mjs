import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateNumber,number,roundUp} from '../app/robisie/core.js';
test('działania sumują i odejmują, obsługują przecinek, kropkę i odstępy',()=>{
 for(const [input,result] of [['25+3+7-2',33],['2,5+3,25-0,5',5.25],['2.5 + 3.25 - .5',5.25],['−5+10',5],['-0',0],['+5',5],['25--2',27],['0.1+0.2',0.3],['1.1+2.2',3.3]])assert.equal(calculateNumber(input),result,input);
});
test('mnożenie, dzielenie i nawiasy zachowują kolejność działań',()=>{
 for(const [input,result] of [['2+3*4',14],['(2+3)*4',20],['25/5+2',7],['2,5×4−3÷2',8.5],['8/2/2',2],['-(2+3)',-5],['10-(3-2)',9],['1e-3+1',1.001]])assert.equal(calculateNumber(input),result,input);
 assert.equal(roundUp(calculateNumber('2,3+0,041')),2.35);
});
test('niepełne działania i dzielenie przez zero nie stają się zerem',()=>{
 for(const value of ['',' ','25+','25+*2','(2+3','2+3)','1/0','1/(3-3)','1,2,3','1 2','1e999','2**3'])assert.throws(()=>calculateNumber(value),undefined,value);
});
test('wyrażenia nie wykonują kodu ani nie odczytują zmiennych',()=>{
 for(const value of ['alert(1)','globalThis','Math.random()','2;3','1||2','process.exit()','[].constructor','2//3','2/*3*/','0x10'])assert.throws(()=>calculateNumber(value),undefined,value);
 assert.throws(()=>calculateNumber('('.repeat(41)+'1'+')'.repeat(41)));
 assert.throws(()=>calculateNumber('1+'.repeat(251)+'1'));
});
test('zwykłe liczby zachowują precyzję, przeliczanie historii pozostaje bez zmian',()=>{
 assert.equal(calculateNumber('9007199254740991'),9007199254740991);
 assert.equal(calculateNumber('0.1234567890123456'),0.1234567890123456);
 assert.equal(calculateNumber('1000000000000000+1'),1000000000000001);
 assert.equal(number('2,5'),2.5);assert.equal(number('25+3'),0);
});
