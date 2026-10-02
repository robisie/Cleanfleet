# Numeracja CleanFleet

Ustalony schemat: `vMAJOR.FEATURE.FIX`.

- `MAJOR` oznacza główną generację aplikacji.
- `FEATURE` oznacza moduł aplikacji; nowa funkcjonalność w istniejącym module nie zmienia tego numeru.
- `FIX` rośnie o 1 przy każdej kolejnej zmianie w module: nowej funkcji, poprawce lub zmianie wyglądu.

Po przeglądzie zmian z 21–29 września 2026 oznaczenie aplikacji skorygowano z `v1.30.135` na `v1.48.5`. To nowy punkt odniesienia; historyczne nazwy commitów i oznaczenia wydań zachowują oryginalną postać. Poprawka backupu to `v1.48.6`. Eksport jednego backupu wszystkich danych aplikacji bez zdjęć to nowa funkcja `v1.49.0`. Poprawki eksportu: `v1.49.1` (widoczne błędy), `v1.49.2` (połączenie przycisku z modułem administratora), `v1.49.3` (biblioteka ZIP w aplikacji). Przywracanie wybranego zakresu z jednego backupu to nowa funkcja `v1.50.0`. Przeniesienie opcji kopii z menu do kafelka administratora to `v1.50.1`.

Przy publikacji aktualizuj wspólnie widoczny numer i wartość `app_version` w `app/index.html`, oznaczenie w `app/sw.js` oraz parametr rejestracji `sw.js`. Parametry `?v=` i numery w nazwach plików modułów są kluczami odświeżania lub historią tych plików; zmieniaj je, gdy zmienia się ich zawartość. Nie zastępuj globalnie starych numerów w HTML, ponieważ mogą oznaczać historyczny moment uruchomienia funkcji.

Etap 1 modułu Dokumenty księgowe w panelu administratora — kafelek, widok miesiąca i podgląd wybranych plików — `v1.51.0`.

Poprawka widoczności kafelka Dokumenty księgowe przez użycie udostępnionego mechanizmu uprawnień administratora — `v1.51.1`.

Etap 2 modułu Dokumenty księgowe — eksport faktur zakupowych i sprzedażowych z KSeF do osobnych archiwów XML/ZIP — `v1.52.0`.

Zapamiętanie tokenu KSeF: przycisk Zapisz, maskowanie pola i zaszyfrowany zapis dla administratora — `v1.52.1`.

Etap 3 Dokumentów księgowych — konwersja pełnych eksportów CSV mBanku do MT940, kontrola sald i pobieranie plików STA — `v1.53.0`.

Rozszerzenie eksportu MT940 zmienione na TXT zgodnie z wymaganiem księgowej — `v1.53.1`.

## Uzgodnienie numeracji Dokumentów księgowych — 2 października 2026

Moduł ma stały numer `1.51`. Każda kolejna zmiana zwiększa ostatnią liczbę o 1. Nie kodujemy numerów funkcji ani ich poprawek w ostatnim segmencie.

- `v1.51.0`: początkowy widok modułu.
- `v1.51.1`: integracja KSeF.
- `v1.51.2`: zapamiętanie tokenu.
- `v1.51.3`: konwersja CSV mBanku do MT940.
- `v1.51.4`: rozszerzenie MT940 `.txt`.
- `v1.51.5`: wybór wielu PDF-ów z mOrganizera.

Starsze oznaczenia `1.52.*` i `1.53.*` powyżej oraz w historii Git są historycznymi etykietami sprzed uzgodnienia. Bieżące oznaczenie aplikacji: `v1.51.5`. Kolejna zmiana tego modułu: `v1.51.6`.
