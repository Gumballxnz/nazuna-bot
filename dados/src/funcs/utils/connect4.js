const CONFIG = {
    INVITATION_TIMEOUT_MS: 15 * 60 * 1000,
    GAME_TIMEOUT_MS: 30 * 60 * 1000,
    MOVE_TIMEOUT_MS: 5 * 60 * 1000,
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    ROWS: 6,
    COLS: 7,
    WIN_LENGTH: 4,
    SYMBOLS: { 1: '🔴', 2: '🟡' },
    EMPTY: '⚪',
    NUMBERS: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣']
};

const getUserName = (userId) => {
    if (!userId || typeof userId !== 'string') return 'unknown';
    return userId.split('@')[0] || userId;
};

class Connect4Engine {
    constructor(player1, player2) {
        this.board = Array(CONFIG.ROWS).fill(null).map(() => Array(CONFIG.COLS).fill(0));
        this.players = { 1: player1, 2: player2 };
        this.currentTurn = 1;
        this.moves = 0;
        this.startTime = Date.now();
        this.lastMoveTime = Date.now();
        this.winner = null;
        this.winningCells = [];
    }

    makeMove(player, column) {
        if (player !== this.players[this.currentTurn]) {
            return { success: false, reason: 'not_your_turn' };
        }

        const col = parseInt(column) - 1;
        if (isNaN(col) || col < 0 || col >= CONFIG.COLS) {
            return { success: false, reason: 'invalid_column' };
        }

        let row = -1;
        for (let r = CONFIG.ROWS - 1; r >= 0; r--) {
            if (this.board[r][col] === 0) {
                row = r;
                break;
            }
        }

        if (row === -1) {
            return { success: false, reason: 'column_full' };
        }

        this.board[row][col] = this.currentTurn;
        this.moves++;
        this.lastMoveTime = Date.now();

        if (this._checkWin(row, col)) {
            this.winner = this.players[this.currentTurn];
            return { success: true, status: 'win', winner: this.winner };
        }

        if (this.moves === CONFIG.ROWS * CONFIG.COLS) {
            return { success: true, status: 'draw' };
        }

        this.currentTurn = this.currentTurn === 1 ? 2 : 1;
        return { success: true, status: 'continue', nextPlayer: this.players[this.currentTurn] };
    }

    renderBoard() {
        let board = '';

        board += CONFIG.NUMBERS.join('') + '\n';

        for (let r = 0; r < CONFIG.ROWS; r++) {
            for (let c = 0; c < CONFIG.COLS; c++) {
                const cell = this.board[r][c];
                if (cell === 0) {
                    board += CONFIG.EMPTY;
                } else {
                    board += CONFIG.SYMBOLS[cell];
                }
            }
            board += '\n';
        }

        return board;
    }

    _checkWin(row, col) {
        const directions = [
            [0, 1],
            [1, 0],
            [1, 1],
            [1, -1]
        ];

        const player = this.board[row][col];

        for (const [dr, dc] of directions) {
            let count = 1;
            const cells = [[row, col]];

            let r = row + dr;
            let c = col + dc;
            while (r >= 0 && r < CONFIG.ROWS && c >= 0 && c < CONFIG.COLS && this.board[r][c] === player) {
                count++;
                cells.push([r, c]);
                r += dr;
                c += dc;
            }

            r = row - dr;
            c = col - dc;
            while (r >= 0 && r < CONFIG.ROWS && c >= 0 && c < CONFIG.COLS && this.board[r][c] === player) {
                count++;
                cells.push([r, c]);
                r -= dr;
                c -= dc;
            }

            if (count >= CONFIG.WIN_LENGTH) {
                this.winningCells = cells;
                return true;
            }
        }

        return false;
    }
}

class Connect4Manager {
    constructor() {
        this.activeGames = new Map();
        this.pendingInvitations = new Map();
        setInterval(() => this._cleanup(), CONFIG.CLEANUP_INTERVAL_MS);
    }

    invitePlayer(groupId, inviter, invitee) {
        if (!groupId || !inviter || !invitee || inviter === invitee) {
            return this._formatResponse(false, '❌ Dados inválidos para o convite');
        }
        if (this.activeGames.has(groupId) || this.pendingInvitations.has(groupId)) {
            return this._formatResponse(false, '❌ Já existe um jogo ou convite em andamento neste grupo!');
        }

        this.pendingInvitations.set(groupId, { inviter, invitee, timestamp: Date.now() });
        const message = `🔴🟡 *CONVITE CONNECT 4*\n\n` +
                        `@${getUserName(inviter)} convidou @${getUserName(invitee)} para jogar!\n\n` +
                        `✅ Aceitar: "sim", "s"\n` +
                        `❌ Recusar: "não", "n"\n\n` +
                        `⏳ Expira em 15 minutos.`;
        return this._formatResponse(true, message, { mentions: [inviter, invitee] });
    }

