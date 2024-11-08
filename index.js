const cron = require('node-cron');
const dotenv = require("dotenv")
const http = require('http');
const executeCron = require('./utils/cron')
const executeBirthdayCron = require('./utils/birthdayCron')
const {debug} = require("./utils/debug");
const {getPublicHolidays} = require("./utils/date");
dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

// Directly run the cron job if the DEBUG flag is set to true.
if (process.env.DEBUG === 'true') {
  executeBirthdayCron().then(() => console.log('Success!'))
  // executeCron().then(() => console.log('Success!'))
  return;
}

const currentTime = new Date().toLocaleString()
let cronStatus = 'online';
let lastRunTime = 'never';

// # ┌────────────── second (optional)
// # │ ┌──────────── minute
// # │ │ ┌────────── hour
// # │ │ │ ┌──────── day of month
// # │ │ │ │ ┌────── month
// # │ │ │ │ │ ┌──── day of week
// # │ │ │ │ │ │
// # │ │ │ │ │ │
// # * * * * * *
// Schedule the cron job to execute the function every day at a specific time (e.g., 9:00 AM)
const cronJob = cron.schedule(process.env.CRON_TIME, () => {
  debug('Starting cron...');
  try {
    executeCron().then(() => {
      debug('Cron run success!')
    }).catch(error => {
      debug('Cron job failed:', error);
      cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
    });

    // Update the last run time
    lastRunTime = new Date().toLocaleString();
  } catch (error) {
    debug('Cron job failed:', error);
    cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
  }
});

cronJob.start()

// Once per week, monday at 9:00 AM.
const cronJobBirthdays = cron.schedule('0 9 * * 1', () => {
  debug('Starting cron...');
  try {
    executeBirthdayCron().then(() => {
      debug('Birthday Cron run success!')
    }).catch(error => {
      debug('Birthday Cron job failed:', error);
      cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
    });
  } catch (error) {
    debug('Birthday cron job failed:', error);
    cronStatus = `Birthday cron failed: <pre>${JSON.stringify(error)}</pre>`;
  }
});
cronJobBirthdays.start();

// Create a basic HTTP server
const server = http.createServer(async (req, res) => {
  if(req.url === '/runcron') {
    // Manually trigger the cron job
    cronJob.now()
    debug('CRON STARTED!')
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Cron job triggered manually');
  } else {
    // Return the index.html file
    const holidays = await getPublicHolidays();
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(`
        <h1>Cron Job Status</h1>
        <p>Debug: ${process.env.DEBUG}</p>
        <p>Current time: ${currentTime}</p>
        <p>Holidays: ${holidays.join(', ')}</p>
        <p>Runs: every day at 16:00</p>
        <p>Status: ${cronStatus}</p>
        <p>Last Run: ${lastRunTime}</p>
`);
    res.end();
  }
});

// Start the server
server.listen(process.env.PORT || 3000, () => {
  console.log('Server started on port', process.env.PORT || 3000);
});
