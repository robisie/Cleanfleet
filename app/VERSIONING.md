# Numeracja CleanFleet

Osobne narzędzie Moje płatności `/app/priv/index.html` v1.0.0: kafelek administratora, osobny PIN, zaszyfrowana lista i historia, import tekstowych PDF-ów z podglądem, edycja i miesięczna kontrola. Wersja całej aplikacji: `v1.54.0`.

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

Starsze oznaczenia `1.52.*` i `1.53.*` powyżej oraz w historii Git są historycznymi etykietami sprzed uzgodnienia. Bieżące oznaczenie modułu Dokumenty księgowe: `v1.51.17`. Kolejna zmiana tego modułu: `v1.51.18`. Bieżące oznaczenie całej aplikacji: `v1.52.11`.

Poczta o2 — połączenie IMAP na bieżącą sesję, wybór załączników banku i ZIP — `v1.51.6`.

Zaszyfrowany trwały zapis danych poczty, przycisk Zapisz, maskowanie i wymiana hasła — `v1.51.7`.

Kafelek Dokumenty księgowe bezpośrednio w rendererze administratora (także iPhone); aktualne pliki modułu przez Service Worker — `v1.51.8`.

Czytnik kartek z praniami — odczyt zdjęcia, tabela zatwierdzenia, czas 1:30 / 1,5, wykonane i nieopłacone, zapis transakcyjny — `v1.52.0`.

Naprawa otwierania Dokumentów księgowych — zamknięcie modułu poczty przed zamontowaniem formularza nie przerywa inicjalizacji obsługi kafelka — `v1.51.9`.


Czytnik kartek — GPT‑5.4, szczegółowy obraz, kontrola rejestracji i dat z całej kartki oraz przypisanie dat grup — `v1.52.1`.

Dokumenty księgowe v1.51.10 (aplikacja v1.52.2): standardowy LOGIN przez TLS dla o2, rozróżnienie odrzucenia logowania, błędów DNS/połączenia i otwarcia folderu. Logowanie wyłącznie kodów błędów bez danych skrzynki i hasła. Sprawdzono TLS i powitanie IMAP bez logowania do rzeczywistej skrzynki.

Dokumenty księgowe v1.51.11 (aplikacja v1.52.3): filtr maili kontakt@mbank.pl i tytułu „mBank - elektroniczne zestawienie operacji za *”, kontrolowany przy wyszukiwaniu i pobieraniu pojedynczego załącznika.


Czytnik kartek — analiza asynchroniczna, krótkie sprawdzanie statusu i wznowienie tego samego wyniku po przerwaniu połączenia — `v1.52.4`.

Dokumenty księgowe v1.51.12 (aplikacja v1.52.5): wybór folderu z listy IMAP o2; rozwiązywanie pełnej ścieżki folderu i Unicode, pomijanie kontenerów bez możliwości wyboru. Lista folderów pobierana po logowaniu bez otwierania folderu i bez zapisu hasła.


Czytnik kartek — przycisk OCR obok wyszukiwarki w panelu administratora, niewidoczny w widokach firm i dla pracowników — `v1.52.6`.


Dokumenty księgowe v1.51.13 (aplikacja v1.52.7): jeden przycisk pobiera świeże faktury KSeF i wszystkie bankowe załączniki z wybranego zakresu poczty, konwertuje wgrane CSV do MT940 TXT i dołącza wszystkie PDF-y mOrganizera. ZIP zawiera folder miesiąca, zakupy/KSEF, sprzedaż, wyciągi i pusty raport kasowy. Kontrola kompletności, kolizji nazw i anulowania; błąd któregokolwiek źródła blokuje niepełny ZIP.

Dokumenty księgowe v1.51.14 (aplikacja v1.52.8): zwijane dane logowania poczty; przycisk Pobierz całą paczkę na dole pakuje przygotowane faktury KSeF, MT940, PDF-y i wyłącznie zaznaczone wyniki poczty. Bez ponownego eksportu, konwersji i wyszukiwania. Źródła można pominąć; wybrane CSV wymagają wcześniejszej konwersji. Pobieranie dokumentów oddzielnie pozostaje dostępne.

