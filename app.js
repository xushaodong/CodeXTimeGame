const MAP_SIZE = 5;
const INITIAL_TIME = 3600;

const areaPool = [
  { name: '生锈图书馆', desc: '知识是有代价的，且往往无用。', mult: 1.0 },
  { name: '电磁沼泽', desc: '维护动作是生存的隐形支出。', mult: 1.15 },
  { name: '无名墓地', desc: '贪婪是最高风险的赌博。', mult: 1.25 },
  { name: '十字路口', desc: '规则的等待耗尽你仅存的意志。', mult: 1.0 },
  { name: '高热工厂', desc: '不冷切核心，你会被错误指令吞噬。', mult: 1.3 },
  { name: '裂隙平原', desc: '风像旧钟摆一样来回切割你的神经。', mult: 0.95 },
  { name: '蒸汽下水道', desc: '迷雾循环常在这里把人困到死亡。', mult: 1.2 },
  { name: '废弃传送阵', desc: '盲目传送可能救命，也可能埋葬你。', mult: 1.0 },
  { name: '天文台残骸', desc: '仍有人在此试图拨正世界时差。', mult: 1.05 },
];

const actionSets = {
  位移: [
    { name: '平原潜行', cost: 300, text: '稳定移动，极低概率发现隐蔽遗物。', fn: moveStealth },
    { name: '乱石翻越', cost: 1200, text: '20%概率齿轮卡死30秒。', fn: moveRocks },
    { name: '极限奔袭', cost: 600, text: '跨越2格，永久扣除最大时间1%。', fn: moveDash },
    { name: '盲目传送', cost: 1800, text: '随机传送到任一坐标。', fn: moveTeleport },
  ],
  维护: [
    { name: '发条润滑', cost: 450, text: '移除生锈，不增加寿命。', fn: lubricate },
    { name: '逻辑重组', cost: 600, text: '下三次探索落空概率-50%。', fn: logicBoost },
    { name: '核心冷切', cost: 300, text: '防止高热区数据溢出。', fn: coreCool },
  ],
  探索: [
    { name: '废墟挖掘', cost: 600, text: '30%得遗物，50%落空，20%陷阱。', fn: ruinsDig },
    { name: '精密拆解', cost: 1500, text: '成功+2h，失败进入漏时。', fn: preciseDismantle },
    { name: '挖掘坟墓', cost: 1800, text: '10%暴利，90%诅咒。', fn: graveDig },
  ],
  交互: [
    { name: '拨动日晷', cost: 900, text: '强制修改当前区域流速。', fn: tweakSundial },
    { name: '释放诱饵', cost: 200, text: '降低下一格遭遇野兽概率。', fn: releaseBait },
    { name: '校准指南针', cost: 300, text: '修复导航混乱状态。', fn: calibrateCompass },
  ],
};

let loopId = null;

const state = {
  time: INITIAL_TIME,
  maxTime: INITIAL_TIME,
  areaMultiplier: 1,
  flowModifier: 1,
  pos: { x: 2, y: 2 },
  tab: '位移',
  statuses: new Set(),
  inventory: ['生锈的手表(+1800s)'],
  logs: [],
  map: [],
  searchBuff: 0,
  bait: false,
  forcedFreeze: 0,
  combat: null,
};

const el = {
  timeDisplay: document.getElementById('timeDisplay'),
  flowDisplay: document.getElementById('flowDisplay'),
  map: document.getElementById('map'),
  areaName: document.getElementById('areaName'),
  areaDesc: document.getElementById('areaDesc'),
  areaFlow: document.getElementById('areaFlow'),
  tabs: document.getElementById('tabs'),
  actions: document.getElementById('actions'),
  statusList: document.getElementById('statusList'),
  inventory: document.getElementById('inventory'),
  log: document.getElementById('log'),
  appRoot: document.getElementById('appRoot'),
  waitButton: document.getElementById('waitButton'),
  echoButton: document.getElementById('echoButton'),
  echoResult: document.getElementById('echoResult'),
  combatBox: document.getElementById('combatBox'),
  combatText: document.getElementById('combatText'),
};

