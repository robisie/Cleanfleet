# Numeracja CleanFleet

Ustalony schemat: `vMAJOR.FEATURE.FIX`.

- `MAJOR` oznacza główną generację aplikacji.
- `FEATURE` rośnie przy nowym module albo odrębnej funkcjonalności; wtedy `FIX` wraca do zera.
- `FIX` rośnie przy poprawce błędu, usprawnieniu działania lub zmianie wyglądu bez nowej funkcji.

Po przeglądzie zmian z 21–29 września 2026 oznaczenie aplikacji skorygowano z `v1.30.135` na `v1.48.5`. To nowy punkt odniesienia; historyczne nazwy commitów i oznaczenia wydań zachowują oryginalną postać. Poprawka backupu to `v1.48.6`. Eksport jednego backupu wszystkich danych aplikacji bez zdjęć to nowa funkcja `v1.49.0`. Następna poprawka to `v1.49.1`.

Przy publikacji aktualizuj wspólnie widoczny numer i wartość `app_version` w `app/index.html`, oznaczenie w `app/sw.js` oraz parametr rejestracji `sw.js`. Parametry `?v=` i numery w nazwach plików modułów są kluczami odświeżania lub historią tych plików; zmieniaj je, gdy zmienia się ich zawartość. Nie zastępuj globalnie starych numerów w HTML, ponieważ mogą oznaczać historyczny moment uruchomienia funkcji.
