import { spawn } from 'child_process';
import fs from 'fs';
const fsPromises = fs.promises;
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delay = ms => new Promise(res => setTimeout(res, ms));

// Configurações
const dir = path.join(__dirname, '..', '..', 'tmp');
const MAX_SIZE_MB = 100; // Limite do WhatsApp agora é arredor de 100MB (embora 50 seja mais seguro)
const TIMEOUT_MS = 240000; // 4 minutos de limite
const TEMPO_LIMPEZA_MS = 3600000; // 1 hora

// Garantir que a pasta tmp existe em dados/tmp
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Limpeza automática do tmp
setInterval(() => {
    try {
        const files = fs.readdirSync(dir);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > TEMPO_LIMPEZA_MS) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (err) {
        console.error('Erro na limpeza de download:', err);
    }
}, TEMPO_LIMPEZA_MS);

async function digitando(nazu, from, tempo = 4000) {
    try {
        await nazu.sendPresenceUpdate('composing', from);
        // Atraso síncrono da promise apenas para manter o presence ativo caso não respondamos logo
        setTimeout(async () => {
             await nazu.sendPresenceUpdate('paused', from);
        }, tempo);
    } catch {}
}

function validarUrl(url) {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.com|twitter\.com|x\.com|tiktok\.com)\/.+$/i;
    return regex.test(url);
}

const PYTHON = 'python3';
const YTDLP = ['-m', 'yt_dlp'];

