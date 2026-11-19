(function () {
  'use strict';
  const button = document.getElementById('cfFullBackup');
  if (!button) return;
  const savedJob = 'cf-ecosystem-backup-job';

  async function call(bridge, body) {
    const { data, error } = await bridge.getClient().functions.invoke('cleanfleet-backup', { body });
    if (error) {
      const result = await error.context?.json?.().catch(() => null);
      if ([404, 410].includes(error.context?.status)) sessionStorage.removeItem(savedJob);
      throw new Error(result?.error || 'Usługa tworzenia kopii jest niedostępna.');
    }
    return data;
  }

  button.addEventListener('click', async () => {
    const bridge = window.cfBackupBridge;
    if (!bridge?.isAdmin() || button.disabled) return;
    button.disabled = true;
    document.getElementById('menuOverlay')?.classList.remove('open');
    try {
      let jobId = sessionStorage.getItem(savedJob);
      if (!jobId) {
        const job = await call(bridge, { action: 'start' });
        jobId = job.id;
        sessionStorage.setItem(savedJob, jobId);
      }
      bridge.setSync('Tworzenie zaszyfrowanej kopii…');
      bridge.toast('Kopia jest przygotowywana. Możesz wrócić do tego przycisku.');
      const until = Date.now() + 20 * 60_000;
      while (Date.now() < until) {
        const job = await call(bridge, { action: 'status', id: jobId });
        if (job.state === 'failed') {
          sessionStorage.removeItem(savedJob);
          throw new Error('Kopia nie przeszła weryfikacji. Spróbuj ponownie.');
        }
        if (job.state === 'ready') {
          const url = new URL(job.url);
          if (url.protocol !== 'https:' || url.origin !== new URL(bridge.getClient().supabaseUrl).origin) {
            throw new Error('Nieprawidłowy adres pobrania kopii.');
          }
          const link = document.createElement('a');
          link.href = url.href;
          link.rel = 'noopener';
          document.body.append(link);
          link.click();
          link.remove();
          sessionStorage.removeItem(savedJob);
          bridge.setSync('Kopia gotowa do zapisania', 'ok');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      bridge.toast('Kopia jest w toku. Kliknij ponownie, aby sprawdzić wynik.');
    } catch (error) {
      bridge.setSync('Kopia nie została pobrana', 'err');
      bridge.toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
})();
