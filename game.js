(() => {
"use strict";

const RECIPES = {
  burger:{name:"Burger",emoji:"🍔",price:18,cookMs:4800,holdMs:5600},
  coffee:{name:"Coffee",emoji:"☕",price:8,cookMs:2200,holdMs:null},
  fries:{name:"Fries",emoji:"🍟",price:12,cookMs:3900,holdMs:5000},
  pancakes:{name:"Pancakes",emoji:"🥞",price:15,cookMs:4300,holdMs:5200}
};

const LEVELS = [
  {name:"Soft Opening",goal:55,customers:4,tables:2,arrivalMs:7600,patience:74,menu:["burger"],maxItems:1},
  {name:"Coffee Run",goal:80,customers:5,tables:2,arrivalMs:7000,patience:72,menu:["burger","coffee"],maxItems:1},
  {name:"Lunch Starts",goal:115,customers:6,tables:2,arrivalMs:6400,patience:69,menu:["burger","coffee","fries"],maxItems:1},
  {name:"Third Table",goal:150,customers:7,tables:3,arrivalMs:5700,patience:66,menu:["burger","coffee","fries"],maxItems:2},
  {name:"All-Day Breakfast",goal:195,customers:8,tables:3,arrivalMs:5150,patience:62,menu:["burger","coffee","fries","pancakes"],maxItems:2},
  {name:"Dinner Rush",goal:245,customers:10,tables:3,arrivalMs:4600,patience:58,menu:["burger","coffee","fries","pancakes"],maxItems:2},
  {name:"Friday Night",goal:305,customers:11,tables:4,arrivalMs:4100,patience:54,menu:["burger","coffee","fries","pancakes"],maxItems:2},
  {name:"Full House",goal:375,customers:13,tables:4,arrivalMs:3600,patience:50,menu:["burger","coffee","fries","pancakes"],maxItems:3}
];

const TABLE_LAYOUTS = {
  2:[{x:34,y:25},{x:65,y:43}],
  3:[{x:33,y:23},{x:66,y:24},{x:51,y:48}],
  4:[{x:31,y:22},{x:66,y:22},{x:31,y:48},{x:66,y:48}]
};

const STATION_LAYOUT = {
  burger:{x:29,y:77},
  coffee:{x:43,y:88},
  fries:{x:58,y:77},
  pancakes:{x:73,y:88}
};

const NAMES = ["Maya","Theo","Nina","Jay","Lena","Omar","Riley","Sam","Ari","Tess","Miles","Zoe","Kai","Ivy","Noah","Mina"];
const AVATARS = ["👩🏽","👨🏻","👩🏾","🧔🏽","👩🏻","👨🏾","👩🏼","👨🏿","🧑🏽","👩🏿","👨🏼","🧑🏻"];

const els = {
  levelLabel:document.querySelector("#levelLabel"),
  cashLabel:document.querySelector("#cashLabel"),
  goalLabel:document.querySelector("#goalLabel"),
  waitingLine:document.querySelector("#waitingLine"),
  tablesLayer:document.querySelector("#tablesLayer"),
  stationsLayer:document.querySelector("#stationsLayer"),
  passSlots:document.querySelector("#passSlots"),
  carrySlots:[...document.querySelectorAll(".carry-slot")],
  server:document.querySelector("#server"),
  cook:document.querySelector("#cook"),
  serverBubble:document.querySelector("#serverBubble"),
  cookBubble:document.querySelector("#cookBubble"),
  toast:document.querySelector("#toast"),
  levelsButton:document.querySelector("#levelsButton"),
  restartButton:document.querySelector("#restartButton"),
  startButton:document.querySelector("#startButton"),
  modal:document.querySelector("#modal"),
  modalIcon:document.querySelector("#modalIcon"),
  modalTitle:document.querySelector("#modalTitle"),
  modalText:document.querySelector("#modalText"),
  modalDetails:document.querySelector("#modalDetails"),
  modalPrimary:document.querySelector("#modalPrimary"),
  modalSecondary:document.querySelector("#modalSecondary")
};

let save = loadSave();
let state = createState(Math.min((save.lastLevel||1)-1,LEVELS.length-1));
let raf=0;
let lastFrame=performance.now();
let toastTimer=0;
let audioContext=null;
let soundOn=save.soundOn!==false;

function loadSave(){
  try{return JSON.parse(localStorage.getItem("orderUpSaveV2")||"{}")}catch{return{}}
}
function persist(){
  localStorage.setItem("orderUpSaveV2",JSON.stringify(save));
}
function createState(levelIndex){
  const lvl=LEVELS[levelIndex];
  const layout=TABLE_LAYOUTS[lvl.tables];
  return {
    levelIndex,
    running:false,
    ended:false,
    cash:0,
    spawned:0,
    resolved:0,
    nextId:1,
    nextSpawnAt:0,
    selectedWaitingId:null,
    selectedCarrySlot:null,
    waiting:[],
    pass:[],
    carry:[null,null],
    server:{busy:false,x:31,y:52,token:0},
    cook:{busy:false,x:44,y:79,token:0},
    tables:layout.map((p,i)=>({
      id:i+1,x:p.x,y:p.y,state:"empty",customer:null,order:[],served:[],
      eatingUntil:0,cleaningUntil:0
    })),
    stations:Object.fromEntries(lvl.menu.map(key=>[
      key,{key,state:"idle",startedAt:0,readyAt:0,burnAt:0}
    ]))
  };
}

const clock=()=>performance.now();

function beep(freq=550,duration=.055){
  if(!soundOn)return;
  try{
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioContext.createOscillator();
    const gain=audioContext.createGain();
    osc.frequency.value=freq;
    gain.gain.value=.035;
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);
    osc.stop(audioContext.currentTime+duration);
  }catch{}
}

function toast(text,ms=1850){
  els.toast.textContent=text;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>els.toast.classList.remove("show"),ms);
}

