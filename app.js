const CONFIG = {
  actions: {
    move: [
      { id: 'm1', name: '平原潜行', cost: 300, desc: '平稳推进，极低概率拾取隐蔽遗物。', type: 'move' },
      { id: 'm2', name: '乱石翻越', cost: 1200, desc: '高消耗。20% 概率造成齿轮卡死。', type: 'move' },
      { id: 'm3', name: '极限奔袭', cost: 600, desc: '跨越两层区域，永久扣除1%最大寿命。', type: 'move' },
      { id: 'm4', name: '盲目传送', cost: 1800, desc: '随机落点，可能直接坠入高危区。', type: 'move' },
    ],
    maintain: [
      { id: 'mt1', name: '发条润滑', cost: 450, desc: '不给时间，仅移除[生锈]。', type: 'maintain' },
      { id: 'mt2', name: '逻辑重组', cost: 600, desc: '不给时间，探索落空率降低。', type: 'maintain' },
      { id: 'mt3', name: '核心冷切', cost: 300, desc: '不给时间，防止高热溢出误指令。', type: 'maintain' },
    ],
    explore: [
      { id: 'e1', name: '废墟挖掘', cost: 600, desc: '30%遗物 / 50%落空 / 20%陷阱。', type: 'explore' },
      { id: 'e2', name: '精密拆解', cost: 1500, desc: '成功 +2h，失败进入漏时。', type: 'explore' },
      { id: 'e3', name: '拨动日晷', cost: 900, desc: '改写当前区域流速。', type: 'explore' },
    ],
    combat: [
      { id: 'c1', name: '瞬时过载', cost: 500, desc: '强杀目标，提取发条收益。', type: 'combat' },
      { id: 'c2', name: '诱导转向', cost: 200, desc: '小额耗时，避战无收益。', type: 'combat' },
      { id: 'c3', name: '肉搏缠斗', cost: 0, desc: '每秒额外扣10秒，直到随机结束。', type: 'combat' },
    ],
  },
  areaFlow: [0.95, 1, 1.05, 1.15, 1.25, 1.3],
  events: [
    {
      name: '虚假信号',
      chance: 0.1,
      msg: '你耗费巨额时间赶往信号源，发现只是光线折射。',
      effect: () => GameState.modifyTime(-1200),
    },
    {
      name: '迷雾循环',
      chance: 0.08,
      msg: '你在迷雾中绕回原地，徒增损耗。',
      effect: () => GameState.modifyTime(-300),
    },
    {
      name: '系统强检',
      chance: 0.05,
      msg: '强制固件更新，行动指令被封禁。',
      effect: () => GameUI.lockSystem(6000),
    },
  ],
};

const GameState = {
  time: 3600,
  maxTime: 3600,
  location: '格林威治 0 号',
  flow: 1,
  debuffs: new Set(),
  buffs: { logicReorg: 0, bait: 0 },
  isDead: false,
  locked: false,
  brawlTicker: null,
  loopTicker: null,

  init() {
    this.loopTicker = setInterval(() => {
      if (this.isDead) return;

      const decay = 1 * this.flow + (this.debuffs.has('漏时') ? 2 : 0);
      this.time -= decay;

      if (this.time <= 0) {
        this.die();
      }

      GameUI.update();
    }, 1000);
  },

  spend(cost, actionName) {
    if (this.locked || this.isDead) return false;
    if (this.time <= cost) {
      GameUI.addLog(`执行[${actionName}]失败：可用寿命不足。`, 'loss');
      return false;
    }
    this.time -= cost;
    return true;
  },

  modifyTime(amount) {
    this.time += amount;
    if (this.time > this.maxTime) this.time = this.maxTime;
    if (amount > 0) {
      GameUI.addLog(`获得时间补给：+${amount}s`, 'reward');
    } else {
      GameUI.addLog(`时间意外损耗：${amount}s`, 'loss');
    }
  },

  die() {
    this.time = 0;
    this.isDead = true;
    if (this.loopTicker) clearInterval(this.loopTicker);
    if (this.brawlTicker) clearInterval(this.brawlTicker);
    GameUI.addLog('齿轮完全停滞。你成为了荒原上的一具新骸骨。', 'loss');
    document.getElementById('app').classList.add('glitch');
  },
};

