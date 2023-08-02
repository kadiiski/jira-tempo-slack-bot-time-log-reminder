const getFormattedDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getFirstDayOfMonth = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return getFormattedDate(firstDay);
}

const getLastDayOfMonth = () => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return getFormattedDate(lastDay);
}

const getBusinessDays = () => {
  let businessDays = [];
  const start = new Date(getFirstDayOfMonth());
  const end = new Date();

  // If it's friday.
  if (end.getDay() !== 5) {
    // Remove the current day but NOT friday!
    end.setDate(end.getDate() - 1);
  }

  while (start <= end) {
    const dayOfWeek = start.getDay();
    if(dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays.push(start.toISOString().split('T')[0])
    }
    start.setDate(start.getDate() + 1);
  }

  return businessDays;
}

module.exports = {getFirstDayOfMonth, getLastDayOfMonth, getBusinessDays}