function bubble(kind,text,ms=900){
  const el=kind==="server"?els.serverBubble:els.cookBubble;
  el.textContent=text;
  el.classList.remove("hidden");
  setTimeout(()=>el.classList.add("hidden"),ms);
}

function openModal(){els.modal.classList.add("open")}
function closeModal(){els.modal.classList.remove("open")}

function showIntro(){
  els.modalIcon.textContent="🍽️";
  els.modalTitle.textContent="Order Up!";
  els.modalText.textContent="Run the whole diner. Tap the restaurant itself to control the server and cook.";
  els.modalDetails.innerHTML=`
    <div class="instruction"><span>🚪</span><strong>Tap a waiting customer, then an empty table.</strong></div>
    <div class="instruction"><span>📝</span><strong>Tap the table to take the order.</strong></div>
    <div class="instruction"><span>🍳</span><strong>Tap kitchen stations to cook. Tap READY food to plate it.</strong></div>
    <div class="instruction"><span>🍽️</span><strong>Tap food on the pass to pick it up. Select it on the tray, then tap the table.</strong></div>
    <div class="instruction"><span>💵</span><strong>Tap for payment, then tap the dirty table to clean it.</strong></div>`;
  els.modalPrimary.textContent=`Play Level ${state.levelIndex+1}`;
  els.modalPrimary.onclick=()=>{closeModal();startLevel(state.levelIndex)};
  els.modalSecondary.classList.add("hidden");
  openModal();
}

function showLevels(){
  const unlocked=Math.max(1,save.unlocked||1);
  els.modalIcon.textContent="🧾";
  els.modalTitle.textContent="Choose a Shift";
  els.modalText.textContent="Unlocked levels and best ratings are saved on this phone.";
  els.modalDetails.innerHTML=LEVELS.map((lvl,i)=>{
    const n=i+1;
    const stars=save.bestStars?.[n]||0;
    const locked=n>unlocked;
    return `<button class="level-option" data-level="${i}" ${locked?"disabled":""}>
      <span><strong>${n}. ${lvl.name}</strong><br><small>${lvl.customers} customers • goal $${lvl.goal}</small></span>
      <span>${locked?"🔒":("⭐".repeat(stars)||"—")}</span>
    </button>`;
  }).join("");

  els.modalDetails.querySelectorAll("[data-level]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const i=Number(btn.dataset.level);
      state=createState(i);
      save.lastLevel=i+1;
      persist();
      render();
      closeModal();
      showIntro();
    });
  });

  els.modalPrimary.textContent="Close";
  els.modalPrimary.onclick=closeModal;
  els.modalSecondary.classList.add("hidden");
  openModal();
}

