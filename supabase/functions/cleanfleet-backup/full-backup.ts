const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DELIVERY_BUCKET = 'ecosystem-backup-delivery';

export async function fullBackup(req: Request, userId: string, client: any, admin: any) {
  if (Deno.env.get('ECOSYSTEM_BACKUP_ENABLED') !== 'true') {
    return { status: 503, body: { error: 'Kopia ekosystemu wymaga uruchomienia usługi backupu.' } };
  }

  const raw = await req.text();
  if (raw.length > 256) return { status: 400, body: { error: 'Nieprawidłowe żądanie.' } };
  let request;
  try { request = JSON.parse(raw); } catch { return { status: 400, body: { error: 'Nieprawidłowe żądanie.' } }; }
  if (!request || (request.action !== 'start' && (request.action !== 'status' || !UUID.test(request.id)))) {
    return { status: 400, body: { error: 'Nieprawidłowe żądanie.' } };
  }

  if (request.action === 'start') {
    const { rows: [job] } = await client.query(
      `insert into private.ecosystem_backup_jobs (owner_id) values ($1)
       on conflict (owner_id) where state in ('queued','running')
       do update set owner_id=excluded.owner_id returning id,state`, [userId],
    );
    return { status: 202, body: job };
  }

  const { rows: [job] } = await client.query(
    'select id,state from private.ecosystem_backup_jobs where id=$1 and owner_id=$2', [request.id, userId],
  );
  if (!job) return { status: 404, body: { error: 'Nie znaleziono kopii.' } };
  if (job.state !== 'ready') return { status: 200, body: job };

  const { data, error } = await admin.storage.from(DELIVERY_BUCKET).createSignedUrl(
    `${job.id}.zip.gpg`, 300, { download: `CleanFleet-ROBISIE-BILL-${job.id}.zip.gpg` },
  );
  if (error || !data?.signedUrl) return { status: 410, body: { error: 'Plik kopii jest już niedostępny.' } };
  return { status: 200, body: { ...job, url: data.signedUrl } };
}
