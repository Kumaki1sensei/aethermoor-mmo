const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));
app.use(express.json());

// ============================================================
// DADOS DO JOGO
// ============================================================
const MAP_SIZE = 7;
const BANK_CENTER = 3;
const TILES = [];
for (let y = 0; y < MAP_SIZE; y++) {
  for (let x = 0; x < MAP_SIZE; x++) {
    const isBank = x >= BANK_CENTER - 1 && x <= BANK_CENTER + 1 && y >= BANK_CENTER - 1 && y <= BANK_CENTER + 1;
    TILES.push({ x, y, type: isBank ? 'bank' : 'pvp', items: [] });
  }
}

const ITEMS = {
  espada_madeira: { name: 'Espada Madeira', icon: '🗡️', slot: 'weapon', dmg: 3, def: 0, tier: 'common', color: '#888' },
  tunica: { name: 'Túnica', icon: '👕', slot: 'armor', dmg: 0, def: 2, tier: 'common', color: '#888' },
  botas_velhas: { name: 'Botas Velhas', icon: '👢', slot: 'boots', dmg: 0, def: 1, tier: 'common', color: '#888' },
  pocao_vida: { name: 'Poção Vida', icon: '🧪', slot: 'consumable', heal: 30, tier: 'common', color: '#888' },
  pocao_mana: { name: 'Poção Mana', icon: '💧', slot: 'consumable', mana: 30, tier: 'common', color: '#888' },
  espada_ferro: { name: 'Espada Ferro', icon: '⚔️', slot: 'weapon', dmg: 6, def: 0, tier: 'rare', color: '#4488ff' },
  couro: { name: 'Couro', icon: '🛡️', slot: 'armor', dmg: 0, def: 4, tier: 'rare', color: '#4488ff' },
  adaga: { name: 'Adaga', icon: '🗡️', slot: 'weapon', dmg: 5, def: 0, tier: 'rare', color: '#4488ff' },
  anel_forca: { name: 'Anel Força', icon: '💍', slot: 'ring', dmg: 2, def: 1, tier: 'rare', color: '#4488ff' },
  pocao_grande: { name: 'Poção Grande', icon: '🧪', slot: 'consumable', heal: 60, tier: 'rare', color: '#4488ff' },
  espada_aco: { name: 'Espada Aço', icon: '🗡️', slot: 'weapon', dmg: 10, def: 0, tier: 'epic', color: '#aa44ff' },
  cota_malha: { name: 'Cota Malha', icon: '⛓️', slot: 'armor', dmg: 0, def: 7, tier: 'epic', color: '#aa44ff' },
  machado: { name: 'Machado', icon: '🪓', slot: 'weapon', dmg: 12, def: 0, tier: 'epic', color: '#aa44ff' },
  amuleto: { name: 'Amuleto', icon: '📿', slot: 'neck', dmg: 3, def: 3, tier: 'epic', color: '#aa44ff' },
  botas_rapidas: { name: 'Botas Rápidas', icon: '👢', slot: 'boots', dmg: 0, def: 3, tier: 'epic', color: '#aa44ff' },
  espada_fogo: { name: 'Espada de Fogo', icon: '🔥', slot: 'weapon', dmg: 20, def: 0, tier: 'legendary', color: '#ffaa00' },
  placas_dragao: { name: 'Placas Dragão', icon: '🐉', slot: 'armor', dmg: 0, def: 15, tier: 'legendary', color: '#ffaa00' },
  anel_rei: { name: 'Anel do Rei', icon: '👑', slot: 'ring', dmg: 5, def: 5, tier: 'legendary', color: '#ffaa00' },
  machado_gigante: { name: 'Machado Gigante', icon: '🪓', slot: 'weapon', dmg: 25, def: 0, tier: 'legendary', color: '#ffaa00' },
  capa_invisivel: { name: 'Capa Invisível', icon: '🧥', slot: 'cloak', dmg: 0, def: 10, tier: 'legendary', color: '#ffaa00' }
};