function startLevel(index){
  if(raf)cancelAnimationFrame(raf);
  state=createState(index);
  state.running=true;
  state.nextSpawnAt=clock()+700;
  save.lastLevel=index+1;
  persist();
  lastFrame=clock();
  render();
  toast("The diner is open. Customers are coming.");
  raf=requestAnimationFrame(loop);
}

function loop(t){
  if(!state.running)return;
  const dt=Math.min(.18,(t-lastFrame)/1000);
  lastFrame=t;
  const lvl=LEVELS[state.levelIndex];

  if(state.spawned<lvl.customers&&t>=state.nextSpawnAt){
    spawnCustomer();
    state.nextSpawnAt=t+lvl.arrivalMs;
  }

  updatePatience(dt);
  updateStations(t);
  updateTables(t);
  checkEnd();
  render();

  if(state.running)raf=requestAnimationFrame(loop);
}

function spawnCustomer(){
  const lvl=LEVELS[state.levelIndex];
  const id=state.nextId++;
  const c={
    id,
    name:NAMES[(id+state.levelIndex*2)%NAMES.length],
    avatar:AVATARS[(id*3+state.levelIndex)%AVATARS.length],
    patience:lvl.patience,
    maxPatience:lvl.patience
  };
  state.waiting.push(c);
  state.spawned++;
  beep(440);
  toast(`${c.name} walked in.`);
}

function updatePatience(dt){
  [...state.waiting].forEach(c=>{
    c.patience-=dt*.8;
    if(c.patience<=0){
      state.waiting=state.waiting.filter(x=>x.id!==c.id);
      if(state.selectedWaitingId===c.id)state.selectedWaitingId=null;
      state.resolved++;
      beep(170,.14);
      toast(`${c.name} left the line.`);
    }
  });

  state.tables.forEach(table=>{
    const c=table.customer;
    if(!c||!["seated","waitingFood"].includes(table.state))return;
    c.patience-=dt;

    if(c.patience<=0){
      table.customer=null;
      table.order=[];
      table.served=[];
      table.state="dirty";
      state.resolved++;
      beep(160,.15);
      toast(`Table ${table.id} walked out. Clean it.`);
    }
  });
}

function updateStations(t){
  Object.values(state.stations).forEach(station=>{
    if(station.state==="cooking"&&t>=station.readyAt){
      station.state="ready";
      beep(820);
      toast(`${RECIPES[station.key].name} is ready!`);
    }

    if(station.state==="ready"&&station.burnAt&&t>=station.burnAt){
      station.state="burned";
      beep(120,.2);
      toast(`${RECIPES[station.key].name} burned.`);
    }
  });
}

function updateTables(t){
  state.tables.forEach(table=>{
    if(table.state==="eating"&&t>=table.eatingUntil){
      table.state="checkout";
      beep(760);
      toast(`Table ${table.id} wants the check.`);
    }

    if(table.state==="cleaning"&&t>=table.cleaningUntil){
      resetTable(table);
      beep(630);
      toast(`Table ${table.id} is ready.`);
    }
  });
}

function resetTable(table){
  table.state="empty";
  table.customer=null;
  table.order=[];
  table.served=[];
  table.eatingUntil=0;
  table.cleaningUntil=0;
}

