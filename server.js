const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

// ==================== CONFIGURAÇÕES ====================
const TICK_RATE = 20; // 20 ticks por segundo
const MAP_SIZE = 5;
const SPAWN_POS = { x: 1, y: 1 };
const BANK_TILES = [{x:1,y:1},{x:2,y:1},{x:1,y:2},{x:2,y:2}];

const CLASSES = {
  warrior: { hpMax: 120, manaMax: 30, dmg: 12, def: 8, spd: 8 },
  mage:    { hpMax: 70,  manaMax: 100, dmg: 18, def: 3, spd: 10 },
  rogue:   { hpMax: 90,  manaMax: 50,  dmg: 15, def: 4, spd: 16 }
};

const ITEMS = {
  espada_madeira: { name: 'Espada Madeira', type: 'weapon',     dmg: 3,  def: 0, icon: '🗡️' },
  espada_ferro:   { name: 'Espada Ferro',   type: 'weapon',     dmg: 8,  def: 0, icon: '⚔️' },
  espada_aco:     { name: 'Espada Aço',     type: 'weapon',     dmg: 15, def: 0, icon: '🗡️' },
  adaga:          { name: 'Adaga',          type: 'weapon',     dmg: 10, def: 0, icon: '🗡️' },
  machado:        { name: 'Machado',        type: 'weapon',     dmg: 20, def: 0, icon: '🪓' },
  tunica:         { name: 'Túnica',         type: 'armor',      dmg: 0,  def: 2, icon: '👕' },
  couro:          { name: 'Couro',          type: 'armor',      dmg: 0,  def: 5, icon: '🛡️' },
  cota:           { name: 'Cota Malha',     type: 'armor',      dmg: 0,  def: 10, icon: '⛓️' },
  placas:         { name: 'Placas',         type: 'armor',      dmg: 0,  def: 18, icon: '🛡️' },
  amuleto:        { name: 'Amuleto',        type: 'accessory',  dmg: 2,  def: 2, icon: '📿' },
  anel:           { name: 'Anel Força',     type: 'accessory',  dmg: 5,  def: 0, icon: '💍' },
  botas:          { name: 'Botas',          type: 'accessory',  dmg: 0,  def: 1, icon: '👢' },
  pocao_vida:     { name: 'Poção Vida',     type: 'consumable', heal: 30, icon: '🧪' },
  pocao_mana:     { name: 'Poção Mana',     type: 'consumable', mana: 30, icon: '💧' },
  pocao_grande:   { name: 'Poção Grande',   type: 'consumable', heal: 60, icon: '🧪' }
};

// ==================== ESTADO DO JOGO ====================
const players = new Map();      // socket.id -> player data
const groundItems = new Map();  // "x,y" -> [{id, qty}]
const combats = new Map();      // attackerId -> {targetId, turn}

function isBank(x, y) {
  return BANK_TILES.some(t => t.x === x && t.y === y);
}

function getStats(p) {
  let dmg = p.baseDmg, def = p.baseDef, spd = p.baseSpd;
  if (p.eq.weapon && ITEMS[p.eq.weapon]) dmg += ITEMS[p.eq.weapon].dmg || 0;
  if (p.eq.armor && ITEMS[p.eq.armor])   def += ITEMS[p.eq.armor].def || 0;
  if (p.eq.accessory && ITEMS[p.eq.accessory]) {
    dmg += ITEMS[p.eq.accessory].dmg || 0;
    def += ITEMS[p.eq.accessory].def || 0;
  }
  return { dmg, def, spd };
}

function calcDamage(attacker, defender) {
  const a = getStats(attacker), d = getStats(defender);
  let raw = a.dmg + Math.floor(Math.random() * 5);
  let mit = d.def * 0.5;
  let dmg = Math.max(1, Math.floor(raw - mit));
  if (Math.random() < 0.15) return { dmg: Math.floor(dmg * 1.5), crit: true };
  return { dmg, crit: false };
}

function addGroundItem(x, y, itemId, qty = 1) {
  const key = `${x},${y}`;
  if (!groundItems.has(key)) groundItems.set(key, []);
  const existing = groundItems.get(key).find(i => i.id === itemId);
  if (existing) existing.qty += qty;
  else groundItems.get(key).push({ id: itemId, qty });
}

function removeGroundItem(x, y, index) {
  const key = `${x},${y}`;
  const items = groundItems.get(key);
  if (!items || !items[index]) return null;
  return items.splice(index, 1)[0];
}

function broadcast(event, data, exceptId = null) {
  players.forEach((p, id) => {
    if (id !== exceptId && p.socket) {
      p.socket.emit(event, data);
    }
  });
}

