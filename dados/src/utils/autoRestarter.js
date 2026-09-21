import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AutoRestarter {
    constructor() {
        this.restartCount = 0;
        this.maxRestarts = 5;
        this.restartCooldown = 30000;
        this.lastRestart = 0;
        this.criticalErrors = [
            'ENOSPC',
            'ENOMEM',
            'EMFILE',
            'ECONNRESET',
            'ERR_UNHANDLED_ERROR',
            'UnhandledPromiseRejectionWarning'
        ];
        this.logFile = path.join(__dirname, '../../../logs/auto-restart.log');
        this.pidFile = path.join(__dirname, '../../../nazuna.pid');
        this.isShuttingDown = false;
        this.childProcess = null;

        this.setupErrorHandlers();
        this.setupGracefulShutdown();
    }

    setupErrorHandlers() {

        process.on('uncaughtException', async (error) => {
            await this.handleCriticalError('uncaughtException', error);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            await this.handleCriticalError('unhandledRejection', reason);
        });

        process.on('warning', async (warning) => {
            if (warning.name === 'MaxListenersExceededWarning') {
                await this.logEvent('warning', `MaxListeners exceeded: ${warning.message}`);
            }
        });

        setInterval(async () => {
            await this.checkMemoryUsage();
        }, 60000);
    }

    setupGracefulShutdown() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

        signals.forEach((signal) => {
            process.on(signal, async () => {
                await this.gracefulShutdown(signal);
            });
        });
    }

    async handleCriticalError(type, error) {
        try {
            const errorMessage = error?.message || error?.toString() || 'Erro desconhecido';
            const errorCode = error?.code || error?.errno || 'UNKNOWN';

            await this.logEvent('critical_error', {
                type,
                message: errorMessage,
                code: errorCode,
                stack: error?.stack || 'Stack não disponível',
                timestamp: new Date().toISOString(),
                memoryUsage: process.memoryUsage(),
                restartCount: this.restartCount
            });

            const needsRestart = this.criticalErrors.some(criticalError =>
                errorMessage.includes(criticalError) || errorCode === criticalError
            );

            if (needsRestart) {
                await this.initiateRestart(`Erro crítico detectado: ${errorCode} - ${errorMessage}`);
            } else {
                console.error(`❌ Erro não crítico capturado (${type}):`, errorMessage);
            }
        } catch (logError) {
            console.error('❌ Erro ao processar erro crítico:', logError.message);

            await this.forceRestart('Falha no sistema de logs');
        }
    }

    async checkMemoryUsage() {
        try {
            const memUsage = process.memoryUsage();
            const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

            if (memUsedMB > 512) {
                await this.logEvent('high_memory', {
                    heapUsed: memUsedMB,
                    heapTotal: memTotalMB,
                    rss: Math.round(memUsage.rss / 1024 / 1024),
                    external: Math.round(memUsage.external / 1024 / 1024)
                });
            }

            if (memUsedMB > 1024) {
                await this.initiateRestart(`Uso crítico de memória: ${memUsedMB}MB`);
            }
        } catch (error) {
            console.error('❌ Erro ao verificar uso de memória:', error.message);
        }
    }

    async initiateRestart(reason) {
        if (this.isShuttingDown) return;

        const now = Date.now();

        if (now - this.lastRestart < this.restartCooldown) {
            await this.logEvent('restart_blocked', `Restart bloqueado por cooldown. Razão: ${reason}`);
            return;
        }

        if (this.restartCount >= this.maxRestarts) {
            await this.logEvent('restart_limit', `Limite de ${this.maxRestarts} reinicializações atingido. Sistema será finalizado.`);
            await this.gracefulShutdown('MAX_RESTARTS_REACHED');
            return;
        }

        this.restartCount++;
        this.lastRestart = now;
        this.isShuttingDown = true;

        await this.logEvent('restart_initiated', {
            reason,
            count: this.restartCount,
            maxRestarts: this.maxRestarts
        });

        try {

            await this.performEmergencyCleanup();

            await this.saveRestartState();

            await this.restartProcess();
        } catch (error) {
            console.error('❌ Erro durante reinicialização:', error.message);
            await this.forceRestart('Falha no processo de reinicialização');
        }
    }

    async forceRestart(reason) {

        try {
            await this.logEvent('force_restart', reason);
            await this.saveRestartState();
        } catch {

        }

        setTimeout(() => {
            process.exit(1);
        }, 1000);
    }

    async performEmergencyCleanup() {
        try {

            if (global.gc) {
                global.gc();
            }

            if (global.messagesCache) {
                global.messagesCache.clear();
            }

            const tempDirs = ['/tmp/nazuna-*', './temp/*'];

            for (const tempPattern of tempDirs) {
                try {
                    const { exec } = await import('child_process');
                    exec(`rm -rf ${tempPattern}`, { timeout: 5000 }, (error) => {
                        if (error && !error.message.includes('No such file')) {
                            console.warn(`⚠️ Erro na limpeza de ${tempPattern}:`, error.message);
                        }
                    });
                } catch {

                }
            }

        } catch (error) {
            console.warn('⚠️ Erro na limpeza emergencial:', error.message);
        }
    }

    async saveRestartState() {
        try {
            const state = {
                restartCount: this.restartCount,
                lastRestart: this.lastRestart,
                timestamp: new Date().toISOString(),
                pid: process.pid,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            };

            const stateFile = path.join(__dirname, '../../../restart-state.json');
            await fs.writeFile(stateFile, JSON.stringify(state, null, 2));

            await fs.writeFile(this.pidFile, process.pid.toString());
        } catch (error) {
            console.warn('⚠️ Erro ao salvar estado:', error.message);
        }
    }

    async loadRestartState() {
        try {
            const stateFile = path.join(__dirname, '../../../restart-state.json');
            const stateData = await fs.readFile(stateFile, 'utf8');
            const state = JSON.parse(stateData);

            const stateDate = new Date(state.timestamp).toDateString();
            const today = new Date().toDateString();

            if (stateDate === today) {
                this.restartCount = state.restartCount || 0;
                this.lastRestart = state.lastRestart || 0;

                await this.logEvent('state_loaded', {
                    previousRestarts: this.restartCount,
                    previousPid: state.pid
                });
            } else {

                this.restartCount = 0;
                this.lastRestart = 0;
            }
        } catch (error) {

            this.restartCount = 0;
            this.lastRestart = 0;
        }
    }

    async restartProcess() {
        try {

            const args = process.argv.slice(1);
            const nodeArgs = [];

            if (process.execArgv.includes('--expose-gc')) {
                nodeArgs.push('--expose-gc');
            }

            const child = spawn(process.execPath, [...nodeArgs, ...args], {
                detached: true,
                stdio: ['ignore', 'inherit', 'inherit'],
                env: {
                    ...process.env,
                    NAZUNA_RESTARTED: 'true',
                    NAZUNA_RESTART_COUNT: this.restartCount.toString()
                }
            });

            this.childProcess = child;

            child.on('spawn', () => {
            });

            child.on('error', async (error) => {
                console.error('❌ Erro ao iniciar novo processo:', error.message);
                await this.logEvent('restart_failed', error.message);
            });

            child.unref();

            setTimeout(() => {
                process.exit(0);
            }, 5000);

        } catch (error) {
            console.error('❌ Falha crítica na reinicialização:', error.message);
            await this.logEvent('restart_critical_failure', error.message);
            process.exit(1);
        }
    }

    async gracefulShutdown(signal) {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        try {
            await this.logEvent('graceful_shutdown', signal);

            try {
                await fs.unlink(this.pidFile);
            } catch {

            }

            if (this.childProcess && !this.childProcess.killed) {
                this.childProcess.kill('SIGTERM');
            }

            if (global.gc) {
                global.gc();
            }

            setTimeout(() => {
                process.exit(signal === 'MAX_RESTARTS_REACHED' ? 1 : 0);
            }, 2000);

        } catch (error) {
            console.error('❌ Erro durante shutdown:', error.message);
            process.exit(1);
        }
    }

    async logEvent(type, data) {
        try {

            const logsDir = path.dirname(this.logFile);
            await fs.mkdir(logsDir, { recursive: true });

            const logEntry = {
                timestamp: new Date().toISOString(),
                type,
                data,
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            };

            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.logFile, logLine);

        } catch (error) {
            console.error('❌ Erro ao escrever log:', error.message);
        }
    }

    async start() {
        try {
            await this.loadRestartState();

            await this.logEvent('auto_restart_started', {
                restartCount: this.restartCount,
                maxRestarts: this.maxRestarts,
                pid: process.pid
            });

            if (process.env.NAZUNA_RESTARTED === 'true') {
                await this.logEvent('restart_success', {
                    previousRestartCount: process.env.NAZUNA_RESTART_COUNT || 'unknown'
                });
            }
        } catch (error) {
            console.error('❌ Erro ao iniciar sistema de auto-restart:', error.message);
        }
    }

    async stop() {
        this.isShuttingDown = true;
        await this.logEvent('auto_restart_stopped', 'Manual stop');
    }

    getStats() {
        return {
            restartCount: this.restartCount,
            maxRestarts: this.maxRestarts,
            lastRestart: this.lastRestart,
            isShuttingDown: this.isShuttingDown,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            pid: process.pid
        };
    }

    async manualRestart(reason = 'Reinicialização manual') {
        await this.logEvent('manual_restart', reason);
        await this.initiateRestart(reason);
    }
}

export default AutoRestarter;