function chooseOrder(){
  const lvl=LEVELS[state.levelIndex];
  let count=1;

  if(lvl.maxItems>=2&&Math.random()>.48)count=2;
  if(lvl.maxItems>=3&&Math.random()>.82)count=3;

  const result=[];
  const pool=[...lvl.menu];

  while(result.length<count){
    const pick=pool[Math.floor(Math.random()*pool.length)];
    result.push(pick);

    if(pool.length>1&&Math.random()<.7){
      pool.splice(pool.indexOf(pick),1);
    }
  }

  return result;
}

function moveWorker(kind,x,y,label,callback,duration=430){
  const data=state[kind];

  if(data.busy){
    toast(`${kind==="server"?"Server":"Cook"} is busy.`);
    return false;
  }

  data.busy=true;
  data.token++;
  const token=data.token;
  data.x=x;
  data.y=y;

  const el=kind==="server"?els.server:els.cook;
  el.classList.add("busy");
  bubble(kind,label,Math.max(700,duration));
  renderWorkers();

  setTimeout(()=>{
    if(!state.running||data.token!==token)return;

    try{
      callback?.();
    }finally{
      data.busy=false;
      el.classList.remove("busy");
      render();
    }
  },duration);

  return true;
}

function onWaitingTap(id){
  if(!state.running)return;

  state.selectedWaitingId=state.selectedWaitingId===id?null:id;
  const c=state.waiting.find(x=>x.id===id);

  if(c&&state.selectedWaitingId){
    beep(530);
    toast(`${c.name} selected. Tap an empty table.`);
  }

  renderWaiting();
}

function onTableTap(id){
  if(!state.running)return;

  const table=state.tables.find(t=>t.id===id);
  if(!table)return;

  if(table.state==="empty"){
    if(!state.selectedWaitingId){
      toast("Select a customer waiting by the door first.");
      return;
    }

    const customer=state.waiting.find(c=>c.id===state.selectedWaitingId);
    if(!customer)return;

    moveWorker("server",table.x-4,table.y+7,"Seating",()=>{
      state.waiting=state.waiting.filter(c=>c.id!==customer.id);
      state.selectedWaitingId=null;
      table.customer=customer;
      table.state="seated";
      beep(610);
      toast(`${customer.name} is seated. Tap Table ${table.id} to take the order.`);
    },520);

    return;
  }

  if(table.state==="seated"){
    moveWorker("server",table.x-4,table.y+7,"Taking order",()=>{
      table.order=chooseOrder();
      table.served=table.order.map(()=>false);
      table.state="waitingFood";
      beep(670);
      toast(`Table ${table.id}: ${table.order.map(k=>RECIPES[k].emoji).join(" ")}. Send the cook!`);
    },520);

    return;
  }

  if(table.state==="waitingFood"){
    const slot=state.selectedCarrySlot;

    if(slot===null||!state.carry[slot]){
      toast("Select food on the server tray first.");
      return;
    }

    const item=state.carry[slot];
    const matchIndex=table.order.findIndex((key,i)=>key===item.key&&!table.served[i]);

    if(matchIndex<0){
      beep(180);
      toast(`Table ${table.id} didn't order that.`);
      return;
    }

    moveWorker("server",table.x-4,table.y+7,"Serving",()=>{
      table.served[matchIndex]=true;
      state.carry[slot]=null;
      state.selectedCarrySlot=null;
      beep(860);

      if(table.served.every(Boolean)){
        table.state="eating";
        table.eatingUntil=clock()+4100+Math.random()*1500;
        toast(`Table ${table.id} has everything. They're eating.`);
      }else{
        toast(`Table ${table.id} still needs ${remainingOrder(table)}.`);
      }
    },470);

    return;
  }

  if(table.state==="eating"){
    toast(`Table ${table.id} is eating.`);
    return;
  }

  if(table.state==="checkout"){
    moveWorker("server",table.x-4,table.y+7,"Payment",()=>{
      const base=table.order.reduce((sum,key)=>sum+RECIPES[key].price,0);
      const c=table.customer;
      const patienceRatio=c?Math.max(0,c.patience/c.maxPatience):0;
      const tip=Math.round(base*(.08+patienceRatio*.30));

      state.cash+=base+tip;
      state.resolved++;
      table.customer=null;
      table.state="dirty";
      beep(980);
      toast(`+$${base+tip}. Table ${table.id} needs cleaning.`);
    },500);

    return;
  }

  if(table.state==="dirty"){
    moveWorker("server",table.x-4,table.y+7,"Cleaning",()=>{
      table.state="cleaning";
      table.cleaningUntil=clock()+1400;
      beep(520);
    },480);

    return;
  }

  if(table.state==="cleaning"){
    toast("Still cleaning that table.");
  }
}