function init() {
  generateMap();
  renderTabs();
  renderActions();
  renderMap();
  renderStatus();
  renderInventory();
  addLog('系统上线：Time = 3600。欢迎来到格林威治裂隙。');

  el.waitButton.addEventListener('click', () => forceDeduct(120, '你在十字路口等待无意义的信号灯。'));
  el.echoButton.addEventListener('click', observeEcho);

  document.querySelectorAll('[data-combat]').forEach((btn) => {
    btn.addEventListener('click', () => resolveCombat(btn.dataset.combat));
  });

  loopId = setInterval(gameTick, 1000);
}

function gameTick() {
  if (state.time <= 0) return gameOver();

  let decay = 1 * state.areaMultiplier * state.flowModifier;
  if (state.statuses.has('漏时')) decay += 2;

  if (state.forcedFreeze > 0) {
    state.forcedFreeze -= 1;
    addLog('系统强检中...你无法行动，只能看着秒针坠落。');
  }

  if (state.combat?.mode === 'brawl') {
    state.time -= 10;
    state.combat.timer -= 1;
    if (state.combat.timer <= 0) {
      endCombat('你侥幸挣脱，但机体留下大片刮痕。');
    }
  }

  state.time -= decay;

  if (Math.random() < 0.03) {
    triggerSystemCheck();
  }

  renderAll();
  if (state.time <= 0) gameOver();
}

function generateMap() {
  state.map = Array.from({ length: MAP_SIZE * MAP_SIZE }, () => areaPool[Math.floor(Math.random() * areaPool.length)]);
  setAreaByPos();
}

function setAreaByPos() {
  const index = state.pos.y * MAP_SIZE + state.pos.x;
  const area = state.map[index];
  state.areaMultiplier = area.mult;
  el.areaName.textContent = area.name;
  el.areaDesc.textContent = area.desc;
  el.areaFlow.textContent = `x${area.mult.toFixed(2)}`;
}

function renderMap() {
  el.map.innerHTML = '';
  state.map.forEach((area, index) => {
    const x = index % MAP_SIZE;
    const y = Math.floor(index / MAP_SIZE);
    const cell = document.createElement('button');
    cell.className = 'cell';
    if (x === state.pos.x && y === state.pos.y) cell.classList.add('active');
    cell.textContent = area.name.slice(0, 4);
    cell.addEventListener('click', () => attemptMove(x, y));
    el.map.appendChild(cell);
  });
}

function renderTabs() {
  el.tabs.innerHTML = '';
  Object.keys(actionSets).forEach((name) => {
    const tab = document.createElement('button');
    tab.className = `tab ${state.tab === name ? 'active' : ''}`;
    tab.textContent = name;
    tab.addEventListener('click', () => {
      state.tab = name;
      renderTabs();
      renderActions();
    });
    el.tabs.appendChild(tab);
  });
}

function renderActions() {
  el.actions.innerHTML = '';
  actionSets[state.tab].forEach((act) => {
    const card = document.createElement('article');
    card.className = 'action-card';
    card.innerHTML = `<h3>${act.name}（${act.cost}s）</h3><p>${act.text}</p>`;
    const btn = document.createElement('button');
    btn.textContent = '执行指令';
    btn.disabled = state.forcedFreeze > 0 || Boolean(state.combat);
    btn.addEventListener('click', () => runAction(act));
    card.appendChild(btn);
    el.actions.appendChild(card);
  });
}

function runAction(action) {
  if (!spendTime(action.cost)) return;
  action.fn();
  randomNegativeFeedback();
  renderAll();
}

function spendTime(sec) {
  if (state.time <= sec) {
    addLog('寿命不足，指令拒绝执行。');
    return false;
  }
  state.time -= sec;
  return true;
}

function forceDeduct(sec, text) {
  state.time -= sec;
  addLog(text);
  renderAll();
}

function attemptMove(x, y) {
  if (state.forcedFreeze > 0 || state.combat) return;
  const dist = Math.abs(x - state.pos.x) + Math.abs(y - state.pos.y);
  if (dist !== 1) return addLog('移动失败：仅能点击相邻格位。');

  let cost = 300;
  if (state.statuses.has('生锈')) cost *= 1.2;
  if (state.statuses.has('负重')) cost *= 1.3;

  if (Math.random() < 0.3 && currentArea().name === '蒸汽下水道') {
    return forceDeduct(300, '迷雾循环触发：你原地打转。');
  }

  if (!spendTime(Math.floor(cost))) return;

  state.pos = { x, y };
  setAreaByPos();
  addLog(`你移动到了【${currentArea().name}】。`);

  if (Math.random() < (state.bait ? 0.08 : 0.22)) startCombat();
  state.bait = false;
  renderAll();
}

