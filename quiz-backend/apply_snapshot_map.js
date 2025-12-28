require('dotenv').config();
const { query } = require('./utils/db');

async function run() {
  try {
    console.log('Adding quizSnapshot column...');
    await query('ALTER TABLE QuizSession ADD COLUMN quizSnapshot JSON DEFAULT NULL;');
    console.log('Success!');
    process.exit(0);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists.');
      process.exit(0);
    }
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