Dokumenty księgowe v1.51.15 (aplikacja v1.52.9): zakupy i sprzedaż KSeF w PDF, generowane lokalnie z XML przez przypięty renderer CIRFMF 1.1.40; QR z oryginalnego SHA-256, NIP-u i daty wystawienia. Osobne ZIP-y i wspólna paczka zawierają wyłącznie PDF-y KSeF. Sprawdzenie kompletności, formatu i anulowania; błąd konwersji blokuje eksport. Wizualna weryfikacja zwykłej faktury, korekty i faktury z 70 pozycjami; polskie znaki, sumy, wielostronicowe tabele.

Dokumenty księgowe v1.51.16 (aplikacja v1.52.10): kontrola płatności przed ZIP. Metadane zakupów zachowane w pamięci z XML KSeF; porównanie ujemnych operacji CSV według dokładnej kwoty, waluty, numeru faktury, rachunku i nazwy sprzedawcy. Dopasowania, przypadki niepewne, wydatki do sprawdzenia i pozostałe operacje; platformy/operatorzy, korekty, raty, duplikaty i inne waluty wymagają oceny. Ograniczenie do bieżącego miesiąca i przygotowanych źródeł ujawnione w raporcie. Osobne zatwierdzenie ZIP, unieważnienie kontroli po zmianie źródeł.

Dokumenty księgowe v1.51.17 (aplikacja v1.52.11): czytelna responsywna lista kontroli z datą, odbiorcą, kwotą i statusem; rozwijane szczegóły, filtry i wyszukiwanie. Zaznaczanie widocznych pozycji i akcje zbiorcze: do uzupełnienia, dokument poza KSeF, nie wymaga faktury, sprawdzone, cofnięcie oznaczenia. Decyzje zachowane w bieżącej kontroli, również po ponownym pokazaniu i pobraniu ZIP; zmiana źródeł lub miesiąca je unieważnia. Oznaczenia nie zmieniają dokumentów w paczce. Przelewy własne bez dopasowania trafiają do pozostałych operacji.

Dokumenty księgowe v1.51.18 (aplikacja v1.52.12): wiele faktur PDF dołączanych do płatności w kontroli. PDF-y spoza KSeF trafiają bezpośrednio do faktury zakupowe, KSeF pozostaje w podfolderze KSEF. Walidacja PDF, limity, deduplikacja według zawartości, filtr załączonych dokumentów i usuwanie. Pliki zachowane przy zmianach źródeł w obrębie miesiąca; usuwane po zmianie miesiąca, wylogowaniu lub opuszczeniu strony.

Dokumenty księgowe v1.51.19 (aplikacja v1.52.13): trwała historia metadanych zakupów KSeF na koncie administratora, osobno dla NIP-u i środowiska. Kompletne miesięczne migawki, także puste, aktualizowane przy eksporcie; ponowienie błędnego zapisu. Kontrola płatności uwzględnia miesiąc bieżący i trzy poprzednie, ujawnia brak historii i miesiąc faktury, umożliwia ręczny wybór dopasowania. Starsze dokumenty nie trafiają ponownie do ZIP. RLS ogranicza zapis i odczyt do właściciela z rolą administratora.

Moje płatności v1.0.1 (aplikacja v1.54.1): odczyt zabezpieczonych PDF-ów po podaniu hasła, ponowienie błędnego hasła i anulowanie; bez zapisu hasła.

Moje płatności v1.0.2 (aplikacja v1.54.2): czytelna lista odczytu bez edytowania transakcji, wybór stałych pozycji ptaszkami, pola dat i miesięcy węższe o 32 px; parser łączy datę księgowania i opisy z operacją, rozdziela kwotę od salda, pokazuje nierozpoznane operacje i blokuje błędne potwierdzenie kompletności.

Moje płatności v1.0.3 / CleanFleet v1.54.3: pierwszy odczyt pokazuje tylko unikalnych kontrahentów z aktywnymi checkboxami; zapis i kolejne importy dotyczą wyłącznie kontrolowanej listy. Naprawa odczytu kwot i dat księgowania potwierdzona na rzeczywistym wyciągu mBanku.

Moje płatności v1.0.4 / CleanFleet v1.54.4: opis przelewu BLIK zaczynający się od „PRZELEW ŚRODKÓW” nie tworzy osobnej operacji bez kwoty. Rozpoznawanie dat księgowania oparte na nagłówkach typów operacji. Zweryfikowano marcowy i sierpniowy wyciąg mBanku.

Moje płatności v1.0.5 / CleanFleet v1.54.5: po „Zapisz i zaczytaj z wyciągu” otwiera się jawny krok z polem wyboru PDF. Usunięto wywołanie systemowego wyboru pliku po asynchronicznym zapisie, które może blokować Safari na iPadzie.