function broadcastToZone(x, y, event, data, exceptId = null) {
  players.forEach((p, id) => {
    if (id !== exceptId && p.pos.x === x && p.pos.y === y && p.socket) {
      p.socket.emit(event, data);
    }
  });
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('Novo jogador conectado:', socket.id);

  // Criar personagem
  socket.on('createPlayer', ({ name, cls }) => {
    const base = CLASSES[cls] || CLASSES.warrior;
    const player = {
      id: socket.id,
      socket: socket,
      name: name.substring(0, 16) || 'Herói',
      cls: cls || 'warrior',
      lvl: 1,
      xp: 0,
      xpNext: 100,
      hp: base.hpMax,
      hpMax: base.hpMax,
      mana: base.manaMax,
      manaMax: base.manaMax,
      baseDmg: base.dmg,
      baseDef: base.def,
      baseSpd: base.spd,
      gold: 50,
      pos: { ...SPAWN_POS },
      inv: [
        { id: 'espada_madeira', qty: 1 },
        { id: 'tunica', qty: 1 },
        { id: 'pocao_vida', qty: 2 }
      ],
      eq: { weapon: 'espada_madeira', armor: 'tunica', accessory: null },
      bank: [],
      kills: 0,
      deaths: 0,
      inCombat: false,
      combatTarget: null
    };
    players.set(socket.id, player);

    socket.emit('playerCreated', { 
      player: sanitizePlayer(player),
      groundItems: getGroundItemsAt(player.pos.x, player.pos.y)
    });

    broadcast('playerJoined', { 
      id: player.id, 
      name: player.name, 
      cls: player.cls, 
      lvl: player.lvl,
      pos: player.pos 
    }, socket.id);

    // Enviar lista de jogadores na mesma zona
    const nearby = getPlayersInZone(player.pos.x, player.pos.y, socket.id);
    socket.emit('nearbyPlayers', nearby.map(sanitizePlayer));
  });

  // Movimentação
  socket.on('move', ({ x, y }) => {
    const p = players.get(socket.id);
    if (!p || p.inCombat) return;
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;
    const dx = Math.abs(x - p.pos.x), dy = Math.abs(y - p.pos.y);
    if (dx + dy !== 1) return;

    const oldPos = { ...p.pos };
    p.pos = { x, y };

    socket.emit('moved', { pos: p.pos, isBank: isBank(x, y) });

    // Notificar jogadores na zona antiga que ele saiu
    broadcastToZone(oldPos.x, oldPos.y, 'playerLeftZone', { id: p.id }, p.id);

    // Notificar jogadores na nova zona que ele chegou
    broadcastToZone(x, y, 'playerEnteredZone', sanitizePlayer(p), p.id);

    // Enviar jogadores próximos
    const nearby = getPlayersInZone(x, y, p.id);
    socket.emit('nearbyPlayers', nearby.map(sanitizePlayer));

    // Enviar itens no chão
    socket.emit('groundItems', getGroundItemsAt(x, y));
  });

  // Equipar/Usar item
  socket.on('equip', ({ index }) => {
    const p = players.get(socket.id);
    if (!p || index < 0 || index >= p.inv.length) return;
    const item = p.inv[index];
    if (!item || !ITEMS[item.id]) return;
    const data = ITEMS[item.id];

    if (data.type === 'consumable') {
      if (data.heal) {
        p.hp = Math.min(p.hpMax, p.hp + data.heal);
        socket.emit('healed', { hp: p.hp, amount: data.heal });
      }
      if (data.mana) {
        p.mana = Math.min(p.manaMax, p.mana + data.mana);
        socket.emit('manaRestored', { mana: p.mana, amount: data.mana });
      }
      item.qty--;
      if (item.qty <= 0) p.inv[index] = null;
      socket.emit('inventoryUpdated', p.inv);
      return;
    }

    const slotMap = { weapon: 'weapon', armor: 'armor', accessory: 'accessory' };
    const slot = slotMap[data.type];
    if (!slot) return;

    const current = p.eq[slot];
    if (current === item.id) {
      p.eq[slot] = null;
    } else {
      if (current) {
        const oldIdx = p.inv.findIndex(i => i && i.id === current);
        if (oldIdx >= 0) p.inv[oldIdx] = null;
      }
      p.eq[slot] = item.id;
      item.qty--;
      if (item.qty <= 0) p.inv[index] = null;
    }

    socket.emit('equipmentUpdated', { eq: p.eq, inv: p.inv, stats: getStats(p) });
  });

  // Pegar item do chão
  socket.on('pickup', ({ index }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const item = removeGroundItem(p.pos.x, p.pos.y, index);
    if (!item) return;

    const emptyIdx = p.inv.findIndex(i => !i);
    if (emptyIdx >= 0) {
      p.inv[emptyIdx] = { id: item.id, qty: item.qty };
    } else if (p.inv.length < 16) {
      p.inv.push({ id: item.id, qty: item.qty });
    } else {
      addGroundItem(p.pos.x, p.pos.y, item.id, item.qty);
      socket.emit('error', 'Inventário cheio!');
      return;
    }

    socket.emit('inventoryUpdated', p.inv);
    socket.emit('groundItems', getGroundItemsAt(p.pos.x, p.pos.y));
    broadcastToZone(p.pos.x, p.pos.y, 'groundItemsUpdated', getGroundItemsAt(p.pos.x, p.pos.y), p.id);
  });

  // Atacar jogador
  socket.on('attack', ({ targetId }) => {
    const attacker = players.get(socket.id);
    const target = players.get(targetId);
    if (!attacker || !target) return;
    if (attacker.inCombat || target.inCombat) return;
    if (attacker.pos.x !== target.pos.x || attacker.pos.y !== target.pos.y) return;
    if (isBank(attacker.pos.x, attacker.pos.y)) return;
    if (attacker.hp <= 0 || target.hp <= 0) return;

    attacker.inCombat = true;
    attacker.combatTarget = targetId;
    target.inCombat = true;
    target.combatTarget = socket.id;

    socket.emit('combatStarted', { target: sanitizePlayer(target) });
    target.socket.emit('combatStarted', { target: sanitizePlayer(attacker), attacker: true });

    // Iniciar loop de combate
    processCombat(socket.id, targetId);
  });

  // Descansar
  socket.on('rest', () => {
    const p = players.get(socket.id);
    if (!p || p.inCombat) return;
    if (!isBank(p.pos.x, p.pos.y)) {
      socket.emit('error', 'Só no Banco!');
      return;
    }
    p.hp = Math.min(p.hpMax, p.hp + 40);
    p.mana = Math.min(p.manaMax, p.mana + 30);
    socket.emit('rested', { hp: p.hp, mana: p.mana });
  });

  // Banco
  socket.on('depositAll', () => {
    const p = players.get(socket.id);
    if (!p || !isBank(p.pos.x, p.pos.y)) return;
    p.inv.forEach((item, i) => {
      if (item) {
        const existing = p.bank.find(b => b.id === item.id);
        if (existing) existing.qty += item.qty;
        else p.bank.push({ id: item.id, qty: item.qty });
        p.inv[i] = null;
      }
    });
    socket.emit('bankUpdated', { bank: p.bank, inv: p.inv });
  });

  socket.on('withdrawAll', () => {
    const p = players.get(socket.id);
    if (!p) return;
    p.bank.forEach(item => {
      const emptyIdx = p.inv.findIndex(i => !i);
      if (emptyIdx >= 0) p.inv[emptyIdx] = { id: item.id, qty: item.qty };
      else if (p.inv.length < 16) p.inv.push({ id: item.id, qty: item.qty });
    });
    p.bank = [];
    socket.emit('bankUpdated', { bank: p.bank, inv: p.inv });
  });

  socket.on('withdraw', ({ index }) => {
    const p = players.get(socket.id);
    if (!p || index < 0 || index >= p.bank.length) return;
    const item = p.bank[index];
    const emptyIdx = p.inv.findIndex(i => !i);
    if (emptyIdx >= 0) {
      p.inv[emptyIdx] = { id: item.id, qty: item.qty };
    } else if (p.inv.length < 16) {
      p.inv.push({ id: item.id, qty: item.qty });
    } else {
      socket.emit('error', 'Inventário cheio!');
      return;
    }
    p.bank.splice(index, 1);
    socket.emit('bankUpdated', { bank: p.bank, inv: p.inv });
  });

  // Desconectar
  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p) {
      // Se estava em combate, o oponente vence
      if (p.inCombat && p.combatTarget) {
        const opponent = players.get(p.combatTarget);
        if (opponent) {
          opponent.inCombat = false;
          opponent.combatTarget = null;
          opponent.socket.emit('combatWon', { reason: 'disconnect', xp: 50, gold: 30 });
        }
      }
      broadcast('playerLeft', { id: socket.id }, socket.id);
      players.delete(socket.id);
    }
    console.log('Jogador desconectado:', socket.id);
  });
});

