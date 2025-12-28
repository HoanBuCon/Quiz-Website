require('dotenv').config();
const { query } = require('./utils/db');

async function checkColumn() {
  try {
    console.log('Checking QuizSession columns...');
    const result = await query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
      AND TABLE_NAME = 'QuizSession' 
      AND COLUMN_NAME = 'quizSnapshot';
    `);
    
    if (result.length > 0) {
      console.log('VERIFIED: quizSnapshot column EXISTS.');
    } else {
      console.log('MISSING: quizSnapshot column does NOT exist.');
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

checkColumn();
