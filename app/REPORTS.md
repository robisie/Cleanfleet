# Raporty administratora — v1.30.33

Moduł działa na oddzielnym zestawie danych pobranym przez istniejący klient Supabase z sesją użytkownika. Nie przełącza aktywnej firmy, nie zmienia wpisów, zdjęć ani raportów klientów. Brak migracji bazy. Biblioteki XLSX, jsPDF i AutoTable pochodzą z istniejącej aplikacji. Dodano lokalną czcionkę z polskimi znakami i jej licencję.

## Dane i obliczenia

Katalog pól sprawdzony 2026-09-21 w `information_schema.columns`; klucze, relacje oraz RLS sprawdzone w PostgreSQL. Źródła biznesowe obejmują usługi, pojazdy, firmy, faktury i pozycje, zakupy, zarobki i reguły, własne przypomnienia i podatki, pracowników, dostępy firmowe, wnioski, zdjęcia serwerowe i wiadomości. Nie pobiera haseł/PIN, kluczy push ani tabel technicznej konfiguracji.

Pobieranie stronicowane z porządkiem klucza i kontrolą liczby oraz duplikatów. Błąd pobierania nie jest zamieniany na pusty, poprawny raport. Baza może zmienić wartości między żądaniami: nie jest to transakcyjny snapshot całej bazy. Wyświetlony wynik, jego grupy, szczegóły i eksporty korzystają jednak z jednego pobranego zestawu i mają datę pobrania.

Połączenia nie mnożą wierszy. Pozycja faktury jest unikalna według `wash_record_id`, a faktura wiązana przez `invoice_id`. Typ historyczny usługi i obecny typ pojazdu są osobnymi polami. Pojazd identyfikowany w raportach przez firmę i rejestrację; bieżący klucz główny kartoteki w bazie to `plate`.

- Liczba wpisów obejmuje wszystkie wiersze po filtracji; wykonane prania mają `wash_date`.
- Brakująca kwota jest pomijana w średniej, nie zastępowana zerem. Kwoty pieniężne sumowane w groszach.
- Częstotliwość: wykonane prania / unikalne pojazdy w przefiltrowanym zbiorze.
- Średni odstęp: różnice kolejnych dat dla firmy i pojazdu, wyłącznie po filtracji; pokazuje pary wpisów. Dwa prania jednego dnia dają 0 dni.
- Dni godzinowych pól wyznacza Europe/Warsaw; tydzień zaczyna się w poniedziałek.
- Filtry: ORAZ między filtrami, LUB między wartościami jednego filtra. Pusty wybór wartości oznacza brak dopasowania.

## Dostęp i ograniczenia

Administrator otwiera Raporty z kafelka panelu. Zarobki wymagają odblokowania istniejącego modułu PIN. Reguły RLS zachowane; przypomnienia i podatki są własne. Dane i widok raportów usuwane z pamięci przy wylogowaniu / zmianie użytkownika lub roli. Szablony zapisują wyłącznie konfigurację, lokalnie i osobno dla użytkownika; nie synchronizują się między urządzeniami.

Drill-down otwiera widoki tylko do odczytu bez zmiany kontekstu firmy. Powrót zachowuje konfigurację i stronę tabeli. PDF i XLSX eksportują cały raport nadrzędny, nie tylko aktualną stronę lub drill-down (komunikat jest przy tabeli). XLSX zawiera pełne kolumny danych i autofilter. PDF korzysta z wybranych kolumn; długie zestawy kolumn dzielone na części powiązane numerem wiersza. Wykres udziałowy ma w PDF postać słupków z procentami, zachowując mianownik całego raportu. Bardzo duże zbiory obciążą pamięć urządzenia — obliczenia są po stronie klienta.

Zdjęcia lokalne nie są dostępne w tabeli serwerowej zdjęć. Nie wymyślamy podtypu pojazdu ani rodzaju usługi: katalog zawiera tylko istniejące pola, m.in. `type` i `billing_category`.

## Weryfikacja wydania

Przeprowadzono porównanie silnika z niezależnym SQL na rzeczywistych danych: liczby, suma/średnia, unikalne pojazdy, typy, wykonawcy, firmy, kombinacja okres + wiele typów + zatwierdzenie oraz średnie odstępy. Zweryfikowano zachowanie filtrów i szczegółów w testach DOM, powrót, szablony, blokadę PIN, zmianę roli i błędy niekompletnych danych. XLSX ponownie odczytany: zgodność liczby wierszy, sum, typów liczb/dat/boolean i autofilter. PDF wygenerowany rzeczywistym jsPDF/AutoTable, wyciągnięty tekst i sprawdzony render: polskie znaki, strony, tabela, karta pojazdu. Przetestowane SVG dla trzech wykresów i eksport do PDF; rasteryzacja w teście lokalnym przez Sharp.

Przeglądarka produkcyjna wymaga logowania. Nie wykonano pełnego testu zalogowanego administratora na produkcji ani testu na fizycznym iPhonie/iPadzie. Responsywne reguły obejmują telefon (520 px), tablet (900 px) i desktop; walidacja wizualna na tych urządzeniach pozostaje do wykonania.

Test powtarzalny: `node app/tests/reports.test.cjs`. Prywatna kopia danych może być przekazana zmienną `CF_REPORT_FIXTURE`; danych klientów nie przechowujemy w repozytorium.
