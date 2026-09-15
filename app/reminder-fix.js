/* CleanFleet reminders date-bucket fix.
   A reminder stays in "Dzisiaj" for the whole calendar day.
   It becomes "Zaległe" only after midnight on the following day. */
(() => {
  function installFix(){
    if (typeof window.cfReminderBucket !== 'function') {
      setTimeout(installFix, 50);
      return;
    }

    window.cfReminderBucket = function(r, now = new Date()){
      if (r.status === 'done' || r.status === 'cancelled') return 'done';

      const raw = (r.status === 'snoozed' && r.snoozed_until)
        ? r.snoozed_until
        : r.remind_at;
      const at = new Date(raw);
      if (Number.isNaN(at.getTime())) return 'upcoming';

      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const nextDay = new Date(dayStart);
      nextDay.setDate(nextDay.getDate() + 1);

      if (at < dayStart) return 'overdue';
      if (at < nextDay) return 'today';
      return 'upcoming';
    };
  }

  installFix();
})();