function remainingOrder(table){
  return table.order
    .filter((_,i)=>!table.served[i])
    .map(k=>RECIPES[k].emoji)
    .join(" ");
}

function onStationTap(key){
  if(!state.running)return;

  const station=state.stations[key];
  const recipe=RECIPES[key];
  const pos=STATION_LAYOUT[key];

  if(!station)return;

  if(station.state==="idle"){
    moveWorker("cook",pos.x-2,pos.y+1,`Start ${recipe.name}`,()=>{
      station.state="cooking";
      station.startedAt=clock();
      station.readyAt=station.startedAt+recipe.cookMs;
      station.burnAt=recipe.holdMs?station.readyAt+recipe.holdMs:0;
      beep(520);
      toast(`${recipe.name} cooking.`);
    },430);

    return;
  }

  if(station.state==="cooking"){
    toast(`${recipe.name} is still cooking.`);
    return;
  }

  if(station.state==="ready"){
    moveWorker("cook",pos.x-2,pos.y+1,"Plate food",()=>{
      state.pass.push({
        id:`${key}-${Date.now()}-${Math.random()}`,
        key
      });

      station.state="idle";
      station.startedAt=0;
      station.readyAt=0;
      station.burnAt=0;

      beep(900);
      toast(`${recipe.name} is on the pass.`);
    },380);

    return;
  }

  if(station.state==="burned"){
    moveWorker("cook",pos.x-2,pos.y+1,"Toss burned food",()=>{
      station.state="idle";
      station.startedAt=0;
      station.readyAt=0;
      station.burnAt=0;
      beep(210);
      toast(`Burned ${recipe.name} tossed.`);
    },350);
  }
}

function onPassItemTap(id){
  if(!state.running)return;

  const emptySlot=state.carry.findIndex(x=>x===null);

  if(emptySlot<0){
    toast("Server tray is full.");
    return;
  }

  const index=state.pass.findIndex(item=>item.id===id);
  if(index<0)return;

  const item=state.pass[index];

  moveWorker("server",73,64,"Picking up",()=>{
    state.pass.splice(index,1);
    state.carry[emptySlot]=item;
    state.selectedCarrySlot=emptySlot;
    beep(810);
    toast(`${RECIPES[item.key].name} is on the server tray.`);
  },500);
}

function onCarryTap(slot){
  if(!state.running)return;

  if(!state.carry[slot]){
    state.selectedCarrySlot=null;
    renderCarry();
    return;
  }

  state.selectedCarrySlot=state.selectedCarrySlot===slot?null:slot;
  const item=state.carry[slot];

  if(state.selectedCarrySlot!==null&&item){
    toast(`${RECIPES[item.key].name} selected. Tap the right table.`);
  }

  renderCarry();
}

function checkEnd(){
  if(state.ended||!state.running)return;

  const lvl=LEVELS[state.levelIndex];
  const allSpawned=state.spawned>=lvl.customers;
  const noWaiting=state.waiting.length===0;
  const noActiveCustomers=state.tables.every(t=>!t.customer);

  if(allSpawned&&state.resolved>=lvl.customers&&noWaiting&&noActiveCustomers){
    endLevel();
  }
}