const GameUI = {
  currentTab: 'move',

  init() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    this.renderActions();
    this.update();
  },

  update() {
    const timerEl = document.getElementById('ui-timer');
    const flowEl = document.getElementById('ui-multiplier');

    timerEl.textContent = this.formatTime(Math.max(0, Math.floor(GameState.time)));
    flowEl.textContent = `FLOW: ${GameState.flow.toFixed(2)}x`;

    if (GameState.time < 600) {
      timerEl.style.color = 'var(--color-danger)';
      timerEl.classList.add('glitch');
    } else {
      timerEl.style.color = 'var(--color-primary)';
      timerEl.classList.remove('glitch');
    }

    this.renderTags();
  },

  renderTags() {
    const debuffEl = document.getElementById('ui-debuffs');
    debuffEl.innerHTML = '';

    if (GameState.debuffs.size === 0) {
      debuffEl.innerHTML = '<span class="tag tag-ok">状态稳定</span>';
    } else {
      GameState.debuffs.forEach((d) => {
        debuffEl.innerHTML += `<span class="tag tag-danger">${d}</span>`;
      });
    }

    if (GameState.buffs.logicReorg > 0) {
      debuffEl.innerHTML += `<span class="tag tag-info">逻辑优化 x${GameState.buffs.logicReorg}</span>`;
    }
    if (GameState.buffs.bait > 0) {
      debuffEl.innerHTML += '<span class="tag tag-info">诱饵生效</span>';
    }
  },

  formatTime(s) {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  },

  addLog(text, type = 'normal') {
    const container = document.getElementById('log-container');
    document.querySelectorAll('.log-current').forEach((el) => el.classList.remove('log-current'));

    const div = document.createElement('div');
    div.className = `log log-current log-${type}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.renderActions();
  },

  renderActions() {
    const grid = document.getElementById('action-grid');
    grid.innerHTML = '';

    CONFIG.actions[this.currentTab].forEach((act) => {
      const card = document.createElement('button');
      card.className = 'action-card';
      card.innerHTML = `
        <div class="action-name">${act.name}</div>
        <div class="action-cost">-${act.cost}s</div>
        <div class="action-desc">${act.desc}</div>
      `;
      card.addEventListener('click', () => this.handleAction(act));
      grid.appendChild(card);
    });
  },

  handleAction(act) {
    if (!GameState.spend(act.cost, act.name)) return;

    this.addLog(`执行[${act.name}]，消耗${act.cost}秒...`, 'sys');

    setTimeout(() => {
      this.processActionLogic(act);
      this.checkRandomEvents();
      this.update();
    }, 350);
  },

  processActionLogic(act) {
    const roll = Math.random();

    if (act.type === 'move') {
      if (act.id === 'm1') {
        this.shiftLocation(1);
        if (Math.random() < 0.05) {
          GameState.modifyTime(1800);
          this.addLog('你摸到一块生锈手表，秒针仍在跳动。', 'reward');
        }
      }

      if (act.id === 'm2') {
        this.shiftLocation(1);
        if (roll < 0.2) {
          GameState.debuffs.add('生锈');
          this.addLog('乱石翻越失败：齿轮卡顿，机体生锈。', 'loss');
        }
      }

      if (act.id === 'm3') {
        this.shiftLocation(2);
        GameState.maxTime = Math.floor(GameState.maxTime * 0.99);
        if (GameState.time > GameState.maxTime) GameState.time = GameState.maxTime;
        this.addLog('极限奔袭完成：最大寿命上限永久 -1%。', 'loss');
      }

      if (act.id === 'm4') {
        GameState.flow = CONFIG.areaFlow[Math.floor(Math.random() * CONFIG.areaFlow.length)];
        GameState.location = `未知扇区 ${Math.floor(Math.random() * 4096)}`;
        document.getElementById('ui-location').textContent = `LOC: ${GameState.location}`;
        this.addLog(`盲目传送完成，你跌入 ${GameState.location}。`, 'sys');
      }
    }

    if (act.type === 'maintain') {
      if (act.id === 'mt1') {
        GameState.debuffs.delete('生锈');
        this.addLog('发条润滑完成：机体噪音降低。不给予时间奖励。', 'sys');
      }
      if (act.id === 'mt2') {
        GameState.buffs.logicReorg = 3;
        this.addLog('逻辑重组生效：下三次探索落空率降低。不给予时间奖励。', 'sys');
      }
      if (act.id === 'mt3') {
        GameState.debuffs.delete('过热');
        this.addLog('核心冷切执行：防止数据溢出。不给予时间奖励。', 'sys');
      }
    }

    if (act.type === 'explore') {
      if (act.id === 'e3') {
        GameState.flow = CONFIG.areaFlow[Math.floor(Math.random() * CONFIG.areaFlow.length)];
        this.addLog(`日晷偏转成功：区域流速改写为 ${GameState.flow.toFixed(2)}x。`, 'sys');
        return;
      }

      let successChance = act.id === 'e2' ? 0.45 : 0.3;
      if (GameState.buffs.logicReorg > 0) {
        successChance += 0.3;
        GameState.buffs.logicReorg -= 1;
      }

      if (roll < successChance) {
        const gain = act.id === 'e2' ? 7200 : 1800;
        GameState.modifyTime(gain);
      } else if (roll > 0.8) {
        GameState.modifyTime(-900);
        GameState.debuffs.add('漏时');
        this.addLog('陷阱触发：你被强制抽取时间并进入漏时。', 'loss');
      } else {
        this.addLog('颗粒无收。你翻开石板，只有冷灰与回声。');
      }
    }

    if (act.type === 'combat') {
      if (act.id === 'c1') {
        const trophy = 1200 + Math.floor(Math.random() * 2600);
        GameState.modifyTime(trophy);
        this.addLog(`瞬时过载成功：提取发条 +${trophy}s。`, 'reward');
      }

      if (act.id === 'c2') {
        this.addLog('你偏转了野兽的攻击轨迹，勉强脱战。', 'sys');
      }

      if (act.id === 'c3') {
        this.startBrawl();
      }
    }
  },

  shiftLocation(step) {
    const depth = Math.floor(Math.random() * 1000) + step * 100;
    GameState.location = `荒原深度 ${depth}`;
    GameState.flow = CONFIG.areaFlow[Math.floor(Math.random() * CONFIG.areaFlow.length)];
    document.getElementById('ui-location').textContent = `LOC: ${GameState.location}`;
  },

  startBrawl() {
    if (GameState.brawlTicker) clearInterval(GameState.brawlTicker);
    const duration = 4 + Math.floor(Math.random() * 7);
    let elapsed = 0;
    this.addLog(`肉搏缠斗开始：预计持续 ${duration}s，每秒额外扣10秒。`, 'loss');

    GameState.brawlTicker = setInterval(() => {
      if (GameState.isDead) {
        clearInterval(GameState.brawlTicker);
        return;
      }
      GameState.time -= 10;
      elapsed += 1;
      this.update();
      if (elapsed >= duration) {
        clearInterval(GameState.brawlTicker);
        GameState.brawlTicker = null;
        this.addLog('你挣脱了缠斗，但铆钉与外甲已崩裂。', 'sys');
      }
    }, 1000);
  },

  checkRandomEvents() {
    CONFIG.events.forEach((ev) => {
      if (Math.random() < ev.chance) {
        this.addLog(`[突发事件] ${ev.name}：${ev.msg}`, 'loss');
        ev.effect();
      }
    });

    if (Math.random() < 0.12) {
      this.addLog('残影观察：上一个旅者在这里选择了盲目传送。', 'sys');
    }
  },

  lockSystem(duration) {
    const lock = document.getElementById('system-lock');
    const lockMsg = document.getElementById('lock-msg');
    GameState.locked = true;
    lock.style.display = 'flex';

    let remain = Math.ceil(duration / 1000);
    lockMsg.textContent = `正在进行系统强检... ${remain}s`;

    const ticker = setInterval(() => {
      remain -= 1;
      lockMsg.textContent = `正在进行系统强检... ${Math.max(0, remain)}s`;
      if (remain <= 0) {
        clearInterval(ticker);
      }
    }, 1000);

    setTimeout(() => {
      lock.style.display = 'none';
      GameState.locked = false;
      this.addLog('系统强检结束。你只能庆幸秒针还在走。', 'sys');
    }, duration);
  },
};

GameState.init();
GameUI.init();
