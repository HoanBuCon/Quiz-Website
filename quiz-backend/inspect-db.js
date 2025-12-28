const { queryOne, query } = require('./utils/db');
require('dotenv').config();

async function inspectLatestSession() {
  try {
    console.log('Fetching latest session...');
    const session = await queryOne(`
      SELECT id, quizId, userId, score, startedAt, completedAt, 
             JSON_LENGTH(quizSnapshot) as snapshotLength,
             JSON_LENGTH(answers) as answersLength,
             quizSnapshot, answers
      FROM QuizSession 
      ORDER BY completedAt DESC 
      LIMIT 1
    `);

    if (!session) {
      console.log('No sessions found.');
      return;
    }

    console.log('--- Latest Session Metadata ---');
    console.log(`ID: ${session.id}`);
    console.log(`QuizID: ${session.quizId}`);
    console.log(`UserID: ${session.userId}`);
    console.log(`Score: ${session.score}`);
    console.log(`CompletedAt: ${session.completedAt}`);
    
    console.log('\n--- Data Check ---');
    console.log(`Snapshot Exists: ${!!session.quizSnapshot}`);
    console.log(`Snapshot Type: ${typeof session.quizSnapshot}`);
    
    // Check if snapshot is a string (needs parsing) or object
    let snapshot = session.quizSnapshot;
    if (typeof snapshot === 'string') {
        try {
            snapshot = JSON.parse(snapshot);
            console.log('Snapshot was string, parsed successfully.');
        } catch (e) {
            console.log('Snapshot string parse failed:', e.message);
        }
    }
    
    if (snapshot) {
        console.log(`Snapshot Keys: ${Object.keys(snapshot).join(', ')}`);
        if (snapshot.questions) {
            console.log(`Snapshot Question Count: ${snapshot.questions.length}`);
            if (snapshot.questions.length > 0) {
                console.log('First Question Sample:', JSON.stringify(snapshot.questions[0], null, 2).substring(0, 200) + '...');
            }
        }
    }

    console.log('\n--- Answers Check ---');
    let answers = session.answers;
    if (typeof answers === 'string') {
         try {
            answers = JSON.parse(answers);
            console.log('Answers was string, parsed successfully.');
        } catch (e) {
            console.log('Answers string parse failed:', e.message);
        }
    }
    console.log('Answers:', JSON.stringify(answers, null, 2).substring(0, 200));

  } catch (error) {
    console.error('Error inspecting DB:', error);
  } finally {
    process.exit();
  }
}

inspectLatestSession();