// ==================== COMBATE ====================
async function processCombat(attackerId, targetId) {
  const attacker = players.get(attackerId);
  const target = players.get(targetId);
  if (!attacker || !target) return;

  while (attacker.inCombat && target.inCombat && attacker.hp > 0 && target.hp > 0) {
    await sleep(700);

    const aStats = getStats(attacker);
    const tStats = getStats(target);
    const attackerFirst = aStats.spd >= tStats.spd;

    if (attackerFirst) {
      if (!doAttack(attacker, target)) break;
      if (target.hp > 0) {
        await sleep(700);
        if (!doAttack(target, attacker)) break;
      }
    } else {
      if (!doAttack(target, attacker)) break;
      if (attacker.hp > 0) {
        await sleep(700);
        if (!doAttack(attacker, target)) break;
      }
    }
  }

  // Fim do combate
  if (attacker.hp <= 0) {
    handleDeath(attacker, target);
  } else if (target.hp <= 0) {
    handleDeath(target, attacker);
  }
}

function doAttack(attacker, defender) {
  if (!attacker.inCombat || !defender.inCombat) return false;
  const result = calcDamage(attacker, defender);
  defender.hp = Math.max(0, defender.hp - result.dmg);

  attacker.socket.emit('combatLog', {
    type: 'attack',
    attacker: attacker.name,
    defender: defender.name,
    dmg: result.dmg,
    crit: result.crit,
    defenderHp: defender.hp,
    defenderHpMax: defender.hpMax
  });
  defender.socket.emit('combatLog', {
    type: 'attacked',
    attacker: attacker.name,
    defender: defender.name,
    dmg: result.dmg,
    crit: result.crit,
    defenderHp: defender.hp,
    defenderHpMax: defender.hpMax
  });

  return defender.hp > 0;
}

