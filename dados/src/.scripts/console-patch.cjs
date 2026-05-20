// Console patch to suppress libsignal session key logging
// Must be loaded BEFORE baileys/libsignal via --require flag
// libsignal uses console.info/warn to log full SessionEntry objects with private keys

const _origInfo = console.info;
const _origWarn = console.warn;

const SESSION_PATTERNS = [
    'Closing session:',
    'Opening session:',
    'Removing old closed session:',
    'Session already closed',
    'Session already open',
];

console.info = (...args) => {
    if (typeof args[0] === 'string' && SESSION_PATTERNS.some(p => args[0].includes(p))) return;
    _origInfo(...args);
};

console.warn = (...args) => {
    if (typeof args[0] === 'string' && SESSION_PATTERNS.some(p => args[0].includes(p))) return;
    _origWarn(...args);
};
