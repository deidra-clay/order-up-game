(() => {
"use strict";

const ITEMS = {
  burger:{name:"Burger",emoji:"🍔",price:18},
  coffee:{name:"Coffee",emoji:"☕",price:8},
  fries:{name:"Fries",emoji:"🍟",price:12},
  pancakes:{name:"Pancakes",emoji:"🥞",price:15}
};

const LEVELS = [
  {name:"Breakfast Basics",goal:70,customers:4,tables:2,arrivalMs:7800,patience:78,menu:["burger","coffee"],maxItems:2},
  {name:"Add the Fryer",goal:105,customers:5,tables:2,arrivalMs:7100,patience:74,menu:["burger","coffee","fries"],maxItems:2},
  {name:"Pancake Morning",goal:140,customers:6,tables:2,arrivalMs:6500,patience:70,menu:["burger","coffee","fries","pancakes"],maxItems:2},
  {name:"Third Table",goal:180,customers:7,tables:3,arrivalMs:5850,patience:66,menu:["burger","coffee","fries","pancakes"],maxItems:2},
  {name:"Lunch Rush",goal:225,customers:8,tables:3,arrivalMs:5250,patience:62,menu:["burger","coffee","fries","pancakes"],maxItems:2},
  {name:"Dinner Rush",goal:280,customers:10,tables:3,arrivalMs:4700,patience:58,menu:["burger","coffee","fries","pancakes"],maxItems:3},
  {name:"Friday Night",goal:340,customers:11,tables:4,arrivalMs:4150,patience:54,menu:["burger","coffee","fries","pancakes"],maxItems:3},
  {name:"Full House",goal:420,customers:13,tables:4,arrivalMs:3650,patience:50,menu:["burger","coffee","fries","pancakes"],maxItems:3}
];

const TABLE_LAYOUTS = {
  2:[{x:35,y:24},{x:66,y:43}],
  3:[{x:34,y:22},{x:67,y:23},{x:52,y:45}],
  4:[{x:31,y:21},{x:68,y:21},{x:31,y:45},{x:68,y:45}]
};

const STATION_POS = {
  grill:{x:24,y:70,emoji:"🥩",label:"GRILL"},
  bun:{x:35,y:70,emoji:"🥯",label:"BUN"},
  lettuce:{x:46,y:70,emoji:"🥬",label:"LETTUCE"},
  tomato:{x:57,y:70,emoji:"🍅",label:"TOMATO"},
  cup:{x:72,y:70,emoji:"🥤",label:"CUP"},
  coffee:{x:84,y:70,emoji:"☕",label:"COFFEE"},
  fryer:{x:27,y:84,emoji:"🍟",label:"FRYER"},
  salt:{x:39,y:84,emoji:"🧂",label:"SALT"},
  griddle:{x:52,y:84,emoji:"🥞",label:"GRIDDLE"},
  syrup:{x:64,y:84,emoji:"🍯",label:"SYRUP"}
};

const NAMES=["Maya","Theo","Nina","Jay","Lena","Omar","Riley","Sam","Ari","Tess","Miles","Zoe","Kai","Ivy","Noah","Mina"];
const AVATARS=["👩🏽","👨🏻","👩🏾","🧔🏽","👩🏻","👨🏾","👩🏼","👨🏿","🧑🏽","👩🏿","👨🏼","🧑🏻"];

const els={
  levelLabel:document.querySelector("#levelLabel"),cashLabel:document.querySelector("#cashLabel"),goalLabel:document.querySelector("#goalLabel"),
  waitingLine:document.querySelector("#waitingLine"),tablesLayer:document.querySelector("#tablesLayer"),stationsLayer:document.querySelector("#stationsLayer"),
  menuBoard:document.querySelector("#menuBoard"),burgerPrepSlots:document.querySelector("#burgerPrepSlots"),sidePrepArea:document.querySelector("#sidePrepArea"),
  passSlots:document.querySelector("#passSlots"),carrySlots:[...document.querySelectorAll(".carry-slot")],server:document.querySelector("#server"),cook:document.querySelector("#cook"),
  serverBubble:document.querySelector("#serverBubble"),cookBubble:document.querySelector("#cookBubble"),toast:document.querySelector("#toast"),levelsButton:document.querySelector("#levelsButton"),
  restartButton:document.querySelector("#restartButton"),startButton:document.querySelector("#startButton"),modal:document.querySelector("#modal"),modalIcon:document.querySelector("#modalIcon"),
  modalTitle:document.querySelector("#modalTitle"),modalText:document.querySelector("#modalText"),modalDetails:document.querySelector("#modalDetails"),modalPrimary:document.querySelector("#modalPrimary"),modalSecondary:document.querySelector("#modalSecondary")
};

let save=loadSave();
let state=createState(Math.min((save.lastLevel||1)-1,LEVELS.length-1));
let raf=0,lastFrame=performance.now(),toastTimer=0,audioContext=null;
let soundOn=save.soundOn!==false;

function loadSave(){try{return JSON.parse(localStorage.getItem("orderUpSaveV3")||"{}")}catch{return{}}}
function persist(){localStorage.setItem("orderUpSaveV3",JSON.stringify(save))}
function clock(){return performance.now()}
function blankBurgerSlot(){return{bun:false,lettuce:false,tomato:false,patty:false}}

function createState(levelIndex){
  const lvl=LEVELS[levelIndex],layout=TABLE_LAYOUTS[lvl.tables];
  return{
    levelIndex,running:false,ended:false,cash:0,spawned:0,resolved:0,nextId:1,nextSpawnAt:0,ordersTaken:0,
    selectedWaitingId:null,selectedCarrySlot:null,selectedBurgerSlot:0,waiting:[],pass:[],carry:[null,null],
    server:{busy:false,x:31,y:50,token:0},cook:{busy:false,x:51,y:73,token:0},
    tables:layout.map((p,i)=>({id:i+1,x:p.x,y:p.y,state:"empty",customer:null,order:[],served:[],eatingUntil:0,cleaningUntil:0})),
    burgerSlots:[blankBurgerSlot(),blankBurgerSlot()],
    grill:{state:"idle",startedAt:0,readyAt:0,burnAt:0},
    coffee:{cup:false,state:"idle",startedAt:0,readyAt:0},
    fries:{state:"idle",startedAt:0,readyAt:0,burnAt:0,prep:"empty"},
    pancakes:{state:"idle",startedAt:0,readyAt:0,burnAt:0,prep:"empty"}
  };
}

function beep(freq=550,duration=.055){
  if(!soundOn)return;
  try{audioContext||=new(window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(audioContext.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);o.stop(audioContext.currentTime+duration)}catch{}
}
function toast(text,ms=1800){els.toast.textContent=text;els.toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.classList.remove("show"),ms)}
function bubble(kind,text,ms=850){const el=kind==="server"?els.serverBubble:els.cookBubble;el.textContent=text;el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),ms)}
function openModal(){els.modal.classList.add("open")}function closeModal(){els.modal.classList.remove("open")}

