// Config de PM2 para correr wa-bridge + su vigia 24/7.
// Uso: pm2 start ecosystem.config.cjs
// (o systemd — ver DEPLOY.md para la alternativa sin PM2)
module.exports = {
  apps: [
    {
      name: 'tryvex-wa-bridge',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'tryvex-wa-heartbeat',
      script: 'heartbeat.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
