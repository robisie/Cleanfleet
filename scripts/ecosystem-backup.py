"""Create encrypted backup archives for jobs in the shared application database."""
import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import boto3
import psycopg
from botocore.config import Config
from psycopg.conninfo import conninfo_to_dict

DELIVERY_BUCKET = "ecosystem-backup-delivery"
ROOT = Path(__file__).resolve().parents[1]
LOCK_ID = 1341878321
INVENTORY = """
select b.id, o.name, o.version, o.updated_at, o.metadata
from storage.buckets b
left join storage.objects o on o.bucket_id=b.id
where b.id <> %s
order by b.id,o.name
"""
CLAIM = """
update private.ecosystem_backup_jobs set state='running',updated_at=now()
where id=(
  select id from private.ecosystem_backup_jobs
  where state in ('running','queued') order by created_at for update skip locked limit 1
)
returning id
"""


def run(*args, env=None):
    return subprocess.run(
        args, cwd=ROOT, env=env, check=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=3600,
    ).stdout


def file_hash(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def copy_object(s3, archive, bucket, name, metadata, index):
    member = f"storage/{index}"
    conditions = {}
    etag = (metadata or {}).get("eTag")
    if etag:
        conditions["IfMatch"] = etag
    response = s3.get_object(Bucket=bucket, Key=name, **conditions)
    digest = hashlib.sha256()
    length = 0
    body = response["Body"]
    try:
        with archive.open(member, "w", force_zip64=True) as output:
            for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
                length += len(chunk)
    finally:
        body.close()
    expected_length = (metadata or {}).get("size")
    if length != response["ContentLength"] or (expected_length is not None and length != int(expected_length)):
        raise RuntimeError("Storage object size differs from the backup snapshot")
    return {
        "bucket": bucket, "key": name, "member": member, "sha256": digest.hexdigest(), "bytes": length,
        "content_type": response.get("ContentType"), "metadata": response.get("Metadata", {}),
    }


def dump_database(dsn, snapshot, directory):
    options = conninfo_to_dict(dsn)
    if any("\n" in value or "\r" in value for value in options.values()):
        raise ValueError("Invalid multiline PostgreSQL connection option")
    service = directory / "pg_service.conf"
    service.write_text("[ecosystem_backup]\n" + "".join(f"{key}={value}\n" for key, value in options.items()))
    database = directory / "database.dump"
    run("pg_dump", "--no-password", "--format=custom", "--dbname=service=ecosystem_backup",
        f"--snapshot={snapshot}", f"--file={database}", env={**os.environ, "PGSERVICEFILE": str(service)})
    run("pg_restore", "--list", str(database))
    globals_sql = directory / "globals.sql"
    run("pg_dumpall", "--no-password", "--globals-only", "--no-role-passwords",
        "--dbname=service=ecosystem_backup", f"--file={globals_sql}",
        env={**os.environ, "PGSERVICEFILE": str(service)})
    service.unlink()
    return database, globals_sql


def create_archive(dsn, s3, recovery_config, recipient, directory):
    before = datetime.now(timezone.utc).isoformat()
    with psycopg.connect(dsn) as source:
        source.execute("set transaction isolation level repeatable read read only")
        snapshot, server = source.execute(
            "select pg_export_snapshot(),current_setting('server_version')"
        ).fetchone()
        inventory = source.execute(INVENTORY, (DELIVERY_BUCKET,)).fetchall()
        database, globals_sql = dump_database(dsn, snapshot, directory)
    source_commit = run("git", "rev-parse", "HEAD").decode().strip()
    code = directory / "application.tar"
    run("git", "archive", "--format=tar", f"--output={code}", source_commit)
    bundle = directory / "ecosystem.zip"
    with ZipFile(bundle, "w", ZIP_DEFLATED, allowZip64=True) as archive:
        assets = []
        for path, name in ((database, "database.dump"), (globals_sql, "globals.sql"), (code, "application.tar"),
                           (recovery_config, "recovery-config.gpg")):
            assets.append({"member": name, "sha256": file_hash(path)})
            archive.write(path, name)
        objects = [
            copy_object(s3, archive, bucket, name, metadata, index)
            for index, (bucket, name, _version, _modified, metadata) in enumerate(inventory)
            if name is not None
        ]
        with psycopg.connect(dsn) as source:
            if source.execute(INVENTORY, (DELIVERY_BUCKET,)).fetchall() != inventory:
                raise RuntimeError("Storage changed during backup; retry for a consistent copy")
        archive.writestr("manifest.json", json.dumps({
            "format": 1, "created_at": before, "source_commit": source_commit, "postgres_version": server,
            "buckets": sorted({row[0] for row in inventory}), "files": assets, "objects": objects,
            "delivery_bucket_excluded": DELIVERY_BUCKET,
        }, ensure_ascii=False))
    with ZipFile(bundle) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("Invalid backup archive")
    encrypted = directory / "ecosystem.zip.gpg"
    run("gpg", "--batch", "--yes", "--trust-model", "always", "--recipient", recipient,
        "--output", str(encrypted), "--encrypt", str(bundle))
    return encrypted


def finish(connection, job_id, state):
    connection.execute(
        "update private.ecosystem_backup_jobs set state=%s,updated_at=now() where id=%s",
        (state, job_id),
    )


def work(dsn, s3, recovery_config, recipient, scratch, once):
    with psycopg.connect(dsn, autocommit=True) as queue:
        if not queue.execute("select pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[0]:
            raise RuntimeError("Another backup worker is already active")
        while True:
            job = queue.execute(CLAIM).fetchone()
            if job:
                job_id = job[0]
                try:
                    with tempfile.TemporaryDirectory(prefix="ecosystem-", dir=scratch) as workdir:
                        backup = create_archive(dsn, s3, recovery_config, recipient, Path(workdir))
                        key = f"{job_id}.zip.gpg"
                        s3.upload_file(str(backup), DELIVERY_BUCKET, key,
                                       ExtraArgs={"ContentType": "application/octet-stream"})
                        response = s3.get_object(Bucket=DELIVERY_BUCKET, Key=key)
                        remote = response["Body"]
                        try:
                            digest = hashlib.sha256()
                            for chunk in remote.iter_chunks(chunk_size=1024 * 1024):
                                digest.update(chunk)
                        finally:
                            remote.close()
                        if digest.hexdigest() != file_hash(backup):
                            raise RuntimeError("Uploaded encrypted archive checksum differs")
                    finish(queue, job_id, "ready")
                except Exception as error:
                    finish(queue, job_id, "failed")
                    # Error messages from external programs can contain credentials or paths.
                    print(f"Backup job failed ({type(error).__name__})", flush=True)
            if once:
                return
            if not job:
                time.sleep(5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    args = parser.parse_args()
    os.umask(0o077)
    dsn = os.environ["BACKUP_DB_DSN"]
    recipient = os.environ["BACKUP_RECIPIENT_FINGERPRINT"]
    if not re.fullmatch(r"[0-9A-Fa-f]{40,64}", recipient):
        raise ValueError("Set the full fingerprint of the recovery public key")
    recovery_config = Path(os.environ["BACKUP_RECOVERY_CONFIG"]).resolve(strict=True)
    scratch = Path(os.environ["BACKUP_WORK_DIR"]).resolve(strict=True)
    if not recovery_config.is_file() or recovery_config.stat().st_size == 0:
        raise ValueError("Provide a separate encrypted recovery configuration")
    if not scratch.is_dir() or stat.S_IMODE(scratch.stat().st_mode) & 0o077:
        raise ValueError("Use a private work directory with mode 0700")
    endpoint = os.environ["BACKUP_STORAGE_S3_ENDPOINT"]
    if not endpoint.startswith("https://"):
        raise ValueError("Use an HTTPS Storage S3 endpoint")
    s3 = boto3.client(
        "s3", endpoint_url=endpoint, region_name=os.environ["BACKUP_STORAGE_REGION"],
        aws_access_key_id=os.environ["BACKUP_STORAGE_ACCESS_KEY"],
        aws_secret_access_key=os.environ["BACKUP_STORAGE_SECRET_KEY"],
        config=Config(s3={"addressing_style": "path"}, request_checksum_calculation="when_required",
                      response_checksum_validation="when_required"),
    )
    work(dsn, s3, recovery_config, recipient, scratch, args.once)


if __name__ == "__main__":
    main()
