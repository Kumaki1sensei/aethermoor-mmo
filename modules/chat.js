// Modulo de Chat - Aethermoor MMO
// Este ficheiro e carregado automaticamente pelo server.js
// Podes adicionar comandos especiais de chat aqui!

module.exports = function({ io, players, accounts, saveAccounts, ITEMS, getStats, isBank, getTile, getPlayersInZone, sanitizePlayer }) {

  // Comandos especiais de chat
  io.on('connection', (socket) => {

    socket.on('chat', (msg) => {
      // Comandos especiais comecam com /
      if (msg.startsWith('/')) {
        const parts = msg.slice(1).split(' ');
        const cmd = parts[0].toLowerCase();

        if (cmd === 'help') {
          socket.emit('chatMessage', {
            from: 'AJUDA',
            text: 'Comandos: /help, /online, /rank, /me',
            color: '#44ff44',
            isSystem: true
          });
          return; // Nao enviar como mensagem normal
        }

        if (cmd === 'online') {
          const count = Object.keys(players).length;
          socket.emit('chatMessage', {
            from: 'SISTEMA',
            text: 'Jogadores online: ' + count,
            color: '#ffaa00',
            isSystem: true
          });
          return;
        }

        if (cmd === 'rank') {
          const sorted = Object.values(players).sort((a, b) => (b.kills || 0) - (a.kills || 0)).slice(0, 5);
          let text = 'TOP KILLS: ';
          sorted.forEach((p, i) => { text += (i+1) + '.' + p.name + '(' + (p.kills||0) + ') '; });
          socket.emit('chatMessage', {
            from: 'RANK',
            text: text,
            color: '#ffaa00',
            isSystem: true
          });
          return;
        }

        if (cmd === 'me') {
          const p = Object.values(players).find(pl => pl.id === socket.id);
          if (p) {
            socket.emit('chatMessage', {
              from: 'INFO',
              text: p.name + ' Lv.' + p.level + ' | Kills:' + (p.kills||0) + ' Deaths:' + (p.deaths||0),
              color: '#4488ff',
              isSystem: true
            });
          }
          return;
        }
      }
    });
  });

  console.log('[Chat Module] Comandos carregados: /help, /online, /rank, /me');
};