    processInvitationResponse(groupId, invitee, response) {
        const invitation = this.pendingInvitations.get(groupId);
        if (!invitation || invitation.invitee !== invitee) {
            return this._formatResponse(false, '❌ Nenhum convite pendente para você.');
        }

        const normalizedResponse = response.toLowerCase().trim();
        const isAccepted = ['s', 'sim', 'y', 'yes'].includes(normalizedResponse);
        const isRejected = ['n', 'não', 'nao', 'no'].includes(normalizedResponse);

        if (!isAccepted && !isRejected) {
            return this._formatResponse(false, '❌ Resposta inválida. Use "sim" ou "não".');
        }

        this.pendingInvitations.delete(groupId);

        if (isRejected) {
            return this._formatResponse(true, '❌ Convite recusado. Jogo cancelado.', { mentions: [invitation.inviter, invitee] });
        }

        const game = new Connect4Engine(invitation.inviter, invitation.invitee);
        this.activeGames.set(groupId, game);

        const message = `🔴🟡 *CONNECT 4 - INICIADO!*\n\n` +
                        `👥 Jogadores:\n` +
                        `➤ ${CONFIG.SYMBOLS[1]}: @${getUserName(invitation.inviter)}\n` +
                        `➤ ${CONFIG.SYMBOLS[2]}: @${getUserName(invitation.invitee)}\n\n` +
                        `${game.renderBoard()}\n` +
                        `💡 Vez de @${getUserName(invitation.inviter)}\n` +
                        `📝 Digite um número de 1 a 7 para escolher a coluna.`;
        return this._formatResponse(true, message, { mentions: [invitation.inviter, invitee] });
    }

    makeMove(groupId, player, column) {
        const game = this.activeGames.get(groupId);
        if (!game) {
            return this._formatResponse(false, '❌ Nenhum jogo em andamento!');
        }

        if (Date.now() - game.lastMoveTime > CONFIG.MOVE_TIMEOUT_MS) {
            this.activeGames.delete(groupId);
            return this._formatResponse(false, '❌ Jogo encerrado por inatividade (5 minutos sem jogada).', { mentions: Object.values(game.players) });
        }

        const result = game.makeMove(player, column);

        if (!result.success) {
            const errorMessages = {
                'not_your_turn': '❌ Não é sua vez!',
                'invalid_column': '❌ Coluna inválida! Use 1-7.',
                'column_full': '❌ Esta coluna está cheia!'
            };
            return this._formatResponse(false, errorMessages[result.reason] || '❌ Erro desconhecido.');
        }

        if (result.status === 'win') {
            this.activeGames.delete(groupId);
            const message = `🔴🟡 *CONNECT 4 - FIM*\n\n` +
                            `🎉 @${getUserName(result.winner)} venceu! 🏆\n\n` +
                            `${game.renderBoard()}`;
            return this._formatResponse(true, message, { finished: true, winner: result.winner, mentions: [result.winner] });
        }

        if (result.status === 'draw') {
            this.activeGames.delete(groupId);
            const message = `🔴🟡 *CONNECT 4 - FIM*\n\n` +
                            `🤝 Empate!\n\n` +
                            `${game.renderBoard()}`;
            return this._formatResponse(true, message, { finished: true, draw: true, mentions: Object.values(game.players) });
        }

        if (result.status === 'continue') {
            const message = `🔴🟡 *CONNECT 4*\n\n` +
                            `👉 Vez de @${getUserName(result.nextPlayer)}\n\n` +
                            `${game.renderBoard()}\n` +
                            `💡 Digite um número de 1 a 7.`;
            return this._formatResponse(true, message, { finished: false, mentions: [result.nextPlayer] });
        }
    }

    endGame(groupId) {
        if (!this.activeGames.has(groupId)) {
            return this._formatResponse(false, '❌ Nenhum jogo em andamento!');
        }
        const players = Object.values(this.activeGames.get(groupId).players);
        this.activeGames.delete(groupId);
        return this._formatResponse(true, '🔴🟡 Jogo encerrado manualmente!', { mentions: players });
    }

    hasActiveGame = (groupId) => this.activeGames.has(groupId);
    hasPendingInvitation = (groupId) => this.pendingInvitations.has(groupId);
    getActiveGame = (groupId) => this.activeGames.get(groupId);
    getPendingInvitation = (groupId) => this.pendingInvitations.get(groupId);

    _formatResponse(success, message, extras = {}) {
        return { success, message, ...extras };
    }

    _cleanup() {
        const now = Date.now();

        for (const [groupId, invitation] of this.pendingInvitations) {
            if (now - invitation.timestamp > CONFIG.INVITATION_TIMEOUT_MS) {
                this.pendingInvitations.delete(groupId);
            }
        }

        for (const [groupId, game] of this.activeGames) {
            if (now - game.lastMoveTime > CONFIG.GAME_TIMEOUT_MS) {
                this.activeGames.delete(groupId);
            }
        }
    }
}

const manager = new Connect4Manager();

const invitePlayer = (groupId, inviter, invitee) => manager.invitePlayer(groupId, inviter, invitee);
const processInvitationResponse = (groupId, invitee, response) => manager.processInvitationResponse(groupId, invitee, response);
const makeMove = (groupId, player, column) => manager.makeMove(groupId, player, column);
const endGame = (groupId) => manager.endGame(groupId);
const hasActiveGame = (groupId) => manager.hasActiveGame(groupId);
const hasPendingInvitation = (groupId) => manager.hasPendingInvitation(groupId);
const getActiveGame = (groupId) => manager.getActiveGame(groupId);
const getPendingInvitation = (groupId) => manager.getPendingInvitation(groupId);

export {
    invitePlayer,
    processInvitationResponse,
    makeMove,
    endGame,
    hasActiveGame,
    hasPendingInvitation,
    getActiveGame,
    getPendingInvitation,
    Connect4Engine,
    Connect4Manager
};

export default {
    invitePlayer,
    processInvitationResponse,
    makeMove,
    endGame,
    hasActiveGame,
    hasPendingInvitation,
    getActiveGame,
    getPendingInvitation
};