function showIntro(){
  const lvl=LEVELS[state.levelIndex];
  els.modalIcon.textContent="🍳";els.modalTitle.textContent=`Level ${state.levelIndex+1}: ${lvl.name}`;
  els.modalText.textContent="You still run the dining room — but now you actually make the food too.";
  els.modalDetails.innerHTML=`
    <div class="instruction"><span>🍔</span><strong>Burger: select a prep plate → bun + lettuce + tomato → grill patty → add patty → tap completed plate.</strong></div>
    <div class="instruction"><span>☕</span><strong>Coffee: grab a cup → brew it → tap READY coffee to put it on the pass.</strong></div>
    ${lvl.menu.includes("fries")?'<div class="instruction"><span>🍟</span><strong>Fries: fryer → remove when ready → salt → tap the portion.</strong></div>':""}
    ${lvl.menu.includes("pancakes")?'<div class="instruction"><span>🥞</span><strong>Pancakes: pour → flip → plate → syrup → tap the plate.</strong></div>':""}`;
  els.modalPrimary.textContent="Start Shift";els.modalPrimary.onclick=()=>{closeModal();startLevel(state.levelIndex)};els.modalSecondary.classList.add("hidden");openModal();
}

function showLevels(){
  const unlocked=Math.max(1,save.unlocked||1);els.modalIcon.textContent="🧾";els.modalTitle.textContent="Choose a Shift";els.modalText.textContent="The kitchen gets busier as new dishes unlock.";
  els.modalDetails.innerHTML=LEVELS.map((lvl,i)=>{const n=i+1,stars=save.bestStars?.[n]||0,locked=n>unlocked;return`<button class="level-option" data-level="${i}" ${locked?"disabled":""}><span><strong>${n}. ${lvl.name}</strong><br><small>${lvl.menu.map(k=>ITEMS[k].emoji).join(" ")} • ${lvl.customers} customers</small></span><span>${locked?"🔒":("⭐".repeat(stars)||"—")}</span></button>`}).join("");
  els.modalDetails.querySelectorAll("[data-level]").forEach(btn=>btn.addEventListener("click",()=>{const i=Number(btn.dataset.level);state=createState(i);save.lastLevel=i+1;persist();render();closeModal();showIntro()}));
  els.modalPrimary.textContent="Close";els.modalPrimary.onclick=closeModal;els.modalSecondary.classList.add("hidden");openModal();
}

