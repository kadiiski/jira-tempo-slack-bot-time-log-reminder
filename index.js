const cron = require('node-cron');
const dotenv = require("dotenv")
const http = require('http');
const executeCron = require('./utils/cron')
dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

// if (process.env.DEBUG === 'true') {
//   executeCron().then(() => console.log('Success!'))
//   return;
// }

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
const cronJob = cron.schedule('0 15 * * 1-5', () => {
  console.log('Starting cron...');
  try {
    executeCron().then(() => {
      console.log('Cron run success!')
    }).catch(error => {
      console.error('Cron job failed:', error);
      cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
    });

    // Update the last run time
    lastRunTime = new Date().toLocaleString();
  } catch (error) {
    console.error('Cron job failed:', error);
    cronStatus = `failed <pre>${JSON.stringify(error)}</pre>`;
  }
});

cronJob.start()

// Create a basic HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/runcron') {
    // Manually trigger the cron job
    cronJob.now()
    console.log('CRON STARTED!')
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Cron job triggered manually');
  } else {
    // Return the index.html file
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<h1>Cron Job Status</h1>');
    res.write(`<p>Debug: ${process.env.DEBUG}</p>`);
    res.write(`<p>Current time: ${currentTime}</p>`);
    res.write(`<p>Runs: every day at 16:00</p>`);
    res.write(`<p>Status: ${cronStatus}</p>`);
    res.write(`<p>Last Run: ${lastRunTime}</p>`);
    res.end();
  }
});

// Start the server
server.listen(process.env.PORT || 3000, () => {
  console.log('Server started on port', process.env.PORT || 3000);
});
