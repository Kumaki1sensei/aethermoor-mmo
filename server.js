const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: 'ok', players: players.size }); });

const MAP_SIZE = 7;
const SPAWN_POS = { x: 3, y: 3 };
const BANK_TILES = [
  {x:2,y:2},{x:3,y:2},{x:4,y:2},
  {x:2,y:3},{x:3,y:3},{x:4,y:3},
  {x:2,y:4},{x:3,y:4},{x:4,y:4}
];

const CLASSES = {
  warrior: { hpMax: 120, manaMax: 30, dmg: 12, def: 8, spd: 8 },
  mage:    { hpMax: 70,  manaMax: 100, dmg: 18, def: 3, spd: 10 },
  rogue:   { hpMax: 90,  manaMax: 50,  dmg: 15, def: 4, spd: 16 }
};

const RARITY = { COMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };

const ITEMS = {
  espada_madeira: { name: 'Espada Madeira', type: 'weapon', dmg: 3,  def: 0, icon: '🗡️', rarity: 1 },
  tunica:         { name: 'Túnica',         type: 'armor',  dmg: 0,  def: 2, icon: '👕', rarity: 1 },
  botas_velhas:   { name: 'Botas Velhas',   type: 'accessory', dmg: 0, def: 1, icon: '👢', rarity: 1 },
  pocao_vida:     { name: 'Poção Vida',     type: 'consumable', heal: 30, icon: '🧪', rarity: 1 },
  pocao_mana:     { name: 'Poção Mana',     type: 'consumable', mana: 30, icon: '💧', rarity: 1 },
  espada_ferro:   { name: 'Espada Ferro',   type: 'weapon', dmg: 8,  def: 0, icon: '⚔️', rarity: 2 },
  couro:          { name: 'Couro',          type: 'armor',  dmg: 0,  def: 5, icon: '🛡️', rarity: 2 },
  adaga:          { name: 'Adaga',          type: 'weapon', dmg: 10, def: 0, icon: '🗡️', rarity: 2 },
  anel:           { name: 'Anel Força',     type: 'accessory', dmg: 5, def: 0, icon: '💍', rarity: 2 },
  pocao_grande:   { name: 'Poção Grande',   type: 'consumable', heal: 60, icon: '🧪', rarity: 2 },
  espada_aco:     { name: 'Espada Aço',     type: 'weapon', dmg: 15, def: 0, icon: '🗡️', rarity: 3 },
  cota:           { name: 'Cota Malha',     type: 'armor',  dmg: 0,  def: 10, icon: '⛓️', rarity: 3 },
  machado:        { name: 'Machado',        type: 'weapon', dmg: 20, def: 0, icon: '🪓', rarity: 3 },
  amuleto:        { name: 'Amuleto',        type: 'accessory', dmg: 2, def: 2, icon: '📿', rarity: 3 },
  botas_rapidas:  { name: 'Botas Rápidas',  type: 'accessory', dmg: 0, def: 3, icon: '👢', rarity: 3 },
  espada_fogo:    { name: 'Espada de Fogo', type: 'weapon', dmg: 35, def: 5, icon: '🔥', rarity: 4 },
  placas:         { name: 'Placas Dragão',  type: 'armor',  dmg: 5,  def: 25, icon: '🐉', rarity: 4 },
  anel_rei:       { name: 'Anel do Rei',    type: 'accessory', dmg: 15, def: 10, icon: '👑', rarity: 4 },
  machado_gigante:{ name: 'Machado Gigante',type: 'weapon', dmg: 40, def: 0, icon: '🪓', rarity: 4 },
  capa_invisivel: { name: 'Capa Invisível', type: 'accessory', dmg: 8, def: 8, icon: '🧥', rarity: 4 }
};

const LOOT_TABLE = {
  common: ['espada_madeira','tunica','botas_velhas','pocao_vida','pocao_mana'],
  rare: ['espada_ferro','couro','adaga','anel','pocao_grande'],
  epic: ['espada_aco','cota','machado','amuleto','botas_rapidas'],
  legendary: ['espada_fogo','placas','anel_rei','machado_gigante','capa_invisivel']
};

