/* CleanFleet reminders date-bucket fix.
   Klasyfikacja Dzisiaj/Zaległe opiera się na dacie wymagalności (due_at),
   a nie na godzinie wcześniejszego przypomnienia (remind_at).
   Termin przypadający dzisiaj pozostaje w "Dzisiaj" przez cały dzień
   i przechodzi do "Zaległe" dopiero po północy następnego dnia. */
(() => {
  function installFix(){
    if (typeof window.cfReminderBucket !== 'function') {
      setTimeout(installFix, 50);
      return;
    }

    window.cfReminderBucket = function(r, now = new Date()){
      if (r.status === 'done' || r.status === 'cancelled') return 'done';

      // Najważniejsza jest faktyczna data wymagalności.
      // remind_at może być celowo wcześniejsze (np. przypomnienie dzień wcześniej),
      // więc nie może decydować o tym, czy pozycja jest już zaległa.
      const raw = r.due_at || ((r.status === 'snoozed' && r.snoozed_until)
        ? r.snoozed_until
        : r.remind_at);

      const at = new Date(raw);
      if (Number.isNaN(at.getTime())) return 'upcoming';

      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const nextDay = new Date(dayStart);
      nextDay.setDate(nextDay.getDate() + 1);

      const dueDay = new Date(at.getFullYear(), at.getMonth(), at.getDate());

      if (dueDay < dayStart) return 'overdue';
      if (dueDay < nextDay) return 'today';
      return 'upcoming';
    };
  }

  installFix();
})();
