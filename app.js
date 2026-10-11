/* RUSSKI 30 ULTRA — application autonome, aucun framework ni API requis pour le parcours de base. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = val => String(val == null ? '' : val).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eattr = val => esc(val);
const DAY = 86400000, STORAGE = 'russki-signature-v1';
const now = () => Date.now();
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const ntext = text => String(text ?? '').normalize('NFC').toLocaleLowerCase('ru').replace(/[\u0300-\u036f]/g,'').replace(/[.,!?;:«»“”()…—–\-]/g,' ').replace(/\s+/g,' ').trim();
const shuffle = values => {const result = [...values]; for(let i=result.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const wdb = [...new Map(LESSONS.flatMap(l=>l.words.map(([ru,fr])=>[ru,{ru,fr,day:l.day}]))).values()];
const phdb = LESSONS.flatMap(l=>l.phrases.map(([ru,fr])=>({ru,fr,day:l.day}))) ;
const byWord = new Map(wdb.map(w=>[w.ru,w]));
const alphabetKeys='й ц у к е н г ш щ з х ъ ф ы в а п р о л д ж э я ч с м и т ь б ю ё'.split(' ');
const navItems = [
 ['home','house','Aujourd’hui'],['session','target','Ma séance'],['path','calendar','30 jours'],
 ['revision','layers','Révisions'],['dialogue','messages','Conversations'],['exams','graduation','Examens'],
 ['library','book','Bibliothèque'],['profile','chart','Progrès & réglages']
];
const ICON={house:'⌂',target:'◎',calendar:'▦',layers:'◈',messages:'☏',graduation:'◉',book:'▤',chart:'◫'};
const missions = [
 {title:'Faire connaissance',context:'Tu rencontres une personne russe.',reference:0,day:1},
 {title:'Parler de tes origines',context:'Tu fais connaissance avec un ami.',reference:1,day:5},
 {title:'Trouver le métro',context:'Tu demandes ton chemin dans la rue.',reference:2,day:12},
 {title:'Commander un café',context:'Tu commandes au comptoir.',reference:3,day:15},
 {title:'Payer au magasin',context:'Tu veux régler un achat.',reference:4,day:17},
 {title:'Prendre un taxi',context:'Tu arrives à l’aéroport.',reference:5,day:18},
 {title:'Arriver à l’hôtel',context:'Tu te présentes à la réception.',reference:6,day:19},
 {title:'Parler de la météo',context:'Tu discutes avec un voisin.',reference:7,day:20},
 {title:'Proposer une sortie',context:'Tu invites un ami au café.',reference:8,day:22},
 {title:'Raconter hier',context:'Tu racontes ta journée à un ami.',reference:9,day:24},
 {title:'Demander de l’aide',context:'Tu as perdu ton téléphone.',reference:10,day:26}
];
function fresh(){return {version:4, started:today(), active:1, completed:{},cards:{},attempts:[],errors:[], favorites:[],sessions:{}, exams:{}, xp:0, settings:{minutes:30,speed:.82,audioMode:'device',theme:'dark',font:'normal',objective:'Parler en voyage'}, tutorHistory:[], legacyImported:false}}
function migrateLegacy(base){
  try {
    const old=JSON.parse(localStorage.getItem('russki30-pro-v2')||'null') || JSON.parse(localStorage.getItem('russki30-progress-v1')||'null');
    if(!old || typeof old !=='object')return base;
    base.active=clamp(Number(old.active)||1,1,30);
    base.completed=(old.completed && typeof old.completed==='object')?{...old.completed}:{};
    base.xp=Math.max(0,Number(old.xp)||0);
    base.favorites=Array.isArray(old.favorites)?old.favorites.filter(x=>typeof x==='string').slice(0,500):[];
    base.attempts=Array.isArray(old.attempts)?old.attempts.slice(-250):[];
    Object.entries(old.reviews||{}).forEach(([ru,r])=>{
      if(!byWord.has(ru))return;
      const interval=[0,1,3,7,14,30,60][clamp(Number(r.box)||0,0,6)];
      base.cards[ru]={due:Number(r.due)||now(),interval,ease:2.3,reps:Math.max(0,Number(r.box)||0),lapses:Number(r.lapses)||0,seen:1,correct:Math.max(0,Number(r.box)||0)};
    });
    base.legacyImported=true;
  }catch(err){/* missing or malformed prior data */}
  return base;
}
function load(){
  const defaults=fresh();
  try{
    const raw=localStorage.getItem(STORAGE) || localStorage.getItem('russki-ultra-v1');
    if(!raw)return migrateLegacy(defaults);
    const p=JSON.parse(raw);
    if(!p||typeof p!=='object'||Array.isArray(p))return defaults;
    const s={...defaults,...p,settings:{...defaults.settings,...p.settings}};
    for(const key of ['cards','completed','sessions','exams'])if(!s[key]||Array.isArray(s[key])||typeof s[key]!=='object')s[key]={};
    for(const key of ['errors','favorites','attempts','tutorHistory'])if(!Array.isArray(s[key]))s[key]=[];
    s.active=clamp(Number(s.active)||1,1,30); s.settings.minutes=[15,30,45,60].includes(+s.settings.minutes)?+s.settings.minutes:30;
    s.settings.speed=clamp(Number(s.settings.speed)||.82,.6,1.1); s.settings.theme=['light','dark'].includes(s.settings.theme)?s.settings.theme:'dark'; s.settings.audioMode=['device','server'].includes(s.settings.audioMode)?s.settings.audioMode:'device';
    return s;
  }catch(e){return defaults}
}
let aiAudioCache=new Map(), state=load(), page='home', screenDay=state.active, courseTab='words', selectedMission=0, scene=null, exam=null, session=null, tutorEntry='', tutorBusy=false, transcripts=null, recordingMap={}, mic=null, playing=null, alertTimer=0, studySearch='', libraryType='words', quiz=null, pendingMicTarget=null;
const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch(e){message('Stockage plein ou indisponible : exporte tes progrès.')}};
function message(t){const el=$('toast');if(!el)return;el.textContent=t;el.classList.add('visible');clearTimeout(alertTimer);alertTimer=setTimeout(()=>el.classList.remove('visible'),3700)}
const totalDays=()=>Object.keys(state.completed).filter(d=>Number(d)>0&&Number(d)<=30&&state.completed[d]).length;
const scoreOf=()=>state.attempts.length?Math.round(state.attempts.reduce((v,x)=>v+(Number(x.score)||0),0)/state.attempts.length):0;
const learned=()=>Object.values(state.cards).filter(c=>Number(c.seen)>0).length;
const dueWords=()=>wdb.filter(w=>state.cards[w.ru]&&Number(state.cards[w.ru].due||0)<=now());
function streak(){const ds=new Set(Object.keys(state.sessions).filter(d=>state.sessions[d]?.finished));let d=new Date();d.setHours(12,0,0,0);if(!ds.has(today(d)))d.setDate(d.getDate()-1);let i=0;while(ds.has(today(d))){i++;d.setDate(d.getDate()-1)}return i}
function newCard(ru){return state.cards[ru] || {due:0,interval:0,ease:2.5,reps:0,lapses:0,seen:0,correct:0,last:0}}
function rate(ru,quality){
  if(!byWord.has(ru))return;
  const v=newCard(ru),q=clamp(Number(quality)||0,0,3),prior=Math.max(0,Number(v.interval)||0),ease=clamp(Number(v.ease)||2.5,1.3,3.0);
  let days=0,minutes=0,nextEase=ease,reps=Number(v.reps)||0;
  if(q===0){minutes=10;reps=0;nextEase=clamp(ease-.2,1.3,3.0)}
  else if(q===1){days=prior?Math.max(1,Math.round(prior*0.85)):1;nextEase=clamp(ease-.15,1.3,3);reps++}
  else if(q===2){days=!reps?1:reps===1?3:Math.max(1,Math.round(prior*ease));reps++}
  else{days=!reps?3:reps===1?6:Math.max(2,Math.round(prior*ease*1.3));nextEase=clamp(ease+.12,1.3,3);reps++}
  const c={...v,due:now()+(minutes*60000||days*DAY),interval:days,ease:nextEase,reps,seen:(Number(v.seen)||0)+1,correct:(Number(v.correct)||0)+(q>0?1:0),lapses:(Number(v.lapses)||0)+(q===0?1:0),last:now()};state.cards[ru]=c;
  if(q===0){state.errors.unshift({ru,fr:byWord.get(ru).fr,day:byWord.get(ru).day,date:today(),type:'mot à revoir'});state.errors=state.errors.slice(0,200)}
  state.xp+=q===0?1:3+q;save();
}
const canText=(a,b)=>ntext(a)===ntext(b);
function checkRussian(given,target){
  if(canText(given,target))return {ok:true,almost:false,tip:'Exact !'};
  const normalized=ntext(given),expected=ntext(target);
  if(normalized.replace(/ё/g,'е')===expected.replace(/ё/g,'е')&&normalized!==expected)return {ok:false,almost:true,tip:'Attention : « ё » et « е » sont deux lettres différentes. Retrouve la forme correcte.'};
  return {ok:false,almost:false,tip:'Compare l’orthographe, les terminaisons et l’ordre des mots.'};
}
function trackAttempt(type,correct,count){const pct=count?Math.round(100*correct/count):0;state.attempts.push({mode:type,score:pct,day:state.active,date:today()});state.attempts=state.attempts.slice(-300);save();return pct}
function chooseDailyWords(day,n=7){const x=LESSONS[day-1].words.map(([ru,fr])=>({ru,fr,day}));return x.sort((a,b)=>{
 const ca=state.cards[a.ru],cb=state.cards[b.ru];const sa=ca?((now()>=ca.due?500:0)+Number(ca.lapses||0)*15-Number(ca.correct||0)*3):900;
 const sb=cb?((now()>=cb.due?500:0)+Number(cb.lapses||0)*15-Number(cb.correct||0)*3):900;return sb-sa;
}).slice(0,n)}
function makeSession(day){const words=chooseDailyWords(day,7),due=dueWords().filter(w=>w.day!==day).slice(0,4);return {day,stamp:today(),stage:0,index:0,answer:'',feedback:null,words,review:due,wordCorrect:0,phraseCorrect:0,spoken:0,attempts:0,repeat:[],finished:false,startedAt:now(),reviewCount:0}}
function curSession(){if(!session||session.stamp!==today()||session.day!==state.active){session=state.sessions[today()];if(!session||session.day!==state.active){session=makeSession(state.active);state.sessions[today()]=session;save()}}return session}
function persistSession(){state.sessions[today()]=session;save()}
function stepSession(){session.feedback=null;session.answer='';session.index++;
 const length=[session.review.length,session.words.length,session.words.length,LESSONS[session.day-1].phrases.length,LESSONS[session.day-1].phrases.length][session.stage];
 if(session.index>=length){session.stage++;session.index=0}
 if(session.stage>=5){session.finished=true;state.xp+=20;state.sessions[today()]=session;trackAttempt('Séance guidée',session.wordCorrect+session.phraseCorrect,session.attempts);}
 persistSession();render(true)}
