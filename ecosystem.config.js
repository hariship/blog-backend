module.exports = {
  apps: [
    {
      name: 'blog-backend',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/blog-backend-error.log',
      out_file: './logs/blog-backend-out.log',
      log_file: './logs/blog-backend-combined.log',
      time: true
    },
    {
      name: 'telegram-bot',
      script: 'src/telegram-daemon.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/telegram-bot-error.log',
      out_file: './logs/telegram-bot-out.log',
      log_file: './logs/telegram-bot-combined.log',
      time: true
    }
  ]
};