function startLevel(index){if(raf)cancelAnimationFrame(raf);state=createState(index);state.running=true;state.nextSpawnAt=clock()+650;save.lastLevel=index+1;persist();lastFrame=clock();render();toast("The diner is open.");raf=requestAnimationFrame(loop)}
function loop(t){if(!state.running)return;const dt=Math.min(.18,(t-lastFrame)/1000);lastFrame=t;const lvl=LEVELS[state.levelIndex];if(state.spawned<lvl.customers&&t>=state.nextSpawnAt){spawnCustomer();state.nextSpawnAt=t+lvl.arrivalMs}updatePatience(dt);updateKitchen(t);updateTables(t);checkEnd();render();if(state.running)raf=requestAnimationFrame(loop)}
function spawnCustomer(){const lvl=LEVELS[state.levelIndex],id=state.nextId++;const c={id,name:NAMES[(id+state.levelIndex*2)%NAMES.length],avatar:AVATARS[(id*3+state.levelIndex)%AVATARS.length],patience:lvl.patience,maxPatience:lvl.patience};state.waiting.push(c);state.spawned++;beep(440);toast(`${c.name} walked in.`)}

function updatePatience(dt){
  [...state.waiting].forEach(c=>{c.patience-=dt*.78;if(c.patience<=0){state.waiting=state.waiting.filter(x=>x.id!==c.id);if(state.selectedWaitingId===c.id)state.selectedWaitingId=null;state.resolved++;beep(170,.14);toast(`${c.name} left the line.`)}});
  state.tables.forEach(table=>{const c=table.customer;if(!c||!["seated","waitingFood"].includes(table.state))return;c.patience-=dt;if(c.patience<=0){table.customer=null;table.order=[];table.served=[];table.state="dirty";state.resolved++;beep(160,.15);toast(`Table ${table.id} walked out. Clean it.`)}});
}

function updateKitchen(t){
  const g=state.grill;
  if(g.state==="cooking"&&t>=g.readyAt){g.state="ready";beep(820);toast("Patty is ready — get it off the grill!")}
  if(g.state==="ready"&&t>=g.burnAt){g.state="burned";beep(120,.2);toast("The burger patty burned.")}

  const coffee=state.coffee;
  if(coffee.state==="brewing"&&t>=coffee.readyAt){coffee.state="ready";beep(840);toast("Coffee is ready.")}

  const fries=state.fries;
  if(fries.state==="frying"&&t>=fries.readyAt){fries.state="ready";beep(820);toast("Fries are ready — pull the basket!")}
  if(fries.state==="ready"&&t>=fries.burnAt){fries.state="burned";beep(120,.2);toast("The fries burned.")}

  const p=state.pancakes;
  if(p.state==="side1"&&t>=p.readyAt){p.state="flipReady";p.burnAt=t+4200;beep(820);toast("Pancake is ready to flip.")}
  else if(p.state==="flipReady"&&t>=p.burnAt){p.state="burned";beep(120,.2);toast("The pancake burned before you flipped it.")}
  else if(p.state==="side2"&&t>=p.readyAt){p.state="plateReady";p.burnAt=t+4200;beep(820);toast("Pancake is cooked — plate it.")}
  else if(p.state==="plateReady"&&t>=p.burnAt){p.state="burned";beep(120,.2);toast("The pancake burned on the griddle.")}
}

function updateTables(t){state.tables.forEach(table=>{if(table.state==="eating"&&t>=table.eatingUntil){table.state="checkout";beep(760);toast(`Table ${table.id} wants the check.`)}if(table.state==="cleaning"&&t>=table.cleaningUntil){resetTable(table);beep(630);toast(`Table ${table.id} is clean.`)}})}
function resetTable(table){table.state="empty";table.customer=null;table.order=[];table.served=[];table.eatingUntil=0;table.cleaningUntil=0}

function chooseOrder(){
  const lvl=LEVELS[state.levelIndex];
  if(state.levelIndex===0){
    const scripted=[["burger"],["coffee"],["burger","coffee"],["burger"]];
    return scripted[Math.min(state.ordersTaken,scripted.length-1)];
  }
  let count=1;if(lvl.maxItems>=2&&Math.random()>.45)count=2;if(lvl.maxItems>=3&&Math.random()>.78)count=3;
  const pool=[...lvl.menu],result=[];
  while(result.length<count&&pool.length){const idx=Math.floor(Math.random()*pool.length);result.push(pool[idx]);pool.splice(idx,1)}
  return result;
}

function moveWorker(kind,x,y,label,callback,duration=430){
  const data=state[kind];if(data.busy){toast(`${kind==="server"?"Server":"Cook"} is busy.`);return false}
  data.busy=true;data.token++;const token=data.token;data.x=x;data.y=y;const el=kind==="server"?els.server:els.cook;el.classList.add("busy");bubble(kind,label,Math.max(700,duration));renderWorkers();
  setTimeout(()=>{if(!state.running||data.token!==token)return;try{callback?.()}finally{data.busy=false;el.classList.remove("busy");render()}},duration);return true;
}

function onWaitingTap(id){if(!state.running)return;state.selectedWaitingId=state.selectedWaitingId===id?null:id;const c=state.waiting.find(x=>x.id===id);if(c&&state.selectedWaitingId){beep(530);toast(`${c.name} selected. Tap an empty table.`)}renderWaiting()}

