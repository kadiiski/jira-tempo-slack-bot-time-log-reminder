const cron = require('node-cron');
const dotenv = require("dotenv");
const http = require('http');
const executeCron = require('./utils/cron'); // For time logs reminders
const executeBirthdayCron = require('./utils/birthdayCron'); // For birthday reminders
const { debug } = require("./utils/debug");
const { getPublicHolidays } = require("./utils/date");

dotenv.config();
dotenv.config({ path: `.env.local`, override: true });

// Initial status and history setup for both cron jobs
const currentTime = new Date().toLocaleString();
let cronStatus = { timeLogs: 'online', birthday: 'online' };
let lastRunTime = { timeLogs: 'never', birthday: 'never' };
const cronHistory = { timeLogs: [], birthday: [] };

// Helper function to update cron history
const updateCronHistory = (cronType, status, error = null) => {
  const timestamp = new Date().toLocaleString();
  cronHistory[cronType].push({
    timestamp,
    status: status ? 'Success' : 'Failed',
    details: error ? JSON.stringify(error) : 'No errors'
  });
  // Limit history entries to the last 10
  if (cronHistory[cronType].length > 10) cronHistory[cronType].shift();
};

// Directly run the cron job if the DEBUG flag is set to true
if (process.env.DEBUG === 'true') {
  // executeBirthdayCron().then(() => console.log('Birthday Cron Success!'));
  executeCron().then(() => console.log('Success!'))

  return;
}

// Time Log Reminder Cron (daily based on CRON_TIME environment variable)
const timeLogCronJob = cron.schedule(process.env.CRON_TIME, () => {
  debug('Starting Time Log Reminder Cron...');
  executeCron()
    .then(() => {
      debug('Time Log Reminder Cron run success!');
      lastRunTime.timeLogs = new Date().toLocaleString();
      cronStatus.timeLogs = 'Success';
      updateCronHistory('timeLogs', true);
    })
    .catch(error => {
      debug('Time Log Reminder Cron job failed:', error);
      cronStatus.timeLogs = 'Failed';
      updateCronHistory('timeLogs', false, error);
    });
});
timeLogCronJob.start();

// Birthday Reminder Cron (runs every Monday at 9:00 AM)
const birthdayCronJob = cron.schedule('0 9 * * 1', () => {
  debug('Starting Birthday Reminder Cron...');
  executeBirthdayCron()
    .then(() => {
      debug('Birthday Reminder Cron run success!');
      lastRunTime.birthday = new Date().toLocaleString();
      cronStatus.birthday = 'Success';
      updateCronHistory('birthday', true);
    })
    .catch(error => {
      debug('Birthday Reminder Cron job failed:', error);
      cronStatus.birthday = 'Failed';
      updateCronHistory('birthday', false, error);
    });
});
birthdayCronJob.start();

// Create an HTTP server to display cron status and history
const server = http.createServer(async (req, res) => {
  if (req.url === '/run-time-log-cron') {
    // Manually trigger the Time Log Reminder cron
    timeLogCronJob.now();
    debug('Time Log Reminder cron triggered manually!');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Time Log Reminder cron triggered manually');
  } else if (req.url === '/run-birthday-cron') {
    // Manually trigger the Birthday cron
    birthdayCronJob.now();
    debug('Birthday cron triggered manually!');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Time Log Reminder cron triggered manually');
  } else {
    // Display cron status and history
    const holidays = await getPublicHolidays();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`
      <html>
      <head>
        <title>Cron Job Status</title>
        <style>
          body { font-family: Arial, sans-serif; }
          h1 { color: #333; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 12px; border: 1px solid #ccc; text-align: left; }
          th { background-color: #f4f4f4; }
          .status-success { color: green; }
          .status-failed { color: red; }
        </style>
      </head>
      <body>
        <h1>Cron Job Status</h1>
        <p><strong>Current Time:</strong> ${currentTime}</p>
        <p><strong>Public Holidays:</strong> ${holidays.join(', ')}</p>
        
        <h2>Time Log Reminder Cron</h2>
        <p><strong>Status:</strong> <span class="status-${cronStatus.timeLogs === 'Success' ? 'success' : 'failed'}">${cronStatus.timeLogs}</span></p>
        <p><strong>Last Run:</strong> ${lastRunTime.timeLogs}</p>
        <table>
          <tr><th>Timestamp</th><th>Status</th><th>Details</th></tr>
          ${cronHistory.timeLogs.map(entry => `
            <tr>
              <td>${entry.timestamp}</td>
              <td class="status-${entry.status === 'Success' ? 'success' : 'failed'}">${entry.status}</td>
              <td>${entry.details}</td>
            </tr>
          `).join('')}
        </table>

        <h2>Birthday Reminder Cron</h2>
        <p><strong>Status:</strong> <span class="status-${cronStatus.birthday === 'Success' ? 'success' : 'failed'}">${cronStatus.birthday}</span></p>
        <p><strong>Last Run:</strong> ${lastRunTime.birthday}</p>
        <table>
          <tr><th>Timestamp</th><th>Status</th><th>Details</th></tr>
          ${cronHistory.birthday.map(entry => `
            <tr>
              <td>${entry.timestamp}</td>
              <td class="status-${entry.status === 'Success' ? 'success' : 'failed'}">${entry.status}</td>
              <td>${entry.details}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `);
    res.end();
  }
});

// Start the server
server.listen(process.env.PORT || 3000, () => {
  console.log('Server started on port', process.env.PORT || 3000);
});
