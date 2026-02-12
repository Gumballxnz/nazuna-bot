# 📋 PRD / Diário — Bot Nazuna

> **Última atualização:** 2026-02-12 12:26 CAT
> **Autor:** Gumball × Antigravity
> **Status:** � Online — Conectado via PM2

---

## 📌 Informações Gerais

| Campo | Valor |
|---|---|
| **Nome do Bot** | Nazuna |
| **Versão** | 8.0.0 |
| **Prefixo de Comando** | `!` |
| **Nome do Dono** | 🇯🇵𝙶𝙷𝙾𝚂𝚃 𝙶𝚄𝙼𝙱𝙰𝙻𝙻 ╰⁔╯ |
| **Número do Dono** | 258879116693 |
| **Número do Bot** | 258858148698 |
| **LID do Dono** | 159034049044504@lid |
| **Timezone** | Africa/Maputo |
| **Debug Mode** | ❌ Desativado |

---

## 🏗️ Infraestrutura

### AWS EC2
| Campo | Valor |
|---|---|
| **IP Público** | `13.51.121.237` |
| **Chave SSH** | `bot-chave-nova.pem` (local: `f:\BOTS\nazuna\bot-chave-nova.pem`) |
| **Região** | eu-north-1 (Estocolmo) |
| **Gerenciador** | PM2 |
| **OS do Servidor** | Linux (Ubuntu) |
| **Node.js Req.** | >= 20.0.0 |
| **npm Req.** | >= 9.0.0 |

### Comando SSH
```bash
ssh -i "bot-chave-nova.pem" ubuntu@13.51.121.237
```

