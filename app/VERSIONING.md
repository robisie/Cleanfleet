# Numeracja CleanFleet

Ustalony schemat: `vMAJOR.FEATURE.FIX`.

- `MAJOR` oznacza główną generację aplikacji.
- `FEATURE` rośnie przy nowym module albo odrębnej funkcjonalności; wtedy `FIX` wraca do zera.
- `FIX` rośnie przy poprawce błędu, usprawnieniu działania lub zmianie wyglądu bez nowej funkcji.

Po przeglądzie zmian z 21–29 września 2026 oznaczenie aplikacji skorygowano z `v1.30.135` na `v1.48.5`. To nowy punkt odniesienia; historyczne nazwy commitów i oznaczenia wydań zachowują oryginalną postać. Poprawka backupu to `v1.48.6`. Eksport jednego backupu wszystkich danych aplikacji bez zdjęć to nowa funkcja `v1.49.0`. Poprawki eksportu: `v1.49.1` (widoczne błędy), `v1.49.2` (połączenie przycisku z modułem administratora), `v1.49.3` (biblioteka ZIP w aplikacji). Przywracanie wybranego zakresu z jednego backupu to nowa funkcja `v1.50.0`. Przeniesienie opcji kopii z menu do kafelka administratora to `v1.50.1`.

Przy publikacji aktualizuj wspólnie widoczny numer i wartość `app_version` w `app/index.html`, oznaczenie w `app/sw.js` oraz parametr rejestracji `sw.js`. Parametry `?v=` i numery w nazwach plików modułów są kluczami odświeżania lub historią tych plików; zmieniaj je, gdy zmienia się ich zawartość. Nie zastępuj globalnie starych numerów w HTML, ponieważ mogą oznaczać historyczny moment uruchomienia funkcji.

Etap 1 modułu Dokumenty księgowe w panelu administratora — kafelek, widok miesiąca i podgląd wybranych plików — `v1.51.0`.

Poprawka widoczności kafelka Dokumenty księgowe przez użycie udostępnionego mechanizmu uprawnień administratora — `v1.51.1`.

Etap 2 modułu Dokumenty księgowe — eksport faktur zakupowych i sprzedażowych z KSeF do osobnych archiwów XML/ZIP — `v1.52.0`.

Zapamiętanie tokenu KSeF: przycisk Zapisz, maskowanie pola i zaszyfrowany zapis dla administratora — `v1.52.1`.

Etap 3 Dokumentów księgowych — konwersja pełnych eksportów CSV mBanku do MT940, kontrola sald i pobieranie plików STA — `v1.53.0`.