function onTableTap(id){
  if(!state.running)return;const table=state.tables.find(t=>t.id===id);if(!table)return;
  if(table.state==="empty"){
    if(!state.selectedWaitingId){toast("Select a customer by the door first.");return}
    const customer=state.waiting.find(c=>c.id===state.selectedWaitingId);if(!customer)return;
    moveWorker("server",table.x-4,table.y+7,"Seating",()=>{state.waiting=state.waiting.filter(c=>c.id!==customer.id);state.selectedWaitingId=null;table.customer=customer;table.state="seated";beep(610);toast(`${customer.name} is seated. Take the order.`)},520);return;
  }
  if(table.state==="seated"){
    moveWorker("server",table.x-4,table.y+7,"Taking order",()=>{table.order=chooseOrder();state.ordersTaken++;table.served=table.order.map(()=>false);table.state="waitingFood";beep(670);toast(`Table ${table.id}: ${table.order.map(k=>ITEMS[k].emoji).join(" ")}`)},520);return;
  }
  if(table.state==="waitingFood"){
    const slot=state.selectedCarrySlot;if(slot===null||!state.carry[slot]){toast("Select something on the server tray first.");return}
    const item=state.carry[slot];const match=table.order.findIndex((key,i)=>key===item.key&&!table.served[i]);if(match<0){beep(180);toast(`Table ${table.id} didn't order that.`);return}
    moveWorker("server",table.x-4,table.y+7,"Serving",()=>{table.served[match]=true;state.carry[slot]=null;state.selectedCarrySlot=null;beep(860);if(table.served.every(Boolean)){table.state="eating";table.eatingUntil=clock()+3900+Math.random()*1400;toast(`Table ${table.id} has everything.`)}else toast(`Table ${table.id} still needs ${remainingOrder(table)}.`)},470);return;
  }
  if(table.state==="eating"){toast(`Table ${table.id} is eating.`);return}
  if(table.state==="checkout"){
    moveWorker("server",table.x-4,table.y+7,"Payment",()=>{const base=table.order.reduce((sum,key)=>sum+ITEMS[key].price,0);const c=table.customer,ratio=c?Math.max(0,c.patience/c.maxPatience):0,tip=Math.round(base*(.08+ratio*.30));state.cash+=base+tip;state.resolved++;table.customer=null;table.state="dirty";beep(980);toast(`+$${base+tip}. Clean Table ${table.id}.`)},500);return;
  }
  if(table.state==="dirty"){moveWorker("server",table.x-4,table.y+7,"Cleaning",()=>{table.state="cleaning";table.cleaningUntil=clock()+1300;beep(520)},480);return}
  if(table.state==="cleaning")toast("Still cleaning that table.");
}
function remainingOrder(table){return table.order.filter((_,i)=>!table.served[i]).map(k=>ITEMS[k].emoji).join(" ")}

function selectedBurger(){return state.burgerSlots[state.selectedBurgerSlot]}
function burgerComplete(slot){return slot.bun&&slot.lettuce&&slot.tomato&&slot.patty}
function addBurgerPart(part){
  const slot=selectedBurger();if(slot[part]){toast(`That burger already has ${part}.`);return}
  const pos=STATION_POS[part];moveWorker("cook",pos.x-2,pos.y+1,`Add ${part}`,()=>{slot[part]=true;beep(610);toast(`${part[0].toUpperCase()+part.slice(1)} added to burger ${state.selectedBurgerSlot+1}.`)},320);
}
function onBurgerSlotTap(index){
  if(!state.running)return;state.selectedBurgerSlot=index;const slot=state.burgerSlots[index];
  if(burgerComplete(slot)){
    moveWorker("cook",76,91,"Assemble burger",()=>{addToPass("burger");state.burgerSlots[index]=blankBurgerSlot();beep(920);toast("Burger assembled and sent to the pass.")},440);
  }else{toast(`Burger prep ${index+1} selected. Add bun, lettuce, tomato, and a cooked patty.`);renderBurgerPrep()}
}

function onGrillTap(){
  if(!state.running)return;const g=state.grill,pos=STATION_POS.grill;
  if(g.state==="idle"){moveWorker("cook",pos.x-2,pos.y+1,"Patty on grill",()=>{g.state="cooking";g.startedAt=clock();g.readyAt=g.startedAt+4300;g.burnAt=g.readyAt+4800;beep(520);toast("Patty is grilling.")},350);return}
  if(g.state==="cooking"){toast("Patty is still cooking.");return}
  if(g.state==="ready"){
    const slot=selectedBurger();if(slot.patty){toast("Selected burger already has a patty. Choose the other prep plate.");return}
    moveWorker("cook",pos.x-2,pos.y+1,"Move patty",()=>{slot.patty=true;g.state="idle";g.startedAt=g.readyAt=g.burnAt=0;beep(880);toast(`Patty added to burger ${state.selectedBurgerSlot+1}.`)},330);return;
  }
  if(g.state==="burned"){moveWorker("cook",pos.x-2,pos.y+1,"Toss patty",()=>{g.state="idle";g.startedAt=g.readyAt=g.burnAt=0;beep(210);toast("Burned patty tossed.")},280)}
}

