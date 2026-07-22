
# AETHERMOOR MMO - v6 Final

## O que foi corrigido nesta versão

| Problema | Causa | Correção |
|----------|-------|----------|
| "🟡 Conectando..." eterno | Socket.IO não carregava no Render | Cliente carrega do CDN (socket.io.min.js) em vez de `/socket.io/socket.io.js` |
| Porta 10000 bloqueada | Render usa porta interna diferente | `window.location.host` detecta automaticamente |
| WebSocket cai no free tier | Render free tem limitações | `transports: ['polling','websocket']` — polling primeiro |

## Arquivos

```
aethermoor-server/
├── server.js          # Servidor Node.js
├── package.json       # Dependências
└── public/
    └── index.html     # Cliente do jogo
```

## Como subir no GitHub

1. Vá em https://github.com/SEU_NOME/aethermoor-mmo
2. Substitua os 3 arquivos:
   - `server.js` → cole o novo código
   - `package.json` → cole o novo código
   - `public/index.html` → cole o novo código
3. Commit: "v6 Final - Socket.IO CDN fix"

## Como re-deploy no Render

1. Vá em https://dashboard.render.com
2. Clique no seu serviço `aethermoor-mmo`
3. Clique "Manual Deploy" → "Deploy latest commit"
4. Aguarde 2-3 minutos

## Teste

Acesse: https://aethermoor-mmo.onrender.com

Deve mostrar:
- 🟢 Online (em segundos)
- Campo de nome + escolha de classe
- Botão "ENTRAR NO MUNDO" funciona!