### GitHub
| Campo | Valor |
|---|---|
| **Repositório** | [Gumballxnz/nazuna-bot](https://github.com/Gumballxnz/nazuna-bot) |
| **Repo Original (fork)** | hiudyy/nazuna |

---

## 🛠️ Stack Tecnológica

| Tecnologia | Versão | Descrição |
|---|---|---|
| **@whiskeysockets/baileys** | ^7.0.0-rc.9 | Biblioteca WhatsApp Web API |
| **Node.js** | >= 20.0.0 | Runtime |
| **pino** | ^10.1.0 | Logger (silenciado em produção) |
| **axios** | ^1.13.2 | Cliente HTTP |
| **fluent-ffmpeg** | ^2.1.3 | Processamento de mídia |
| **node-cache** | ^5.1.2 | Cache em memória |
| **node-cron** | ^4.2.1 | Tarefas agendadas |
| **node-webpmux** | ^3.2.1 | Stickers WebP |
| **qrcode-terminal** | ^0.12.0 | QR no terminal |
| **youtube-sr** | ^4.3.12 | Busca YouTube |
| **linkedom** | ^0.18.12 | DOM parser |
| **nodemon** | ^3.1.4 | Dev hot-reload |

---

## 📁 Arquitetura do Código

```
nazuna/
├── package.json               # Configuração do projeto
├── dados/
│   ├── src/
│   │   ├── connect.js         # 🔑 Conexão principal (1537 linhas)
│   │   ├── config.json        # Configurações do bot
│   │   ├── index.js           # 🔑 Handler de comandos (1.5MB!)
│   │   ├── .scripts/
│   │   │   ├── start.js       # Script de inicialização
│   │   │   ├── config.js      # Configurador interativo
│   │   │   └── update.js      # Atualizador
│   │   ├── funcs/             # 59 módulos de funções
│   │   ├── menus/             # 16 menus
│   │   └── utils/             # 16 utilitários
│   │       ├── autoRestarter.js
│   │       ├── database.js
│   │       ├── helpers.js
│   │       ├── performanceOptimizer.js
│   │       ├── rentalExpirationManager.js
│   │       ├── subBotManager.js
│   │       ├── systemMonitor.js
│   │       └── ...
│   ├── database/              # Dados persistentes
│   │   ├── qr-code/           # Sessão de autenticação
│   │   ├── grupos/            # Configurações de grupos
│   │   ├── dono/              # Dados do dono
│   │   └── users/             # Dados de usuários
│   ├── logs/                  # Logs de execução
│   └── midias/                # Arquivos de mídia
```

---

## 🔌 Configuração de Conexão (connect.js)

| Parâmetro | Valor | Descrição |
|---|---|---|
| `connectTimeoutMs` | 180.000ms (3min) | Timeout de conexão |
| `keepAliveIntervalMs` | 60.000ms (1min) | Intervalo de heartbeat |
| `retryRequestDelayMs` | 10.000ms | Delay entre retries |
| `qrTimeout` | 180.000ms (3min) | Timeout do QR code |
| `syncFullHistory` | ❌ false | Não sincroniza histórico |
| `markOnlineOnConnect` | ✅ true | Marca online ao conectar |
| `browser` | `['Ubuntu', 'Chrome', '20.0.04']` | User-Agent |
| `MAX_RECONNECT_ATTEMPTS` | 10 | Máx tentativas reconexão |
| `MAX_403_ATTEMPTS` | 3 | Máx tentativas erro 403 |
| `RECONNECT_DELAY_BASE` | 5.000ms | Base do backoff |

### Sistema de Fila de Mensagens
- **Workers:** 8
- **Lotes simultâneos:** 10
- **Mensagens por lote:** 2
- **Total paralelo:** 20 mensagens por ciclo

---

## 🔴 Diagnóstico de Desconexão

### Problema Reportado
O bot desconecta do WhatsApp repetidamente, necessitando reconexão manual.

### Causas Identificadas

#### 🟥 Crítico — Baileys RC Instável
A versão `@whiskeysockets/baileys@^7.0.0-rc.9` é uma **Release Candidate**. Versões RC são **pré-release** e possuem bugs conhecidos de estabilidade de conexão no WhatsApp. Esta é a causa mais provável das desconexões.

**Recomendação:** Atualizar para a versão estável mais recente do Baileys.

#### 🟧 Alto — Flag `isReconnecting` Resetado Prematuramente
Na `startNazu()` (linha 1420), o flag `isReconnecting = false` é definido logo após `createBotSocket()` retornar, mas isso acontece ANTES da conexão WebSocket estar plenamente estabilizada. O `createBotSocket` retorna o socket, mas a conexão real só é completada quando o evento `connection: 'open'` é emitido.

```diff
- isReconnecting = false; // Conexão estabelecida com sucesso (PREMATURO!)
+ // isReconnecting deveria ser resetado dentro do handler connection === 'open'
```

#### 🟧 Alto — Reset de `reconnectAttempts` Inconsistente
Na linha 1393 do handler `connection.close`, `reconnectAttempts = 0` é chamado DENTRO do setTimeout, resetando o contador a cada tentativa. Isso anula o mecanismo de backoff exponencial, causando reconexões infinitas rápidas.

#### 🟨 Médio — `process.exit(1)` em `uncaughtException`
Na linha 1532, qualquer erro não capturado (mesmo inofensivo) mata o processo completamente. Se o PM2 reinicia, a sessão pode ficar corrompida.

#### 🟨 Médio — Sem Monitoramento de Heartbeat
O `keepAliveIntervalMs: 60_000` envia pings, mas não há verificação se o WhatsApp respondeu. Se o servidor ignorar os pings, o bot não detecta que está "morto" até o próximo timeout.

#### 🟦 Baixo — Browser Fingerprint
`['Ubuntu', 'Chrome', '20.0.04']` é um user-agent incomum que pode ser flaggeado pelo WhatsApp como suspeito.

---

## 📝 Histórico de Atualizações

### 2026-02-12 — Criação do PRD + Reconexão
- ✅ Documento PRD criado com informações completas do bot
- ✅ Diagnóstico de desconexão documentado (6 causas)
- ✅ Servidor verificado: Running, disco 34%, RAM 42%, swap 7%
- ✅ Sessão anterior limpa e pairing code gerado (`S88QT2ZT`)
- ✅ Bot conectado ao WhatsApp com número 258858148698
- ✅ PM2 reconfigurado: `pm2 start dados/src/connect.js --name nazuna`
- ✅ PM2 salvo para persistência (`pm2 save`)
- ✅ Bot online: 0 restarts, 109.4MB, status online

#### Correções de Estabilidade Aplicadas
- ✅ **isReconnecting**: Flag agora é resetado no `connection=open` (não no `createBotSocket`)
- ✅ **reconnectAttempts**: Reset movido para `connection=open`, backoff exponencial preservado
- ✅ **Heartbeat Monitor**: Detecta conexão zumbi após 90s sem resposta e força reconexão
- ✅ **Browser Fingerprint**: Atualizado de `['Ubuntu', 'Chrome', '20.0.04']` para `['Chrome (Linux)', 'Chrome', '130.0.0.0']`
- ✅ **keepAlive**: Reduzido de 60s para 25s para detecção mais rápida
- ✅ **uncaughtException**: Não mata mais o processo por erros não-críticos do Baileys
- ✅ **unhandledRejection**: Handler adicionado para capturar promises não tratadas
- ✅ Deploy via SCP + PM2 restart
- 🔲 Pendente: Atualizar Baileys para versão estável (requer npm install no servidor)

### Conversas Anteriores Relevantes
| Data | Assunto | ID da Conversa |
|---|---|---|
| 2026-02-10 | Fusão de bots Nazuna + Saitama | `b095e628` |
| 2026-02-07 | Recovery de sessão | `2e111842` |
| 2026-02-07 | Fix sticker commands | `8af6664b` |
| 2026-01-12 | Fixing bot deployment | `35721941` |
| 2026-01-11 | Fixing admin commands | `abb41377` |
| 2026-01-11 | Bot session recovery | `e6b109cb` |
| 2026-01-10 | Fix owner permissions | `52039d67` |

---

## 🔑 Chaves e Credenciais

| Recurso | Localização |
|---|---|
| **SSH Key** | `f:\BOTS\nazuna\bot-chave-nova.pem` |
| **SSH Key (backup)** | `f:\BOTS\nazuna\key.pem` |
| **API Key** | Vazia no `config.json` (campo `apikey`) |
| **Sessão WhatsApp** | `dados/database/qr-code/` (no servidor) |
| **Sessão Backup** | `f:\BOTS\nazuna\session.zip` |

---

## 🔜 Próximos Passos
1. [ ] Conectar via SSH ao servidor (13.51.121.237) para verificar logs
2. [ ] Analisar logs do PM2 para identificar padrões de desconexão
3. [ ] Verificar uso de disco/memória no servidor
4. [ ] Corrigir bugs de reconexão identificados
5. [ ] Atualizar Baileys para versão estável
6. [ ] Gerar pairing code e reconectar com número 258858148698
7. [ ] Testar estabilidade de conexão após correções
