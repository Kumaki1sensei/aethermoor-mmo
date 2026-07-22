[README.md](https://github.com/user-attachments/files/30284500/README.md)
# ⚔️ AETHERMOOR MMO - Servidor Multiplayer

## 🎮 Sobre
MMO RPG PvP em tempo real com WebSockets. Jogue com seus amigos!

## 📋 Requisitos
- Node.js 18+ (https://nodejs.org)
- npm (vem com Node.js)

## 🚀 Instalação Rápida

### 1. Instalar dependências
```bash
npm install
```

### 2. Iniciar servidor
```bash
npm start
```

### 3. Acessar o jogo
Abra no navegador:
```
http://localhost:3000
```

## 🌐 Jogar com Amigos

### Opção A: Mesma rede WiFi (LAN)
1. Descubra o IP do computador servidor:
   - Windows: `ipconfig` (procure IPv4)
   - Mac/Linux: `ifconfig` ou `ip addr`
2. Seus amigos acessam: `http://SEU_IP:3000`
   - Exemplo: `http://192.168.1.5:3000`

### Opção B: Internet (Port Forwarding)
1. No roteador, redirecione porta 3000 para o IP do servidor
2. Descubra seu IP público: https://whatismyipaddress.com
3. Amigos acessam: `http://SEU_IP_PUBLICO:3000`

### Opção C: Hospedagem Gratuita (Recomendado)
1. Suba para GitHub
2. Hospede no Render.com (grátis)
3. Ou use ngrok para teste temporário:
   ```bash
   npx ngrok http 3000
   ```

## 🗺️ Mapa
```
⚔️ ⚔️ ⚔️ ⚔️ ⚔️
⚔️ 🏦 🏦 ⚔️ ⚔️
⚔️ 🏦 🏦 ⚔️ ⚔️
⚔️ ⚔️ ⚔️ ⚔️ ⚔️
⚔️ ⚔️ ⚔️ ⚔️ ⚔️
```
- 🏦 = Banco (seguro, sem PvP)
- ⚔️ = Zona PvP (qualquer um pode te atacar!)

## ⚔️ Como Jogar
1. Digite seu nome e escolha classe
2. Equipe itens no inventário
3. Clique no mapa para se mover
4. Fora do banco = PvP livre!
5. Atacar jogadores próximos
6. Matou? Pega os itens do chão!
7. Guarde no banco (seguro se morrer)
8. 💀 Morreu? Perde tudo e ressurge no banco

## 🛠️ Comandos
| Comando | Descrição |
|---------|-----------|
| `npm start` | Inicia servidor |
| `npm run dev` | Inicia com auto-reload |

## 📁 Estrutura
```
aethermoor-server/
├── server.js          # Servidor Node.js + Socket.IO
├── package.json       # Dependências
├── public/
│   └── index.html     # Cliente do jogo
└── README.md
```

## 🐛 Troubleshooting
- **"Cannot find module"** → Rode `npm install`
- **Porta em uso** → Mude a porta no `server.js` (linha `const PORT`)
- **Amigos não conseguem conectar** → Verifique firewall e port forwarding

## 📝 Licença
MIT - Use à vontade!
