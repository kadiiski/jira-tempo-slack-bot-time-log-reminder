const getFormattedDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  let date10DaysAgo = getDate10DaysAgo();
  const dateFirstDayOfMonth = getDateFirstDayOfMonth();
  let startDate = new Date(Math.min(date10DaysAgo, dateFirstDayOfMonth));
  return getFormattedDate(startDate);
}

const getEndDate = () => {
  return getFormattedDate(getDateLastDayOfMonth());
}

function isWorkingDay(date) {
  const formattedDate = getFormattedDate(date);
  const dayOfWeek = date.getDay();
  const year = date.getFullYear();
  const nonWorkingDays = [
    "XXXX-01-01",
    "XXXX-03-03",
    "XXXX-05-01",
    "XXXX-05-06",
    "XXXX-05-24",
    "XXXX-09-06",
    "XXXX-09-22",
    "XXXX-11-01",
    "XXXX-12-24",
    "XXXX-12-25",
    "XXXX-12-26",
  ].map(date => date.replace("XXXX", year));
  const nonWorkingMondays = nonWorkingDays.map(date => {
    let dayPlus1 = String(Number(date.substring(-2))).padStart(2, "0");
    return date.substring(0, -2) + dayPlus1;
  });
  // @TODO: Fix Christmas before Christmas if possible.
  // @TODO: Fix easter by using <grigorin> value in API.
  // API for BG Easter: "https://psdox.com/calendar/api/2023".
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  else if (nonWorkingDays.includes(formattedDate)) {
    return false;
  }
  else if (dayOfWeek === 1 && nonWorkingMondays.includes(formattedDate)) {
    return false;
  }
  else {
    return true;
  }
}

const getBusinessDays = () => {
  let businessDays = [];
  const start = new Date(getStartDate());
  const end = new Date();

  // If it's friday.
  if (end.getDay() !== 5) {
    // Remove the current day but NOT friday!
    end.setDate(end.getDate() - 1);
  }

  const current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current)) {
      businessDays.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1);
  }

  return businessDays;
}

module.exports = { getStartDate, getEndDate, getBusinessDays }