export default async function baixarVideoLocal(nazu, from, m, q, reply) {
    let dl = null;
    let ffmpeg = null;
    let timeout = null;
    let raw = null;
    let final = null;

    try {
        if (!q) {
            return reply('❌ Envie um link válido.\n\n📌 *Exemplos:*\n• youtube.com/watch?v=...\n• instagram.com/p/...\n• tiktok.com/@user/video/...\n• x.com/user/status/...\\n• fb.watch/...');
        }

        const url = q.trim().split(' ')[0]; // Garante que pega só o primeiro link no texto

        // Validar URL
        if (!validarUrl(url)) {
            return reply('❌ Link inválido ou não suportado para o módulo gratuito.\n\n📌 *Sites suportados:*\n• YouTube\n• Instagram\n• Facebook\n• Twitter/X\n• TikTok');
        }

        // Reagir com download
        if (m.key) {
            await nazu.sendMessage(from, { react: { text: '🔄', key: m.key } }).catch(()=>{});
        }

        const notifyMsg = await reply('📥 *Iniciando Download...*\nIsso não gasta APIs. Por favor, aguarde a conversão não fechar.');
        await digitando(nazu, from, 5000);

        // Criar nomes de arquivos únicos
        const timestamp = Date.now();
        raw = path.join(dir, `raw_${timestamp}.mp4`);
        final = path.join(dir, `final_${timestamp}.mp4`);

        // Função para limpar arquivos
        const limparArquivos = () => {
            try {
                if (raw && fs.existsSync(raw)) fs.unlinkSync(raw);
                if (final && fs.existsSync(final)) fs.unlinkSync(final);
            } catch (err) {}
        };

        // Timeout global
        timeout = setTimeout(() => {
            console.log('Timeout: download local yt-dlp excedeu o limite');
            if (dl) dl.kill();
            if (ffmpeg) ffmpeg.kill();
            limparArquivos();
            reply('⏰ *Tempo Limite Excedido!*\nO vídeo demorou mais de 4 minutos para ser puxado ou convertido. O processo foi abortado.');
        }, TIMEOUT_MS);

        // 📥 Download com yt-dlp
        console.log(`[yt-dlp local] Iniciando download: ${url}`);
        dl = spawn(PYTHON, [
            ...YTDLP,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', raw,
            '--no-playlist', 
            '--socket-timeout', '30',
            url
        ]);

        let stderrout = '';
        dl.stderr.on('data', (data) => {
            stderrout += data.toString();
        });

        dl.on('error', (err) => {
            console.error('Erro no yt-dlp:', err);
            clearTimeout(timeout);
            limparArquivos();
            reply('❌ *Ocorreu um erro interno de processo* (yt-dlp ausente ou quebrado). Verifique se os pacotes python estão instalados no servidor.');
        });

        dl.on('close', async (code) => {
            if (code !== 0) {
                console.error(`yt-dlp fechou com código ${code}:`, stderrout);
                clearTimeout(timeout);
                limparArquivos();
                return reply('❌ *Falha ao baixar vídeo.*\nO link pode ser privado, indisponível, ter expirado, ou o site bloqueou a solicitação de bots gratuitas.');
            }

            if (!fs.existsSync(raw)) {
                clearTimeout(timeout);
                limparArquivos();
                return reply('❌ Arquivo não encontrado após download.');
            }

            // Verificar tamanho do arquivo
            const stats = fs.statSync(raw);
            const tamanhoMB = stats.size / (1024 * 1024);
            
            if (tamanhoMB > MAX_SIZE_MB) {
                clearTimeout(timeout);
                limparArquivos();
                return reply(`❌ *Vídeo muito Grande!*\nO vídeo pussuí (${tamanhoMB.toFixed(1)}MB). Nosso limite de processamento no WhatsApp é de ${MAX_SIZE_MB}MB.`);
            }

            await digitando(nazu, from, 3000);

            // 🔄 Converter com ffmpeg para o formato mais compatível com Whatsapp
            console.log(`[ffmpeg local] Convertendo vídeo de ${tamanhoMB.toFixed(1)}MB`);
            ffmpeg = spawn('ffmpeg', [
                '-i', raw,
                // Redimensiona o video e melhora a compatibilidade h264 no android/ios
                '-vf', 'scale=\'min(1280,iw)\':-2', 
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '26', // Compactação decente
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                '-y', 
                final
            ]);

            ffmpeg.on('error', (err) => {
                console.error('Erro no ffmpeg:', err);
                clearTimeout(timeout);
                limparArquivos();
                reply('❌ Erro na conversão do vídeo pelo FFmpeg. Contate o administrador do servidor.');
            });

            ffmpeg.on('close', async (code) => {
                clearTimeout(timeout);
                
                if (code !== 0) {
                    console.error(`ffmpeg fechou com código ${code}`);
                    limparArquivos();
                    return reply('❌ Erro de processamento ao tentar codificar o vídeo para o WhatsApp.');
                }

                if (!fs.existsSync(final)) {
                    limparArquivos();
                    return reply('❌ Erro interno ao gerar arquivo final MP4.');
                }

                const statsFinal = fs.statSync(final);
                const tamanhoFinalMB = statsFinal.size / (1024 * 1024);

                if (tamanhoFinalMB > MAX_SIZE_MB) {
                    limparArquivos();
                    
                    // Se o convertido ficou também gigantesco, avise e encerre
                    return reply(`⚠️ *Vídeo Extra-Largo*\nMesmo após a conversão, o vídeo tem (${tamanhoFinalMB.toFixed(1)}MB). Isso travará o envio WhatsApp da AWS. Limitado a ${MAX_SIZE_MB}MB.`);
                }

                await nazu.sendMessage(from, { text: `🎬 Enviando de (${tamanhoFinalMB.toFixed(1)}MB)...\nHospedado sem uso de APIs de Baixo Padrão!` }, { quoted: m });

                // Enviar vídeo
                await nazu.sendMessage(from, {
                    video: { url: final },
                    mimetype: 'video/mp4',
                    caption: `🎬 Download Local Concluído\n✦ Plataforma: Automática\n✦ Tamanho: **${tamanhoFinalMB.toFixed(1)}MB**`
                }, { quoted: m }).catch((e) => {
                    console.error("Falha ao enviar video gigante no Whatsapp:", e);
                    reply("❌ Houve um erro no baileys ao tentar processar o Buffer do Vídeo e injetar na rede do WhatsApp.");
                });

                // Limpar
                limparArquivos();

                // Reagir com sucesso
                if (m.key) {
                    await nazu.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(()=>{});
                }
            });
        });

    } catch (err) {
        console.error('Erro fatal no downloader local:', err);
        if (timeout) clearTimeout(timeout);
        
        try {
            if (raw && fs.existsSync(raw)) fs.unlinkSync(raw);
            if (final && fs.existsSync(final)) fs.unlinkSync(final);
        } catch (e) {}

        reply('❌ Erro de sistema crítico ao processar módulo universal de mídia.');
    }
};
