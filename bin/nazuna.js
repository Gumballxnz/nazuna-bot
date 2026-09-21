#!/usr/bin/env node

import { createInterface } from 'readline';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');
const USER_CWD = process.cwd();

const LOCAL_CONFIG_PATH = join(USER_CWD, 'nazuna.config.json');
const INTERNAL_CONFIG_PATH = join(PKG_ROOT, 'dados', 'src', 'config.json');
const CONFIG_PATH = existsSync(LOCAL_CONFIG_PATH) ? LOCAL_CONFIG_PATH : (existsSync(INTERNAL_CONFIG_PATH) ? INTERNAL_CONFIG_PATH : LOCAL_CONFIG_PATH);

const rawArgs = process.argv.slice(2);
const cmd = rawArgs[0];

function ask(rl, question, fallback = '') {
    return new Promise(resolve => {
        const hint = fallback ? ` (padrão: ${fallback})` : '';
        rl.question(`${question}${hint}: `, ans => {
            resolve(ans.trim() || fallback);
        });
    });
}

async function runInit() {
    console.log('\n🌸 Nazuna Bot — Setup Wizard\n');

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const ownerNumber = await ask(rl, '📱 Seu número do WhatsApp (com DDI/DDD, ex: 258879116693)', '');
    if (!ownerNumber || !/^\d{7,15}$/.test(ownerNumber)) {
        console.log('❌ Número inválido. Execute novamente informando apenas dígitos.');
        rl.close();
        process.exit(1);
    }

    const ownerName = await ask(rl, '👤 Seu nome/apelido de Dono', 'Ghost Gumball');
    const botName = await ask(rl, '🤖 Nome do bot', 'nazuna');
    const botNumber = await ask(rl, '📱 Número do chip do Bot (opcional, para pareamento)', ownerNumber);
    const prefix = await ask(rl, '⌨️ Prefixo dos comandos', '!');
    const timezone = await ask(rl, '🌍 Fuso horário (Timezone)', 'Africa/Maputo');

    rl.close();

    const configData = {
        prefixo: prefix,
        nomebot: botName,
        nomedono: ownerName,
        numerodono: ownerNumber,
        debug: false,
        apikey: '',
        botNumber: botNumber,
        lidowner: '',
        timezone: timezone
    };

    writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(configData, null, 2) + '\n', 'utf-8');

    const gitignorePath = join(USER_CWD, '.gitignore');
    const gitignoreEntries = '\nnazuna.config.json\ndatabase/\n*.log\n*.key\n*.pem\n';
    if (existsSync(gitignorePath)) {
        const existing = readFileSync(gitignorePath, 'utf-8');
        if (!existing.includes('nazuna.config.json')) {
            writeFileSync(gitignorePath, existing + gitignoreEntries, 'utf-8');
        }
    } else {
        writeFileSync(gitignorePath, gitignoreEntries.trim() + '\n', 'utf-8');
    }

    const dbDir = join(USER_CWD, 'database');
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    if (!existsSync(join(dbDir, 'qr-code'))) mkdirSync(join(dbDir, 'qr-code'), { recursive: true });
    if (!existsSync(join(dbDir, 'grupos'))) mkdirSync(join(dbDir, 'grupos'), { recursive: true });
    if (!existsSync(join(dbDir, 'users'))) mkdirSync(join(dbDir, 'users'), { recursive: true });
    if (!existsSync(join(dbDir, 'dono'))) mkdirSync(join(dbDir, 'dono'), { recursive: true });

    console.log('\n✅ nazuna.config.json criado com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('  npx nazuna-bot pair   → Conectar ao WhatsApp via código de pareamento');
    console.log('  npx nazuna-bot start  → Iniciar a Nazuna\n');
}

function resolveEnv() {
    const isInsidePkg = USER_CWD === PKG_ROOT;
    const dbPath = isInsidePkg ? join(PKG_ROOT, 'dados', 'database') : join(USER_CWD, 'database');
    const authPath = join(dbPath, 'qr-code');

    process.env.DATABASE_PATH = process.env.DATABASE_PATH || dbPath;
    process.env.AUTH_PATH = process.env.AUTH_PATH || authPath;
    process.env.CONFIG_PATH = process.env.CONFIG_PATH || CONFIG_PATH;
}

async function runPair(extraNumber) {
    if (!existsSync(CONFIG_PATH)) {
        console.log('ℹ️ Configuração não encontrada. Iniciando setup...');
        await runInit();
    }

    let cfg = {};
    try {
        cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {}

    const phone = extraNumber || cfg.botNumber || cfg.numerodono;
    if (!phone) {
        console.log('❌ Número não encontrado. Use: npx nazuna-bot pair <numero>');
        process.exit(1);
    }

    resolveEnv();

    const connectScript = join(PKG_ROOT, 'dados', 'src', 'connect.js');
    const child = spawn(process.execPath, [
        connectScript,
        `--phone=${phone}`,
        '--code'
    ], {
        stdio: 'inherit',
        cwd: USER_CWD,
        env: { ...process.env }
    });

    child.on('exit', code => process.exit(code ?? 0));
}

async function runStart(forwardArgs = []) {
    if (!existsSync(CONFIG_PATH)) {
        console.log('ℹ️ Configuração não encontrada. Iniciando setup wizard...');
        await runInit();
    }

    resolveEnv();

    const connectScript = join(PKG_ROOT, 'dados', 'src', 'connect.js');
    const child = spawn(process.execPath, [
        '--no-deprecation',
        '--max-old-space-size=512',
        connectScript,
        ...forwardArgs
    ], {
        stdio: 'inherit',
        cwd: USER_CWD,
        env: { ...process.env }
    });

    child.on('exit', code => process.exit(code ?? 0));
}

function showVersion() {
    try {
        const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
        console.log(`nazuna-bot v${pkg.version}`);
    } catch {
        console.log('nazuna-bot v9.0.0');
    }
}

function showHelp() {
    console.log('\n🌸 Nazuna Bot CLI — WhatsApp Multi-device Bot\n');
    console.log('Uso:');
    console.log('  npx nazuna-bot init            Assistente de configuração inicial');
    console.log('  npx nazuna-bot pair [numero]   Parear com código de 8 dígitos');
    console.log('  npx nazuna-bot start           Iniciar o bot');
    console.log('  npx nazuna-bot version         Exibir versão atual');
    console.log('  npx nazuna-bot help            Exibir este menu de ajuda\n');
    console.log('Exemplos diretos:');
    console.log('  npx nazuna-bot --phone=258858148698 --code');
    console.log('  npx nazuna-bot start\n');
}

switch (cmd) {
    case 'init':
    case 'setup':
    case 'config':
        runInit();
        break;
    case 'pair':
        runPair(rawArgs[1]);
        break;
    case 'start':
        runStart(rawArgs.slice(1));
        break;
    case 'version':
    case '-v':
    case '--version':
        showVersion();
        break;
    case 'help':
    case '-h':
    case '--help':
        showHelp();
        break;
    default:
        if (rawArgs.some(a => a.startsWith('--phone') || a === '--code' || a === '--qr')) {
            runStart(rawArgs);
        } else if (rawArgs.length === 0) {
            runStart();
        } else {
            showHelp();
        }
}
