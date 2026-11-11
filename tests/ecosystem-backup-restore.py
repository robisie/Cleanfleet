"""Exercise backup, decryption and a restore on a disposable PostgreSQL server."""
import hashlib
import importlib.util
import io
import json
import os
import tempfile
from pathlib import Path
from zipfile import ZipFile

import pgserver
import psycopg

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("backup", ROOT / "scripts/ecosystem-backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class StorageBody(io.BytesIO):
    def iter_chunks(self, chunk_size):
        return iter(lambda: self.read(chunk_size), b"")


class Storage:
    def __init__(self):
        self.objects = {("new-bucket", "folder/new file.pdf"): b"example backup contents"}

    def get_object(self, Bucket, Key, **options):
        if Bucket != backup.DELIVERY_BUCKET:
            assert options == {"IfMatch": '"fixture-etag"'}
        data = self.objects[Bucket, Key]
        return {"Body": StorageBody(data), "ContentLength": len(data)}

    def upload_file(self, filename, bucket, key, **_options):
        self.objects[bucket, key] = Path(filename).read_bytes()


def exercise(scratch):
    gpg_home = scratch / "gpg"
    gpg_home.mkdir(mode=0o700)
    os.environ["GNUPGHOME"] = str(gpg_home)
    backup.run("gpg", "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
               "--quick-generate-key", "Backup fixture", "rsa2048", "encrypt", "1d")
    key = backup.run("gpg", "--with-colons", "--list-keys").decode()
    fingerprint = next(row.split(":")[9] for row in key.splitlines() if row.startswith("fpr:"))
    config = scratch / "config.gpg"
    config.write_bytes(b"fixture configuration")
    storage = Storage()

    with pgserver.get_server(scratch / "source", cleanup_mode="delete") as server:
        dsn = server.get_uri()
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute("create database restored")
            conn.execute("create role anon; create role authenticated; create role app_fixture")
            conn.execute("create schema private; create schema storage; create schema auth; create schema future_module")
            conn.execute("""
              create table storage.buckets(id text primary key);
              create table storage.objects(bucket_id text,name text,version text,updated_at timestamptz,metadata jsonb);
              insert into storage.buckets values ('new-bucket'),('empty-bucket'),('ecosystem-backup-delivery');
              insert into storage.objects values
                ('new-bucket','folder/new file.pdf','v1',now(),'{}'),
                ('ecosystem-backup-delivery','old.zip.gpg','v1',now(),'{}');
              create table future_module.later_feature(id bigserial, data text);
              alter table future_module.later_feature enable row level security;
              create policy demo on future_module.later_feature for select to app_fixture using (true);
              insert into future_module.later_feature(data) values ('new feature payload');
              create table auth.users(id uuid,encrypted_password text);
              insert into auth.users values ('10000000-0000-0000-0000-000000000001','example-password-hash');
              create table public.bill_counters(period text,last_number integer);
              insert into public.bill_counters values ('2026-11',31);
            """)
            # Match metadata to the fixture byte length without depending on the string length.
            conn.execute("update storage.objects set metadata=metadata||%s::jsonb where bucket_id='new-bucket'",
                         (json.dumps({"size": len(storage.objects["new-bucket", "folder/new file.pdf"]), "eTag": '"fixture-etag"'}),))
            migration = next((ROOT / "supabase/migrations").glob("*_ecosystem_backup_jobs.sql"))
            conn.execute(migration.read_text())
            job = conn.execute("insert into private.ecosystem_backup_jobs(owner_id) values(gen_random_uuid()) returning id").fetchone()[0]

        backup.work(dsn, storage, config, fingerprint, scratch, True)
        with psycopg.connect(dsn) as conn:
            assert conn.execute("select state from private.ecosystem_backup_jobs where id=%s", (job,)).fetchone() == ("ready",)

        encrypted = scratch / "received.zip.gpg"
        encrypted.write_bytes(storage.objects[backup.DELIVERY_BUCKET, f"{job}.zip.gpg"])
        decrypted = scratch / "decrypted.zip"
        backup.run("gpg", "--batch", "--output", str(decrypted), "--decrypt", str(encrypted))
        with ZipFile(decrypted) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            assert manifest["buckets"] == ["empty-bucket", "new-bucket"]
            [file] = manifest["objects"]
            assert (file["bucket"], file["key"]) == ("new-bucket", "folder/new file.pdf")
            assert archive.read(file["member"]) == storage.objects[file["bucket"], file["key"]]
            for item in manifest["objects"] + manifest["files"]:
                assert hashlib.sha256(archive.read(item["member"])).hexdigest() == item["sha256"]
            archive.extract("database.dump", scratch)

        restore_dsn = server.get_uri(database="restored")
        backup.run("pg_restore", "--exit-on-error", "--dbname", restore_dsn, str(scratch / "database.dump"))
        with psycopg.connect(restore_dsn) as restored:
            assert restored.execute("select data from future_module.later_feature").fetchone() == ("new feature payload",)
            assert restored.execute("insert into future_module.later_feature(data) values ('next') returning id").fetchone() == (2,)
            assert restored.execute("select count(*) from pg_policies where schemaname='future_module'").fetchone() == (1,)
            assert restored.execute("select encrypted_password from auth.users").fetchone() == ("example-password-hash",)
            assert restored.execute("select last_number from public.bill_counters").fetchone() == (31,)


if __name__ == "__main__":
    os.umask(0o077)
    pg_bin = Path(pgserver.__file__).parent / "pginstall/bin"
    os.environ["PATH"] = f"{pg_bin}:{os.environ['PATH']}"
    with tempfile.TemporaryDirectory(prefix="ecosystem-restore-") as tmp:
        exercise(Path(tmp))
    print("Encrypted backup and isolated database restore passed")