function onCupTap(){if(!state.running)return;const c=state.coffee,pos=STATION_POS.cup;if(c.cup){toast("There is already a cup at the coffee machine.");return}moveWorker("cook",pos.x-2,pos.y+1,"Grab cup",()=>{c.cup=true;beep(600);toast("Cup is ready. Brew the coffee.")},260)}
function onCoffeeTap(){
  if(!state.running)return;const c=state.coffee,pos=STATION_POS.coffee;
  if(!c.cup){toast("Grab a cup first.");return}
  if(c.state==="idle"){moveWorker("cook",pos.x-2,pos.y+1,"Brew coffee",()=>{c.state="brewing";c.startedAt=clock();c.readyAt=c.startedAt+2400;beep(520);toast("Coffee is brewing.")},300);return}
  if(c.state==="brewing"){toast("Coffee is still brewing.");return}
  if(c.state==="ready"){moveWorker("cook",pos.x-2,pos.y+1,"Coffee to pass",()=>{addToPass("coffee");c.cup=false;c.state="idle";c.startedAt=c.readyAt=0;beep(900);toast("Coffee sent to the pass.")},300)}
}

function onFryerTap(){
  if(!state.running)return;const f=state.fries,pos=STATION_POS.fryer;
  if(f.prep!=="empty"){toast("Finish the current fries portion first.");return}
  if(f.state==="idle"){moveWorker("cook",pos.x-2,pos.y+1,"Drop fries",()=>{f.state="frying";f.startedAt=clock();f.readyAt=f.startedAt+3600;f.burnAt=f.readyAt+4300;beep(520);toast("Fries are frying.")},330);return}
  if(f.state==="frying"){toast("Fries are still cooking.");return}
  if(f.state==="ready"){moveWorker("cook",pos.x-2,pos.y+1,"Pull basket",()=>{f.state="idle";f.startedAt=f.readyAt=f.burnAt=0;f.prep="unsalted";beep(850);toast("Fries are out. Salt and portion them.")},320);return}
  if(f.state==="burned"){moveWorker("cook",pos.x-2,pos.y+1,"Toss fries",()=>{f.state="idle";f.startedAt=f.readyAt=f.burnAt=0;beep(210);toast("Burned fries tossed.")},280)}
}
function onSaltTap(){if(!state.running)return;const f=state.fries,pos=STATION_POS.salt;if(f.prep!=="unsalted"){toast("There are no fresh fries waiting for salt.");return}moveWorker("cook",pos.x-2,pos.y+1,"Salt fries",()=>{f.prep="salted";beep(650);toast("Fries are seasoned. Tap the fries portion to send it.")},260)}
function onFriesPrepTap(){if(!state.running)return;if(state.fries.prep!=="salted"){toast(state.fries.prep==="unsalted"?"Salt the fries first.":"No fries are ready.");return}moveWorker("cook",42,94,"Portion fries",()=>{addToPass("fries");state.fries.prep="empty";beep(920);toast("Fries sent to the pass.")},300)}

function onGriddleTap(){
  if(!state.running)return;const p=state.pancakes,pos=STATION_POS.griddle;
  if(p.prep!=="empty"){toast("Finish the plated pancake first.");return}
  if(p.state==="idle"){moveWorker("cook",pos.x-2,pos.y+1,"Pour batter",()=>{p.state="side1";p.startedAt=clock();p.readyAt=p.startedAt+3000;p.burnAt=0;beep(520);toast("Pancake is cooking on side one.")},320);return}
  if(p.state==="side1"){toast("First side is still cooking.");return}
  if(p.state==="flipReady"){moveWorker("cook",pos.x-2,pos.y+1,"Flip pancake",()=>{p.state="side2";p.startedAt=clock();p.readyAt=p.startedAt+2500;p.burnAt=0;beep(690);toast("Pancake flipped.")},250);return}
  if(p.state==="side2"){toast("Second side is still cooking.");return}
  if(p.state==="plateReady"){moveWorker("cook",pos.x-2,pos.y+1,"Plate pancake",()=>{p.state="idle";p.startedAt=p.readyAt=p.burnAt=0;p.prep="plain";beep(850);toast("Pancake plated. Add syrup.")},280);return}
  if(p.state==="burned"){moveWorker("cook",pos.x-2,pos.y+1,"Toss pancake",()=>{p.state="idle";p.startedAt=p.readyAt=p.burnAt=0;beep(210);toast("Burned pancake tossed.")},260)}
}
function onSyrupTap(){if(!state.running)return;const p=state.pancakes,pos=STATION_POS.syrup;if(p.prep!=="plain"){toast("There is no plated pancake waiting for syrup.");return}moveWorker("cook",pos.x-2,pos.y+1,"Add syrup",()=>{p.prep="syrup";beep(650);toast("Pancake finished. Tap the plate to send it.")},250)}
function onPancakePrepTap(){if(!state.running)return;if(state.pancakes.prep!=="syrup"){toast(state.pancakes.prep==="plain"?"Add syrup first.":"No pancake is ready.");return}moveWorker("cook",58,94,"Pancake to pass",()=>{addToPass("pancakes");state.pancakes.prep="empty";beep(920);toast("Pancakes sent to the pass.")},300)}

