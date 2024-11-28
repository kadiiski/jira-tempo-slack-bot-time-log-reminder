const {decrypt} = require('./encrypt-utils');
const sqlite3 = require("sqlite3").verbose();

// Initialize SQLite database
const db = new sqlite3.Database(`./feedback.db`, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        author_slack_id TEXT NOT NULL,
        recipient_slack_id TEXT NOT NULL,
        feedback TEXT NOT NULL
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_id INTEGER NOT NULL,
        manager_thread_ts TEXT NOT NULL,
        author_thread_ts TEXT NOT NULL,
        manager_slack_id TEXT NOT NULL,
        author_slack_id TEXT NOT NULL,
        FOREIGN KEY (feedback_id) REFERENCES feedback (id) ON DELETE CASCADE
      );
    `);
  }
});

const insertFeedback = async (authorSlackId, recipientSlackId, encryptedFeedback) => {
  const now = new Date().toISOString();

  db.run(`INSERT INTO feedback (date, author_slack_id, recipient_slack_id, feedback) VALUES (?, ?, ?, ?)`,
    [now, authorSlackId, recipientSlackId, encryptedFeedback]
  );
}

const insertThreadState = async (feedbackId, managerThreadTs, authorThreadTs, managerSlackId, authorSlackId) => {
  // Insert thread information into the threads table.
  db.run(`INSERT INTO threads (feedback_id, manager_thread_ts, author_thread_ts, manager_slack_id, author_slack_id) VALUES (?, ?, ?, ?, ?)`,
    [feedbackId, managerThreadTs, authorThreadTs, managerSlackId, authorSlackId],
  );
}

const getAllFeedback = async () => {
  const query = `SELECT * FROM feedback`;

  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error reading feedback records:', err.message);
        reject(err);
      } else {
        // Decrypt feedback for each row
        const decryptedRows = rows.map(row => ({
          ...row,
          feedback: decrypt(row.feedback) // Decrypt the feedback
        }));
        resolve(decryptedRows);
      }
    });
  });
};

const getFeedbackByRecipientId = async (slackId) => {
  const query = `SELECT * FROM feedback WHERE recipient_slack_id = ?`;

  return new Promise((resolve, reject) => {
    db.all(query, [slackId], (err, rows) => {
      if (err) {
        console.error('Error reading feedback records:', err.message);
        reject(err);
      } else {
        // Decrypt feedback for each row
        const decryptedRows = rows.map(row => ({
          ...row,
          feedback: decrypt(row.feedback) // Decrypt the feedback
        }));
        resolve(decryptedRows);
      }
    });
  });
}

const getFeedbackById = async (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM feedback WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Error retrieving feedback:', err.message);
        reject(err);
      } else {
        resolve({
          ...row,
          feedback: decrypt(row.feedback)
        });
      }
    });
  });
};

const getThreadStateByThreadTs = (thread_ts) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM threads WHERE manager_thread_ts = ? OR author_thread_ts = ?`,
      [thread_ts, thread_ts],
      (err, row) => {
        if (err) {
          console.error('Error retrieving thread state:', err.message);
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

const getThreadStateByFeedbackId = (feedbackId, authorSlackId, managerSlackId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM threads WHERE feedback_id = ? AND author_slack_id = ? AND manager_slack_id = ? `, [feedbackId, authorSlackId, managerSlackId], (err, row) => {
      if (err) {
        console.error('Error retrieving thread state:', err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

module.exports = { getAllFeedback, getFeedbackById, getThreadStateByThreadTs, insertFeedback, insertThreadState, getFeedbackByRecipientId, getThreadStateByFeedbackId };