function handleDeath(victim, killer) {
  victim.deaths++;
  victim.inCombat = false;
  victim.combatTarget = null;

  killer.kills++;
  killer.inCombat = false;
  killer.combatTarget = null;
  killer.xp += victim.lvl * 25;
  killer.gold += victim.lvl * 15;

  // Dropa itens
  const drops = [];
  if (victim.eq.weapon) { drops.push({ id: victim.eq.weapon, qty: 1 }); victim.eq.weapon = null; }
  if (victim.eq.armor) { drops.push({ id: victim.eq.armor, qty: 1 }); victim.eq.armor = null; }
  if (victim.eq.accessory) { drops.push({ id: victim.eq.accessory, qty: 1 }); victim.eq.accessory = null; }
  victim.inv.forEach(item => { if (item) drops.push({ id: item.id, qty: item.qty }); });
  victim.inv = [];

  drops.forEach(d => addGroundItem(victim.pos.x, victim.pos.y, d.id, d.qty));

  // Bônus aleatório
  if (Math.random() < 0.3) {
    const bonus = ['espada_ferro', 'couro', 'anel', 'botas', 'pocao_vida', 'pocao_grande'];
    const bn = bonus[Math.floor(Math.random() * bonus.length)];
    addGroundItem(victim.pos.x, victim.pos.y, bn, 1);
    drops.push({ id: bn, qty: 1 });
  }

  victim.socket.emit('died', {
    killer: killer.name,
    drops: drops.map(d => ({ name: ITEMS[d.id]?.name || d.id, icon: ITEMS[d.id]?.icon || '📦' })),
    pos: victim.pos
  });

  killer.socket.emit('combatWon', {
    target: victim.name,
    xp: victim.lvl * 25,
    gold: victim.lvl * 15,
    drops: drops.map(d => ({ name: ITEMS[d.id]?.name || d.id, icon: ITEMS[d.id]?.icon || '📦' }))
  });

  // Notificar outros na zona
  broadcastToZone(victim.pos.x, victim.pos.y, 'playerDied', {
    name: victim.name,
    killer: killer.name,
    drops: drops.length
  });

  broadcastToZone(victim.pos.x, victim.pos.y, 'groundItemsUpdated', getGroundItemsAt(victim.pos.x, victim.pos.y));
}

// ==================== HELPERS ====================
function sanitizePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    cls: p.cls,
    lvl: p.lvl,
    hp: p.hp,
    hpMax: p.hpMax,
    pos: p.pos,
    eq: p.eq,
    inCombat: p.inCombat
  };
}

function getPlayersInZone(x, y, exceptId) {
  const result = [];
  players.forEach((p, id) => {
    if (id !== exceptId && p.pos.x === x && p.pos.y === y && p.hp > 0) {
      result.push(p);
    }
  });
  return result;
}

function getGroundItemsAt(x, y) {
  const key = `${x},${y}`;
  return groundItems.get(key) || [];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkLevelUp(p) {
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.lvl++;
    p.xpNext = Math.floor(p.xpNext * 1.5);
    p.hpMax += 15;
    p.hp = p.hpMax;
    p.manaMax += 10;
    p.mana = p.manaMax;
    p.baseDmg += 3;
    p.baseDef += 2;
    p.socket.emit('levelUp', { lvl: p.lvl });
  }
}

// ==================== SERVIDOR ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Aethermoor MMO Server rodando na porta ${PORT}`);
  console.log(`📡 Acesse: http://localhost:${PORT}`);
});