function addToPass(key){state.pass.push({id:`${key}-${Date.now()}-${Math.random()}`,key})}
function onPassItemTap(id){
  if(!state.running)return;const emptySlot=state.carry.findIndex(x=>x===null);if(emptySlot<0){toast("Server tray is full.");return}
  const index=state.pass.findIndex(item=>item.id===id);if(index<0)return;const item=state.pass[index];
  moveWorker("server",76,60,"Picking up",()=>{state.pass.splice(index,1);state.carry[emptySlot]=item;state.selectedCarrySlot=emptySlot;beep(810);toast(`${ITEMS[item.key].name} is on the server tray.`)},480);
}
function onCarryTap(slot){if(!state.running)return;if(!state.carry[slot]){state.selectedCarrySlot=null;renderCarry();return}state.selectedCarrySlot=state.selectedCarrySlot===slot?null:slot;const item=state.carry[slot];if(state.selectedCarrySlot!==null&&item)toast(`${ITEMS[item.key].name} selected. Tap the right table.`);renderCarry()}

function checkEnd(){
  if(state.ended||!state.running)return;const lvl=LEVELS[state.levelIndex];const allSpawned=state.spawned>=lvl.customers,noWaiting=state.waiting.length===0,noCustomers=state.tables.every(t=>!t.customer),allClean=state.tables.every(t=>t.state==="empty");
  if(allSpawned&&state.resolved>=lvl.customers&&noWaiting&&noCustomers&&allClean)endLevel();
}
function endLevel(){
  state.running=false;state.ended=true;const lvl=LEVELS[state.levelIndex],ratio=state.cash/lvl.goal,won=state.cash>=lvl.goal;let stars=0;if(won)stars=ratio>=1.4?3:ratio>=1.17?2:1;
  if(won){const n=state.levelIndex+1;save.unlocked=Math.max(save.unlocked||1,Math.min(LEVELS.length,n+1));save.bestStars||={};save.bestStars[n]=Math.max(save.bestStars[n]||0,stars);persist()}
  els.modalIcon.textContent=won?"🎉":"😵";els.modalTitle.textContent=won?"Shift Complete!":"Diner Disaster";els.modalText.textContent=won?`You made $${state.cash} on a $${lvl.goal} goal. ${"⭐".repeat(stars)}`:`You made $${state.cash}. You needed $${lvl.goal}.`;
  els.modalDetails.innerHTML=`<div class="instruction"><span>💵</span><strong>Cash: $${state.cash}</strong></div><div class="instruction"><span>👥</span><strong>Customers: ${state.resolved}/${lvl.customers}</strong></div><div class="instruction"><span>🏆</span><strong>Best: ${"⭐".repeat(save.bestStars?.[state.levelIndex+1]||0)||"—"}</strong></div>`;
  if(won&&state.levelIndex<LEVELS.length-1){els.modalPrimary.textContent=`Play Level ${state.levelIndex+2}`;els.modalPrimary.onclick=()=>{closeModal();startLevel(state.levelIndex+1)}}else{els.modalPrimary.textContent="Retry";els.modalPrimary.onclick=()=>{closeModal();startLevel(state.levelIndex)}}
  els.modalSecondary.textContent="Levels";els.modalSecondary.classList.remove("hidden");els.modalSecondary.onclick=showLevels;openModal();
}

function render(){
  const lvl=LEVELS[state.levelIndex];els.levelLabel.textContent=`Level ${state.levelIndex+1}: ${lvl.name}`;els.cashLabel.textContent=`$${state.cash}`;els.goalLabel.textContent=`$${state.cash} / $${lvl.goal}`;els.startButton.textContent=state.running?"Running":"Start Shift";
  renderMenuBoard();renderWaiting();renderTables();renderStations();renderBurgerPrep();renderSidePrep();renderPass();renderCarry();renderWorkers();
}

function renderMenuBoard(){
  const menu=LEVELS[state.levelIndex].menu;
  els.menuBoard.innerHTML=`<strong>TODAY</strong>${menu.map(key=>`<span>${ITEMS[key].emoji} ${ITEMS[key].name}</span>`).join("")}`;
}

