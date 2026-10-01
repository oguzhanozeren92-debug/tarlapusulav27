import test from 'node:test';
import assert from 'node:assert/strict';

function insectScore({ temp=20, wind=8, gust=12, rainChance=0, rainMm=0, isDay=true }) {
  let score=100;
  if(!isDay) score-=80;
  if(temp<10) score-=55; else if(temp<15) score-=25; else if(temp>30) score-=40; else if(temp>27) score-=15;
  if(rainMm>=.2||rainChance>=60) score-=65; else if(rainChance>=30) score-=20;
  if(wind>24||gust>35) score-=55; else if(wind>16||gust>25) score-=20;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function windScore({ temp=20, wind=10, gust=16, rainChance=0, rainMm=0, isDay=true }) {
  let score=100;
  if(!isDay) score-=35;
  if(temp<10||temp>32) score-=40; else if(temp<14||temp>28) score-=15;
  if(rainMm>=.2||rainChance>=60) score-=65; else if(rainChance>=30) score-=20;
  if(wind<4) score-=30; else if(wind>28||gust>40) score-=45; else if(wind>22||gust>34) score-=20;
  return Math.max(0,Math.min(100,Math.round(score)));
}

test('badem tipi kuru, ılık ve sakin saati yüksek puanlar',()=>assert.ok(insectScore({})>=70));
test('yağmur arı penceresini keskin düşürür',()=>assert.ok(insectScore({rainMm:1})<45));
test('antep fıstığı tipi çok durgun rüzgârı ideal saymaz',()=>assert.ok(windScore({wind:1})<windScore({wind:10})));