const TIER_WEIGHTS = { common: 50, rare: 30, epic: 15, legendary: 5 };

function getRandomItem() {
  const total = Object.values(TIER_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  let selected = 'common';
  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) { selected = tier; break; }
  }
  const pool = Object.entries(ITEMS).filter(([k, v]) => v.tier === selected);
  const [id, item] = pool[Math.floor(Math.random() * pool.length)];
  return { id, qty: 1 };
}

// ============================================================
// JOGADORES E CONTAS
// ============================================================
let players = {};
let accounts = {};

const ACCOUNTS_FILE = './accounts.json';
try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    console.log('Contas carregadas:', Object.keys(accounts).length);
  }
} catch (e) { console.log('Sem contas salvas ainda'); }

function saveAccounts() {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

function getDefaultPlayerData() {
  return {
    x: BANK_CENTER, y: BANK_CENTER,
    hp: 100, maxHp: 100,
    mana: 50, maxMana: 50,
    xp: 0, maxXp: 100, level: 1,
    gold: 0, kills: 0, deaths: 0,
    class: 'warrior',
    inv: [
      { id: 'espada_madeira', qty: 1 },
      { id: 'tunica', qty: 1 },
      { id: 'pocao_vida', qty: 2 }
    ],
    eq: { weapon: 'espada_madeira', armor: 'tunica', boots: null, ring: null, neck: null, cloak: null },
    bank: [],
    lastLogin: Date.now()
  };
}

function sanitizePlayer(p) {
  return {
    id: p.id, name: p.name, x: p.x, y: p.y,
    hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
    xp: p.xp, maxXp: p.maxXp, level: p.level,
    gold: p.gold, kills: p.kills, deaths: p.deaths,
    class: p.class, inv: p.inv, eq: p.eq, bank: p.bank
  };
}

function getStats(p) {
  let dmg = 0, def = 0;
  for (const slot in p.eq) {
    const itemId = p.eq[slot];
    if (itemId && ITEMS[itemId]) {
      dmg += ITEMS[itemId].dmg || 0;
      def += ITEMS[itemId].def || 0;
    }
  }
  return { dmg, def };
}

function isBank(x, y) {
  return x >= BANK_CENTER - 1 && x <= BANK_CENTER + 1 && y >= BANK_CENTER - 1 && y <= BANK_CENTER + 1;
}

function getTile(x, y) {
  return TILES.find(t => t.x === x && t.y === y);
}

function getPlayersInZone(x, y) {
  return Object.values(players).filter(p => p.x === x && p.y === y);
}

function spawnRandomLoot() {
  const pvpTiles = TILES.filter(t => t.type === 'pvp');
  const tile = pvpTiles[Math.floor(Math.random() * pvpTiles.length)];
  const item = getRandomItem();
  tile.items.push(item);
  io.emit('lootSpawned', { x: tile.x, y: tile.y, items: tile.items });
}

for (let i = 0; i < 15; i++) spawnRandomLoot();
setInterval(() => { if (Object.keys(players).length > 0) spawnRandomLoot(); }, 30000);

function hashPass(pw) { return crypto.createHash('sha256').update(pw).digest('hex'); }

// ============================================================
// AUTH ENDPOINTS
// ============================================================
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, msg: 'Preencha todos os campos' });
  if (username.length < 3 || username.length > 16) return res.json({ success: false, msg: 'Username: 3-16 caracteres' });
  if (password.length < 4) return res.json({ success: false, msg: 'Password mínimo 4 caracteres' });
  if (accounts[username]) return res.json({ success: false, msg: 'Username já existe' });
  accounts[username] = { passwordHash: hashPass(password), data: getDefaultPlayerData() };
  saveAccounts();
  res.json({ success: true, msg: 'Conta criada! Faça login.' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!accounts[username]) return res.json({ success: false, msg: 'Conta não encontrada' });
  if (accounts[username].passwordHash !== hashPass(password)) return res.json({ success: false, msg: 'Password incorreta' });
  res.json({ success: true, msg: 'Login OK', username });
});