function renderWaiting(){
  els.waitingLine.innerHTML="";state.waiting.forEach((c,i)=>{const btn=document.createElement("button");btn.className=`waiting-customer ${state.selectedWaitingId===c.id?"selected":""}`;btn.style.left=`${(i%2)*44}%`;btn.style.top=`${Math.floor(i/2)*28}%`;const pct=Math.max(0,c.patience/c.maxPatience*100);btn.innerHTML=`<span class="person">${c.avatar}</span><span class="customer-name-tag">${c.name}</span><span class="mini-patience"><span style="width:${pct}%;background:${patienceColor(pct)}"></span></span>`;btn.addEventListener("click",()=>onWaitingTap(c.id));els.waitingLine.appendChild(btn)})
}

function renderTables(){
  els.tablesLayer.innerHTML="";state.tables.forEach(table=>{const btn=document.createElement("button");btn.className=`table ${["seated","waitingFood","checkout","dirty"].includes(table.state)?"action":""} ${["dirty","cleaning"].includes(table.state)?"dirty":""}`;btn.style.left=`calc(${table.x}% - 43px)`;btn.style.top=`calc(${table.y}% - 35px)`;btn.addEventListener("click",()=>onTableTap(table.id));
    let customer="",bubbleText="",patience="";if(table.customer){customer=`<div class="seated-customer">${table.customer.avatar}</div>`;const pct=Math.max(0,table.customer.patience/table.customer.maxPatience*100);patience=`<div class="table-patience"><span style="width:${pct}%;background:${patienceColor(pct)}"></span></div>`}
    if(table.state==="seated")bubbleText="📝 ORDER";if(table.state==="waitingFood")bubbleText=remainingOrder(table);if(table.state==="eating")bubbleText="😋 eating";if(table.state==="checkout")bubbleText="💵 CHECK";if(table.state==="dirty")bubbleText="🧽 CLEAN";if(table.state==="cleaning")bubbleText="✨ wiping";
    btn.innerHTML=`${bubbleText?`<div class="table-bubble">${bubbleText}</div>`:""}<div class="chair chair-a"></div><div class="chair chair-b"></div><div class="tabletop"></div>${customer}<div class="table-number">${table.id}</div>${patience}`;els.tablesLayer.appendChild(btn)
  })
}

function stationEl(name,visualState,label,progress,onTap){
  const pos=STATION_POS[name],btn=document.createElement("button");btn.className=`station ${visualState||""}`;btn.style.left=`calc(${pos.x}% - 25px)`;btn.style.top=`calc(${pos.y}% - 24px)`;btn.innerHTML=`<div class="station-timer"><span style="width:${progress||0}%"></span></div><div class="station-box"></div><div class="station-icon">${pos.emoji}</div><div class="station-name">${label||pos.label}</div>`;btn.addEventListener("click",onTap);els.stationsLayer.appendChild(btn)
}

function renderStations(){
  const lvl=LEVELS[state.levelIndex],t=clock();els.stationsLayer.innerHTML="";
  if(lvl.menu.includes("burger")){
    const g=state.grill;let gp=0,gl="GRILL";if(g.state==="cooking"){gp=Math.min(100,(t-g.startedAt)/(g.readyAt-g.startedAt)*100);gl=`${Math.max(0,(g.readyAt-t)/1000).toFixed(1)}s`}else if(g.state==="ready"){gp=100;gl="PATTY READY"}else if(g.state==="burned"){gp=100;gl="BURNED"}
    stationEl("grill",g.state,gl,gp,onGrillTap);stationEl("bun","","BUN",0,()=>addBurgerPart("bun"));stationEl("lettuce","","LETTUCE",0,()=>addBurgerPart("lettuce"));stationEl("tomato","","TOMATO",0,()=>addBurgerPart("tomato"));
  }
  if(lvl.menu.includes("coffee")){
    const c=state.coffee;stationEl("cup",c.cup?"selected":"",c.cup?"CUP READY":"GRAB CUP",0,onCupTap);let cp=0,cl="BREWER";if(c.state==="brewing"){cp=Math.min(100,(t-c.startedAt)/(c.readyAt-c.startedAt)*100);cl=`${Math.max(0,(c.readyAt-t)/1000).toFixed(1)}s`}else if(c.state==="ready"){cp=100;cl="COFFEE READY"}stationEl("coffee",c.state==="ready"?"ready":c.state,cl,cp,onCoffeeTap);
  }
  if(lvl.menu.includes("fries")){
    const f=state.fries;let fp=0,fl="FRYER";if(f.state==="frying"){fp=Math.min(100,(t-f.startedAt)/(f.readyAt-f.startedAt)*100);fl=`${Math.max(0,(f.readyAt-t)/1000).toFixed(1)}s`}else if(f.state==="ready"){fp=100;fl="PULL FRIES"}else if(f.state==="burned"){fp=100;fl="BURNED"}stationEl("fryer",f.state,fl,fp,onFryerTap);stationEl("salt",f.prep==="unsalted"?"selected":"","SALT",0,onSaltTap);
  }
  if(lvl.menu.includes("pancakes")){
    const p=state.pancakes;let pp=0,pl="GRIDDLE";if(p.state==="side1"||p.state==="side2"){pp=Math.min(100,(t-p.startedAt)/(p.readyAt-p.startedAt)*100);pl=`${Math.max(0,(p.readyAt-t)/1000).toFixed(1)}s`}else if(p.state==="flipReady"){pp=100;pl="FLIP!"}else if(p.state==="plateReady"){pp=100;pl="PLATE!"}else if(p.state==="burned"){pp=100;pl="BURNED"}stationEl("griddle",["flipReady","plateReady"].includes(p.state)?"ready":p.state,pl,pp,onGriddleTap);stationEl("syrup",p.prep==="plain"?"selected":"","SYRUP",0,onSyrupTap);
  }
}

