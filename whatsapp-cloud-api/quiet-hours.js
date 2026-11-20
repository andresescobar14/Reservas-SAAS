"use strict";
// Only reminders are deferred. A confirmation follows the customer's new booking.
function nextReminderTime(now, timezone) {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (date) => {
    const p = format.formatToParts(date);
    return {
      hour: Number(p.find((x) => x.type === "hour").value),
      minute: Number(p.find((x) => x.type === "minute").value),
    };
  };
  const current = parts(new Date(now));
  if (current.hour >= 8 && current.hour < 20) return now;
  // Iterate UTC instants to handle daylight saving transitions without guessing offsets.
  for (
    let candidate = Math.ceil(now / 60000) * 60000;
    candidate <= now + 36 * 3600000;
    candidate += 60000
  ) {
    const local = parts(new Date(candidate));
    if (local.hour === 8 && local.minute === 0) return candidate;
  }
  throw new Error("Cannot resolve business hours");
}
module.exports = { nextReminderTime };