function validateSession(val){const s=curSession();if(s.feedback)return;
 const isWord=s.stage===0||s.stage===2,isPhrase=s.stage===3;
 if(isWord||isPhrase){const item=s.stage===0?s.review[s.index]:s.stage===2?s.words[s.index]:LESSONS[s.day-1].phrases[s.index];const ru=Array.isArray(item)?item[0]:item.ru;
 const result=checkRussian(val,ru);s.feedback={given:val,expected:ru,fr:Array.isArray(item)?item[1]:item.fr,...result};s.attempts++;
 if(result.ok){s.wordCorrect+=isWord?1:0;s.phraseCorrect+=isPhrase?1:0}
 if(isWord){rate(ru,result.ok?2:0);if(!result.ok&&s.stage===2&&!s.repeat.includes(ru)){s.repeat.push(ru);s.words.push({ru,fr:item.fr})}}
 else if(!result.ok)state.errors.unshift({ru,fr:item[1],day:s.day,date:today(),type:'phrase à revoir'});
 persistSession();render();}
}
function showSession(){const s=curSession(),phases=['Réactivation','Découverte','Rappel actif','Construire','Parler','Bilan']; const les=LESSONS[s.day-1];let html='';
 if(s.stage===0){const item=s.review[s.index];html=!item?`<div class="focus"><div class="eyebrow">ÉTAPE 1 / 5</div><h2>Pas de révision en retard 🎉</h2><p>Tu peux passer à la découverte de nouveaux mots.</p>${button('session-skip','Continuer →','primary')}</div>`:typeTask(item.fr,item.ru,'Réactivation','Écris le mot russe de mémoire, sans indice.');}
 if(s.stage===1){const item=s.words[s.index];html=`<div class="focus"><div class="eyebrow">ÉTAPE 2 / 5 · IMPRÉGNATION</div><p class="stephead">Écoute, répète, puis cache la réponse.</p><div class="bigru" lang="ru">${esc(item.ru)}</div>${STRESS[item.ru]?`<div class="accent" lang="ru">Accent : ${esc(STRESS[item.ru])}</div>`:''}<div class="bigfr">${esc(item.fr)}</div><p>Écoute deux fois, prononce à voix haute, puis passe au mot suivant. Le son est synthétique, sauf enregistrement ajouté.</p><div class="buttons">${button('speak','Écouter ♫','secondary',`data-text="${eattr(item.ru)}"`)}${button('session-next','J’ai répété →','primary')}</div></div>`;}
 if(s.stage===2){const item=s.words[s.index];html=typeTask(item.fr,item.ru,'RAPPEL ACTIF','Retrouve le russe sans voir le modèle.');}
 if(s.stage===3){const item=les.phrases[s.index];html=typeTask(item[1],item[0],'CONSTRUIRE','Compose la phrase complète en russe. Les terminaisons comptent.');}
 if(s.stage===4){const item=les.phrases[s.index];html=`<div class="focus"><div class="eyebrow">ÉTAPE 5 / 5 · PARLER</div><p class="stephead">Dis cette phrase en russe sans regarder :</p><div class="bigfr">${esc(item[1])}</div>${s.feedback?`<div class="answer-box ${s.feedback.ok?'success':''}"><strong>${s.feedback.ok?'Transcription reconnue':'Réponse modèle'}</strong><p class="bigru" lang="ru">${esc(item[0])}</p>${s.feedback.given?`<p>Entendu / saisi : <span lang="ru">${esc(s.feedback.given)}</span></p>`:''}<p class="fine">${s.feedback.mic?'Correspondance de transcription uniquement : cela ne certifie pas ton accent.':'Évalue ta réponse honnêtement avant de continuer.'}</p></div>`:`<div class="prompt-placeholder">Phrase russe masquée. Essaie de la retrouver à l’oral.</div>`}<div class="buttons">${button('speak','♫ Écouter le modèle','secondary',`data-text="${eattr(item[0])}"`)}${!s.feedback?button('session-mic','🎙️ Dire au micro','ghost'):''}${!s.feedback?button('session-reveal','Afficher la réponse','outline'):''}${s.feedback?button('session-next','Continuer →','primary'):''}</div>${!s.feedback?`<p class="fine">Si le microphone n'est pas pris en charge, affiche la réponse et compare toi-même.</p>`:''}</div>`;}
 if(s.stage>=5){const score=s.attempts?Math.round(100*(s.wordCorrect+s.phraseCorrect)/s.attempts):0;html=`<div class="focus result"><div class="eyebrow">SÉANCE TERMINÉE</div><div class="success-mark">✓</div><h2>Bien joué !</h2><p>Tu as pratiqué le russe aujourd’hui. C'est la régularité et la capacité à te rappeler sans aide qui comptent.</p><div class="metric-row"><div><strong>${score}%</strong><span>Rappel écrit</span></div><div><strong>${s.spoken}</strong><span>Essais oraux</span></div><div><strong>${dueWords().length}</strong><span>Cartes à réviser</span></div></div><div class="buttons">${button('to-exams','Me tester','primary')}${button('go-revision','Réviser','secondary')}${button('session-restart','Recommencer','outline')}</div></div>`;}
 return `<div class="pagehead"><div class="eyebrow">TON ENTRAÎNEMENT · JOUR ${s.day}/30</div><h1>Une étape à la fois.</h1><p>${esc(les.title)} · environ ${state.settings.minutes} min selon ton rythme.</p></div>
 <div class="stage-track"><div class="bar"><i style="width:${Math.round(s.stage*20)}%"></i></div><div class="stages">${phases.slice(0,5).map((p,i)=>`<span class="${s.stage===i?'current':s.stage>i?'finished':''}">${i+1}. ${p}</span>`).join('')}</div></div>
 <div class="focusframe">${html}<div class="stepcount">${s.stage<5&&([s.review.length,s.words.length,s.words.length,les.phrases.length,les.phrases.length][s.stage]||0)?`Élément ${s.index+1}/${[s.review.length,s.words.length,s.words.length,les.phrases.length,les.phrases.length][s.stage]}`:'À ton rythme'}</div></div>
 <div class="bottomactions">${button('to-lesson','Voir la leçon','outline')}${button('go-home','Revenir à l’accueil','outline')}</div>`;
}
function typeTask(fr,ru,stage,help){const s=curSession();return `<div class="focus"><div class="eyebrow">${stage}</div><p class="stephead">${help}</p><div class="bigfr">${esc(fr)}</div>${!s.feedback?`<form id="sessionForm" class="answerform"><label class="sr" for="sessionInput">Réponse en russe</label><input id="sessionInput" lang="ru" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Écris en russe…" required><button class="action primary" type="submit">Vérifier →</button></form>${keyboard('sessionInput')}${button('session-forgot','Je ne sais pas','ghost')}`:`<div class="answer-box ${s.feedback.ok?'success':'warning'}"><strong>${s.feedback.ok?'Exact !':s.feedback.almost?'Presque : attention aux lettres.':'Voici la bonne réponse :'}</strong><div class="answer-russian" lang="ru">${esc(ru)}</div>${STRESS[ru]?`<p class="accent" lang="ru">Accent : ${esc(STRESS[ru])}</p>`:''}<p>${esc(fr)}</p>${s.feedback.given?`<p class="fine">Ta réponse : <span lang="ru">${esc(s.feedback.given)}</span></p>`:''}<p class="fine">${esc(s.feedback.tip)}</p><div class="buttons">${button('speak','♫ Écouter','secondary',`data-text="${eattr(ru)}"`)}${button('session-next','Continuer →','primary')}</div></div>`}</div>`}
function keyboard(target){return `<div class="keyboard" role="group" aria-label="Clavier cyrillique">${alphabetKeys.map(k=>`<button type="button" data-act="key" data-key="${k}" data-target="${target}" aria-label="Insérer ${k}">${k}</button>`).join('')}<button data-act="key-back" data-target="${target}" aria-label="Effacer la dernière lettre">⌫</button></div>`}
function button(act,label,kind='ghost',attributes=''){return `<button class="action ${kind}" type="button" data-act="${act}" ${attributes}>${label}</button>`}
function renderShell(){
  const labels={home:'Aujourd’hui',session:'Séance personnalisée',path:'Programme',revision:'Révisions',dialogue:'Conversations',exams:'Évaluations',library:'Bibliothèque',profile:'Progrès & réglages',lesson:`Leçon ${screenDay}`,scene:'Situation réelle',exam:'Test de compétence',tutor:'Professeur IA'};
  $('sidebar').innerHTML=`<div class="logo"><span class="logoicon">Я</span><span><b>RUSSKI <em>SIGNATURE</em></b><small>LE RUSSE, PAS À PAS</small></span></div><div class="navlabel">APPRENDRE</div><nav class="side-links">${navItems.map(([id,icon,name])=>`<button class="navlink ${page===id?'active':''}" data-act="navigate" data-page="${id}"><span class="navicon">${ICON[icon]}</span>${name}</button>`).join('')}</nav><div class="side-summary"><div class="eyebrow">TON PARCOURS</div><strong>${totalDays()} <span>/ 30 jours</span></strong><div class="bar"><i style="width:${100*totalDays()/30}%"></i></div><small>Progression à ton rythme</small></div><div class="side-fine">Interface française · Leçons de russe</div>`;
  $('topbar').innerHTML=`<div><div class="topbrand">🇷🇺 RUSSKI <b>30 SIGNATURE</b></div><span class="topsubtitle">${esc(labels[page]||'Apprendre')}</span></div><div class="topmetrics"><span>🔥 <b>${streak()}</b> j</span><span>✦ <b>${state.xp}</b> XP</span></div>`;
  const mobile=['home','session','revision','dialogue','profile'];
  $('bottomnav').innerHTML=mobile.map(id=>{const it=navItems.find(x=>x[0]===id);return `<button class="${page===id?'active':''}" data-act="navigate" data-page="${id}" aria-label="${it[2]}"><span>${ICON[it[1]]}</span><small>${id==='session'?'Séance':id==='revision'?'Réviser':id==='dialogue'?'Parler':id==='profile'?'Profil':'Accueil'}</small></button>`}).join('');
  document.documentElement.dataset.theme=state.settings.theme;
  document.documentElement.dataset.font=state.settings.font||'normal';
}
function home(){const d=LESSONS[state.active-1],s=state.sessions[today()],rev=dueWords().length;const bad=state.errors.filter(x=>x.date===today()).length;
 return `<div class="welcome"><div class="eyebrow">ДОБРО ПОЖАЛОВАТЬ · BIENVENUE</div><h1>Chaque jour, <span>un peu plus de russe.</span></h1><p>Une seule séance claire. Les bons mots, au bon moment, sans te disperser.</p></div>
 <section class="hero"><div class="herocontent"><div class="pill">JOUR ${state.active} / 30 · ${esc(d.theme)}</div><h2>${esc(d.title)}</h2><p>${esc(d.goal)}</p><div class="buttons">${button('go-session',s?.finished?'Refaire une séance ↗':s?'Reprendre ma séance →':'Commencer ma séance →','primary large')}${button('to-lesson','Voir le cours','outline')}</div><div class="herometa">${d.words.length} mots · 2 phrases · Objectif ${state.settings.minutes} minutes</div></div><div class="heroart" lang="ru">Привет<span>!</span></div></section>
 <div class="home-grid"><button class="quick" data-act="navigate" data-page="revision"><span class="quickicon">◈</span><span><b>${rev} carte${rev>1?'s':''} à revoir</b><small>La mémoire se construit ici</small></span><strong>→</strong></button><button class="quick" data-act="navigate" data-page="dialogue"><span class="quickicon">☏</span><span><b>Parler en russe</b><small>Scènes et conversations</small></span><strong>→</strong></button><button class="quick" data-act="navigate" data-page="exams"><span class="quickicon">◎</span><span><b>Tester ton niveau</b><small>Lire, écouter, écrire, parler</small></span><strong>→</strong></button></div>
 <div class="two-col"><div class="panel"><div class="section-title"><h3>Ton rythme</h3><span class="hint">30 jours</span></div><div class="statsline"><div><b>${totalDays()}</b><small>Leçons validées</small></div><div><b>${learned()}</b><small>Cartes vues</small></div><div><b>${streak()}</b><small>Jours réguliers</small></div></div><div class="bar"><i style="width:${100*totalDays()/30}%"></i></div><p class="fine">Les leçons ne sont pas verrouillées. Avance lorsque tu sais répondre sans indice.</p>${button('navigate','Voir les 30 jours','text',`data-page="path"`)}</div>
 <div class="panel"><div class="section-title"><h3>Les points à renforcer</h3><span class="hint">Personnel</span></div>${state.errors.length?`<div class="weakwords">${[...new Set(state.errors.map(e=>e.ru))].slice(0,4).map(ru=>`<div><span lang="ru">${esc(ru)}</span><small>${esc((state.errors.find(x=>x.ru===ru)||{}).fr||'À réviser')}</small></div>`).join('')}</div>`:'<div class="emptymini">Au début, aucun mot difficile enregistré. Les erreurs deviendront des révisions utiles.</div>'}${button('navigate','Travailler mes difficultés','text',`data-page="revision"`)}</div></div>
 <div class="slimnote"><b>Ton objectif :</b> comprendre et produire des phrases russes simples. Ce parcours vise une initiation vers A1, pas une promesse de parler couramment en 30 jours.</div>`;
}
function path(){return `<div class="pagehead"><div class="eyebrow">TON ITINÉRAIRE</div><h1>30 jours, à ton rythme.</h1><p>Choisis une étape pour accéder au vocabulaire, à la grammaire et aux phrases. Les leçons restent accessibles à tout moment.</p></div><div class="daygrid">${LESSONS.map(d=>`<button class="daytile ${state.active===d.day?'current':''} ${state.completed[d.day]?'done':''}" data-act="select-day" data-day="${d.day}"><div class="daytop"><b>JOUR ${String(d.day).padStart(2,'0')}</b><span>${state.completed[d.day]?'✓':state.active===d.day?'●':'↗'}</span></div><strong>${esc(d.title)}</strong><small>${esc(d.theme)}</small></button>`).join('')}</div>`}
function lesson(){const d=LESSONS[screenDay-1],g=GRAMMAR[screenDay-1];return `<div class="pagehead"><div class="eyebrow">LEÇON ${screenDay} / 30 · ${esc(d.theme)}</div><h1>${esc(d.title)}</h1><p>${esc(d.goal)}</p></div><div class="lesson-top"><button data-act="select-day" data-day="${Math.max(1,screenDay-1)}" ${screenDay===1?'disabled':''}>← Précédente</button><span>Jour ${screenDay}</span><button data-act="select-day" data-day="${Math.min(30,screenDay+1)}" ${screenDay===30?'disabled':''}>Suivante →</button></div><div class="tabs">${[['words','Vocabulaire'],['phrases','Phrases'],['grammar','Grammaire']].map(([t,label])=>`<button class="${courseTab===t?'active':''}" data-act="lesson-tab" data-tab="${t}">${label}</button>`).join('')}</div>
 ${courseTab==='words'?`<div class="wordgrid">${d.words.map(([ru,fr])=>wordCard(ru,fr)).join('')}</div>`:''}
 ${courseTab==='phrases'?`<div class="wordgrid">${d.phrases.map(([ru,fr])=>wordCard(ru,fr,true)).join('')}</div>`:''}
 ${courseTab==='grammar'?`<div class="panel grammar"><div class="eyebrow">GRAMMAIRE EXPLIQUÉE EN FRANÇAIS</div><h2>${esc(g[0])}</h2><p>${esc(g[1])}</p><div class="grammar-example"><small>Formes russes</small><strong lang="ru">${esc(g[2])}</strong>${button('speak','♫ Écouter','ghost',`data-text="${eattr(g[2])}"`)}</div><div class="grammar-example"><small>Exemple expliqué</small><strong>${esc(g[3])}</strong></div><p class="tip">✎ ${esc(g[4])}</p></div>`:''}
 <div class="slimnote">💡 ${esc(d.tip)}</div><div class="buttons" style="margin-top:24px">${button('use-day','Apprendre cette leçon →','primary')}${button('go-session','Lancer ma séance','secondary')}${button('test-day','Quiz de la leçon','outline')}</div>`}
function wordCard(ru,fr,phrase=false){const stress=STRESS[ru];const marked=state.favorites.includes(ru);return `<div class="word"><div><div class="russian" lang="ru">${esc(ru)}</div>${stress&&stress!==ru?`<div class="accent" lang="ru">${esc(stress)}</div>`:''}<div class="meaning">${esc(fr)}</div></div><div class="wordactions">${button('speak','♫','icon',`data-text="${eattr(ru)}" aria-label="Écouter ${eattr(ru)}"`)}${button('bookmark',marked?'★':'☆','icon',`data-text="${eattr(ru)}" aria-label="Ajouter aux favoris"`)}</div></div>`}
function library(){const wordItems=wdb.map(x=>({ru:x.ru,fr:x.fr,day:x.day,type:'Mot'}));const phrases=[...phdb,...PHRASEBOOK.map(([ru,fr])=>({ru,fr,day:'',type:'Expression'})),...BONUS.map(([ru,fr])=>({ru,fr,day:'',type:'Expression bonus'}))];const data=libraryType==='words'?wordItems:libraryType==='phrases'?phrases:ALPHABET.map(x=>({ru:x[0],fr:x[1],day:'',type:'Lettre'})); const v=studySearch.toLocaleLowerCase('ru');const filtered=data.filter(x=>`${x.ru} ${x.fr}`.toLocaleLowerCase('ru').includes(v)).slice(0,100);
return `<div class="pagehead"><div class="eyebrow">BIBLIOTHÈQUE EN FRANÇAIS</div><h1>Tout le russe à portée de main.</h1><p>${wdb.length} mots et expressions de cours, ${phdb.length+PHRASEBOOK.length+BONUS.length} phrases et expressions, 33 lettres et un carnet de voyage.</p></div><div class="librarytools"><div class="tabs">${[['words','Mots'],['phrases','Phrases'],['alphabet','Alphabet']].map(([id,label])=>`<button class="${libraryType===id?'active':''}" data-act="library-tab" data-type="${id}">${label}</button>`).join('')}</div><label class="sr" for="librarySearch">Rechercher en russe ou en français</label><input class="search" type="search" id="librarySearch" placeholder="Rechercher en français ou en russe…" value="${eattr(studySearch)}"></div><div id="libraryResults">${filtered.length?`<div class="wordgrid">${filtered.map(x=>wordCard(x.ru,x.fr)).join('')}</div>`:'<div class="empty">Aucun résultat. Essaie un autre mot.</div>'}</div><p class="fine">Les indications d’accent tonique sont pédagogiques. La synthèse vocale dépend des voix installées ; les exemples n’ont pas tous été enregistrés par des locuteurs natifs.</p>`}
let revSession=null;
function beginRevision(){let items=dueWords();if(!items.length)items=wdb.filter(w=>state.cards[w.ru]).slice(0,8);if(!items.length)items=chooseDailyWords(state.active,8);revSession={items:shuffle(items).slice(0,18),idx:0,flipped:false,correct:0,missed:0};go('revision')}
function review(){if(!revSession||revSession.idx>=revSession.items.length){const due=dueWords().length;return `<div class="pagehead"><div class="eyebrow">MÉMOIRE À LONG TERME</div><h1>Réviser juste au bon moment.</h1><p>Les intervalles évoluent selon tes réponses : oublié, difficile, correct ou facile.</p></div><div class="panel centerblock"><div class="big-number">${due}</div><h2>carte${due>1?'s':''} à revoir maintenant</h2><p>Les mots reviennent après 10 minutes, quelques jours, puis des intervalles plus longs selon tes résultats.</p>${button('revision-start',due?'Commencer les révisions →':'Entraînement supplémentaire →','primary large')}</div><div class="slimnote">L’algorithme est une adaptation simplifiée de la répétition espacée, et non une prédiction exacte de ta mémoire.</div>`}
 const r=revSession,w=r.items[r.idx];return `<div class="pagehead"><div class="eyebrow">RÉVISIONS PERSONNALISÉES</div><h1>Retrouve avant de regarder.</h1><p>Carte ${r.idx+1} sur ${r.items.length}</p></div><div class="bar"><i style="width:${r.idx/r.items.length*100}%"></i></div><div class="flipcard"><span class="eyebrow">TRADUIS EN RUSSE</span><h2>${esc(w.fr)}</h2>${r.flipped?`<div class="flipanswer"><h2 lang="ru">${esc(w.ru)}</h2>${STRESS[w.ru]?`<div class="accent" lang="ru">${esc(STRESS[w.ru])}</div>`:''}${button('speak','♫ Écouter','secondary',`data-text="${eattr(w.ru)}"`)}</div><p>As-tu réellement retrouvé le mot avant de voir la réponse ?</p><div class="grades">${[['0','Oublié','10 min'],['1','Difficile','À revoir'],['2','Correct','Espacer'],['3','Facile','Espacer +']].map(([grade,a,b])=>`<button data-act="revision-rate" data-grade="${grade}"><b>${a}</b><small>${b}</small></button>`).join('')}</div>`:`<div class="prompt-placeholder">Le mot russe est masqué. Dis-le ou écris-le de mémoire.</div>${button('revision-flip','Afficher le russe →','primary large')}`}</div>`}
function openScene(i){selectedMission=clamp(Number(i)||0,0,missions.length-1);scene={turn:0,feedback:null,finished:false,history:[]};go('scene')}
function scenePage(){const m=missions[selectedMission],dial=DIALOGUES[m.reference]; const pairs=[];for(let i=0;i<dial.lines.length-1;i+=2)pairs.push({bot:dial.lines[i],student:dial.lines[i+1]});if(!scene)scene={turn:0,feedback:null,finished:false,history:[]}; const q=pairs[scene.turn];return `<div class="pagehead"><div class="eyebrow">MISE EN SITUATION · ${pairs.length} ÉCHANGES</div><h1>${esc(m.title)}</h1><p>${esc(m.context)} · Un scénario guidé, jouable sans connexion.</p></div><div class="chatpanel"><div class="chathead"><b>Dialogue avec ${esc(m.title.toLowerCase())}</b><span class="hint">${Math.min(scene.turn+1,pairs.length)} / ${pairs.length}</span></div><div class="bubblezone">${scene.history.map(v=>`<div class="bubble bot"><small>Interlocuteur</small><span lang="ru">${esc(v.bot)}</span></div><div class="bubble user"><small>Toi</small><span lang="ru">${esc(v.answer)}</span></div>`).join('')}${q&&!scene.finished?`<div class="bubble bot"><small>Interlocuteur · <span lang="ru">${esc(q.bot[0])}</span></small><span lang="ru">${esc(q.bot[1])}</span><small>${esc(q.bot[2])}</small></div>`:''}</div>${q&&!scene.finished?`<div class="chatquestion"><span class="eyebrow">À TOI DE RÉPONDRE</span><h3>${esc(q.student[2])}</h3>${!scene.feedback?`<form id="sceneForm" class="answerform"><label class="sr" for="sceneInput">Ta réponse en russe</label><input id="sceneInput" lang="ru" spellcheck="false" autocomplete="off" placeholder="Réponds en russe…"><button type="submit" class="action primary">Envoyer →</button></form>${keyboard('sceneInput')}<div class="buttons">${button('speak','♫ Écouter l’interlocuteur','secondary',`data-text="${eattr(q.bot[1])}"`)}${button('scene-mic','🎙️ Répondre au micro','outline')}</div>`:`<div class="answer-box ${scene.feedback.match?'success':'warning'}"><strong>${scene.feedback.match?'Réponse identique au modèle':'Proposition de réponse'}</strong><div class="answer-russian" lang="ru">${esc(q.student[1])}</div><p>${esc(q.student[2])}</p>${scene.feedback.given?`<p class="fine">Tu as répondu : <span lang="ru">${esc(scene.feedback.given)}</span></p>`:''}<p class="fine">${scene.feedback.match?'Bonne correspondance textuelle.':'Une autre formulation peut être correcte : seul le modèle est vérifié automatiquement.'}</p>${button('scene-next','Continuer →','primary')}</div>`}</div>`:`<div class="finish-chat"><h2>Scène terminée ✓</h2><p>Rejoue sans lire les traductions, puis essaie avec une vraie personne.</p>${button('scene-restart','Recommencer','primary')}${button('navigate','Autres situations','outline',`data-page="dialogue"`)}</div>`}</div>`}
function dialogues(){return `<div class="pagehead"><div class="eyebrow">VIE RÉELLE · A1</div><h1>Parler, pas seulement réciter.</h1><p>11 situations construites avec les dialogues de tes cours. Tu peux écrire tes réponses ou utiliser le micro quand il est disponible.</p></div><div class="scene-grid">${missions.map((m,i)=>`<button class="scene-tile" data-act="start-scene" data-i="${i}"><div class="scene-label">SITUATION ${String(i+1).padStart(2,'0')} · J${m.day}</div><strong>${esc(m.title)}</strong><small>${esc(m.context)}</small><span>Jouer la scène →</span></button>`).join('')}</div><div class="panel tutorsell"><div><span class="eyebrow">OPTION AVANCÉE</span><h3>Un véritable professeur IA</h3><p>Pour dialoguer librement et recevoir des explications en français, il faut connecter un serveur IA avec une clé API sécurisée. Le simulateur guidé, lui, fonctionne sans serveur.</p></div>${button('navigate','Ouvrir le professeur','primary',`data-page="tutor"`)}</div>`}
function makeExam(type){let words=shuffle(wdb.filter(w=>w.day<=state.active));if(words.length<10)words=shuffle(wdb);const base=words.slice(0,10);let qs=[];
 if(type==='reading'||type==='listening')qs=base.map(w=>({kind:type,ru:w.ru,fr:w.fr,options:shuffle([w.fr,...shuffle([...new Set(wdb.filter(v=>v.fr!==w.fr).map(v=>v.fr))]).slice(0,3)])}));
 else if(type==='writing')qs=shuffle(phdb.filter(p=>p.day<=state.active)).slice(0,Math.max(3,Math.min(8,state.active*2))).map(w=>({...w,kind:type}));
 else qs=shuffle(phdb.filter(p=>p.day<=state.active)).slice(0,Math.max(3,Math.min(6,state.active*2))).map(w=>({...w,kind:type}));
 exam={type,qs,idx:0,correct:0,feedback:null,oralSelf:0,oralRecognized:0,finished:false};go('exam');
}
function exams(){const list=[['reading','Lecture','Lis une expression russe et reconnais son sens.','▤'],['listening','Compréhension orale','Écoute sans voir le mot russe.','♫'],['writing','Expression écrite','Retrouve une phrase complète.','✎'],['speaking','Expression orale','Prononce des phrases et compare la transcription.','◉']];return `<div class="pagehead"><div class="eyebrow">DIAGNOSTIC PERSONNEL · VERS A1</div><h1>Ce que tu sais vraiment faire.</h1><p>Quatre compétences distinctes, des résultats suivis dans le temps, sans prétendre délivrer une certification CECR.</p></div><div class="examgrid">${list.map(([type,label,desc,icon])=>`<div class="exam-tile"><span class="exam-icon">${icon}</span><h3>${label}</h3><p>${desc}</p>${state.exams[type]?`<span class="hint">Dernier résultat : ${state.exams[type].score}% · ${esc(state.exams[type].date)}</span>`:''}${button('launch-exam','Démarrer →','primary',`data-type="${type}"`)}</div>`).join('')}</div><div class="slimnote">L’oral repose sur la transcription disponible dans le navigateur et sur ton autoévaluation. Une transcription conforme ne prouve pas la qualité de l’accent.</div>`}
function examPage(){if(!exam)return exams();if(exam.finished){const pct=exam.qs.length?Math.round(exam.correct/exam.qs.length*100):0;return `<div class="pagehead"><div class="eyebrow">BILAN · ${esc(exam.type)}</div><h1>Ton résultat</h1></div><div class="panel centerblock"><div class="big-number">${pct}%</div><h2>${exam.correct} sur ${exam.qs.length} réponses retenues</h2><p>${exam.type==='speaking'?'Évaluation indicative basée sur la transcription ou ta propre comparaison. Pas de test de phonétique.':'Une mesure d’entraînement, pas une certification linguistique.'}</p><div class="buttons">${button('launch-exam','Repasser ce test','primary',`data-type="${exam.type}"`)}${button('navigate','Voir tous les examens','secondary',`data-page="exams"`)}</div></div>`}
 const q=exam.qs[exam.idx],pct=exam.idx/exam.qs.length*100,isMC=['reading','listening'].includes(exam.type);
 return `<div class="pagehead"><div class="eyebrow">EXAMEN PERSONNEL · ${esc(({reading:'LECTURE',listening:'ÉCOUTE',writing:'ÉCRITURE',speaking:'ORAL'})[exam.type])}</div><h1>Question ${exam.idx+1} / ${exam.qs.length}</h1><p>Essaie avant de demander de l’aide.</p></div><div class="bar"><i style="width:${pct}%"></i></div><div class="exam-frame"><div class="eyebrow">${esc(({reading:'QUE SIGNIFIE CE MOT ?',listening:'ÉCOUTE PUIS CHOISIS',writing:'TRADUIS EN RUSSE',speaking:'DIS CETTE PHRASE À VOIX HAUTE'})[exam.type])}</div>${exam.type==='reading'?`<h2 class="bigru" lang="ru">${esc(q.ru)}</h2>`:''}${exam.type==='listening'?`<div class="listenbox">♫ Le russe est volontairement masqué.<div>${button('speak','Écouter le mot russe','secondary',`data-text="${eattr(q.ru)}"`)}</div></div>`:''}${['writing','speaking'].includes(exam.type)?`<h2 class="bigfr">${esc(q.fr)}</h2>`:''}
 ${exam.feedback?`<div class="answer-box ${exam.feedback.ok?'success':'warning'}"><strong>${exam.feedback.ok?'Bonne réponse !':exam.feedback.almost?'Attention à « ё » !':'Réponse modèle'}</strong><div class="answer-russian" lang="ru">${esc(q.ru)}</div><p>${esc(q.fr)}</p>${exam.feedback.given?`<p class="fine">Ta réponse : <span lang="ru">${esc(exam.feedback.given)}</span></p>`:''}${exam.type==='speaking'?'<p class="fine">La reconnaissance de mots ne suffit pas à valider la prononciation. Le score reste indicatif.</p>':''}${button('exam-next','Question suivante →','primary')}</div>`:isMC?`<div class="options">${q.options.map(o=>`<button data-act="exam-pick" data-answer="${eattr(o)}">${esc(o)}</button>`).join('')}</div>`:exam.type==='writing'?`<form id="examForm" class="answerform"><label class="sr" for="examInput">Réponse écrite en russe</label><input id="examInput" lang="ru" autocomplete="off" spellcheck="false" placeholder="Écris en cyrillique…" required><button class="action primary" type="submit">Vérifier →</button></form>${keyboard('examInput')}${button('exam-forgot','Je ne sais pas','outline')}`:`<div class="buttons">${button('exam-mic','🎙️ Je prononce en russe','primary')}${button('exam-reveal','Comparer moi-même','secondary')}${button('speak','♫ Entendre le modèle','outline',`data-text="${eattr(q.ru)}"`)}</div><p class="fine">Sur iPhone, l’autorisation microphone est parfois nécessaire. Sans reconnaissance vocale, tu peux t’autoévaluer.</p>`}</div>`}
function confirmExam(given,manual=false){if(!exam||exam.feedback)return;const q=exam.qs[exam.idx];let res=checkRussian(given,q.ru);if(['reading','listening'].includes(exam.type))res={ok:canText(given,q.fr),almost:false};if(exam.type==='speaking'&&manual)res={ok:false,almost:false};
 if(res.ok)exam.correct++;
 exam.feedback={...res,given:manual?'Autoévaluation nécessaire':given};render();}
function nextExam(){exam.idx++;exam.feedback=null;if(exam.idx>=exam.qs.length){exam.finished=true;const score=Math.round(100*exam.correct/exam.qs.length);state.exams[exam.type]={score,date:today(),questions:exam.qs.length,method:exam.type==='speaking'?'transcription non phonétique':'automatique'};trackAttempt(exam.type,exam.correct,exam.qs.length);state.xp+=10;}render(true)}
function profile(){const uniq=[...new Map(state.errors.map(x=>[x.ru,x])).values()].slice(0,18),t=state.settings;
return `<div class="pagehead"><div class="eyebrow">STATISTIQUES PERSONNELLES</div><h1>Ton tableau de bord.</h1><p>Des indicateurs utiles, sans fausses promesses de niveau.</p></div><div class="statgrid"><div><strong>${totalDays()}<small>/30</small></strong><span>Leçons validées</span></div><div><strong>${learned()}</strong><span>Mots travaillés</span></div><div><strong>${scoreOf()}%</strong><span>Moyenne exercices</span></div><div><strong>${streak()}</strong><span>Jours d'affilée</span></div></div>
 <div class="two-col"><section class="panel"><h3>Calendrier d’apprentissage</h3><div class="calendargrid">${LESSONS.map(d=>`<button class="${state.completed[d.day]?'completed':''} ${state.active===d.day?'selected':''}" data-act="select-day" data-day="${d.day}" aria-label="Voir le jour ${d.day}">${d.day}</button>`).join('')}</div><p class="fine">Cases vertes : leçon validée par un quiz. La progression n’est pas une certification A1.</p><h3>Mon carnet d’erreurs</h3>${uniq.length?`<div class="errorlist">${uniq.map(x=>`<div><b lang="ru">${esc(x.ru)}</b><small>${esc(x.fr)}</small>${button('speak','♫','icon',`data-text="${eattr(x.ru)}"`)}</div>`).join('')}</div>`:'<p class="fine">Pas encore d’erreur enregistrée.</p>'}</section>
 <section class="panel"><h3>Personnaliser mon apprentissage</h3><label class="setting"><span><b>Objectif quotidien</b><small>Durée indicative de la séance</small></span><select id="settingMinutes">${[15,30,45,60].map(n=>`<option value="${n}" ${t.minutes===n?'selected':''}>${n} min</option>`).join('')}</select></label><label class="setting"><span><b>Vitesse du russe</b><small>Synthèse vocale de l’appareil</small></span><select id="settingSpeed">${[[.66,'Lente'],[.82,'Normale lente'],[1,'Normale']].map(([n,lb])=>`<option value="${n}" ${Math.abs(t.speed-n)<.01?'selected':''}>${lb}</option>`).join('')}</select></label><label class="setting"><span><b>Voix audio</b><small>Le serveur IA est facultatif et peut occasionner des frais</small></span><select id="settingAudioMode"><option value="device" ${t.audioMode!=='server'?'selected':''}>Voix russe de mon appareil</option><option value="server" ${t.audioMode==='server'?'selected':''}>Voix IA du serveur (si connecté)</option></select></label><label class="setting"><span><b>Apparence</b></span><select id="settingTheme"><option value="dark" ${t.theme==='dark'?'selected':''}>Sombre</option><option value="light" ${t.theme==='light'?'selected':''}>Claire</option></select></label><label class="setting"><span><b>Lisibilité</b></span><select id="settingFont"><option value="normal" ${t.font!=='large'?'selected':''}>Normale</option><option value="large" ${t.font==='large'?'selected':''}>Texte agrandi</option></select></label><label class="setting"><span><b>Mon objectif</b></span><select id="settingObjective">${['Parler en voyage','Communiquer au quotidien','Comprendre les conversations','Lire le cyrillique'].map(v=>`<option ${t.objective===v?'selected':''}>${v}</option>`).join('')}</select></label><div class="divider"></div><h3>Mes données</h3><p class="fine">Enregistrées sur cet appareil. Aucune synchronisation automatique : exporte régulièrement une sauvegarde.</p><div class="buttons">${button('export','↓ Exporter en JSON','secondary')}${button('import','↑ Importer','outline')}${button('download-calendar','Créer un rappel calendrier','outline')}</div><div class="divider"></div>${button('reset','Effacer ma progression','danger')}</section></div><section class="panel" style="margin-top:18px"><h3>Installer sur iPhone</h3><p>Publie le ZIP décompressé sur un hébergement HTTPS. Ouvre ensuite l’adresse dans Safari → Partager → Sur l’écran d’accueil. La lecture audio et le microphone dépendent de ton appareil. L’entraînement et les cours restent accessibles sans serveur IA.</p><p class="fine">Des cours ou traductions peuvent contenir des imperfections ; la relecture native intégrale n’a pas été réalisée. Vérifie les expressions importantes avec un enseignant.</p></section>`}
let aiStatus='unknown';
async function checkAi(){try{const ac=new AbortController();const tim=setTimeout(()=>ac.abort(),2500);const r=await fetch('./api/status',{signal:ac.signal});clearTimeout(tim);aiStatus=r.ok&&(await r.json()).enabled?'online':'offline';}catch(e){aiStatus='offline'} if(page==='tutor')render();}
function tutor(){const online=aiStatus==='online',history=state.tutorHistory.slice(-16);return `<div class="pagehead"><div class="eyebrow">PROFESSEUR PERSONNEL · OPTION AVANCÉE</div><h1>Discute en russe, fais-toi corriger.</h1><p>Avec le serveur IA optionnel, tu peux dialoguer librement. Sans lui, les scènes guidées sont toujours accessibles.</p></div><div class="panel ai-head"><div><b>${online?'● Serveur IA connecté':'○ Mode IA non connecté'}</b><p>${online?'Les réponses sont générées par un modèle. Pense à vérifier les points linguistiques importants.':'Pour l’activer, lance le serveur Python fourni avec une clé API sur le serveur (jamais dans le navigateur). Les appels peuvent être facturés.'}</p></div>${button('ai-check','Tester la connexion','outline')}</div>
 <div class="chatpanel"><div class="chathead"><b>Conversation libre · russe débutant</b><span class="hint">${online?'IA active':'Hors connexion'}</span></div><div class="bubblezone" id="tutorChat">${history.length?history.map(h=>`<div class="bubble ${h.role==='user'?'user':'bot'}"><small>${h.role==='user'?'Toi':'Professeur'}</small><span lang="${h.role==='user'?'ru':'fr'}">${esc(h.text)}</span></div>`).join(''):'<div class="emptymini">Привет! Nous pouvons commencer par les salutations, la présentation et les questions simples.</div>'}</div><form id="tutorForm" class="answerform"><label class="sr" for="tutorInput">Écrire au professeur en russe</label><input id="tutorInput" lang="ru" value="${eattr(tutorEntry)}" autocomplete="off" placeholder="Привет! Меня зовут…" ${!online||tutorBusy?'disabled':''}><button class="action primary" type="submit" ${!online||tutorBusy?'disabled':''}>${tutorBusy?'En cours…':'Envoyer ↗'}</button></form><div class="buttons">${button('tutor-mic','🎙️ Dicter en russe','secondary',!online?'disabled':'')}${button('tutor-clear','Effacer cet échange','outline')}</div><p class="fine">Cette IA fournit des explications utiles mais peut se tromper. La transcription micro n’est pas un diagnostic d’accent.</p></div><div class="slimnote">Pour disposer d’une conversation libre, le serveur et son accès à une API sont nécessaires. Aucune clé API ne doit être placée dans les fichiers du site. Les messages du professeur seront transmis au serveur connecté.</div>`}
function go(p,scroll=true){page=p;if(p==='session')curSession();if(p==='revision'&&!revSession)revSession=null;render(scroll)}
function render(scroll=false){renderShell();$('main').innerHTML=({home,session:showSession,path,lesson,revision:review,dialogue:dialogues,scene:scenePage,exams,exam:examPage,library,profile,tutor}[page]||home)()+`<footer class="footer">RUSSKI 30 SIGNATURE · Français → russe · Expérience premium · Contenus d’initiation · Relecture native complète non effectuée</footer>`;if(scroll)window.scrollTo({top:0,behavior:'instant'})}

function initUiExperience(){
 const splash=$('splash');
 if(splash){
   setTimeout(()=>splash.classList.add('hide'),1450);
   setTimeout(()=>{try{splash.remove()}catch(e){}},2600);
 }
}

function say(text){
 const url=recordingMap[text];if(playing){try{playing.pause();playing.currentTime=0}catch(e){}playing=null}
 try{window.speechSynthesis?.cancel()}catch(e){}
 if(url){try{playing=new Audio(url);playing.play().catch(()=>saySynthetic(text));return}catch(e){/* fallback */}}
 if(state.settings.audioMode==='server'&&aiStatus==='online'){sayAiVoice(text);return}
 if(state.settings.audioMode==='server'&&aiStatus!=='online')message('Serveur audio indisponible : utilisation de la voix de ton appareil.');
 saySynthetic(text);
}
async function sayAiVoice(text){
 try {
   let url=aiAudioCache.get(text);
   if(!url){
     message('Préparation de la voix russe…');
     const res=await fetch('./api/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
     if(!res.ok)throw Error('service vocal indisponible');
     const blob=await res.blob();
     if(!blob.type.startsWith('audio/'))throw Error('format audio inattendu');
     url=URL.createObjectURL(blob);aiAudioCache.set(text,url);
     if(aiAudioCache.size>80){const oldest=aiAudioCache.keys().next().value;URL.revokeObjectURL(aiAudioCache.get(oldest));aiAudioCache.delete(oldest)}
   }
   playing=new Audio(url);await playing.play();
 }catch(e){message('Impossible de lire la voix IA : retour à la voix de ton appareil.');saySynthetic(text)}
}
function saySynthetic(text){if(!('speechSynthesis' in window)){message('Synthèse vocale indisponible sur cet appareil.');return}
 try {const voices=speechSynthesis.getVoices();const russian=voices.find(v=>v.lang?.toLowerCase().startsWith('ru'));const utter=new SpeechSynthesisUtterance(text);utter.lang='ru-RU';utter.rate=state.settings.speed;if(russian)utter.voice=russian;else if(voices.length)message('Voix russe non installée : la prononciation peut être incorrecte.');speechSynthesis.speak(utter);}catch(e){message('La lecture audio a échoué.')}}
function listen(callback){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){message('Micro vocal non disponible. Utilise l’écrit ou la comparaison manuelle.');return}try{
 mic?.abort?.();const r=new SR();mic=r;r.lang='ru-RU';r.interimResults=false;r.maxAlternatives=1;
 message('Écoute en cours… parle en russe.');r.onresult=e=>{const transcript=e.results?.[0]?.[0]?.transcript||'';callback(transcript);};r.onerror=e=>message(`Reconnaissance indisponible (${e.error}). Essaye la saisie.`);r.start();
 }catch(e){message('Impossible d’accéder au microphone. Autorise-le dans le navigateur.')}}
function finishSceneAnswer(given){if(!scene||scene.feedback)return;const m=missions[selectedMission],lines=DIALOGUES[m.reference].lines,expected=lines[scene.turn*2+1]?.[1];if(!expected)return;scene.feedback={match:canText(given,expected),given};render()}
function audioMic(type){
 if(type==='session'){const s=curSession(),p=LESSONS[s.day-1].phrases[s.index];listen(t=>{s.spoken++;s.feedback={given:t,ok:canText(t,p[0]),mic:true};persistSession();render()})}
 if(type==='scene')listen(t=>finishSceneAnswer(t));
 if(type==='exam')listen(t=>{if(exam&&exam.type==='speaking'){exam.oralRecognized++;confirmExam(t)}});
 if(type==='tutor')listen(t=>{tutorEntry=t;const inp=$('tutorInput');if(inp)inp.value=t;message('Transcription saisie : vérifie-la avant de l’envoyer.')})
}
async function sendTutor(raw){if(tutorBusy||aiStatus!=='online')return;const utterance=String(raw||'').trim();if(!utterance||utterance.length>1000){message('Saisis un message russe de 1 à 1 000 caractères.');return}tutorBusy=true;state.tutorHistory.push({role:'user',text:utterance});state.tutorHistory=state.tutorHistory.slice(-40);save();tutorEntry='';render();
 try{const res=await fetch('./api/tutor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:utterance,history:state.tutorHistory.slice(-14),level:'A1',day:state.active})});const data=await res.json();if(!res.ok)throw Error(data.error||`Erreur HTTP ${res.status}`);
 state.tutorHistory.push({role:'assistant',text:String(data.reply||'Réponse vide').slice(0,1500)});state.tutorHistory=state.tutorHistory.slice(-40);save();
 }catch(e){message('Professeur indisponible : '+String(e.message).slice(0,100));}finally{tutorBusy=false;render()}}
function progressExport(){const blob=new Blob([JSON.stringify({app:'russki-ultra',version:3,created:today(),progress:state},null,2)],{type:'application/json'});downloadBlob(blob,`russki30-ultra-${today()}.json`)}
function downloadBlob(blob,filename){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),5000)}
function createIcs(){const dt=new Date();dt.setDate(dt.getDate()+1);const start=`${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}T190000`;const data=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RUSSKI30//ULTRA//FR\r\nBEGIN:VEVENT\r\nUID:russki30-${Date.now()}@local\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}\r\nDTSTART:${start}\r\nDURATION:PT${state.settings.minutes}M\r\nRRULE:FREQ=DAILY;COUNT=30\r\nSUMMARY:Apprendre le russe — RUSSKI 30\r\nDESCRIPTION:Ouvrir RUSSKI 30 ULTRA et faire la séance quotidienne.\r\nBEGIN:VALARM\r\nTRIGGER:-PT5M\r\nACTION:DISPLAY\r\nDESCRIPTION:C'est l'heure de parler russe !\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;downloadBlob(new Blob([data],{type:'text/calendar;charset=utf-8'}),'russki30-rappels.ics');message('Ajoute le calendrier à ton téléphone pour activer ses rappels.')} 
function recordLessonPass(){state.completed[screenDay]=today();if(screenDay===state.active&&screenDay<30)state.active=screenDay+1;save();message('Leçon validée. Continue à pratiquer pour la retenir.');go('path')}
function startDayQuiz(){const l=LESSONS[screenDay-1];const items=shuffle(l.words).slice(0,Math.min(8,l.words.length)).map(([ru,fr])=>({ru,fr,options:shuffle([fr,...shuffle([...new Set(wdb.filter(w=>w.fr!==fr).map(w=>w.fr))]).slice(0,3)])}));quiz={day:screenDay,items,index:0,correct:0,feedback:null,finished:false};showQuiz()}
function showQuiz(){if(!quiz)return;if(quiz.finished){const pct=Math.round(100*quiz.correct/quiz.items.length);$('main').innerHTML=`<div class="pagehead"><div class="eyebrow">LEÇON ${quiz.day}</div><h1>Résultat du quiz</h1></div><div class="panel centerblock"><div class="big-number">${pct}%</div><h2>${pct>=80?'Objectif atteint !':'Encore un peu de pratique'}</h2><p>${pct>=80?'Tu peux passer à la suite, tout en continuant les révisions.':'En dessous de 80 %, révise puis réessaie.'}</p>${button('quiz-retry','Recommencer','secondary')}${pct>=80?button('quiz-validate','Valider la leçon →','primary'):button('to-lesson','Revoir le cours','primary')}</div>`;return}
 const q=quiz.items[quiz.index];$('main').innerHTML=`<div class="pagehead"><div class="eyebrow">QUIZ DE VALIDATION · JOUR ${quiz.day}</div><h1>Question ${quiz.index+1} / ${quiz.items.length}</h1><p>80 % requis pour valider cette leçon.</p></div><div class="bar"><i style="width:${quiz.index/quiz.items.length*100}%"></i></div><div class="exam-frame"><h2 class="bigru" lang="ru">${esc(q.ru)}</h2>${!quiz.feedback?`<div class="options">${q.options.map(o=>`<button data-act="quiz-pick" data-answer="${eattr(o)}">${esc(o)}</button>`).join('')}</div>`:`<div class="answer-box ${quiz.feedback.ok?'success':'warning'}"><strong>${quiz.feedback.ok?'Bonne réponse':'La bonne réponse :'}</strong><p>${esc(q.fr)}</p>${button('quiz-next','Suivant →','primary')}</div>`}</div>`;}
function addListeners(){
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
  const a=b.dataset.act;
  if(a==='navigate'){go(b.dataset.page);return}
  if(a==='go-home'){go('home');return}
  if(a==='go-session'){go('session');return}
  if(a==='to-lesson'){screenDay=state.active;courseTab='words';go('lesson');return}
  if(a==='go-revision'){beginRevision();return}
  if(a==='select-day'){screenDay=clamp(+b.dataset.day||1,1,30);go('lesson');return}
  if(a==='lesson-tab'){courseTab=b.dataset.tab;render();return}
  if(a==='use-day'){state.active=screenDay;session=null;save();go('session');return}
  if(a==='test-day'){startDayQuiz();return}
  if(a==='quiz-pick'&&quiz&&!quiz.feedback){const q=quiz.items[quiz.index],good=canText(b.dataset.answer,q.fr);quiz.correct+=good?1:0;quiz.feedback={ok:good};showQuiz();return}
  if(a==='quiz-next'&&quiz){quiz.index++;quiz.feedback=null;if(quiz.index>=quiz.items.length){quiz.finished=true;trackAttempt('Quiz',quiz.correct,quiz.items.length)}showQuiz();return}
  if(a==='quiz-retry'){startDayQuiz();return}
  if(a==='quiz-validate'){recordLessonPass();return}
  if(a==='session-next'){if(session.stage===4&&!session.feedback?.mic)session.spoken++;stepSession();return}
  if(a==='session-skip'){session.stage=1;session.index=0;persistSession();render();return}
  if(a==='session-forgot'){validateSession('');return}
  if(a==='session-mic'){audioMic('session');return}
  if(a==='session-reveal'){const p=LESSONS[session.day-1].phrases[session.index];session.feedback={ok:false,given:'',mic:false};persistSession();render();return}
  if(a==='session-restart'){if(confirm('Recommencer la séance du jour ?')){session=makeSession(state.active);persistSession();render()}return}
  if(a==='speak'){say(b.dataset.text||'');return}
  if(a==='bookmark'){const text=b.dataset.text;const i=state.favorites.indexOf(text);if(i<0)state.favorites.push(text);else state.favorites.splice(i,1);save();render();return}
  if(a==='key'){const target=$(b.dataset.target);if(target){const start=target.selectionStart??target.value.length,end=target.selectionEnd??start;target.value=target.value.slice(0,start)+b.dataset.key+target.value.slice(end);target.focus();target.setSelectionRange(start+1,start+1)}return}
  if(a==='key-back'){const target=$(b.dataset.target);if(target){const start=target.selectionStart??target.value.length,end=target.selectionEnd??start;target.value=target.value.slice(0,Math.max(0,start-1))+target.value.slice(end);target.focus()}return}
  if(a==='revision-start'){beginRevision();return}
  if(a==='revision-flip'&&revSession){revSession.flipped=true;render();return}
  if(a==='revision-rate'&&revSession){rate(revSession.items[revSession.idx].ru,+b.dataset.grade);revSession.idx++;revSession.flipped=false;render();return}
  if(a==='library-tab'){libraryType=b.dataset.type;studySearch='';render();return}
  if(a==='start-scene'){openScene(+b.dataset.i);return}
  if(a==='scene-mic'){audioMic('scene');return}
  if(a==='scene-next'){const m=missions[selectedMission],lines=DIALOGUES[m.reference].lines;scene.history.push({bot:lines[scene.turn*2][1],answer:scene.feedback?.given||'(réponse montrée)' });scene.turn++;scene.feedback=null;scene.finished=scene.turn>=Math.floor(lines.length/2);render();return}
  if(a==='scene-restart'){openScene(selectedMission);return}
  if(a==='launch-exam'){makeExam(b.dataset.type);return}
  if(a==='exam-pick'){if(!exam||exam.feedback)return;const q=exam.qs[exam.idx];exam.correct+=canText(b.dataset.answer,q.fr)?1:0;exam.feedback={ok:canText(b.dataset.answer,q.fr),given:b.dataset.answer};render();return}
  if(a==='exam-next'){nextExam();return}
  if(a==='exam-forgot'){confirmExam('');return}
  if(a==='exam-mic'){audioMic('exam');return}
  if(a==='exam-reveal'){confirmExam('',true);return}
  if(a==='to-exams'){go('exams');return}
  if(a==='ai-check'){checkAi();message('Test de connexion effectué.');return}
  if(a==='tutor-mic'){audioMic('tutor');return}
  if(a==='tutor-clear'){if(confirm('Effacer cet échange enregistré sur ton appareil ?')){state.tutorHistory=[];save();render()}return}
  if(a==='export'){progressExport();return}
  if(a==='import'){$('importFile').click();return}
  if(a==='download-calendar'){createIcs();return}
  if(a==='reset'){if(confirm('Supprimer tous les progrès, résultats, favoris et erreurs sur cet appareil ?')){state=fresh();session=null;save();go('home');message('Progression locale réinitialisée.')}return}
 });
 document.addEventListener('submit',e=>{
  if(e.target.id==='sessionForm'){e.preventDefault();validateSession($('sessionInput')?.value||'')}
  if(e.target.id==='sceneForm'){e.preventDefault();finishSceneAnswer($('sceneInput')?.value||'')}
  if(e.target.id==='examForm'){e.preventDefault();confirmExam($('examInput')?.value||'')}
  if(e.target.id==='tutorForm'){e.preventDefault();sendTutor($('tutorInput')?.value||'')}
 });
 document.addEventListener('input',e=>{if(e.target.id==='librarySearch'){studySearch=e.target.value;const rows=libraryType==='words'?wdb:libraryType==='phrases'?[...phdb,...PHRASEBOOK.map(([ru,fr])=>({ru,fr})),...BONUS.map(([ru,fr])=>({ru,fr}))]:ALPHABET.map(([ru,fr])=>({ru,fr}));const term=studySearch.toLocaleLowerCase('ru');const filtered=rows.filter(r=>(r.ru+' '+r.fr).toLocaleLowerCase('ru').includes(term)).slice(0,100);$('libraryResults').innerHTML=filtered.length?`<div class="wordgrid">${filtered.map(r=>wordCard(r.ru,r.fr)).join('')}</div>`:'<div class="empty">Aucun résultat.</div>'}if(e.target.id==='tutorInput')tutorEntry=e.target.value});
 document.addEventListener('change',e=>{const key={settingMinutes:'minutes',settingSpeed:'speed',settingAudioMode:'audioMode',settingTheme:'theme',settingFont:'font',settingObjective:'objective'}[e.target.id];if(key){state.settings[key]=['minutes','speed'].includes(key)?Number(e.target.value):e.target.value;save();render();message('Préférence enregistrée.')}});
 $('importFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>2000000)throw Error('Sauvegarde trop volumineuse.');const data=JSON.parse(await f.text());if(!data||!data.progress||typeof data.progress!=='object'||!['russki-ultra','russki30-pro','russki30'].includes(data.app))throw Error('Format de sauvegarde inconnu.');if(!confirm('Remplacer tous tes progrès actuels par ceux du fichier ?'))return;
 const p=data.progress,clean=fresh();clean.active=clamp(Number(p.active)||1,1,30);clean.completed=(p.completed&&typeof p.completed==='object'&&!Array.isArray(p.completed))?p.completed:{};clean.xp=clamp(Number(p.xp)||0,0,1000000);
 if(data.app==='russki-ultra'){clean.cards=(p.cards&&typeof p.cards==='object'&&!Array.isArray(p.cards))?Object.fromEntries(Object.entries(p.cards).filter(([k])=>byWord.has(k))):{};clean.sessions=(p.sessions&&typeof p.sessions==='object')?p.sessions:{};clean.errors=Array.isArray(p.errors)?p.errors.slice(-200):[];clean.exams=(p.exams&&typeof p.exams==='object')?p.exams:{};clean.settings={...clean.settings,...p.settings};clean.tutorHistory=Array.isArray(p.tutorHistory)?p.tutorHistory.slice(-40):[];}
 else Object.entries(p.reviews||{}).forEach(([ru,r])=>{if(byWord.has(ru))clean.cards[ru]={due:Number(r.due)||now(),interval:Math.max(0,Number(r.box)||0),ease:2.3,reps:Number(r.box)||0,lapses:Number(r.lapses)||0,seen:1,correct:0}});
 clean.favorites=Array.isArray(p.favorites)?p.favorites.filter(x=>typeof x==='string').slice(0,500):[];clean.attempts=Array.isArray(p.attempts)?p.attempts.slice(-300):[];state=clean;session=null;save();go('profile');message('Sauvegarde importée.');
 }catch(err){message('Import impossible : '+String(err.message).slice(0,80))}finally{e.target.value=''}});
}
addListeners();save();render();initUiExperience();checkAi();
fetch('./recordings.json').then(r=>r.ok?r.json():{}).then(obj=>{if(obj&&typeof obj==='object'&&!Array.isArray(obj))recordingMap=Object.fromEntries(Object.entries(obj).filter(([k,v])=>typeof k==='string'&&typeof v==='string'&&/^audio\/[\w./-]+\.(mp3|ogg|wav)$/i.test(v)&&!v.includes('..')))}).catch(()=>{});
if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