function renderBurgerPrep(){
  if(!LEVELS[state.levelIndex].menu.includes("burger")){els.burgerPrepSlots.parentElement.classList.add("hidden");return}else els.burgerPrepSlots.parentElement.classList.remove("hidden");
  els.burgerPrepSlots.innerHTML="";state.burgerSlots.forEach((slot,i)=>{const btn=document.createElement("button"),complete=burgerComplete(slot);btn.className=`prep-slot ${state.selectedBurgerSlot===i?"selected":""} ${complete?"ready":""}`;btn.innerHTML=`<div class="prep-parts"><span>${slot.bun?"🥯":"▫️"}</span><span>${slot.lettuce?"🥬":"▫️"}</span><span>${slot.tomato?"🍅":"▫️"}</span><span>${slot.patty?"🥩":"▫️"}</span></div><span class="prep-step">PREP ${i+1}</span>${complete?'<span class="prep-go">TAP TO ASSEMBLE</span>':""}`;btn.addEventListener("click",()=>onBurgerSlotTap(i));els.burgerPrepSlots.appendChild(btn)})
}

function renderSidePrep(){
  const lvl=LEVELS[state.levelIndex],parts=[];
  if(lvl.menu.includes("fries")){const f=state.fries,label=f.prep==="salted"?"READY":f.prep==="unsalted"?"NEEDS SALT":"EMPTY",cls=f.prep==="salted"?"ready":f.prep==="unsalted"?"action":"";parts.push(`<button id="friesPrep" class="side-prep ${cls}"><strong>FRIES TRAY</strong><span class="big">${f.prep==="empty"?"▫️":"🍟"}</span>${label}</button>`)}
  if(lvl.menu.includes("pancakes")){const p=state.pancakes,label=p.prep==="syrup"?"READY":p.prep==="plain"?"ADD SYRUP":"EMPTY",cls=p.prep==="syrup"?"ready":p.prep==="plain"?"action":"";parts.push(`<button id="pancakePrep" class="side-prep ${cls}"><strong>PANCAKE PLATE</strong><span class="big">${p.prep==="empty"?"▫️":"🥞"}</span>${label}</button>`)}
  els.sidePrepArea.innerHTML=parts.join("");document.querySelector("#friesPrep")?.addEventListener("click",onFriesPrepTap);document.querySelector("#pancakePrep")?.addEventListener("click",onPancakePrepTap);
}

function renderPass(){if(!state.pass.length){els.passSlots.innerHTML='<span class="empty-pass">finished orders</span>';return}els.passSlots.innerHTML="";state.pass.forEach(item=>{const btn=document.createElement("button");btn.className="pass-item";btn.textContent=ITEMS[item.key].emoji;btn.addEventListener("click",()=>onPassItemTap(item.id));els.passSlots.appendChild(btn)})}
function renderCarry(){els.carrySlots.forEach((btn,i)=>{const item=state.carry[i];btn.textContent=item?ITEMS[item.key].emoji:"—";btn.classList.toggle("selected",state.selectedCarrySlot===i)})}
function renderWorkers(){els.server.style.left=`calc(${state.server.x}% - 26px)`;els.server.style.top=`calc(${state.server.y}% - 26px)`;els.cook.style.left=`calc(${state.cook.x}% - 26px)`;els.cook.style.top=`calc(${state.cook.y}% - 26px)`;els.server.classList.toggle("busy",state.server.busy);els.cook.classList.toggle("busy",state.cook.busy)}
function patienceColor(pct){if(pct>55)return"#5d9869";if(pct>27)return"#e2a53d";return"#b44136"}

els.carrySlots.forEach((btn,i)=>btn.addEventListener("click",()=>onCarryTap(i)));els.levelsButton.addEventListener("click",showLevels);els.restartButton.addEventListener("click",()=>{if(!state.running){startLevel(state.levelIndex);return}if(confirm("Restart this level?"))startLevel(state.levelIndex)});els.startButton.addEventListener("click",()=>{if(!state.running)startLevel(state.levelIndex)});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
render();showIntro();
})();