// ============================================================
// SOCKET.IO
// ============================================================
const activeSessions = {};

io.on('connection', (socket) => {
  console.log('Socket conectado:', socket.id);
  let player = null;
  let username = null;

  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  for (const [uname, sid] of Object.entries(activeSessions)) {
    const otherSocket = io.sockets.sockets.get(sid);
    if (otherSocket) {
      const otherIp = otherSocket.handshake.headers['x-forwarded-for'] || otherSocket.handshake.address;
      if (otherIp === clientIp && uname !== username) {
        otherSocket.emit('kicked', 'Outra sessão iniciada neste dispositivo');
        otherSocket.disconnect();
      }
    }
  }

  socket.on('login', (data) => {
    const { username: uname, password } = data;
    if (!accounts[uname] || accounts[uname].passwordHash !== hashPass(password)) {
      socket.emit('loginFailed', 'Dados incorretos');
      return;
    }
    if (activeSessions[uname]) {
      const oldSocket = io.sockets.sockets.get(activeSessions[uname]);
      if (oldSocket) { oldSocket.emit('kicked', 'Conta aberta noutro dispositivo'); oldSocket.disconnect(); }
    }
    username = uname;
    activeSessions[username] = socket.id;
    const saved = accounts[username].data;
    player = {
      id: socket.id, name: username,
      x: saved.x, y: saved.y,
      hp: saved.hp, maxHp: saved.maxHp,
      mana: saved.mana, maxMana: saved.maxMana,
      xp: saved.xp, maxXp: saved.maxXp, level: saved.level,
      gold: saved.gold, kills: saved.kills, deaths: saved.deaths,
      class: saved.class,
      inv: JSON.parse(JSON.stringify(saved.inv)),
      eq: JSON.parse(JSON.stringify(saved.eq)),
      bank: JSON.parse(JSON.stringify(saved.bank))
    };
    if (!player.inv || player.inv.length === 0) {
      player.inv = [{ id: 'espada_madeira', qty: 1 }, { id: 'tunica', qty: 1 }, { id: 'pocao_vida', qty: 2 }];
      player.eq = { weapon: 'espada_madeira', armor: 'tunica', boots: null, ring: null, neck: null, cloak: null };
    }
    players[socket.id] = player;
    socket.emit('playerCreated', sanitizePlayer(player));
    socket.emit('mapUpdate', { tiles: TILES, players: Object.values(players).map(sanitizePlayer) });
    socket.broadcast.emit('playerJoined', sanitizePlayer(player));
    io.emit('chatMessage', { from: 'SISTEMA', text: `👤 ${username} entrou no mundo! (Lv.${player.level})`, color: '#ffaa00', isSystem: true });
  });

  socket.on('register', (data) => {
    const { username: uname, password } = data;
    if (!uname || !password) { socket.emit('registerFailed', 'Preencha todos os campos'); return; }
    if (uname.length < 3 || uname.length > 16) { socket.emit('registerFailed', 'Username: 3-16 caracteres'); return; }
    if (password.length < 4) { socket.emit('registerFailed', 'Password mínimo 4 caracteres'); return; }
    if (accounts[uname]) { socket.emit('registerFailed', 'Username já existe'); return; }
    accounts[uname] = { passwordHash: hashPass(password), data: getDefaultPlayerData() };
    saveAccounts();
    socket.emit('registerSuccess', 'Conta criada! Faça login.');
  });

  socket.on('move', (pos) => {
    if (!player) return;
    const dx = Math.abs(pos.x - player.x);
    const dy = Math.abs(pos.y - player.y);
    if (dx + dy !== 1) return;
    if (pos.x < 0 || pos.x >= MAP_SIZE || pos.y < 0 || pos.y >= MAP_SIZE) return;
    if (!isBank(player.x, player.y) && isBank(pos.x, pos.y)) return;
    player.x = pos.x; player.y = pos.y;
    io.emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
  });

  socket.on('attack', (targetId) => {
    if (!player) return;
    const target = players[targetId];
    if (!target) return;
    if (player.x !== target.x || player.y !== target.y) return;
    if (isBank(player.x, player.y)) return;
    if (target.hp <= 0) return;
    const ps = getStats(player);
    const dmg = Math.max(1, ps.dmg + 5 + Math.floor(Math.random() * 5) - getStats(target).def);
    target.hp -= dmg;
    socket.emit('combatLog', `⚔️ Atacaste ${target.name} por ${dmg} dano!`);
    io.to(targetId).emit('combatLog', `💥 ${player.name} atacou-te por ${dmg} dano!`);
    io.emit('damagePopup', { x: target.x, y: target.y, dmg, color: '#ff4444' });
    if (target.hp <= 0) {
      target.hp = 0;
      player.xp += 25; player.kills++;
      if (player.xp >= player.maxXp) {
        player.level++; player.xp -= player.maxXp; player.maxXp = Math.floor(player.maxXp * 1.5);
        player.maxHp += 10; player.hp = player.maxHp; player.maxMana += 5; player.mana = player.maxMana;
        io.to(socket.id).emit('combatLog', `🆙 SUBISTE PARA NÍVEL ${player.level}!`);
      }
      const tile = getTile(target.x, target.y);
      for (const item of target.inv) { if (item) tile.items.push({ ...item }); }
      for (const slot in target.eq) { const itemId = target.eq[slot]; if (itemId) tile.items.push({ id: itemId, qty: 1 }); }
      const bonusCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bonusCount; i++) tile.items.push(getRandomItem());
      io.emit('lootSpawned', { x: tile.x, y: tile.y, items: tile.items });
      io.emit('playerDied', { id: targetId, killer: player.name });
      target.deaths++;
      target.x = BANK_CENTER; target.y = BANK_CENTER;
      target.hp = target.maxHp; target.mana = target.maxMana;
      target.inv = [{ id: 'espada_madeira', qty: 1 }, { id: 'tunica', qty: 1 }, { id: 'pocao_vida', qty: 2 }];
      target.eq = { weapon: 'espada_madeira', armor: 'tunica', boots: null, ring: null, neck: null, cloak: null };
      io.to(targetId).emit('playerRespawned', sanitizePlayer(target));
      io.emit('playerMoved', { id: targetId, x: target.x, y: target.y });
      io.emit('chatMessage', { from: 'SISTEMA', text: `💀 ${player.name} matou ${target.name}!`, color: '#ff4444', isSystem: true });
    }
    io.emit('playerUpdated', sanitizePlayer(player));
    io.emit('playerUpdated', sanitizePlayer(target));
  });

  socket.on('pickup', (idx) => {
    if (!player) return;
    const tile = getTile(player.x, player.y);
    if (!tile || !tile.items[idx]) return;
    const item = tile.items[idx];
    const empty = player.inv.findIndex(s => !s);
    if (empty === -1) { socket.emit('combatLog', '❌ Inventário cheio!'); return; }
    player.inv[empty] = { id: item.id, qty: item.qty };
    tile.items.splice(idx, 1);
    io.emit('lootSpawned', { x: tile.x, y: tile.y, items: tile.items });
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('equip', (idx) => {
    if (!player) return;
    const item = player.inv[idx];
    if (!item || !item.id || !ITEMS[item.id]) return;
    const itemData = ITEMS[item.id];
    if (!itemData.slot || itemData.slot === 'consumable') return;
    const old = player.eq[itemData.slot];
    player.eq[itemData.slot] = item.id;
    player.inv[idx] = old ? { id: old, qty: 1 } : null;
    socket.emit('combatLog', old ? `🔄 Trocado ${ITEMS[old].name} por ${itemData.name}` : `✅ Equipaste ${itemData.name}`);
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('unequip', (slot) => {
    if (!player) return;
    const itemId = player.eq[slot];
    if (!itemId) return;
    const empty = player.inv.findIndex(s => !s);
    if (empty === -1) { socket.emit('combatLog', '❌ Inventário cheio!'); return; }
    player.inv[empty] = { id: itemId, qty: 1 };
    player.eq[slot] = null;
    socket.emit('combatLog', `📦 Desequipaste ${ITEMS[itemId].name}`);
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('useItem', (idx) => {
    if (!player) return;
    const item = player.inv[idx];
    if (!item || !item.id || !ITEMS[item.id]) return;
    const data = ITEMS[item.id];
    if (data.slot !== 'consumable') return;
    if (data.heal) { player.hp = Math.min(player.maxHp, player.hp + data.heal); socket.emit('combatLog', `❤️ Recuperaste ${data.heal} HP`); }
    if (data.mana) { player.mana = Math.min(player.maxMana, player.mana + data.mana); socket.emit('combatLog', `💧 Recuperaste ${data.mana} Mana`); }
    item.qty--; if (item.qty <= 0) player.inv[idx] = null;
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('bankDeposit', (idx) => {
    if (!player || !isBank(player.x, player.y)) return;
    const item = player.inv[idx];
    if (!item) return;
    player.bank.push({ id: item.id, qty: item.qty });
    player.inv[idx] = null;
    socket.emit('combatLog', `🏦 Depositaste ${ITEMS[item.id].name}`);
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('bankWithdraw', (idx) => {
    if (!player || !isBank(player.x, player.y)) return;
    const item = player.bank[idx];
    if (!item) return;
    const empty = player.inv.findIndex(s => !s);
    if (empty === -1) { socket.emit('combatLog', '❌ Inventário cheio!'); return; }
    player.inv[empty] = { id: item.id, qty: item.qty };
    player.bank.splice(idx, 1);
    socket.emit('combatLog', `🏦 Retiraste ${ITEMS[item.id].name}`);
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('rest', () => {
    if (!player || !isBank(player.x, player.y)) return;
    player.hp = player.maxHp; player.mana = player.maxMana;
    socket.emit('combatLog', '💤 Descansaste. HP e Mana restaurados!');
    socket.emit('playerUpdated', sanitizePlayer(player));
  });

  socket.on('chat', (msg) => {
    if (!player) return;
    if (!msg || typeof msg !== 'string') return;
    msg = msg.trim();
    if (msg.length === 0 || msg.length > 200) return;
    const colors = { warrior: '#ff4444', mage: '#aa44ff', rogue: '#44ff44' };
    io.emit('chatMessage', { from: player.name, text: msg, color: colors[player.class] || '#fff', level: player.level, isSystem: false });
  });

  socket.on('disconnect', () => {
    console.log('Socket desconectado:', socket.id);
    if (player && username) {
      if (accounts[username]) {
        accounts[username].data = {
          x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp,
          mana: player.mana, maxMana: player.maxMana, xp: player.xp, maxXp: player.maxXp,
          level: player.level, gold: player.gold, kills: player.kills, deaths: player.deaths,
          class: player.class, inv: JSON.parse(JSON.stringify(player.inv)),
          eq: JSON.parse(JSON.stringify(player.eq)), bank: JSON.parse(JSON.stringify(player.bank)),
          lastLogin: Date.now()
        };
        saveAccounts();
      }
      delete activeSessions[username];
    }
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// ============================================================
// CARREGAR MODULOS
// ============================================================
const modulesDir = path.join(__dirname, 'modules');
if (fs.existsSync(modulesDir)) {
  fs.readdirSync(modulesDir).forEach(file => {
    if (file.endsWith('.js')) {
      try {
        require(path.join(modulesDir, file))({ io, players, accounts, saveAccounts, ITEMS, getStats, isBank, getTile, getPlayersInZone, sanitizePlayer });
        console.log('Modulo carregado:', file);
      } catch (e) { console.log('Erro no modulo', file, e.message); }
    }
  });
}

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Aethermoor MMO v11 rodando na porta', PORT));
