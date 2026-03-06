module.exports = {
  apps: [
    {
      name: 'botwave',
      script: 'bun',
      args: 'run src/server.ts',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_file: '.env',
      time: true,
    },
  ],
};
