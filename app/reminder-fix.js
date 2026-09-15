/* CleanFleet reminders date-bucket fix.
   Klasyfikacja Dzisiaj/Zaległe opiera się na dacie wymagalności (due_at),
   a nie na godzinie wcześniejszego przypomnienia (remind_at).
   Termin przypadający dzisiaj pozostaje w "Dzisiaj" przez cały dzień
   i przechodzi do "Zaległe" dopiero po północy następnego dnia. */
(() => {
  let installed = false;

  function rerenderReminders(){
    const active = document.querySelector('#cfReminderTabs [data-reminder-tab].active');
    if (active) {
      // Handler istniejący w aplikacji wywołuje wewnętrzne render(),
      // więc po podmianie cfReminderBucket wymuszamy ponowną klasyfikację.
      active.click();
    }
  }

  function installFix(){
    if (typeof window.cfReminderBucket !== 'function') {
      setTimeout(installFix, 50);
      return;
    }

    window.cfReminderBucket = function(r, now = new Date()){
      if (r.status === 'done' || r.status === 'cancelled') return 'done';

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

    installed = true;
    setTimeout(rerenderReminders, 0);
    setTimeout(rerenderReminders, 250);
  }

  installFix();

  // Moduł przypomnień może być otwierany dopiero później.
  // Gdy pojawią się jego zakładki, wymuszamy render już z poprawną logiką.
  const observer = new MutationObserver(() => {
    if (!installed) return;
    const tabs = document.getElementById('cfReminderTabs');
    if (tabs && !tabs.dataset.cfDateFixRendered) {
      tabs.dataset.cfDateFixRendered = '1';
      setTimeout(rerenderReminders, 0);
    }
  });
  observer.observe(document.documentElement, {subtree:true, childList:true});
})();