#!/usr/bin/env node

/**
 * Gakkum CLI Launcher (Omniroute-style)
 * Memulai FastAPI backend dan Next.js frontend secara bersamaan.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const venvDir = path.join(backendDir, 'venv');
const pythonExe = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

console.log('🚀 Memulai Gakkum Network Monitor...');

// 1. Cek / Buat Virtual Environment Python
if (!fs.existsSync(pythonExe)) {
    console.log('📦 Menyiapkan Python virtual environment (.venv)...');
    try {
        execSync(`python -m venv "${venvDir}"`, { stdio: 'inherit', cwd: rootDir });
    } catch (e) {
        console.error('❌ Gagal membuat venv Python. Pastikan Python terinstall dan ada di PATH.');
        process.exit(1);
    }
}

// 2. Install Dependencies Python
console.log('📦 Memeriksa dependencies backend...');
try {
    const pipPath = process.platform === 'win32' ? path.join(venvDir, 'Scripts', 'pip.exe') : path.join(venvDir, 'bin', 'pip');
    execSync(`"${pipPath}" install -r "${path.join(backendDir, 'requirements.txt')}"`, { stdio: 'inherit' });
} catch (e) {
    console.warn('⚠️ Peringatan saat pip install requirements. Lanjutkan...');
}

// 3. Jalankan Backend FastAPI
console.log('🔌 Menyalakan Backend FastAPI (port 8000)...');
const uvicornPath = process.platform === 'win32' ? path.join(venvDir, 'Scripts', 'uvicorn.exe') : path.join(venvDir, 'bin', 'uvicorn');
const backendProc = spawn(uvicornPath, ['backend.main:app', '--host', '0.0.0.0', '--port', '8000'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true
});

// 4. Jalankan Frontend Next.js
console.log('💻 Menyalakan Frontend Dashboard (port 3000)...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const frontendProc = spawn(npmCmd, ['run', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Menghentikan Gakkum...');
    backendProc.kill();
    frontendProc.kill();
    process.exit(0);
});
