const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logPath;

function getLogPath() {
    if (!logPath) {
        // Handle both main and renderer/worker processes
        const userDataPath = app ? app.getPath('userData') : path.join(process.env.APPDATA, 'Curtin');
        logPath = path.join(userDataPath, 'curtin.log');
    }
    return logPath;
}

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${type}] ${message}\n`;
    
    console.log(formattedMessage.trim());
    
    try {
        fs.appendFileSync(getLogPath(), formattedMessage);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
}

module.exports = {
    info: (msg) => log(msg, 'INFO'),
    error: (msg, error) => {
        let fullMsg = msg;
        if (error) {
            fullMsg += ` | Error: ${error.message || error}`;
            if (error.stack) fullMsg += `\nStack: ${error.stack}`;
        }
        log(fullMsg, 'ERROR');
    },
    warn: (msg) => log(msg, 'WARN')
};