Moje płatności v1.0.6 / CleanFleet v1.54.6: podobni kontrahenci przy dodawaniu nowych pozycji, jawny wybór scalenia z istniejącą pozycją lub utworzenia osobnej; zapamiętywanie wariantów nazwy i zachowanie historii oraz ustawień.

Moje płatności v1.0.7 / CleanFleet v1.54.7: każda pozycja pokazuje wydatki za wybrany rok oraz całą zapisaną historię, według dat płatności, w walucie pozycji.

Moje płatności v1.0.8 / CleanFleet v1.54.8: ręczne „Scal pozycje”, lista z checkboxami i wybór zachowanej nazwy/ustawień. Zachowanie historii, wariantów odbiorcy, ręcznych przypisań i zakresu kontroli; waluta oraz sposób przypisania miesiąca i filtr tytułu muszą być zgodne.

Moje płatności v1.0.9 / CleanFleet v1.54.9: nad obserwowaną listą bieżący miesiąc z nazwami pozycji i datami ich terminów, uporządkowany chronologicznie. Uwzględnia zakres kontroli, przesunięcie miesiąca i ostatni dzień krótszych miesięcy.

Moje płatności v1.0.10 / CleanFleet v1.54.10: kliknięcie kafelka bieżącego miesiąca przewija do odpowiedniej obserwowanej pozycji, z widocznym obramowaniem, odstępem od górnego komunikatu i obsługą ograniczenia animacji.

Moje płatności v1.0.11 / CleanFleet v1.54.11: pola formularzy mają 16 px, bez automatycznego powiększania przy fokusie na iOS; odstępy safe-area głównego ekranu, logowania, komunikatu i dialogów; po odblokowaniu zamknięcie klawiatury i powrót na początek strony. Bardziej zwarty pasek przycisków i statystyki telefonu.

CleanFleet v1.54.12: pełnoekranowy loader startowy wykorzystujący aktualne logo aplikacji; animowany puls i refleks, komunikaty rzeczywistych etapów uruchamiania, obsługa safe-area na iPhone/iPad, informacja o dłuższym ładowaniu po 9 s i przycisk „Spróbuj ponownie”. Loader znika po załadowaniu danych albo przed ekranem logowania; przy błędzie pozostaje z czytelnym komunikatem i możliwością ponowienia.

CleanFleet v1.54.13: automatyczne uzupełnianie płatności w module Przypomnienia z faktur PDF otrzymanych na zapisaną skrzynkę o2. Reguła przypomnienia wybiera folder i filtry nadawcy/tematu/nazwy załącznika oraz liczbę dni wcześniejszego sprawdzania. Serwerowy skaner pobiera z PDF numer faktury, kwotę do zapłaty i termin; przy wysokiej pewności aktualizuje przypomnienie, a wynik niepewny oznacza do sprawdzenia. Cykliczne przypomnienie dziedziczy regułę poczty, ale nie poprzednią kwotę ani numer faktury. PDF nie jest zapisywany w bazie.

CleanFleet v1.54.15: poprawione dopasowanie faktur w przypomnieniach do miesiąca. Skaner bierze wiadomości tylko z miesiąca danego przypomnienia, sprawdza również miesiąc odczytany z samej faktury i wybiera najnowszy zgodny dokument. Ustawienia automatycznego pobierania są propagowane na przyszłe wystąpienia cykliczne, z zachowaniem własnej kotwicy miesiąca dla każdego terminu. Błędnie dopasowane przypomnienie „Kasia księgowa” przywrócono do bazowego terminu październikowego i ustawiono do ponownego skanowania.

CleanFleet v1.54.17: zarządzanie aktywną flotą bez kasowania historii. Pojazd może być oznaczony jako poza flotą i nadal pozostaje dostępny w głównej wyszukiwarce oraz historii z czytelną informacją o statusie. Lista wszystkich samochodów pokazuje tylko aktywną flotę i otrzymała wyszukiwarkę wielu tablic, zaznaczanie pojazdów oraz operacje zbiorcze: wspólna edycja danych, Dodaj do floty i Usuń z floty z potwierdzeniem. Ponowne dodanie reaktywuje istniejący rekord zamiast tworzyć duplikat; nieznane tablice mogą być dodane zbiorczo jako nowe pojazdy.

