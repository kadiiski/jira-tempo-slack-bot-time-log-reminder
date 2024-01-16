const axios = require('axios');

const getFormattedDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getDateJan1 = () => {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

const getDate10DaysAgo = () => {
  let date10DaysAgo = new Date();
  date10DaysAgo.setDate(date10DaysAgo.getDate() - 10);
  return date10DaysAgo;
}

const getDateFirstDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const getDateLastDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

const getStartDate = () => {
  const dateJan1 = getDateJan1();
  const date10DaysAgo = getDate10DaysAgo();
  const dateFirstDayOfMonth = getDateFirstDayOfMonth();
  const startDate = new Date(Math.min(Math.max(dateJan1, date10DaysAgo), dateFirstDayOfMonth));
  return getFormattedDate(startDate);
}

const getEndDate = () => {
  return getFormattedDate(getDateLastDayOfMonth());
}

function incrementFormattedDate(formattedDate, incrementDays) {
  let date = new Date(formattedDate);
  date.setDate(date.getDate() + incrementDays);
  return getFormattedDate(date);
}

async function getEaster(year) {
  const fallbackDate = "2024-05-05";
  return axios.get(`https://psdox.com/calendar/api/${year}`)
    .then(response => {
      if (response && response.data) {
        // <grigorin>16.04.2023</grigorin>
        let match = response.data.match(/<grigorin>([\d\.]+)<\/grigorin>/);
        if (match) {
          return match[1].split(".").reverse().join("-");
        }
      }
      return fallbackDate;
    })
    .catch(error => {
      console.error(`ERROR: getEaster: ${error.message}`);
      if (error.response) {
        console.error(`ERROR: getEaster status: ${error.response.status}`);
        console.log(error.response.headers);
        console.log(error.response.data);
      }
      else if (error.request) {
        console.log(error.request);
      }
      return fallbackDate;
    });
}

// Official public holidays in Bulgaria.
const getPublicHolidays = (() => {
  let cached = {publicHolidays: null, year: null};
  return async () => {
    let year = (new Date()).getFullYear();
    if (cached.publicHolidays && cached.year === year) {
      return cached.publicHolidays;
    }
    let easterSunday = await getEaster(year);
    let publicHolidays = [
      `${year}-01-01`,
      `${year}-03-03`,
      incrementFormattedDate(easterSunday, -2), // Good Friday.
      incrementFormattedDate(easterSunday, +1), // Easter Monday.
      `${year}-05-01`,
      `${year}-05-06`,
      `${year}-05-24`,
      `${year}-09-06`,
      `${year}-09-22`,
      `${year}-11-01`,
    ];
    publicHolidays = [...publicHolidays, ...publicHolidays.reduce((extraHolidays, holiday) => {
      let dayOfWeek = (new Date(holiday)).getDay();
      if (dayOfWeek === 0) { // Sunday.
        extraHolidays.push(incrementFormattedDate(holiday, +1));
      }
      if (dayOfWeek === 6) { // Saturday.
        extraHolidays.push(incrementFormattedDate(holiday, +2));
      }
      return extraHolidays;
    }, [])];
    publicHolidays.push(`${year}-12-24`);
    publicHolidays.push(`${year}-12-25`);
    publicHolidays.push(`${year}-12-26`);
    let dayOfWeekChristmasEve = (new Date(year, 11, 24)).getDay();
    if (dayOfWeekChristmasEve === 0) { // Sunday 24th.
      publicHolidays.push(`${year}-12-27`); // Wednesday 27th, because 24th is Sunday.
    }
    else if (dayOfWeekChristmasEve === 4) { // Thursday 24th.
      // No need to add Sunday 27th, because it's Sunday.
      publicHolidays.push(`${year}-12-28`); // Monday 28th, because 26th is Saturday.
    }
    else if (dayOfWeekChristmasEve === 5) { // Friday 24th.
      publicHolidays.push(`${year}-12-27`); // Monday 27th, because 25th is Saturday.
      publicHolidays.push(`${year}-12-28`); // Tuesday 28th, because 26th is Sunday.
    }
    else if (dayOfWeekChristmasEve === 6) { // Saturday 24th.
      publicHolidays.push(`${year}-12-27`); // Tuesday 27th, because 24th is Saturday.
      publicHolidays.push(`${year}-12-28`); // Wednesday 28th, because 25th is Sunday.
    }
    // Unique and sorted values.
    publicHolidays = [...new Set(publicHolidays)].sort();
    cached = {publicHolidays, year};
    return publicHolidays;
  }
})();

function isWorkingDay(date, { publicHolidays }) {
  const formattedDate = getFormattedDate(date);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  else if (publicHolidays.includes(formattedDate)) {
    return false;
  }
  else {
    return true;
  }
}

const getBusinessDays = ({ publicHolidays = [] } = {}) => {
  let businessDays = [];
  const start = new Date(getStartDate());
  const end = new Date();

  // If it's friday.
  if (end.getDay() !== 5) {
    // Remove the current day but NOT friday!
    end.setDate(end.getDate() - 1);
  }

  let current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current, { publicHolidays })) {
      businessDays.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1);
  }

  return businessDays;
}

module.exports = { getStartDate, getEndDate, getBusinessDays, getPublicHolidays }