function currentArea() {
  return state.map[state.pos.y * MAP_SIZE + state.pos.x];
}

function randomNegativeFeedback() {
  if (Math.random() < 0.15) {
    forceDeduct(1200, '虚假信号：你追逐光斑，最终只摸到冰冷墙面。');
  }
}

function triggerSystemCheck() {
  state.forcedFreeze = 6;
  addLog('系统强检触发：强制固件更新60秒。');
}

function startCombat() {
  state.combat = { mode: null, timer: 0 };
  el.combatBox.classList.remove('hidden');
  el.combatText.textContent = '时钟野兽从齿隙中探出头颅，它在吞咽你的未来。';
  addLog('遭遇时钟野兽！立刻做出抉择。');
}

function resolveCombat(type) {
  if (!state.combat) return;

  if (type === 'overload') {
    if (!spendTime(500)) return;
    const gain = Math.floor(Math.random() * 1200) + 300;
    state.time += gain;
    addItem(`提取发条(+${gain}s)`);
    endCombat('瞬时过载成功，你撕下了野兽残余发条。');
  }

  if (type === 'lure') {
    if (!spendTime(200)) return;
    endCombat('你投掷诱导信号，野兽偏离轨迹。');
  }

  if (type === 'brawl') {
    state.combat.mode = 'brawl';
    state.combat.timer = Math.floor(Math.random() * 6) + 4;
    addLog('你选择肉搏缠斗，现实每秒都在抽走你的寿命。');
  }

  renderAll();
}

function endCombat(text) {
  state.combat = null;
  el.combatBox.classList.add('hidden');
  addLog(text);
}

function addItem(item) {
  state.inventory.push(item);
  if (item.includes('闰秒芯片')) {
    state.flowModifier = Math.max(0.6, state.flowModifier - 0.01);
  }
}

function observeEcho() {
  if (!spendTime(100)) return;
  const tips = [
    '残影显示：上一个人执行了【废墟挖掘】，成功率30%。',
    '残影显示：有人在此等待信号灯，最后死于系统强检。',
    '残影显示：前任玩家选择了盲目传送，落入高热工厂。',
  ];
  const msg = tips[Math.floor(Math.random() * tips.length)];
  el.echoResult.textContent = msg;
  addLog(`你窥见了一段残影：${msg}`);
  renderAll();
}

function moveStealth() {
  const nx = clamp(state.pos.x + randDir(), 0, MAP_SIZE - 1);
  const ny = clamp(state.pos.y + randDir(), 0, MAP_SIZE - 1);
  state.pos = { x: nx, y: ny };
  setAreaByPos();
  if (Math.random() < 0.06) {
    addItem('精密陀螺仪(+3h)');
    state.time += 10800;
    addLog('潜行时发现隐蔽遗物：精密陀螺仪。');
  }
}

function moveRocks() {
  jitterMove(1);
  if (Math.random() < 0.2) {
    state.forcedFreeze = 3;
    addLog('齿轮卡死：30秒内无法移动。');
  }
}

function moveDash() {
  jitterMove(2);
  state.maxTime *= 0.99;
  if (state.time > state.maxTime) state.time = state.maxTime;
  addLog('极限奔袭完成：你的寿命上限永久下降1%。');
}

function moveTeleport() {
  state.pos = { x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE) };
  setAreaByPos();
  addLog(`盲目传送结束，你坠入【${currentArea().name}】。`);
}

function lubricate() {
  state.statuses.delete('生锈');
  addLog('发条润滑完成：生锈状态已移除。');
}

function logicBoost() {
  state.searchBuff = 3;
  addLog('逻辑重组完成：下三次探索落空概率降低50%。');
}

function coreCool() {
  state.statuses.delete('过热');
  addLog('核心冷切执行：数据溢出风险降低。');
}

