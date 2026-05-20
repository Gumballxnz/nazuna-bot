// Console patch to suppress libsignal session key logging
// Must be loaded BEFORE baileys/libsignal via --require flag

const _origInfo = console.info;
const _origWarn = console.warn;
const _origLog = console.log;

const SESSION_PATTERNS = [
    'Closing session:',
    'Opening session:',
    'Removing old closed session:',
    'Session already closed',
    'Session already open',
    'Closing open session',
];

// Patterns that indicate protocol/session data leaking to stdout
const PROTOCOL_PATTERNS = [
    'deviceListMetadata',
    'senderKeyDistributionMessage',
    'protocolMessage',
    'deviceListMetadataVersion',
];

function shouldSuppress(arg0) {
    if (typeof arg0 !== 'string') return false;
    return SESSION_PATTERNS.some(p => arg0.includes(p)) ||
           PROTOCOL_PATTERNS.some(p => arg0.includes(p));
}

console.info = (...args) => {
    if (shouldSuppress(args[0])) return;
    _origInfo(...args);
};

console.warn = (...args) => {
    if (shouldSuppress(args[0])) return;
    _origWarn(...args);
};

console.log = (...args) => {
    if (shouldSuppress(args[0])) return;
    _origLog(...args);
};
