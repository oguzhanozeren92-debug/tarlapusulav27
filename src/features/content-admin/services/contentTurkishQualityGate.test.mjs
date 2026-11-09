import test from 'node:test';
import assert from 'node:assert/strict';
import { translationPublicationProblem } from './contentTurkishQualityGate.ts';

const full = {
 original_language:'en',
 title_suggested:'Badem bahçelerinde ilkbahar dönemi yaprak lekesi kontrolü',
 short_summary:'Bademde yaprak lekelerinin erken dönemde incelenmesi önemlidir. Belirtiler tarlada gözlem yapılarak izlenmelidir.',
 body_draft:'Badem bahçesinde yaprak ve meyveler kontrol edilir. Lekeler, yaprak dokusundaki değişiklikler ve genel bitki görünümü karşılaştırılır. Kaynağın yerel koşulları Türkiye için doğrudan tavsiye değildir.',
 structured_body:{translation_status:'translated_full_tr'},
};
test('foreign content cannot publish before full translation is complete',()=>{
 assert.match(translationPublicationProblem({...full,structured_body:{translation_status:'pending_ai'}}),/tam Türkçe/);
 assert.match(translationPublicationProblem({...full,structured_body:{translation_status:'failed_auto'}}),/tam Türkçe/);
});
test('English leftovers fail even if translation flag is complete',()=>{
 assert.match(translationPublicationProblem({...full,title_suggested:'Improving crop yield in orchards'}),/İngilizce|Türkçe/);
 assert.match(translationPublicationProblem({...full,body_draft:full.body_draft+' Soil moisture and water stress can affect crop yield.'}),/İngilizce/);
});
test('complete Turkish explanations pass, native Turkish originals do not need foreign translation flag',()=>{
 assert.equal(translationPublicationProblem(full),null);
 assert.equal(translationPublicationProblem({...full,original_language:'tr',structured_body:{translation_status:'not_required'}}),null);
});