function endLevel(){
  state.running=false;
  state.ended=true;

  const lvl=LEVELS[state.levelIndex];
  const ratio=state.cash/lvl.goal;
  const won=state.cash>=lvl.goal;

  let stars=0;
  if(won)stars=ratio>=1.42?3:ratio>=1.18?2:1;

  if(won){
    const n=state.levelIndex+1;
    save.unlocked=Math.max(save.unlocked||1,Math.min(LEVELS.length,n+1));
    save.bestStars||={};
    save.bestStars[n]=Math.max(save.bestStars[n]||0,stars);
    persist();
  }

  els.modalIcon.textContent=won?"🎉":"😵";
  els.modalTitle.textContent=won?"Shift Complete!":"Diner Disaster";
  els.modalText.textContent=won
    ?`You made $${state.cash} on a $${lvl.goal} goal. ${"⭐".repeat(stars)}`
    :`You made $${state.cash}. You needed $${lvl.goal}.`;

  els.modalDetails.innerHTML=`
    <div class="instruction"><span>💵</span><strong>Cash: $${state.cash}</strong></div>
    <div class="instruction"><span>👥</span><strong>Customers resolved: ${state.resolved}/${lvl.customers}</strong></div>
    <div class="instruction"><span>🏆</span><strong>Best: ${"⭐".repeat(save.bestStars?.[state.levelIndex+1]||0)||"—"}</strong></div>`;

  if(won&&state.levelIndex<LEVELS.length-1){
    els.modalPrimary.textContent=`Play Level ${state.levelIndex+2}`;
    els.modalPrimary.onclick=()=>{closeModal();startLevel(state.levelIndex+1)};
  }else{
    els.modalPrimary.textContent="Retry";
    els.modalPrimary.onclick=()=>{closeModal();startLevel(state.levelIndex)};
  }

  els.modalSecondary.textContent="Levels";
  els.modalSecondary.classList.remove("hidden");
  els.modalSecondary.onclick=showLevels;
  openModal();
}

function render(){
  const lvl=LEVELS[state.levelIndex];

  els.levelLabel.textContent=`Level ${state.levelIndex+1}: ${lvl.name}`;
  els.cashLabel.textContent=`$${state.cash}`;
  els.goalLabel.textContent=`$${state.cash} / $${lvl.goal}`;
  els.startButton.textContent=state.running?"Running":"Start Shift";

  renderWaiting();
  renderTables();
  renderStations();
  renderPass();
  renderCarry();
  renderWorkers();
}

function renderWaiting(){
  els.waitingLine.innerHTML="";

  state.waiting.forEach((c,i)=>{
    const btn=document.createElement("button");

    btn.className=`waiting-customer ${state.selectedWaitingId===c.id?"selected":""}`;
    btn.style.left=`${(i%2)*44}%`;
    btn.style.top=`${Math.floor(i/2)*28}%`;

    const pct=Math.max(0,c.patience/c.maxPatience*100);

    btn.innerHTML=`
      <span class="person">${c.avatar}</span>
      <span class="customer-name-tag">${c.name}</span>
      <span class="mini-patience">
        <span style="width:${pct}%;background:${patienceColor(pct)}"></span>
      </span>`;

    btn.addEventListener("click",()=>onWaitingTap(c.id));
    els.waitingLine.appendChild(btn);
  });
}

function renderTables(){
  els.tablesLayer.innerHTML="";

  state.tables.forEach(table=>{
    const btn=document.createElement("button");

    btn.className=
      `table ${["seated","waitingFood","checkout","dirty"].includes(table.state)?"action":""} `+
      `${["dirty","cleaning"].includes(table.state)?"dirty":""}`;

    btn.style.left=`calc(${table.x}% - 43px)`;
    btn.style.top=`calc(${table.y}% - 35px)`;

    btn.addEventListener("click",()=>onTableTap(table.id));

    let customer="";
    let bubbleText="";
    let patience="";

    if(table.customer){
      customer=`<div class="seated-customer">${table.customer.avatar}</div>`;
      const pct=Math.max(0,table.customer.patience/table.customer.maxPatience*100);

      patience=`
        <div class="table-patience">
          <span style="width:${pct}%;background:${patienceColor(pct)}"></span>
        </div>`;
    }

    if(table.state==="seated")bubbleText="📝 ORDER";
    if(table.state==="waitingFood")bubbleText=remainingOrder(table);
    if(table.state==="eating")bubbleText="😋 eating";
    if(table.state==="checkout")bubbleText="💵 CHECK";
    if(table.state==="dirty")bubbleText="🧽 CLEAN";
    if(table.state==="cleaning")bubbleText="✨ wiping";

    const bubbleHtml=bubbleText?`<div class="table-bubble">${bubbleText}</div>`:"";

    btn.innerHTML=`
      ${bubbleHtml}
      <div class="chair chair-a"></div>
      <div class="chair chair-b"></div>
      <div class="tabletop"></div>
      ${customer}
      <div class="table-number">${table.id}</div>
      ${patience}`;

    els.tablesLayer.appendChild(btn);
  });
}

