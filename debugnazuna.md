openclaude relatorio : Agora tenho uma visão completa. Aqui está o relatório de problemas encontrados:

  ---
  Relatório de Investigação - Nazuna Bot (VPS Oracle Cloud)

  1. CRÍTICO: Memória RAM insuficiente na VPS

  - RAM total: 954 MB (extremamente baixo para rodar 5 bots)
  - RAM usada: 768 MB, livre: apenas 70 MB
  - Swap usado: 1170 MB (sinal de pressão de memória grave)
  - Nazuna sozinho usa ~85 MB, mas o --max-old-space-size=250 no PM2 config é muito baixo comparado  
  ao --max-old-space-size=1024 no start.js
  - Conflito de configuração de memória: o ecosystem.config.cjs define --max-old-space-size=4096 mas 
  o PM2 mostra --max-old-space-size=250. O PM2 está usando uma configuração diferente do ecossistema.
  2. CRÍTICO: 38 restarts em 3 horas

  - O Nazuna reiniciou 38 vezes em apenas 3 horas de uptime
  - Taxa: ~12 restarts/hora — instabilidade severa
  - Causa principal: loops de erro 428 (Connection Closed / rate limit do WhatsApp)

  3. ALTO: Erro 428 em loop

  - Logs mostram ciclos repetidos de: conectar → receber mensagem → erro 428 → reconectar
  - O código tenta proteger contra isso com MAX_428_CONSECUTIVE = 5, mas como o bot conecta com      
  sucesso (open) antes de receber o 428, o reconnectAttempts reseta no open, e o ciclo se repete     
  - O consecutive428Count reseta no open (linha ~1340), mas o 428 vem logo depois — criando um loop  
  infinito que nunca atinge o limite

  4. ALTO: RentalExpirationManager inicializado sem nazu (null)

  - Na linha 285: new RentalExpirationManager(null, {...}) — passa null como socket
  - Só é atribuído na linha ~1375: rentalExpirationManager.nazu = NazunaSock
  - Se o cron job disparar entre a inicialização e a conexão, vai dar erro em
  this.nazu.groupMetadata() — null pointer
  - O log confirma: ⚠️ RentalExpirationManager is already running — tentou inicializar duas vezes    

  5. MÉDIO: Session keys expostas nos logs

  - O bot loga dados sensíveis de sessão Signal/WhatsApp (Buffer de chaves privadas, pubKey, privKey)   no stdout
  - Isso é um risco de segurança — chaves criptográficas em logs

  6. MÉDIO: Watchdog não limpa conexões mortas corretamente

  - O watchdog (linha ~1344) faz presenceSubscribe a cada 45s
  - Mas se a conexão morrer silenciosamente entre os pings, o bot fica "zumbi" por até 45s
  - O erro Connection Closed nos logs de erro mostra que o cron de fetch_metadata falha quando a     
  conexão cai, mas não força restart

  7. MÉDIO: Cron de fetch_metadata falhando

  - Erros: [Cron Error] fetch_metadata 120363405943505943@g.us: Connection Closed
  - 3 grupos falhando — indica que o cron tenta executar em cima de uma conexão já morta

  8. BAIXO: 10 vulnerabilidades npm (2 moderate, 7 high, 1 critical)

  - O deploy log mostra vulnerabilidades não corrigidas
  - npm audit fix nunca foi rodado

  9. BAIXO: SSH key no repositório

  - ssh-key-2026-04-14.key está dentro do diretório do bot na VPS — deveria estar fora do repo       

  10. INFO: Ecosystem config não está sendo usado pelo PM2

  - PM2 mostra o nome como nazuna com args --code --phone=258858148698, mas o ecosystem.config.cjs   
  define nome nazuna-bot com npm start
  - O bot foi iniciado manualmente com pm2 start dados/src/connect.js --name nazuna -- --code        
  --phone=..., ignorando o ecossistema

  ---
  Resumo das ações prioritárias recomendadas (sem alterar nada):

  1. Upgrade de RAM — 954 MB é insuficiente para 5 bots + PM2 + sistema
  2. Fixar o bug do 428 loop — o consecutive428Count precisa persistir entre ciclos de reconexão, não   resetar no open
  3. Fixar o null pointer do RentalExpirationManager — inicializar com o socket após conexão, não    
  antes
  4. Remover logs de chaves de sessão — dados sensíveis expostos
  5. Rodar npm audit fix para corrigir vulnerabilidades
  
  
  relaotrio do anitgravity CLI:  Encontrei problemas críticos que explicam por que ele está instável na sua
  VPS. O subagente de pesquisa foi muito preciso em algumas suspeitas, e eu
  confirmei cada uma delas analisando o código real e os logs da sua VPS.

  ### 🚩 Relatório de Problemas Identificados:
  #### 1. Bug Crítico de Memória (Self-Destruction) 🧠💥

  No arquivo optimizedCache.js, a lógica de limpeza de cache está quebrada:

  • O erro:  if (memoryPercentage > 1024) .
  • O problema: O valor de  memoryPercentage  varia entre 0 e 1 (ex: 0.95
  para 95%). Como ele nunca será maior que 1024, o bot nunca limpa o cache,
  acumulando lixo na memória até travar ou ser morto pelo sistema.
  #### 2. Loop de Reinicialização Agressivo 🔄🔥
  No script start.js, o bot está configurado para reiniciar em apenas
  500ms após qualquer erro, sem limite de tentativas ou tempo de espera
  (backoff).

  • Consequência: Isso gera um estresse enorme na CPU da VPS e na sua conexão
  com o WhatsApp. Se o WhatsApp der um erro temporário, o bot tenta
  reconectar 2 vezes por segundo, o que acaba causando o banimento temporário
  da conexão (Erro 428) por excesso de tentativas.
  #### 3. I/O Síncrono Bloqueante (Lentidão) ⏳🐢

  A função  saveJsonFileSafe  em helpers.js usa  fs.writeFileSync  e     
  fs.renameSync .

  • O problema: Toda vez que o bot salva dados de usuários, economia ou
  grupos, ele trava completamente por alguns milissegundos. Em grupos grandes
  ou com muitos comandos, esses travamentos se acumulam, causando lag e
  desconexões.

  #### 4. Erro 428 (Conexão do WhatsApp) 📱❌

  Os logs da VPS confirmaram que o bot está caindo com o Código 428 (Conexão 
  Fechada).

  • Causa provável: É um efeito dominó dos problemas acima. O bot trava por
  I/O síncrono -> a memória enche e ele fica lento -> o WhatsApp fecha a
  conexão por timeout -> o script  start.js  tenta reconectar loucamente a
  cada 500ms -> o WhatsApp bloqueia a conexão por segurança.

  #### 5. Uso de Memória no Limite na VPS 📊

  O PM2 mostrou que o bot está usando 95.82% do Heap alocado no momento da
  verificação. Sem a limpeza de cache funcionando, ele está vivendo "no fio
  da navalha".