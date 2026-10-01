import test from 'node:test';
import assert from 'node:assert/strict';

function classic(values){return values.filter((t)=>Number.isFinite(t)&&t>=0&&t<=7.2).length}
function utah(t){if(t<1.5)return 0;if(t<2.5)return .5;if(t<9.2)return 1;if(t<12.5)return .5;if(t<=16)return 0;if(t<=18)return -.5;return -1}

function dynamic(values){
  const E0=4153.5,E1=12888.8,A0=139500,A1=2567000000000000000,slope=1.6,Tf=277,aa=A0/A1,ee=E1-E0;
  const xi=[],xs=[],eak=[];
  for(const t of values){const tk=t+273,sr=Math.exp((slope*Tf*(tk-Tf))/tk);xi.push(sr/(1+sr));xs.push(aa*Math.exp(ee/tk));eak.push(Math.exp(-A1*Math.exp(-E1/tk)))}
  const x=new Array(values.length).fill(0);
  for(let i=1;i<values.length;i++){const source=i-1;let s=x[i-1];if(s>=1&&source>0)s*=1-xi[source-1];x[i]=xs[source]-(xs[source]-s)*eak[source]}
  let total=0;for(let i=1;i<x.length;i++)if(x[i]>=1)total+=x[i]*xi[i-1];return total;
}

test('MGM klasik yöntem yalnız 0–7.2 C aralığını sayar',()=>{
  assert.equal(classic([-1,0,3,7.2,7.3,12]),3);
});

test('Utah eşikleri beklenen ağırlıkları üretir',()=>{
  assert.deepEqual([0,2,5,10,14,17,20].map(utah),[0,.5,1,.5,0,-.5,-1]);
});

test('Dynamic Model sabit 5 C serisinde pozitif chill portions üretir',()=>{
  const result=dynamic(Array.from({length:240},()=>5));
  assert.ok(result>0);
});
