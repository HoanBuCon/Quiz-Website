require('dotenv').config(); // Load .env from CWD (quiz-backend)
const { query, close } = require('../utils/db');

(async () => {
  try {
    console.log('Updating SharedAccess table schema...');
    
    // Check if 'hidden' is already in the ENUM (optional, but good for idempotency if simple check feasible, but ALTER is generally safe to run if matches)
    // We'll just run the ALTER. MySQL usually ignores if same.
    
    await query("ALTER TABLE SharedAccess MODIFY COLUMN accessLevel ENUM('full', 'navigationOnly', 'hidden') NOT NULL DEFAULT 'full'");
    
    console.log('✅ Success! Added "hidden" to accessLevel ENUM.');
    await close();
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed to update schema:', e);
    await close();
    process.exit(1);
  }
})();
