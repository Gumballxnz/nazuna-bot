#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');

function run(cmd) {
    console.log(`\n▶ ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const originalName = pkg.name;

console.log('\n🌸 Nazuna Bot — Dual Publish\n');
console.log(`📦 Versão: ${pkg.version}`);

const otpArg = process.argv.find(a => a.startsWith('--otp=')) || (process.argv.includes('--otp') ? `--otp=${process.argv[process.argv.indexOf('--otp') + 1]}` : '');
const otpFlag = otpArg ? ` ${otpArg}` : '';

try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1/2  Publicando como: nazuna-bot (público global)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    pkg.name = 'nazuna-bot';
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    run(`npm publish --access public${otpFlag}`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2/2  Publicando como: @gumballxnz/nazuna-bot (scoped)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    pkg.name = '@gumballxnz/nazuna-bot';
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    run(`npm publish --access public${otpFlag}`);
} finally {
    pkg.name = originalName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

console.log('\n✅ Publicado nos dois registros npm!');
console.log('\nFormas de instalar e rodar:');
console.log('  npx nazuna-bot init');
console.log('  npx @gumballxnz/nazuna-bot init');
console.log('  npx github:Gumballxnz/nazuna-bot init\n');
