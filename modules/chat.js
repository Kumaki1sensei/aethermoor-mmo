// ===== CHAT MODULE =====
// Adiciona chat global ao Aethermoor MMO
// Coloque este ficheiro em: modules/chat.js
// O server.js carrega automaticamente todos os .js da pasta modules/

module.exports = function({ io, players, broadcastAll }) {

  io.on('connection', (socket) => {

    socket.on('chat', ({ message }) => {
      const p = players.get(socket.id);
      if (!p || !message) return;
      const cleanMsg = message.trim().substring(0, 200);
      if (!cleanMsg) return;

      broadcastAll('chatMessage', { 
        name: p.name, 
        message: cleanMsg, 
        cls: p.cls,
        lvl: p.lvl,
        timestamp: Date.now()
      });
    });

  });

  console.log('[Chat Module] Loaded successfully');
};
