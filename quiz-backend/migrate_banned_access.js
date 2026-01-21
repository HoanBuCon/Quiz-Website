require('dotenv').config();
const { query, close } = require('./utils/db');

async function migrate() {
  try {
    console.log('Creating BannedAccess table...');
    await query(`
      CREATE TABLE IF NOT EXISTS \`BannedAccess\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`userId\` VARCHAR(191) NOT NULL,
        \`targetType\` ENUM('class', 'quiz') NOT NULL,
        \`targetId\` VARCHAR(191) NOT NULL,
        \`bannedCode\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`unique_ban_user_target_code\` (\`userId\`, \`targetType\`, \`targetId\`, \`bannedCode\`),
        INDEX \`idx_ban_userId\` (\`userId\`),
        INDEX \`idx_ban_targetId\` (\`targetId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('BannedAccess table created successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await close();
  }
}

migrate();
