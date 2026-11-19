# Kopia całego ekosystemu

Panel administratora CleanFleet ma przycisk **Kopia całego ekosystemu**. Zlecenie trafia do prywatnej kolejki, a przeglądarka pobiera jeden zaszyfrowany plik po zweryfikowaniu go przez usługę. Dotychczasowe kopie danych CleanFleet i import Excel mają oddzielne zastosowania.

## Zakres

- Zrzut PostgreSQL w formacie `pg_dump` zawiera schematy i dane bazy, w tym konta, faktury, numerację, rozliczenia, inwestycje i metadane plików. Zrzut nie zawiera ręcznej listy tabel.
- Każdy zasobnik i obiekt Storage jest wykrywany na podstawie katalogu bazy. Osobny zasobnik wydawania gotowych kopii jest wyłączony z kopiowania plików.
- Archiwum zawiera kod z konkretnego commitu i osobny zaszyfrowany pakiet konfiguracji odtworzeniowej. Pakiet konfiguracji trzeba aktualizować przy zmianie ustawień platformy, sekretów lub kodu wdrożonego poza repozytorium.
- Manifest opisuje zakres, klucze obiektów i ich sumy SHA-256. Usługa odrzuca kopię, jeśli pliki zmieniły się w trakcie odczytu lub jeśli zaszyfrowany plik w Storage ma inną sumę niż plik lokalny.

## Uruchomienie

1. Przygotuj oddzielny zaufany serwer z PostgreSQL client tools zgodnymi z wersją serwera, GnuPG, Git i Python 3.12. Zainstaluj `scripts/backup-requirements.txt`. Katalog roboczy ma mieć uprawnienia `0700` i znajdować się na szyfrowanym woluminie.
2. Importuj do keyringu usługi wyłącznie publiczny klucz odzyskiwania. Zachowaj klucz prywatny w oddzielnym bezpiecznym miejscu i przetestuj nim odszyfrowanie. W zaszyfrowanym pakiecie odtworzeniowym zapisz ustawienia Supabase, wdrożone funkcje, konfigurację zewnętrznych usług oraz sekrety lub dane potrzebne do ich odtworzenia. Klucze powiązane z konkretnym projektem mogą wymagać odtworzenia przez platformę lub osobnej migracji szyfrowanych danych.
3. Ustaw w chronionym środowisku usługi `BACKUP_DB_DSN` (bezpośrednie połączenie lub tryb sesji i TLS), `BACKUP_STORAGE_S3_ENDPOINT`, `BACKUP_STORAGE_REGION`, `BACKUP_STORAGE_ACCESS_KEY`, `BACKUP_STORAGE_SECRET_KEY`, `BACKUP_RECIPIENT_FINGERPRINT`, `BACKUP_RECOVERY_CONFIG` i `BACKUP_WORK_DIR`. Zmienne z danymi dostępowymi są przeznaczone wyłącznie dla tej usługi.
4. Utwórz prywatny zasobnik `ecosystem-backup-delivery` bez publicznych polityk. Zastosuj migrację kolejki, wdróż funkcję eksportu z nowym modułem i uruchom `python scripts/ecosystem-backup.py` pod nadzorem menedżera usług. Włącz `ECOSYSTEM_BACKUP_ENABLED=true` po udanej próbie na środowisku odtworzeniowym.
5. Gotową kopię pobierz z panelu i zachowaj poza źródłowym projektem. Skonfiguruj oddzielną retencję plików w zasobniku wydawania kopii.

## Odtworzenie

Odszyfruj plik poza produkcją. Porównaj SHA-256 członków z manifestem, odtwórz bazę i role, a pliki odtwórz przez Storage według mapowania `bucket` i `key`. Przy migracji na zarządzany projekt Supabase zastosuj procedurę platformy dla jej schematów, ról i rozszerzeń. Zawartość zasobnika wydawania kopii i kolejka eksportu są stanem operacyjnym. Przed uruchomieniem aplikacji usuń przywrócone, już nieaktualne zlecenia i pobierz działające kopie z miejsca przechowywania poza projektem. Przed przywróceniem harmonogramów sprawdź numerację, statusy i XML KSeF oraz dopasowania bankowe. Trzymaj funkcje wysyłki, webhooks i harmonogramy wyłączone w czasie próby.