function renderStations(){
  const t=clock();
  els.stationsLayer.innerHTML="";

  Object.values(state.stations).forEach(station=>{
    const recipe=RECIPES[station.key];
    const pos=STATION_LAYOUT[station.key];
    const btn=document.createElement("button");

    btn.className=`station ${station.state}`;
    btn.style.left=`calc(${pos.x}% - 34px)`;
    btn.style.top=`calc(${pos.y}% - 31px)`;

    btn.addEventListener("click",()=>onStationTap(station.key));

    let pct=0;
    let label=recipe.name.toUpperCase();

    if(station.state==="cooking"){
      pct=Math.min(
        100,
        (t-station.startedAt)/(station.readyAt-station.startedAt)*100
      );

      label=`${Math.max(0,(station.readyAt-t)/1000).toFixed(1)}s`;
    }else if(station.state==="ready"){
      pct=100;
      label="READY!";
    }else if(station.state==="burned"){
      pct=100;
      label="BURNED";
    }

    btn.innerHTML=`
      <div class="station-timer">
        <span style="width:${pct}%"></span>
      </div>
      <div class="station-box"></div>
      <div class="station-icon">${recipe.emoji}</div>
      <div class="station-name">${label}</div>`;

    els.stationsLayer.appendChild(btn);
  });
}

function renderPass(){
  if(!state.pass.length){
    els.passSlots.innerHTML='<span class="empty-pass">finished food goes here</span>';
    return;
  }

  els.passSlots.innerHTML="";

  state.pass.forEach(item=>{
    const btn=document.createElement("button");
    btn.className="pass-item";
    btn.textContent=RECIPES[item.key].emoji;
    btn.addEventListener("click",()=>onPassItemTap(item.id));
    els.passSlots.appendChild(btn);
  });
}

function renderCarry(){
  els.carrySlots.forEach((btn,i)=>{
    const item=state.carry[i];

    btn.textContent=item?RECIPES[item.key].emoji:"—";
    btn.classList.toggle("selected",state.selectedCarrySlot===i);
  });
}

function renderWorkers(){
  els.server.style.left=`calc(${state.server.x}% - 28px)`;
  els.server.style.top=`calc(${state.server.y}% - 28px)`;

  els.cook.style.left=`calc(${state.cook.x}% - 28px)`;
  els.cook.style.top=`calc(${state.cook.y}% - 28px)`;

  els.server.classList.toggle("busy",state.server.busy);
  els.cook.classList.toggle("busy",state.cook.busy);
}

function patienceColor(pct){
  if(pct>55)return"#5d9869";
  if(pct>27)return"#e2a53d";
  return"#b44136";
}

els.carrySlots.forEach((btn,i)=>{
  btn.addEventListener("click",()=>onCarryTap(i));
});

els.levelsButton.addEventListener("click",showLevels);

els.restartButton.addEventListener("click",()=>{
  if(!state.running){
    startLevel(state.levelIndex);
    return;
  }

  if(confirm("Restart this level?")){
    startLevel(state.levelIndex);
  }
});

els.startButton.addEventListener("click",()=>{
  if(!state.running)startLevel(state.levelIndex);
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

render();
showIntro();
})();