function ruinsDig() {
  let roll = Math.random();
  if (state.searchBuff > 0) {
    roll *= 0.75;
    state.searchBuff -= 1;
  }

  if (roll < 0.3) {
    const loot = Math.random() < 0.1 ? '闰秒芯片' : '生锈的手表';
    if (loot === '闰秒芯片') {
      addItem('闰秒芯片(全局流速永久-0.01)');
      addLog('你在灰烬下找到了闰秒芯片，世界稍微慢了一点。');
    } else {
      addItem('生锈的手表(+1800s)');
      state.time += 1800;
      addLog('你找到生锈手表，勉强续命30分钟。');
    }
  } else if (roll < 0.8) {
    addLog('你翻开沉重石板，下面只有冰冷灰尘。');
  } else {
    forceDeduct(900, '陷阱触发：碎刃切开了你的机体外壳。');
    state.statuses.add('漏时');
  }
}

function preciseDismantle() {
  if (Math.random() < 0.45) {
    addItem('高纯度发条核心(+2h)');
    state.time += 7200;
    addLog('精密拆解成功：你提取了高纯度发条核心。');
  } else {
    state.statuses.add('漏时');
    addLog('精密拆解失败：你进入漏时状态。');
  }
}

function graveDig() {
  if (Math.random() < 0.1) {
    state.time += 18000;
    addLog('墓穴深处藏着巨量时间：+5小时。');
  } else {
    state.flowModifier *= 2;
    addLog('诅咒降临：全局流速翻倍。');
  }
}

function tweakSundial() {
  const factor = [0.8, 0.9, 1.1, 1.2][Math.floor(Math.random() * 4)];
  state.areaMultiplier = Number((state.areaMultiplier * factor).toFixed(2));
  addLog(`你拨动日晷，当前区域流速被改写为 x${state.areaMultiplier.toFixed(2)}。`);
}

function releaseBait() {
  state.bait = true;
  addLog('诱饵已释放：下一格遭遇野兽概率显著下降。');
}

function calibrateCompass() {
  state.statuses.delete('导航混乱');
  addLog('指南针恢复校准。');
}

function renderStatus() {
  const narrative = state.time > 43200
    ? '全盛：你可以精准拆解每一个零件。'
    : state.time < 600
      ? '衰老：你的手指不再听使唤，世界在震颤。'
      : '常态：你在崩溃边缘维持秩序。';

  const statuses = Array.from(state.statuses);
  if (!statuses.length) statuses.push('无异常状态');

  el.statusList.innerHTML = `<li>叙事阶段：${narrative}</li><li>最大寿命上限：${Math.floor(state.maxTime)}s</li>${statuses
    .map((s) => `<li>${s}</li>`)
    .join('')}`;
}

function renderInventory() {
  el.inventory.innerHTML = state.inventory.slice(-6).map((item) => `<li>${item}</li>`).join('');
}

function addLog(text) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  state.logs.unshift(`[${stamp}] ${text}`);
  state.logs = state.logs.slice(0, 50);
  el.log.innerHTML = state.logs.map((line) => `<div class="log-item">${line}</div>`).join('');
}

function renderAll() {
  if (state.time < 600) {
    el.appRoot.classList.add('low-time');
  } else {
    el.appRoot.classList.remove('low-time');
  }

  el.timeDisplay.textContent = formatTime(Math.max(0, Math.floor(state.time)));
  el.flowDisplay.textContent = `流速 x${(state.areaMultiplier * state.flowModifier).toFixed(2)}`;
  renderMap();
  renderActions();
  renderStatus();
  renderInventory();
}

function gameOver() {
  addLog('你停止了。骸骨上刻着：时间不属于盗贼。');
  alert('游戏结束：时间归零。');
  if (loopId) clearInterval(loopId);
}

function formatTime(total) {
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function randDir() {
  return [-1, 0, 1][Math.floor(Math.random() * 3)];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function jitterMove(range) {
  const nx = clamp(state.pos.x + randDir() * range, 0, MAP_SIZE - 1);
  const ny = clamp(state.pos.y + randDir() * range, 0, MAP_SIZE - 1);
  state.pos = { x: nx, y: ny };
  setAreaByPos();
}

init();
