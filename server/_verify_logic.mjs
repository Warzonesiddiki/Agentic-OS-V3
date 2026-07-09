// Ad-hoc logic verification for the pure functions in the Mnemosyne test batch.
// Imported via the stub loader so db/client -> better-sqlite3 doesn't crash.
import {
  activeLearningSample,
} from './src/services/memory-clustering.js';
import {
  coerceRelation,
  signCausalChain,
  verifyCausalChainIntegrity,
} from './src/services/memory-causal-chains.js';
import {
  coerceClassification,
  classifyByTags,
} from './src/services/memory-contradiction.js';
import { selectWinner } from './src/services/memory-conflict-resolver.js';
import { canRead, applyZone } from './src/services/memory-privacy-zones.js';
import { detectLanguage } from './src/services/memory-multilingual.js';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }

// clustering
const v = (id, e, imp=0) => ({ id, title:id, content:id, importance:imp, embedding:e });
const als = activeLearningSample([v('a',[1,0],0.1), v('b',[0,1],0.9), v('c',[1,1],0.4)], []);
check('als-len', als.length === 3);
check('als-top-imp', als[0].id === 'b');
check('als-limit', activeLearningSample([v('m0',[0,0]),v('m1',[1,0]),v('m2',[2,0])], [], 2).length === 2);
const far = activeLearningSample([v('near',[1.1,1.1]), v('far',[9,9])], [[1,1]]);
check('als-novel-far', far[0].id === 'far');
const dimBad = activeLearningSample([v('bad',[1,1])], [[1,1,1]]);
check('als-finite', Number.isFinite(dimBad[0].uncertainty));

// causal
check('coerce-enables', coerceRelation('ENABLES') === 'enables');
check('coerce-default', coerceRelation('???') === 'causes');
const e1 = { id:'e1', fromMemoryId:'a', toMemoryId:'b', relation:'causes', createdAt:new Date(0) };
const e2 = { id:'e2', fromMemoryId:'b', toMemoryId:'c', relation:'precedes', createdAt:new Date(1) };
const signed = signCausalChain([e1, e2]);
check('sign-len', signed.length === 2 && typeof signed[0].hash === 'string');
const vr = verifyCausalChainIntegrity(signed);
check('verify-intact', vr.intact === true && vr.total === 2 && vr.chain.join(',') === 'e1,e2');
const tampered = signed.map((e,i)=> i===1 ? {...e, relation:'contradicts'} : e);
check('verify-tamper', verifyCausalChainIntegrity(tampered).intact === false);
check('verify-empty', verifyCausalChainIntegrity([]).intact === true);

// contradiction
check('coerce-direct', coerceClassification('  DIRECT ') === 'direct');
check('coerce-weird', coerceClassification('weird') === 'inconclusive');
check('class-direct', classifyByTags(['sentiment:+','sentiment:-']).classification === 'direct');
check('class-supports+', classifyByTags(['sentiment:+']).classification === 'supports');
check('class-supports-', classifyByTags(['sentiment:-']).classification === 'supports');
check('class-inconclusive', classifyByTags([]).classification === 'inconclusive');
check('class-precedence', classifyByTags(['precedence:conflict']).classification === 'direct');

// conflict
check('win-newest', selectWinner('newest_wins', {id:'a',createdAt:new Date(1000),importance:0,title:'t',content:'c',tags:[],projectId:null}, {id:'b',createdAt:new Date(2000),importance:0,title:'t',content:'c',tags:[],projectId:null}) === 'b');
check('win-importance', selectWinner('highest_importance', {id:'a',createdAt:new Date(0),importance:0.3,title:'t',content:'c',tags:[],projectId:null}, {id:'b',createdAt:new Date(0),importance:0.8,title:'t',content:'c',tags:[],projectId:null}) === 'b');
check('win-llm', selectWinner('llm_merge', {id:'a',createdAt:new Date(0),importance:0,title:'t',content:'c',tags:[],projectId:null}, {id:'b',createdAt:new Date(0),importance:0,title:'t',content:'c',tags:[],projectId:null}) === '');

// privacy
check('canread-eq', canRead('internal','internal') === true);
check('canread-up', canRead('public','confidential') === true);
check('canread-down', canRead('restricted','public') === false);
const az1 = applyZone('s','internal','confidential'); check('apply-ok', az1.readable && az1.value==='s');
const az2 = applyZone('s','restricted','internal'); check('apply-redact', !az2.readable && az2.value==='[redacted:restricted]');

// multilingual
check('lang-empty', detectLanguage('') === 'unknown');
check('lang-zh', detectLanguage('这是一段中文文本用于测试语言检测') === 'zh');
check('lang-ja', detectLanguage('これは日本語のテストです') === 'ja');
check('lang-ko', detectLanguage('이것은 한국어 테스트입니다') === 'ko');
check('lang-ar', detectLanguage('هذا نص عربي للاختبار') === 'ar');
check('lang-ru', detectLanguage('Это тестовый русский текст') === 'ru');
check('lang-en', detectLanguage('this is a test of the english language detection') === 'en');
check('lang-es', detectLanguage('esto es una prueba de detección en español') === 'es');
check('lang-fr', detectLanguage('ceci est un test de détection en français') === 'fr');
check('lang-de', detectLanguage('dies ist ein test der deutschen sprache erkennung') === 'de');
check('lang-gib', detectLanguage('qzx') === 'unknown');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
