// Parse time string (e.g., "8pm", "20:00", "3:30pm")
function parseTime(timeStr) {
  const pmMatch = timeStr.match(/(\d+):?(\d+)?\s*(am|pm)/i);
  if (pmMatch) {
    let [, hours, minutes, period] = pmMatch;
    hours = parseInt(hours);
    minutes = parseInt(minutes || 0);

    if (period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }

    return [hours, minutes];
  }

  const hourMinuteMatch = timeStr.match(/(\d+):(\d+)/);
  if (hourMinuteMatch) {
    const [, hours, minutes] = hourMinuteMatch;
    return [parseInt(hours), parseInt(minutes)];
  }

  const hourMatch = timeStr.match(/(\d+)\s*(am|pm)?/i);
  if (hourMatch) {
    let [, hours, period] = hourMatch;
    hours = parseInt(hours);

    if (period && period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period && period.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }

    return [hours, 0];
  }

  throw new Error(`Could not parse time: ${timeStr}`);
}

// Parse time input and convert to UTC
export function parseTimeToUTC(timeString) {
  const now = new Date();
  let targetTime;

  if (timeString.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timePart = timeString.replace('tomorrow', '').trim();
    const [hours, minutes] = parseTime(timePart);
    tomorrow.setHours(hours, minutes || 0, 0, 0);
    targetTime = tomorrow;
  } else {
    const [hours, minutes] = parseTime(timeString);
    const today = new Date(now);
    today.setHours(hours, minutes || 0, 0, 0);

    if (today < now) {
      today.setDate(today.getDate() + 1);
    }
    targetTime = today;
  }

  return targetTime.toISOString();
}

// Generate date options for today and the next 13 days (14 days total)
export function getDateOptions() {
  const options = [];
  const now = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);

    let label;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else {
      label = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }

    options.push({
      label,
      value: date.toISOString().split('T')[0],
      description: date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    });
  }

  return options;
}

// Generate time options - prioritize common gaming hours (evening first)
export function getTimeOptions() {
  const options = [];

  const orderedHours = [
    14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    12, 13,
    0,
  ];

  for (const hour of orderedHours) {
    for (const minute of [0, 30]) {
      if (options.length >= 25) break;

      const hourStr = hour.toString().padStart(2, '0');
      const minuteStr = minute.toString().padStart(2, '0');
      const value = `${hourStr}:${minuteStr}`;

      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const label = `${displayHour}:${minuteStr} ${period} UTC`;

      options.push({ label, value, description: `${value} UTC` });
    }
  }

  return options;
}

// Generate hour options (0-23)
export function getHourOptions() {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = hour.toString().padStart(2, '0');
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    options.push({
      label: `${displayHour} ${period}`,
      value: hourStr,
      description: `${hourStr}:00 UTC`,
    });
  }
  return options;
}

// Generate minute options (00, 15, 30, 45)
export function getMinuteOptions() {
  return [
    { label: '00', value: '00', description: 'On the hour' },
    { label: '15', value: '15', description: 'Quarter past' },
    { label: '30', value: '30', description: 'Half past' },
    { label: '45', value: '45', description: 'Quarter to' },
  ];
}

// Generate reminder time options (hours and minutes before game)
export function getReminderTimeOptions() {
  const options = [];
  
  // Common reminder times: minutes only (5, 10, 15, 30, 45)
  const minuteOptions = [5, 10, 15, 30, 45];
  for (const minutes of minuteOptions) {
    options.push({
      label: `${minutes} minute${minutes !== 1 ? 's' : ''} before`,
      value: String(minutes),
      description: `${minutes} minutes before game starts`,
    });
  }
  
  // Hour options: 1, 2, 3, 6, 12, 24 hours
  const hourOptions = [1, 2, 3, 6, 12, 24];
  for (const hours of hourOptions) {
    const totalMinutes = hours * 60;
    options.push({
      label: `${hours} hour${hours !== 1 ? 's' : ''} before`,
      value: String(totalMinutes),
      description: `${totalMinutes} minutes (${hours} hour${hours !== 1 ? 's' : ''}) before game starts`,
    });
  }
  
  // Additional combinations for common times
  const hourMinuteCombos = [
    { hours: 1, minutes: 30 },
    { hours: 2, minutes: 30 },
    { hours: 4, minutes: 0 },
    { hours: 8, minutes: 0 },
  ];
  
  for (const { hours, minutes } of hourMinuteCombos) {
    const totalMinutes = hours * 60 + minutes;
    options.push({
      label: `${hours}h ${minutes}m before`,
      value: String(totalMinutes),
      description: `${totalMinutes} minutes before game starts`,
    });
  }
  
  // Sort by total minutes (ascending)
  options.sort((a, b) => parseInt(a.value, 10) - parseInt(b.value, 10));

  return options;
}