CleanFleet v1.54.18: dopracowany widok „Lista wszystkich samochodów”. Kolumna typu pojazdu jest węższa, a pasek operacji zbiorczych (Edytuj dane / Dodaj do floty / Usuń z floty) pozostaje całkowicie ukryty przy braku zaznaczenia i pojawia się dopiero po wybraniu co najmniej jednego pojazdu. Bez zaznaczenia widoczna pozostaje wyłącznie wyszukiwarka i przycisk „Szukaj”.

CleanFleet v1.54.19: poprawiony układ tabeli w „Lista wszystkich samochodów”. Kolumna typu pojazdu ma stałą kompaktową szerokość, a odzyskane miejsce przechodzi głównie na kolumnę tablicy. Przy braku zaznaczonych pojazdów akcje zbiorcze pozostają ukryte — widoczna jest tylko wyszukiwarka i przycisk „Szukaj”.

CleanFleet v1.54.20: tabela „Lista wszystkich samochodów” rozdziela tablicę rejestracyjną od przycisków Historia / Edytuj pojazd. Szerokość kolumn Typ, Tablica i Akcje jest wyliczana po renderowaniu na podstawie najszerszej faktycznej zawartości i ustawiana na 110% tej szerokości; pozostałe kolumny zachowują dotychczasowe zachowanie. Akcje zbiorcze pozostają ukryte do momentu zaznaczenia pojazdu.

CleanFleet v1.54.21: szerokość kolumn Typ, Tablica i Akcje w „Lista wszystkich samochodów” jest liczona jako najszersza rzeczywista zawartość danej kolumny + 15 px, bez przelicznika procentowego. Pozostałe kolumny zachowują dotychczasową szerokość.

CleanFleet v1.54.22: naprawa powrotu z pełnoekranowej prognozy pogody. Przycisk „← CleanFleet” nie korzysta już z history.back(), które na iPadOS/Safari potrafiło przywrócić aplikację z BFCache z widocznym loaderem bez ponownego startu. Powrót prowadzi bezpośrednio do /app/, a aplikacja ma dodatkowe zabezpieczenie pageshow dla powrotów z pamięci przeglądarki.

CleanFleet v1.54.28: loader startowy pokazuje aktualnie ładowaną wersję aplikacji pod komunikatem stanu. Numer jest zgodny z wersją widoczną w nagłówku aplikacji; po uruchomieniu loader dodatkowo synchronizuje ten tekst z elementem wersji aplikacji.

CleanFleet v1.55.0: moduł administratora Dojazdy — potwierdzane adresy (Photon), punkty pośrednie z kolejnością, drogowa odległość OSRM/FOSSGIS, spalanie i cena paliwa, koszt paliwa i powrót przez te same punkty. Usługi publiczne z limitem zapytań, obsługą błędów i timeoutem. Bez zmian w bazie danych.

CleanFleet v1.55.1: naprawa otwierania kafelka Dojazdy — kontrola uprawnień przez udostępniony cfBackupBridge.isAdmin zamiast prywatnej funkcji w głównym IIFE.

CleanFleet v1.55.2: pełna prognoza pogody otwierana w oknie wewnątrz aplikacji. Powrót zamyka okno bez nawigacji i przeładowania głównego widoku, z zachowaniem jego stanu. Escape działa również wewnątrz prognozy; wiadomości zamknięcia są weryfikowane według origin i okna nadawcy.

CleanFleet v1.55.3: przywrócenie fokusu po zamknięciu pełnej prognozy używa preventScroll, aby nie przewijać wcześniejszego ekranu do przycisku pogody. Przycisk Powrót pozostaje w jednej linii na telefonie.

CleanFleet v1.55.4: Dojazdy — wybór benzyny Pb95 lub diesla ON, bieżące ogólnopolskie średnie detaliczne AutoCentrum.pl z datą sprawdzenia, przycisk Użyj tej ceny i odświeżanie. Własna cena nie jest automatycznie nadpisywana. Notowanie aktualizowane codziennie przez GitHub Actions, z kontrolą daty i odrzucaniem nieaktualnych danych.

CleanFleet v1.55.5 / Moje płatności v1.0.12: Gotówka — stały formularz kwoty, opisu i wpływu/wydatku, saldo całej listy i usuwanie przez X. Wpisy zapisane we wspólnym zaszyfrowanym sejfie płatności; starsze sejfy startują z pustą listą gotówki. Zapis, zmiana PIN i kopie zachowują listę.