function getRandomLoot() {
  const roll = Math.random();
  let pool;
  if (roll < 0.50) pool = LOOT_TABLE.common;
  else if (roll < 0.80) pool = LOOT_TABLE.rare;
  else if (roll < 0.95) pool = LOOT_TABLE.epic;
  else pool = LOOT_TABLE.legendary;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getDeathBonusLoot() {
  const roll = Math.random();
  let pool;
  if (roll < 0.40) pool = LOOT_TABLE.common;
  else if (roll < 0.70) pool = LOOT_TABLE.rare;
  else if (roll < 0.90) pool = LOOT_TABLE.epic;
  else pool = LOOT_TABLE.legendary;
  return pool[Math.floor(Math.random() * pool.length)];
}

const players = new Map();
const groundItems = new Map();
const activeIPs = new Map();

// ============================================================
// SISTEMA DE CONTAS (LOGIN/REGISTO)
// ============================================================
const ACCOUNTS_FILE = './accounts.json';
let accounts = {};

try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    console.log('Contas carregadas:', Object.keys(accounts).length);
  }
} catch (e) { console.log('Sem contas salvas ainda'); }

function saveAccounts() {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

function hashPass(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function getDefaultPlayerData(cls) {
  const base = CLASSES[cls] || CLASSES.warrior;
  return {
    cls: cls || 'warrior', lvl: 1, xp: 0, xpNext: 100,
    hp: base.hpMax, hpMax: base.hpMax, mana: base.manaMax, manaMax: base.manaMax,
    baseDmg: base.dmg, baseDef: base.def, baseSpd: base.spd,
    gold: 50, pos: { ...SPAWN_POS },
    inv: [{ id: 'espada_madeira', qty: 1 }, { id: 'tunica', qty: 1 }, { id: 'pocao_vida', qty: 2 }],
    eq: { weapon: 'espada_madeira', armor: 'tunica', accessory: null },
    bank: [], kills: 0, deaths: 0
  };
}

function savePlayerData(player) {
  if (!player || !player.username) return;
  accounts[player.username] = {
    passwordHash: accounts[player.username]?.passwordHash || '',
    data: {
      cls: player.cls, lvl: player.lvl, xp: player.xp, xpNext: player.xpNext,
      hp: player.hp, hpMax: player.hpMax, mana: player.mana, manaMax: player.manaMax,
      baseDmg: player.baseDmg, baseDef: player.baseDef, baseSpd: player.baseSpd,
      gold: player.gold, pos: { ...player.pos },
      inv: JSON.parse(JSON.stringify(player.inv)),
      eq: JSON.parse(JSON.stringify(player.eq)),
      bank: JSON.parse(JSON.stringify(player.bank)),
      kills: player.kills, deaths: player.deaths,
      lastLogin: Date.now()
    }
  };
  saveAccounts();
}

function loadPlayerData(username, socketId) {
  const acc = accounts[username];
  if (!acc || !acc.data) return null;
  const d = acc.data;
  const base = CLASSES[d.cls] || CLASSES.warrior;
  return {
    id: socketId, socket: null,
    username: username,
    name: username,
    cls: d.cls, lvl: d.lvl || 1, xp: d.xp || 0, xpNext: d.xpNext || 100,
    hp: d.hp || base.hpMax, hpMax: d.hpMax || base.hpMax,
    mana: d.mana || base.manaMax, manaMax: d.manaMax || base.manaMax,
    baseDmg: d.baseDmg || base.dmg, baseDef: d.baseDef || base.def, baseSpd: d.baseSpd || base.spd,
    gold: d.gold || 50, pos: d.pos || { ...SPAWN_POS },
    inv: d.inv && d.inv.length ? JSON.parse(JSON.stringify(d.inv)) : [{ id: 'espada_madeira', qty: 1 }, { id: 'tunica', qty: 1 }, { id: 'pocao_vida', qty: 2 }],
    eq: d.eq ? JSON.parse(JSON.stringify(d.eq)) : { weapon: 'espada_madeira', armor: 'tunica', accessory: null },
    bank: d.bank ? JSON.parse(JSON.stringify(d.bank)) : [],
    kills: d.kills || 0, deaths: d.deaths || 0,
    inCombat: false, combatTarget: null
  };
}

// ============================================================
// FUNCOES DO JOGO (ORIGINAIS)
// ============================================================
function isBank(x, y) { return BANK_TILES.some(t => t.x === x && t.y === y); }
function getStats(p) {
  let dmg = p.baseDmg, def = p.baseDef, spd = p.baseSpd;
  if (p.eq.weapon && ITEMS[p.eq.weapon]) dmg += ITEMS[p.eq.weapon].dmg || 0;
  if (p.eq.armor && ITEMS[p.eq.armor])   def += ITEMS[p.eq.armor].def || 0;
  if (p.eq.accessory && ITEMS[p.eq.accessory]) { dmg += ITEMS[p.eq.accessory].dmg || 0; def += ITEMS[p.eq.accessory].def || 0; }
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
function sanitizePlayer(p) {
  return { id: p.id, name: p.name, cls: p.cls, lvl: p.lvl, hp: p.hp, hpMax: p.hpMax, mana: p.mana, manaMax: p.manaMax, xp: p.xp, xpNext: p.xpNext, gold: p.gold, pos: p.pos, eq: p.eq, inCombat: p.inCombat, kills: p.kills, deaths: p.deaths };
}
function getPlayersInZone(x, y, exceptId) {
  const result = [];
  players.forEach((p, id) => { if (id !== exceptId && p.pos.x === x && p.pos.y === y && p.hp > 0) result.push(p); });
  return result;
}
function getGroundItemsAt(x, y) { const key = `${x},${y}`; return groundItems.get(key) || []; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function checkLevelUp(p) {
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.lvl++; p.xpNext = Math.floor(p.xpNext * 1.5);
    p.hpMax += 15; p.hp = p.hpMax; p.manaMax += 10; p.mana = p.manaMax;
    p.baseDmg += 3; p.baseDef += 2;
    p.socket.emit('levelUp', { lvl: p.lvl });
  }
}
function broadcastToZone(x, y, event, data, exceptId = null) {
  players.forEach((p, id) => { if (id !== exceptId && p.pos.x === x && p.pos.y === y && p.socket) p.socket.emit(event, data); });
}
function broadcastAll(event, data, exceptId = null) {
  players.forEach((p, id) => { if (id !== exceptId && p.socket) p.socket.emit(event, data); });
}

function spawnRandomLoot() {
  let x, y;
  do { x = Math.floor(Math.random() * MAP_SIZE); y = Math.floor(Math.random() * MAP_SIZE); } while (isBank(x, y));
  const itemId = getRandomLoot();
  addGroundItem(x, y, itemId, 1);
  broadcastToZone(x, y, 'groundItemsUpdated', getGroundItemsAt(x, y));
}
for (let i = 0; i < 15; i++) spawnRandomLoot();
setInterval(spawnRandomLoot, 30000);

// ============================================================
// COMBATE (ORIGINAL)
// ============================================================
async function processCombat(attackerId, targetId) {
  const attacker = players.get(attackerId);
  const target = players.get(targetId);
  if (!attacker || !target) return;
  while (attacker.inCombat && target.inCombat && attacker.hp > 0 && target.hp > 0) {
    await sleep(700);
    if (attacker.pos.x !== target.pos.x || attacker.pos.y !== target.pos.y) {
      attacker.inCombat = false; attacker.combatTarget = null;
      target.inCombat = false; target.combatTarget = null;
      attacker.socket.emit('error', 'Combate cancelado: alvo fugiu!');
      target.socket.emit('error', 'Combate cancelado: você fugiu!');
      return;
    }
    const aStats = getStats(attacker), tStats = getStats(target);
    const attackerFirst = aStats.spd >= tStats.spd;
    if (attackerFirst) {
      if (!doAttack(attacker, target)) break;
      if (target.hp > 0) { await sleep(700); if (!doAttack(target, attacker)) break; }
    } else {
      if (!doAttack(target, attacker)) break;
      if (attacker.hp > 0) { await sleep(700); if (!doAttack(attacker, target)) break; }
    }
  }
  if (attacker.hp <= 0) handleDeath(attacker, target);
  else if (target.hp <= 0) handleDeath(target, attacker);
}

function doAttack(attacker, defender) {
  if (!attacker.inCombat || !defender.inCombat) return false;
  const result = calcDamage(attacker, defender);
  defender.hp = Math.max(0, defender.hp - result.dmg);
  attacker.socket.emit('combatLog', { type: 'attack', attacker: attacker.name, defender: defender.name, dmg: result.dmg, crit: result.crit, defenderHp: defender.hp, defenderHpMax: defender.hpMax });
  defender.socket.emit('combatLog', { type: 'attacked', attacker: attacker.name, defender: defender.name, dmg: result.dmg, crit: result.crit, defenderHp: defender.hp, defenderHpMax: defender.hpMax });
  return defender.hp > 0;
}

function handleDeath(victim, killer) {
  victim.deaths++; victim.inCombat = false; victim.combatTarget = null;
  killer.kills++; killer.inCombat = false; killer.combatTarget = null;
  killer.xp += victim.lvl * 25; killer.gold += victim.lvl * 15;
  checkLevelUp(killer);
  const drops = [];
  if (victim.eq.weapon) { drops.push({ id: victim.eq.weapon, qty: 1 }); victim.eq.weapon = null; }
  if (victim.eq.armor) { drops.push({ id: victim.eq.armor, qty: 1 }); victim.eq.armor = null; }
  if (victim.eq.accessory) { drops.push({ id: victim.eq.accessory, qty: 1 }); victim.eq.accessory = null; }
  victim.inv.forEach(item => { if (item) drops.push({ id: item.id, qty: item.qty }); });
  victim.inv = [];
  const bonusCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < bonusCount; i++) {
    const bonusItem = getDeathBonusLoot();
    addGroundItem(victim.pos.x, victim.pos.y, bonusItem, 1);
    drops.push({ id: bonusItem, qty: 1 });
  }
  drops.forEach(d => addGroundItem(victim.pos.x, victim.pos.y, d.id, d.qty));
  victim.socket.emit('died', { killer: killer.name, drops: drops.map(d => ({ name: ITEMS[d.id]?.name || d.id, icon: ITEMS[d.id]?.icon || '📦', rarity: ITEMS[d.id]?.rarity || 1 })), pos: victim.pos });
  killer.socket.emit('combatWon', { target: victim.name, xp: victim.lvl * 25, gold: victim.lvl * 15, drops: drops.map(d => ({ name: ITEMS[d.id]?.name || d.id, icon: ITEMS[d.id]?.icon || '📦', rarity: ITEMS[d.id]?.rarity || 1 })) });
  broadcastToZone(victim.pos.x, victim.pos.y, 'playerDied', { name: victim.name, killer: killer.name, drops: drops.length });
  broadcastToZone(victim.pos.x, victim.pos.y, 'groundItemsUpdated', getGroundItemsAt(victim.pos.x, victim.pos.y));
}

// ============================================================
// LOAD MODULES
// ============================================================
const pathModules = path.join(__dirname, 'modules');
if (fs.existsSync(pathModules)) {
  fs.readdirSync(pathModules).forEach(file => {
    if (file.endsWith('.js')) {
      try {
        const mod = require(path.join(pathModules, file));
        if (typeof mod === 'function') {
          mod({ io, players, groundItems, activeIPs, ITEMS, CLASSES, MAP_SIZE, SPAWN_POS, BANK_TILES, isBank, getStats, calcDamage, addGroundItem, removeGroundItem, sanitizePlayer, getPlayersInZone, getGroundItemsAt, sleep, checkLevelUp, broadcastToZone, broadcastAll });
          console.log('Module loaded:', file);
        }
      } catch(e) { console.error('Module error:', file, e.message); }
    }
  });
}

// ============================================================
// SOCKET.IO - COM LOGIN/REGISTO
// ============================================================
const activeUsers = new Map(); // username -> socketId

io.on('connection', (socket) => {
  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  console.log('Jogador conectado:', socket.id, 'IP:', clientIP);

  // Anti-multi-janela por IP
  if (activeIPs.has(clientIP)) {
    const oldSocketId = activeIPs.get(clientIP);
    const oldPlayer = players.get(oldSocketId);
    if (oldPlayer) {
      oldPlayer.socket.emit('kicked', { reason: 'Outra sessão iniciada no mesmo dispositivo.' });
      oldPlayer.socket.disconnect(true);
      if (oldPlayer.username) activeUsers.delete(oldPlayer.username);
      players.delete(oldSocketId);
    }
  }
  activeIPs.set(clientIP, socket.id);

  // ===== REGISTO =====
  socket.on('register', ({ username, password, cls }) => {
    if (!username || !password) { socket.emit('registerFailed', 'Preencha todos os campos'); return; }
    if (username.length < 3 || username.length > 16) { socket.emit('registerFailed', 'Username: 3-16 caracteres'); return; }
    if (password.length < 4) { socket.emit('registerFailed', 'Password mínimo 4 caracteres'); return; }
    if (accounts[username]) { socket.emit('registerFailed', 'Username já existe'); return; }

    const defaultData = getDefaultPlayerData(cls);
    accounts[username] = {
      passwordHash: hashPass(password),
      data: defaultData
    };
    saveAccounts();
    socket.emit('registerSuccess', 'Conta criada! Faça login.');
  });

  // ===== LOGIN =====
  socket.on('login', ({ username, password }) => {
    if (!username || !password) { socket.emit('loginFailed', 'Preencha todos os campos'); return; }
    if (!accounts[username]) { socket.emit('loginFailed', 'Conta não encontrada'); return; }
    if (accounts[username].passwordHash !== hashPass(password)) { socket.emit('loginFailed', 'Password incorreta'); return; }

    // Kick sessão anterior do mesmo user
    if (activeUsers.has(username)) {
      const oldSocketId = activeUsers.get(username);
      const oldPlayer = players.get(oldSocketId);
      if (oldPlayer) {
        savePlayerData(oldPlayer);
        oldPlayer.socket.emit('kicked', { reason: 'Conta aberta noutro dispositivo' });
        oldPlayer.socket.disconnect(true);
        players.delete(oldSocketId);
      }
    }

    activeUsers.set(username, socket.id);

    // Carregar dados
    const player = loadPlayerData(username, socket.id);
    if (!player) { socket.emit('loginFailed', 'Erro ao carregar dados'); return; }
    player.socket = socket;
    players.set(socket.id, player);

    socket.emit('playerCreated', { player: sanitizePlayer(player), groundItems: getGroundItemsAt(player.pos.x, player.pos.y) });
    socket.broadcast.emit('playerJoined', { id: player.id, name: player.name, cls: player.cls, lvl: player.lvl, pos: player.pos });
    const nearby = getPlayersInZone(player.pos.x, player.pos.y, socket.id);
    socket.emit('nearbyPlayers', nearby.map(sanitizePlayer));
  });

  // ===== CREATE PLAYER (modo antigo sem login - mantido para compatibilidade) =====
  socket.on('createPlayer', ({ name, cls }) => {
    const base = CLASSES[cls] || CLASSES.warrior;
    const player = {
      id: socket.id, socket: socket,
      name: (name || 'Herói').substring(0, 16),
      cls: cls || 'warrior', lvl: 1, xp: 0, xpNext: 100,
      hp: base.hpMax, hpMax: base.hpMax, mana: base.manaMax, manaMax: base.manaMax,
      baseDmg: base.dmg, baseDef: base.def, baseSpd: base.spd,
      gold: 50, pos: { ...SPAWN_POS },
      inv: [{ id: 'espada_madeira', qty: 1 }, { id: 'tunica', qty: 1 }, { id: 'pocao_vida', qty: 2 }],
      eq: { weapon: 'espada_madeira', armor: 'tunica', accessory: null },
      bank: [], kills: 0, deaths: 0, inCombat: false, combatTarget: null
    };
    players.set(socket.id, player);
    socket.emit('playerCreated', { player: sanitizePlayer(player), groundItems: getGroundItemsAt(player.pos.x, player.pos.y) });
    socket.broadcast.emit('playerJoined', { id: player.id, name: player.name, cls: player.cls, lvl: player.lvl, pos: player.pos });
    const nearby = getPlayersInZone(player.pos.x, player.pos.y, socket.id);
    socket.emit('nearbyPlayers', nearby.map(sanitizePlayer));
  });

  // ===== MOVE =====
  socket.on('move', ({ x, y }) => {
    const p = players.get(socket.id);
    if (!p || p.inCombat) return;
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;
    const dx = Math.abs(x - p.pos.x), dy = Math.abs(y - p.pos.y);
    if (dx + dy !== 1) return;
    const oldPos = { ...p.pos };
    p.pos = { x, y };
    socket.emit('moved', { pos: p.pos, isBank: isBank(x, y) });
    socket.broadcast.emit('playerLeftZone', { id: p.id, x: oldPos.x, y: oldPos.y });
    socket.broadcast.emit('playerEnteredZone', sanitizePlayer(p));
    const nearby = getPlayersInZone(x, y, p.id);
    socket.emit('nearbyPlayers', nearby.map(sanitizePlayer));
    socket.emit('groundItems', getGroundItemsAt(x, y));
  });

  // ===== EQUIP =====
  socket.on('equip', ({ index }) => {
    const p = players.get(socket.id);
    if (!p || index < 0 || index >= p.inv.length) return;
    const item = p.inv[index];
    if (!item || !ITEMS[item.id]) return;
    const data = ITEMS[item.id];
    if (data.type === 'consumable') {
      if (data.heal) { p.hp = Math.min(p.hpMax, p.hp + data.heal); socket.emit('healed', { hp: p.hp, amount: data.heal }); }
      if (data.mana) { p.mana = Math.min(p.manaMax, p.mana + data.mana); socket.emit('manaRestored', { mana: p.mana, amount: data.mana }); }
      item.qty--; if (item.qty <= 0) p.inv[index] = null;
      socket.emit('inventoryUpdated', p.inv); return;
    }
    const slotMap = { weapon: 'weapon', armor: 'armor', accessory: 'accessory' };
    const slot = slotMap[data.type];
    if (!slot) return;
    const current = p.eq[slot];
    if (current === item.id) { p.eq[slot] = null; }
    else {
      if (current) { const oldIdx = p.inv.findIndex(i => i && i.id === current); if (oldIdx >= 0) p.inv[oldIdx] = null; }
      p.eq[slot] = item.id; item.qty--; if (item.qty <= 0) p.inv[index] = null;
    }
    socket.emit('equipmentUpdated', { eq: p.eq, inv: p.inv, stats: getStats(p) });
  });

  // ===== PICKUP =====
  socket.on('pickup', ({ index }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const item = removeGroundItem(p.pos.x, p.pos.y, index);
    if (!item) return;
    const emptyIdx = p.inv.findIndex(i => !i);
    if (emptyIdx >= 0) p.inv[emptyIdx] = { id: item.id, qty: item.qty };
    else if (p.inv.length < 16) p.inv.push({ id: item.id, qty: item.qty });
    else { addGroundItem(p.pos.x, p.pos.y, item.id, item.qty); socket.emit('error', 'Inventário cheio!'); return; }
    socket.emit('inventoryUpdated', p.inv);
    socket.emit('groundItems', getGroundItemsAt(p.pos.x, p.pos.y));
    broadcastToZone(p.pos.x, p.pos.y, 'groundItemsUpdated', getGroundItemsAt(p.pos.x, p.pos.y), p.id);
  });

  // ===== ATTACK =====
  socket.on('attack', ({ targetId }) => {
    const attacker = players.get(socket.id);
    const target = players.get(targetId);
    if (!attacker || !target) return;
    if (attacker.inCombat || target.inCombat) return;
    if (attacker.pos.x !== target.pos.x || attacker.pos.y !== target.pos.y) return;
    if (isBank(attacker.pos.x, attacker.pos.y)) return;
    if (attacker.hp <= 0 || target.hp <= 0) return;
    const currentTargets = getPlayersInZone(attacker.pos.x, attacker.pos.y, attacker.id);
    const targetStillHere = currentTargets.find(t => t.id === targetId);
    if (!targetStillHere) { socket.emit('error', 'O alvo já saiu da zona!'); return; }
    attacker.inCombat = true; attacker.combatTarget = targetId;
    target.inCombat = true; target.combatTarget = socket.id;
    socket.emit('combatStarted', { target: sanitizePlayer(target) });
    target.socket.emit('combatStarted', { target: sanitizePlayer(attacker), attacker: true });
    processCombat(socket.id, targetId);
  });

  // ===== REST =====
  socket.on('rest', () => {
    const p = players.get(socket.id);
    if (!p || p.inCombat) return;
    if (!isBank(p.pos.x, p.pos.y)) { socket.emit('error', 'Só no Banco!'); return; }
    p.hp = Math.min(p.hpMax, p.hp + 40); p.mana = Math.min(p.manaMax, p.mana + 30);
    socket.emit('rested', { hp: p.hp, mana: p.mana });
  });

  // ===== DEPOSIT ALL =====
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

  // ===== WITHDRAW ALL =====
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

  // ===== WITHDRAW =====
  socket.on('withdraw', ({ index }) => {
    const p = players.get(socket.id);
    if (!p || index < 0 || index >= p.bank.length) return;
    const item = p.bank[index];
    const emptyIdx = p.inv.findIndex(i => !i);
    if (emptyIdx >= 0) p.inv[emptyIdx] = { id: item.id, qty: item.qty };
    else if (p.inv.length < 16) p.inv.push({ id: item.id, qty: item.qty });
    else { socket.emit('error', 'Inventário cheio!'); return; }
    p.bank.splice(index, 1);
    socket.emit('bankUpdated', { bank: p.bank, inv: p.inv });
  });

  // ===== RESPAWN =====
  socket.on('respawn', () => {
    const p = players.get(socket.id);
    if (!p) return;
    p.hp = p.hpMax; p.mana = p.manaMax; p.pos = { ...SPAWN_POS };
    p.inCombat = false; p.combatTarget = null;
    socket.emit('respawned', { pos: p.pos, hp: p.hp, mana: p.mana });
  });

  // ===== CHAT =====
  socket.on('chat', ({ message }) => {
    const p = players.get(socket.id);
    if (!p || !message) return;
    const cleanMsg = message.trim().substring(0, 200);
    if (!cleanMsg) return;
    broadcastAll('chatMessage', { name: p.name, message: cleanMsg, cls: p.cls, lvl: p.lvl });
  });

  // ===== DISCONNECT =====
  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p) {
      // Guardar dados se tiver username (modo login)
      if (p.username) {
        savePlayerData(p);
        activeUsers.delete(p.username);
      }
      if (p.inCombat && p.combatTarget) {
        const opponent = players.get(p.combatTarget);
        if (opponent) {
          opponent.inCombat = false; opponent.combatTarget = null;
          opponent.kills++; opponent.xp += 50; opponent.gold += 30;
          opponent.socket.emit('combatWon', { reason: 'disconnect', xp: 50, gold: 30 });
        }
      }
      socket.broadcast.emit('playerLeft', { id: socket.id });
      players.delete(socket.id);
    }
    activeIPs.delete(clientIP);
    console.log('Jogador desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log('Aethermoor MMO Server v12 rodando na porta ' + PORT); });
