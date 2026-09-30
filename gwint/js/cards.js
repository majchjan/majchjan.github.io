/**
 * gwint/js/cards.js — deklaratywne definicje kart.
 *
 * Wyłącznie DANE. Zero logiki gry, zero DOM, zero sieci.
 * Dodanie karty = jeden wiersz w RAW_CARDS + wpis w talii. Silnika się nie rusza.
 *
 * Pola karty:
 *   id          — unikalny klucz, [a-z0-9_]. Bez ":" i "#" — to separatory identyfikatora instancji.
 *   name        — nazwa wyświetlana
 *   faction     — "northern" | "nilfgaard" | "scoiatael" | "monsters" | "skellige" | "neutral"
 *   type        — "unit" | "hero" | "special"
 *   row         — "melee" | "ranged" | "siege"; null dla kart specjalnych
 *   strength    — siła bazowa; 0 dla kart specjalnych
 *   abilities   — tablica flag (patrz niżej); domyślnie []
 *   musterGroup — grupa zgrupowania; wymagane, gdy abilities zawiera "muster"
 *   special     — efekt karty specjalnej; wymagane, gdy type === "special"
 *
 * Flagi abilities:
 *   "tightBond"   — Więź: karty o tym samym id w tym samym rzędzie mnożą siłę przez swoją liczbę
 *   "moraleBoost" — Zagrzewanie: +1 do POZOSTAŁYCH jednostek w rzędzie
 *   "muster"      — Zgrupowanie: przyciąga z talii i ręki karty o tym samym musterGroup
 *   "spy"         — Szpieg: ląduje po stronie przeciwnika, zagrywający dobiera 2 karty
 *   "medic"       — Medyk: wskrzesza jednostkę z cmentarza po swojej stronie planszy
 *   "horn"        — jednostka działa jak Róg Dowódcy dla swojego rzędu
 *   "agile"       — Zwinność: przy zagraniu wybierasz rząd wręcz albo dystansowy
 *   "avenger"     — Wezwanie: gdy karta zejdzie z planszy na koniec rundy, na nową
 *                   rundę pojawia się karta wskazana polem avengerCard
 *
 * Pola dodatkowe:
 *   musterSummons — grupa przywoływana przez Zgrupowanie, jeśli inna niż własna
 *                   musterGroup (Gaunter należy do "gaunter", przywołuje "darkness")
 *   summonOnly    — karta nie może być w talii, pojawia się tylko przez przywołanie
 *   "scorchRow"   — Pożoga: niszczy najsilniejsze jednostki przeciwnika w rzędzie
 *                   wskazanym polem scorchRow, o ile suma sił tego rzędu osiąga
 *                   scorchThreshold (domyślnie 10)
 *
 * Wartości special:
 *   "frost" | "fog" | "rain" — pogoda dla rzędu wręcz / dystansowego / oblężniczego
 *   "clearWeather"           — usuwa całą pogodę
 *   "horn"                   — Róg Dowódcy na wskazany rząd
 *   "scorch"                 — Spalenie
 *   "decoy"                  — Wabik
 *
 * UWAGA: siły i przypisania do rzędów są przybliżone — dobrane tak, żeby każda
 * mechanika miała czym się wykazać. To czyste dane, kalibruj do woli.
 */

export const ROWS = ["melee", "ranged", "siege"];

export const FACTIONS = ["northern", "nilfgaard", "scoiatael", "monsters", "skellige"];

/** Pasywki frakcji — flagi odczytywane przez silnik. */
export const PASSIVES = {
    northern:  "drawOnRoundWin",     // dobierz 1 kartę po wygranej rundzie
    nilfgaard: "winsDraws",          // wygrywa rundę remisową
    scoiatael: "choosesStarter",     // decyduje, kto zaczyna pierwszą rundę
    monsters:  "keepsRandomUnit",    // po rundzie zostawia na planszy losową jednostkę
    skellige:  "resurrectRound3"
};

/** Limity talii wg zasad z Wiedźmina 3. */
export const DECK_LIMITS = { minUnits: 22, maxSpecials: 10 };

/* ============================================================
   KARTY
   ============================================================ */

const RAW_CARDS = [

    /* ---------- Neutralne jednostki ---------- */
    { id: "geralt",         name: "Geralt z Rivii",  faction: "neutral", type: "hero", row: "melee", strength: 15 },
    { id: "dandelion",      name: "Jaskier",         faction: "neutral", type: "unit", row: "melee", strength: 2, abilities: ["horn"] },
    { id: "mysterious_elf", name: "Tajemniczy elf",  faction: "neutral", type: "hero", row: "melee", strength: 0, abilities: ["spy"] },
    { id: "zoltan_chivay", name: "Zoltan Chivay",  faction: "neutral", type: "unit", row: "melee", strength: 5 },
    { id: "yennefer", name: "Yennefer z Vengerbergu",  faction: "neutral", type: "hero", row: "ranged", strength: 7, abilities: ["medic"]},
    { id: "villentretenmerth", name: "Villentretenmerth",  faction: "neutral", type: "unit", row: "melee", strength: 7, abilities: ["scorchRow"], scorchRow: "melee" },
    { id: "vesemir", name: "Vesemir",  faction: "neutral", type: "unit", row: "melee", strength: 6},
    { id: "triss", name: "Triss Merigold",  faction: "neutral", type: "hero", row: "melee", strength: 7},
    { id: "regis", name: "Emiel Regis Rohellec Terzieff",  faction: "neutral", type: "unit", row: "melee", strength: 5},
    { id: "ciri", name: "Cirilla",  faction: "neutral", type: "hero", row: "melee", strength: 15},
    { id: "cow", name: "Krowa", faction: "neutral", type: "unit", row: "ranged", strength: 0,
      abilities: ["avenger"], avengerCard: "bovine_force" },
    { id: "gaunter", name: "Gaunter O'Dim", faction: "neutral", type: "unit", row: "siege", strength: 2,
      abilities: ["muster"], musterGroup: "gaunter", musterSummons: "darkness" },
    { id: "darkness", name: "Gaunter O'Dim: Cień", faction: "neutral", type: "unit", row: "ranged", strength: 4,
      abilities: ["muster"], musterGroup: "darkness" },
    { id: "olgierd", name: "Olgierd von Everec", faction: "neutral", type: "unit", row: "melee", strength: 6,
      abilities: ["agile"] },
    { id: "bovine_force", name: "Bydlęce Siły Zbrojne", faction: "neutral", type: "unit", row: "melee", strength: 8,
      summonOnly: true },
    { id: "roach", name: "Płotka", faction: "neutral", type: "unit", row: "melee", strength: 3 },

    /* ---------- Neutralne karty specjalne ---------- */
    { id: "frost",         name: "Trzaskający Mróz",    faction: "neutral", type: "special", special: "frost" },
    { id: "fog",           name: "Nieprzenikliwa Mgła", faction: "neutral", type: "special", special: "fog" },
    { id: "rain",          name: "Ulewny Deszcz",       faction: "neutral", type: "special", special: "rain" },
    { id: "clear_weather", name: "Czysta Pogoda",       faction: "neutral", type: "special", special: "clearWeather" },
    { id: "horn",          name: "Róg Dowódcy",         faction: "neutral", type: "special", special: "horn" },
    { id: "scorch",        name: "Spalenie",            faction: "neutral", type: "special", special: "scorch" },
    { id: "decoy",         name: "Wabik",               faction: "neutral", type: "special", special: "decoy" },

    /* ---------- Królestwa Północy ---------- */
    { id: "blue_stripes",       name: "Komando Błękitnych Pasów",   faction: "northern", type: "unit", row: "melee",  strength: 4, abilities: ["tightBond"] },
    { id: "siege_tower",        name: "Wieża oblężnicza",           faction: "northern", type: "unit", row: "siege",  strength: 6 },
    { id: "dun_banner_medic",   name: "Medyczka Burej Chorągwi",    faction: "northern", type: "unit", row: "siege",  strength: 5, abilities: ["medic"] },
    { id: "sigismund_dijkstra", name: "Sigismund Dijkstra",         faction: "northern", type: "unit", row: "melee",  strength: 4, abilities: ["spy"] },
    { id: "john_natalis",       name: "Jan Natalis",                faction: "northern", type: "hero", row: "melee",  strength: 10 },
    { id: "ballista",           name: "Balista",                    faction: "northern", type: "unit", row: "siege",  strength: 6 },
    { id: "catapult",           name: "Katapulta",                  faction: "northern", type: "unit", row: "siege",  strength: 8, abilities: ["tightBond"] },
    { id: "poor_infantry",      name: "Biedna Pierdolona Piechota", faction: "northern", type: "unit", row: "melee",  strength: 1 },
    { id: "detmold",            name: "Detmold",                    faction: "northern", type: "unit", row: "ranged", strength: 6 },
    { id: "esterad",            name: "Esterad Thyssen",            faction: "northern", type: "hero", row: "melee",  strength: 10 },
    { id: "filippa",            name: "Filippa Eilhart",            faction: "northern", type: "hero", row: "ranged", strength: 10 },
    { id: "keira",              name: "Keira Metz",                 faction: "northern", type: "unit", row: "ranged", strength: 5 },
    { id: "stennis",            name: "Książe Stennis",             faction: "northern", type: "unit", row: "melee",  strength: 5, abilities: ["spy"] },
    { id: "expert",             name: "Mistrz Oblężeń z Kaedwen",   faction: "northern", type: "unit", row: "siege",  strength: 1, abilities: ["moraleBoost"] },
    { id: "redanian_soldier",  name: "Redański Piechur",           faction: "northern", type: "unit", row: "melee",  strength: 1 },
    { id: "crinfrid_hunter",    name: "Rębacze z Crinfrid",         faction: "northern", type: "unit", row: "ranged", strength: 5, abilities: ["tightBond"] },
    { id: "sabrina" ,           name: "Sabrina Glevissig",          faction: "northern", type: "unit", row: "ranged", strength: 4 },
    { id: "sheala",             name: "Sheala de Tancarville",      faction: "northern", type: "unit", row: "ranged", strength: 5 },
    { id: "sheldon",            name: "Sheldon Skaggs",             faction: "northern", type: "unit", row: "ranged", strength: 4 },
    { id: "trebuchet",          name: "Trebusz",                    faction: "northern", type: "unit", row: "siege",  strength: 6 },
    { id: "roche",              name: "Vernon Roche",               faction: "northern", type: "hero", row: "melee",  strength: 10 },
    { id: "ves",                name: "Ves",                        faction: "northern", type: "unit", row: "melee",  strength: 5 },
    { id: "yarpen",             name: "Yarpen Zigrin",              faction: "northern", type: "unit", row: "melee",  strength: 2 },
    { id: "siegfried",          name: "Zygfryd z Denesle",          faction: "northern", type: "unit", row: "melee" , strength: 5 },
    { id: "talar",              name: "Talar",                      faction: "northern", type: "unit", row: "siege",  strength: 1, abilities: ["spy"] },

    /* ---------- Cesarstwo Nilfgaardu ---------- */
    { id: "impera_brigade",        name: "Brygada Impera",           faction: "nilfgaard", type: "unit", row: "melee", strength: 3, abilities: ["tightBond"] },
    { id: "siege_technician",      name: "Wsparcie oblężnicze",       faction: "nilfgaard", type: "unit", row: "siege",  strength: 0, abilities: ["medic"] },
    { id: "black_infantry_archer", name: "Nilfgaardzki łucznik",  faction: "nilfgaard", type: "unit", row: "ranged", strength: 10 },
    { id: "stefan_skellen",        name: "Stefan Skellen",           faction: "nilfgaard", type: "unit", row: "melee",  strength: 9, abilities: ["spy"] },
    { id: "menno_coehoorn",        name: "Menno Coehoorn",           faction: "nilfgaard", type: "hero", row: "melee",  strength: 10, abilities: ["medic"] },
    { id: "albrich",               name: "Albrich",                   faction: "nilfgaard", type: "unit", row: "ranged", strength: 2 },
    { id: "assire",               name: "Assire var Anahid",          faction: "nilfgaard", type: "unit", row: "ranged", strength: 6 },
    { id: "cahir",               name: "Cahir Mawr Dyffryn aep Ceallach", faction: "nilfgaard", type: "unit", row: "melee", strength: 6 },
    { id: "cynthia",             name: "Cynthia",                         faction: "nilfgaard", type: "unit", row: "ranged", strength: 4 },
    { id: "fringilla",             name: "Fringilla Vigo",                faction: "nilfgaard", type: "unit", row: "ranged", strength: 6 },
    { id: "kawaleria",             name: "Kawaleria Nauzicaa",            faction: "nilfgaard", type: "unit", row: "melee", strength: 2, abilities: ["tightBond"] },
    { id: "letho",             name: "Letho z Gulety",                    faction: "nilfgaard", type: "hero", row: "melee", strength: 10 },
    { id: "morteisen",             name: "Morteisen",                         faction: "nilfgaard", type: "unit", row: "melee", strength: 3 },
    { id: "morvran",             name: "Morvran Voorhis",                         faction: "nilfgaard", type: "hero", row: "siege", strength: 10 },
    { id: "mlody",             name: "Młody emisariusz",                         faction: "nilfgaard", type: "unit", row: "melee", strength: 5, abilities: ["tightBond"] },
    { id: "puttkammer",             name: "Putkammer",                         faction: "nilfgaard", type: "unit", row: "ranged", strength: 3 },
    { id: "rainfarn",             name: "Rainfarn",                         faction: "nilfgaard", type: "unit", row: "melee", strength: 4 },
    { id: "renuald",             name: "Renuald aep Matsen",                         faction: "nilfgaard", type: "unit", row: "ranged", strength: 5 },
    { id: "saper",             name: "Saper",                         faction: "nilfgaard", type: "unit", row: "siege", strength: 6 },
    { id: "shilard",             name: "Shilard Fitz-Oesterlen",                         faction: "nilfgaard", type: "unit", row: "melee", strength: 7, abilities: ["spy"] },
    { id: "sweers",             name: "Sweers",                         faction: "nilfgaard", type: "unit", row: "ranged", strength: 2 },
    { id: "tibor",             name: "Tibor Eggebracht",                         faction: "nilfgaard", type: "hero", row: "ranged", strength: 10 },
    { id: "vanhemar",             name: "Vanhemar",                         faction: "nilfgaard", type: "unit", row: "ranged", strength: 4 },
    { id: "vattier",             name: "Vattier de Rideaux",                         faction: "nilfgaard", type: "unit", row: "melee", strength: 4, abilities: ["spy"] },
    { id: "vreemde",             name: "Vreemde",                         faction: "nilfgaard", type: "unit", row: "melee", strength: 2 },
    { id: "skorpion",             name: "Wielki Ognisty Skorpion",                         faction: "nilfgaard", type: "unit", row: "siege", strength: 10 },
    { id: "wsparcie",             name: "Wsparcie łuczników",                         faction: "nilfgaard", type: "unit", row: "ranged", strength: 1, abilities: ["medic"] },
    { id: "mangonela",             name: "Zdezelowana mangonela",                         faction: "nilfgaard", type: "unit", row: "siege", strength: 3 },
    { id: "zerrikanski",             name: "Zerrikański Ognisty Skorpion",                         faction: "nilfgaard", type: "unit", row: "siege", strength: 5 },

    /* ---------- Scoia'tael ---------- */
    { id: "havekar_smuggler",     name: "Havekarskie wsparcie ",         faction: "scoiatael", type: "unit", row: "melee",  strength: 5, abilities: ["muster"], musterGroup: "havekar" },
    { id: "elven_skirmisher",     name: "Elfi harcownik",             faction: "scoiatael", type: "unit", row: "ranged", strength: 2, abilities: ["muster"], musterGroup: "elven_skirmisher" },
    { id: "dol_blathanna_archer", name: "Łucznik z Dol Blathanna", faction: "scoiatael", type: "unit", row: "ranged", strength: 4 },
    { id: "schirru",              name: "Schirrú",                    faction: "scoiatael", type: "unit", row: "siege",  strength: 8, abilities: ["scorchRow"], scorchRow: "siege" },
    { id: "iorveth",              name: "Iorveth",                    faction: "scoiatael", type: "hero", row: "ranged",  strength: 10 },
    { id: "barclay",              name: "Barclay Els",                faction: "scoiatael", type: "unit", row: "melee",  strength: 6, abilities: ["agile"] },
    { id: "vrihedd",              name: "Brygada Vrihedd",            faction: "scoiatael", type: "unit", row: "melee",  strength: 5, abilities: ["agile"] },
    { id: "ciaran",               name: "Ciaran aep Easnillien",      faction: "scoiatael", type: "unit", row: "melee",  strength: 3, abilities: ["agile"] },
    { id: "dennis",               name: "Dennis Cranmer",             faction: "scoiatael", type: "unit", row: "melee",  strength: 6 },
    { id: "eithne",               name: "Eithne",                     faction: "scoiatael", type: "hero", row: "ranged", strength: 10 },
    { id: "filavandrel",          name: "Filavandrel aen Fidhail",    faction: "scoiatael", type: "unit", row: "melee",  strength: 6, abilities: ["agile"] },
    { id: "medyk",                name: "Havekarski medyk",           faction: "scoiatael", type: "unit", row: "ranged", strength: 0, abilities: ["medic"] },
    { id: "ida",                  name: "Ida Emean aep Sivney",       faction: "scoiatael", type: "unit", row: "ranged", strength: 6 },
    { id: "isengrim",             name: "Isengrim Faoiltiarna",       faction: "scoiatael", type: "hero", row: "melee",  strength: 10, abilities: ["moraleBoost"] },
    { id: "kadet",                name: "Kadet Vrihedd",              faction: "scoiatael", type: "unit", row: "ranged", strength: 4 },
    { id: "krasnolud",            name: "Krasnolud harcownik",        faction: "scoiatael", type: "unit", row: "melee",  strength: 3, abilities: ["muster"], musterGroup: "krasnolud" },
    { id: "milva",                name: "Milva",                      faction: "scoiatael", type: "unit", row: "ranged", strength: 10, abilities: ["moraleBoost"] },
    { id: "obroncy",              name: "Obrońcy Mahakamu",           faction: "scoiatael", type: "unit", row: "melee",  strength: 5 },
    { id: "riordain",             name: "Riordain",                   faction: "scoiatael", type: "unit", row: "ranged", strength: 1 },
    { id: "saesenthessis",        name: "Saesenthessis",              faction: "scoiatael", type: "hero", row: "ranged", strength: 10 },
    { id: "toruviel",             name: "Toruviel",                   faction: "scoiatael", type: "unit", row: "ranged", strength: 2 },
    { id: "yaevinn",              name: "Yaevinn",                    faction: "scoiatael", type: "unit", row: "melee",  strength: 6, abilities: ["agile"] },
    { id: "zwiadowca",            name: "Zwiadowca z Dol Blathanna",  faction: "scoiatael", type: "unit", row: "melee",  strength: 6, abilities: ["agile"] },

    /* ---------- Potwory ---------- */
    { id: "baba",         name: "Baba cmentarna",            faction: "monsters", type: "unit", row: "ranged",  strength: 5 },
    { id: "bies",         name: "Bies",            faction: "monsters", type: "unit", row: "melee",  strength: 6 },
    { id: "draug",         name: "Draug",           faction: "monsters", type: "hero", row: "melee",  strength: 10 },
    { id: "endriaga",         name: "Endriaga",            faction: "monsters", type: "unit", row: "ranged",  strength: 2 },
    { id: "gargulec",         name: "Gargulec",            faction: "monsters", type: "unit", row: "ranged",  strength: 2 },
    { id: "ghul",         name: "Ghul",            faction: "monsters", type: "unit", row: "melee",  strength: 1, abilities: ["muster"], musterGroup: "ghul" },
    { id: "gryf",         name: "Gryf",            faction: "monsters", type: "unit", row: "melee",  strength: 5 },
    { id: "harpia",         name: "Harpia",            faction: "monsters", type: "unit", row: "melee",  strength: 2, abilities: ["agile"] },
    { id: "celaeno", name: "Harpia Celaeno",  faction: "monsters", type: "unit", row: "melee",  strength: 2, abilities: ["agile"] },
    { id: "imlerith",         name: "Imlerith",            faction: "monsters", type: "hero", row: "melee",  strength: 10 },
    { id: "kejran",        name: "Kejran",          faction: "monsters", type: "unit", row: "melee",  strength: 8, abilities: ["moraleBoost", "agile"] },
    { id: "krabopajak",       name: "Krabopająk",         faction: "monsters", type: "unit", row: "melee",  strength: 4, abilities: ["muster"], musterGroup: "krabopajak" },
    { id: "krolewicz",   name: "Królewicz Ropuch",faction: "monsters", type: "unit", row: "ranged", strength: 7, abilities: ["scorchRow"], scorchRow: "ranged" },
    { id: "kuroliszek",         name: "Kuroliszek",            faction: "monsters", type: "unit", row: "ranged",  strength: 2 },
    { id: "leszy",         name: "Leszy",            faction: "monsters", type: "hero", row: "ranged",  strength: 10 },
    { id: "lodowy_gigant",         name: "Lodowy Gigant",            faction: "monsters", type: "unit", row: "siege",  strength: 5 },
    { id: "mglak",         name: "Mglak",            faction: "monsters", type: "unit", row: "melee",  strength: 2 },
    { id: "morowa",         name: "Morowa Dziewica",            faction: "monsters", type: "unit", row: "melee",  strength: 5 },
    { id: "nekker",         name: "Nekker",            faction: "monsters", type: "unit", row: "melee",  strength: 2, abilities: ["muster"], musterGroup: "nekker" },
    { id: "olbrzymi",         name: "Olbrzymi Krabopająk",            faction: "monsters", type: "unit", row: "siege",  strength: 6, abilities: ["muster"], musterGroup: "olbrzymi", musterSummons: "krabopajak" },
    { id: "poroniec",         name: "Poroniec",            faction: "monsters", type: "unit", row: "melee",  strength: 4 },
    { id: "przeraza",         name: "Przeraza",            faction: "monsters", type: "unit", row: "melee",  strength: 5 },
    { id: "bruxa",         name: "Wampir: Bruxa",            faction: "monsters", type: "unit", row: "melee",  strength: 4, abilities: ["muster"], musterGroup: "wampir" },
    { id: "ekimma",         name: "Wampir: Ekimma",            faction: "monsters", type: "unit", row: "melee",  strength: 4, abilities: ["muster"], musterGroup: "wampir" },
    { id: "fleder",         name: "Wampir: Fleder",            faction: "monsters", type: "unit", row: "melee",  strength: 4, abilities: ["muster"], musterGroup: "wampir" },
    { id: "garkain",         name: "Wampir: Garkain",            faction: "monsters", type: "unit", row: "melee",  strength: 4, abilities: ["muster"], musterGroup: "wampir" },
    { id: "katakan",         name: "Wampir: Katakan",            faction: "monsters", type: "unit", row: "melee",  strength: 5, abilities: ["muster"], musterGroup: "wampir" },
    { id: "widlogon",         name: "Widłogon",            faction: "monsters", type: "unit", row: "melee",  strength: 5 },
    { id: "kuchta",         name: "Wiedźma: Kuchta",            faction: "monsters", type: "unit", row: "melee",  strength: 6, abilities: ["muster"], musterGroup: "wiedzma" },
    { id: "przadka",         name: "Wiedźma: Prządka",            faction: "monsters", type: "unit", row: "melee",  strength: 6, abilities: ["muster"], musterGroup: "wiedzma" },
    { id: "szepciucha",         name: "Wiedźma: Szepciucha",            faction: "monsters", type: "unit", row: "melee",  strength: 6, abilities: ["muster"], musterGroup: "wiedzma" },
    { id: "wilkolak",         name: "Wilkołak",            faction: "monsters", type: "unit", row: "melee",  strength: 5 },
    { id: "wiverna",         name: "Wiverna",            faction: "monsters", type: "unit", row: "ranged",  strength: 2 },
    { id: "ognia",         name: "Żywiołak Ognia",            faction: "monsters", type: "unit", row: "siege",  strength: 6 },
    { id: "ziemi",         name: "Żywiołak Ziemi",            faction: "monsters", type: "unit", row: "siege",  strength: 6 },

    /* ---------- Skellige ---------- */
    { id: "berserker", name: "Berserker", faction: "skellige", type: "unit", row: "melee", strength: 4,
      abilities: ["berserker"], transformTo: "przemieniony" },
    { id: "birna", name: "Birna Bran", faction: "skellige", type: "unit", row: "melee", strength: 2,
      abilities: ["medic"] },
    { id: "cerys", name: "Cerys", faction: "skellige", type: "hero", row: "melee", strength: 10,
      abilities: ["muster"], musterGroup: "cerys", musterSummons: "tarczowniczka" },
    { id: "donar", name: "Donar an Hindar", faction: "skellige", type: "unit", row: "melee", strength: 4 },
    { id: "draig", name: "Draig Bon-Dhu", faction: "skellige", type: "unit", row: "siege", strength: 2,
      abilities: ["horn"] },
    { id: "drakkar", name: "Drakkar wojenny", faction: "skellige", type: "unit", row: "siege", strength: 6,
      abilities: ["tightBond"] },
    { id: "hemdal", name: "Hemdall", faction: "skellige", type: "hero", row: "melee", strength: 11,
      summonOnly: true },
    { id: "hjalmar", name: "Hjalmar", faction: "skellige", type: "hero", row: "ranged", strength: 10 },
    { id: "holger", name: "Holger Czarna Ręka", faction: "skellige", type: "unit", row: "siege", strength: 4 },
    { id: "kambi", name: "Kambi", faction: "skellige", type: "unit", row: "melee", strength: 0,
      abilities: ["avenger"], avengerCard: "hemdal" },
    { id: "lekki", name: "Lekki drakkar", faction: "skellige", type: "unit", row: "ranged", strength: 4,
      abilities: ["muster"], musterGroup: "drakkar" },
    { id: "lucznik", name: "Łucznik klanu Brokvar", faction: "skellige", type: "unit", row: "ranged", strength: 6 },
    { id: "mardroeme", name: "Mardroeme", faction: "skellige", type: "special", special: "mardroeme" },
    { id: "mlody_berserker", name: "Młody berserker", faction: "skellige", type: "unit", row: "ranged", strength: 2,
      abilities: ["berserker"], transformTo: "przemieniony_mlody" },
    { id: "myszowor", name: "Myszowór", faction: "skellige", type: "hero", row: "ranged", strength: 8,
      abilities: ["mardroeme"] },
    { id: "olaf", name: "Olaf", faction: "skellige", type: "unit", row: "melee", strength: 12,
      abilities: ["agile", "moraleBoost"] },
    { id: "pirat", name: "Pirat z klanu Dimun", faction: "skellige", type: "unit", row: "ranged", strength: 6,
      abilities: ["scorch"] },
    { id: "platnerz", name: "Płatnerz klanu Tordarroch", faction: "skellige", type: "unit", row: "melee", strength: 4 },
    { id: "przemieniony", name: "Przemieniony berserker", faction: "skellige", type: "unit", row: "melee", strength: 14,
      abilities: ["moraleBoost"], summonOnly: true },
    { id: "przemieniony_mlody", name: "Przemieniony młody berserker", faction: "skellige", type: "unit", row: "ranged", strength: 8,
      abilities: ["tightBond"], summonOnly: true },
    { id: "siny", name: "Lugos siny", faction: "skellige", type: "unit", row: "melee", strength: 6 },
    { id: "skald", name: "Skald klanu Heymaey", faction: "skellige", type: "unit", row: "melee", strength: 4 },
    { id: "svanrige", name: "Svanrige", faction: "skellige", type: "unit", row: "melee", strength: 4 },
    { id: "szalony", name: "Lugos szalony", faction: "skellige", type: "unit", row: "melee", strength: 6 },
    { id: "tarczowniczka1", name: "Tarczowniczka klanu Drummond", faction: "skellige", type: "unit", row: "melee", strength: 4,
      abilities: ["tightBond"] },
    { id: "udalryk", name: "Udalryk", faction: "skellige", type: "unit", row: "melee", strength: 4 },
    { id: "wojownik", name: "Wojownik klanu Craite", faction: "skellige", type: "unit", row: "melee", strength: 6,
      abilities: ["tightBond"] }
];

/** Uzupełnia pola opcjonalne, żeby silnik nie musiał sprawdzać undefined. */
function normalize(card) {
    return {
        id: card.id,
        name: card.name,
        faction: card.faction,
        type: card.type,
        row: card.row ?? null,
        strength: card.strength ?? 0,
        abilities: card.abilities ?? [],
        musterGroup: card.musterGroup ?? null,
        musterSummons: card.musterSummons ?? null,
        transformTo: card.transformTo ?? null,
        avengerCard: card.avengerCard ?? null,
        summonOnly: card.summonOnly ?? false,
        scorchRow: card.scorchRow ?? null,
        scorchThreshold: card.scorchThreshold ?? 10,
        special: card.special ?? null
    };
}

export const CARDS = RAW_CARDS.map(normalize);

export const CARD_BY_ID = Object.fromEntries(CARDS.map(card => [card.id, card]));

export function getCard(id) {
    const card = CARD_BY_ID[id];
    if (!card) {
        throw new Error("Nieznana karta: " + id);
    }
    return card;
}

export function hasAbility(card, ability) {
    return card.abilities.includes(ability);
}

/* ============================================================
   LIDERZY
   Zdolność jednorazowa, po jednej na grę.
     "clearWeather" — usuwa całą pogodę
     "weather"      — zagrywa pogodę wskazaną w polu weather, spoza talii
     "horn"         — zagrywa Róg Dowódcy na rząd wskazany przy użyciu
   ============================================================ */

export const LEADERS = [
    { id: "foltest_lord_commander", name: "Foltest: Dowódca Północy", faction: "northern",
      ability: "clearWeather",
      text: "Usuń aktywne efekty pogodowe wynikające z kart Trzaskający Mróz, Ulewny Deszcz i Nieprzenikliwa Mgła." },
    { id: "foltest_king", name: "Foltest: Król Temerii", faction: "northern",
      ability: "deckWeather", weather: "fog",
      text: "Znajdź kartę Nieprzenikliwa Mgła w swojej talii i natychmiast ją zagraj." },
    { id: "foltest_son_of_medell", name: "Foltest: Syn Medella", faction: "northern",
      ability: "scorchRow", scorchRow: "ranged",
      text: "Niszczy najsilniejszą jednostkę lub jednostki dalekiego zasięgu przeciwnika, jeśli suma siły jego jednostek dalekiego zasięgu wynosi 10 lub więcej." },
    { id: "foltest_conqueror", name: "Foltest: Zdobywca", faction: "northern",
      ability: "horn", hornRow: "siege",
      text: "Podwaja siłę wszystkich twoich jednostek oblężniczych (o ile w ich rzędzie nie ma już Rogu Dowódcy)." },
    { id: "foltest_steel_forged", name: "Foltest: Żelazny Władca", faction: "northern",
      ability: "scorchRow", scorchRow: "siege",
      text: "Zniszcz najsilniejszą jednostkę lub jednostki oblężnicze przeciwnika, jeśli suma siły jego kart oblężniczych wynosi 10 bądź więcej." },

    { id: "emhyr_white_flame", name: "Emhyr var Emreis: Biały Płomień Tańczący na Kurhanach Wrogów", faction: "nilfgaard",
      ability: "blockOpponentLeader", passive: true,
      text: "Blokuje umiejętność dowódcy twojego przeciwnika." },
    { id: "emhyr_emperor", name: "Emhyr var Emreis: Cesarz Nilfgaardu", faction: "nilfgaard",
      ability: "revealHand", revealCount: 3,
      text: "Obejrzyj trzy losowe karty z ręki przeciwnika." },
    { id: "emhyr_hedgehog", name: "Emhyr var Emreis: Jeż z Erlenwaldu", faction: "nilfgaard",
      ability: "deckWeather", weather: "rain",
      text: "Znajdź w swojej talii kartę Ulewny Deszcz i natychmiast ją zagraj." },
    { id: "emhyr_invader", name: "Emhyr var Emreis: Najeźdźca Północy", faction: "nilfgaard",
      ability: "randomRevive", passive: true,
      text: "Gdy gracz przywraca jednostkę na pole bitwy, przywrócona zostaje losowa jednostka. Dotyczy obu graczy." },
    { id: "emhyr_lord_south", name: "Emhyr var Emreis: Pan Południa", faction: "nilfgaard",
      ability: "takeOpponentGrave",
      text: "Wybierz kartę ze stosu kart odrzuconych przeciwnika i weź ją do ręki." },

    { id: "eredin_commander", name: "Eredin Bréacc Glas: Dowódca Czerwonych Jeźdźców", faction: "monsters",
      ability: "horn", hornRow: "melee",
      text: "Podwaja siłę wszystkich twoich jednostek bliskiego starcia (o ile w ich rzędzie nie ma już Rogu Dowódcy)." },
    { id: "eredin_king", name: "Eredin Bréacc Glas: Król Dzikiego Gonu", faction: "monsters",
      ability: "pickDeckWeather",
      text: "Wybierz dowolną kartę pogody ze swojej talii i natychmiast ją zagraj." },
    { id: "eredin_tir_na_lia", name: "Eredin Bréacc Glas: Władca Tir ná Lia", faction: "monsters",
      ability: "discardAndDraw",
      text: "Odrzuć dwie karty, a następnie wybierz jedną dowolną kartę ze swojej talii." },
    { id: "eredin_auberon_slayer", name: "Eredin Bréacc Glas: Zabójca Auberona", faction: "monsters",
      ability: "takeOwnGrave",
      text: "Weź kartę ze swojego stosu kart odrzuconych." },
    { id: "eredin_treacherous", name: "Eredin Bréacc Glas: Zdradziecki", faction: "monsters",
      ability: "doubleSpies", passive: true,
      text: "Podwaja siłę kart Szpiegów obu graczy." },

    { id: "francesca_pureblood", name: "Francesca Findabair: Elfka czystej krwi", faction: "scoiatael",
      ability: "deckWeather", weather: "frost",
      text: "Znajdź w swojej talii kartę Trzaskający Mróz i natychmiast ją zagraj." },
    { id: "francesca_queen", name: "Francesca Findabair: Królowa Dol Blathanna", faction: "scoiatael",
      ability: "scorchRow", scorchRow: "melee",
      text: "Zniszcz najsilniejszą jednostkę lub jednostki bliskiego starcia przeciwnika, jeśli suma siły jego jednostek bliskiego starcia wynosi 10 bądź więcej." },
    { id: "francesca_hope", name: "Francesca Findabair: Nadzieja Dol Blathanna", faction: "scoiatael",
      ability: "optimizeAgile",
      text: "Przesuwa jednostki ze zdolnością Zwinność do rzędów, które maksymalizują ich siłę (jednostki w optymalnych miejscach nie zostają przesunięte)." },
    { id: "francesca_beautiful", name: "Francesca Findabair: Najpiękniejsza kobieta na świecie", faction: "scoiatael",
      ability: "horn", hornRow: "ranged",
      text: "Podwaja siłę twoich jednostek dalekiego zasięgu (o ile w ich rzędzie nie ma już Rogu Dowódcy)." },
    { id: "francesca_daisy", name: "Francesca Findabair: Stokrotka z Dolin", faction: "scoiatael",
      ability: "extraStartCard", passive: true,
      text: "Weź o jedną kartę więcej na początku bitwy." },

    { id: "crach_an_craite", name: "Crach an Craite", faction: "skellige",
      ability: "shuffleGraves",
      text: "Przetasuj wszystkie karty z cmentarzy obu graczy z powrotem do ich talii." },
    { id: "king_bran", name: "Król Bran", faction: "skellige",
      ability: "halveWeather", passive: true,
      text: "Jednostki tracą pod wpływem pogody tylko połowę siły." }
];

export const LEADER_BY_ID = Object.fromEntries(LEADERS.map(leader => [leader.id, leader]));

/* ============================================================
   TALIE STARTOWE
   Format: [id karty, liczba kopii]. Rozbuduj dowolnie — silnik czyta to jak leci.
   ============================================================ */

export const DECKS = {
    northern: {
        id: "northern",
        name: "Królestwa Północy",
        leader: "foltest_king",
        cards: [
            ["geralt", 1],
            ["dandelion", 1],
            ["mysterious_elf", 1],
            ["zoltan_chivay", 1],
            ["yennefer", 1],
            ["villentretenmerth", 1],
            ["vesemir", 1],
            ["triss", 1],
            ["regis", 1],
            ["ciri", 1],
            ["frost", 3],
            ["fog", 3],
            ["rain", 2],
            ["clear_weather", 2],
            ["horn", 3],
            ["scorch", 3],
            ["decoy", 3],
            ["cow", 1],
            ["gaunter", 1],
            ["darkness", 3],
            ["olgierd", 1],
            ["roach", 1],
            ["blue_stripes", 3],        // Więź: 3 kopie po 4
            ["siege_tower", 1],         // Zagrzewanie
            ["dun_banner_medic", 1],    // Medyk
            ["sigismund_dijkstra", 1],  // Szpieg
            ["john_natalis", 1],        // Bohater
            ["ballista", 2],
            ["poor_infantry", 3],
            ["detmold", 1],
            ["esterad", 1],
            ["filippa", 1],
            ["catapult", 3],
            ["keira", 1],
            ["stennis", 1],
            ["expert", 1],
            ["redanian_soldier", 1],
            ["crinfrid_hunter", 3],
            ["sabrina", 1],
            ["sheala", 1],
            ["sheldon", 1],
            ["trebuchet", 1],
            ["roche", 1],
            ["ves", 1],
            ["yarpen", 1],
            ["siegfried", 1],
            ["talar", 1]
        ]
    },

    nilfgaard: {
        id: "nilfgaard",
        name: "Cesarstwo Nilfgaardu",
        leader: "emhyr_white_flame",
        cards: [
            ["geralt", 1],
            ["dandelion", 1],
            ["mysterious_elf", 1],
            ["zoltan_chivay", 1],
            ["yennefer", 1],
            ["villentretenmerth", 1],
            ["vesemir", 1],
            ["triss", 1],
            ["regis", 1],
            ["ciri", 1],
            ["frost", 3],
            ["fog", 3],
            ["rain", 2],
            ["clear_weather", 2],
            ["horn", 3],
            ["scorch", 3],
            ["decoy", 3],
            ["cow", 1],
            ["gaunter", 1],
            ["darkness", 3],
            ["olgierd", 1],
            ["roach", 1],
            ["impera_brigade", 4],        // Więź: 4 kopie po 3
            ["siege_technician", 1],      // Medyk o sile 0
            ["black_infantry_archer", 2],
            ["stefan_skellen", 1],        // Szpieg o dużej sile
            ["menno_coehoorn", 1],       // Bohater
            ["letho", 1],
            ["shilard", 1],
            ["cahir", 1],
            ["mlody", 2],
            ["rainfarn", 1],
            ["vattier", 1],
            ["morteisen", 1],
            ["kawaleria", 4],
            ["vreemde", 1],
            ["tibor", 1],
            ["assire", 1],
            ["fringilla", 1],
            ["renuald", 1],
            ["cynthia", 1],
            ["vanhemar", 1],
            ["puttkammer", 1],
            ["albrich", 1],
            ["sweers", 1],
            ["wsparcie", 2],
            ["morvran", 1],
            ["skorpion", 1],
            ["saper", 2],
            ["zerrikanski", 1],
            ["mangonela", 1]
        ]
    },

    scoiatael: {
        id: "scoiatael",
        name: "Scoia'tael",
        leader: "francesca_daisy",
        cards: [
            ["havekar_smuggler", 4],      // Zgrupowanie w rzędzie wręcz
            ["elven_skirmisher", 3],      // Zgrupowanie w rzędzie dystansowym
            ["dol_blathanna_archer", 2],
            ["schirru", 1],
            ["iorveth", 1],               // Bohater
            ["geralt", 1],
            ["dandelion", 1],
            ["mysterious_elf", 1],
            ["zoltan_chivay", 1],
            ["yennefer", 1],
            ["villentretenmerth", 1],
            ["vesemir", 1],
            ["triss", 1],
            ["regis", 1],
            ["ciri", 1],
            ["frost", 3],
            ["fog", 3],
            ["rain", 2],
            ["clear_weather", 2],
            ["horn", 3],
            ["scorch", 3],
            ["decoy", 3],
            ["cow", 1],
            ["gaunter", 1],
            ["darkness", 3],
            ["olgierd", 1],
            ["roach", 1],
            ["barclay", 1],
            ["vrihedd", 3],
            ["ciaran", 1],
            ["dennis", 1],
            ["eithne", 1],
            ["filavandrel", 1],
            ["medyk", 4],
            ["ida", 1],
            ["isengrim", 1],
            ["kadet", 1],
            ["krasnolud", 3],
            ["milva", 1],
            ["obroncy", 5], 
            ["riordain", 1], 
            ["saesenthessis", 1],
            ["toruviel", 1],
            ["yaevinn", 1],
            ["zwiadowca", 3]
        ]
    },

    monsters: {
        id: "monsters",
        name: "Potwory",
        leader: "eredin_king",
        cards: [
            ["krabopajak", 3],               // Zgrupowanie
            ["kejran", 1],                // Zagrzewanie
            ["bies", 1],
            ["celaeno", 1],
            ["draug", 1],                 // Bohater o sile 14
            ["krolewicz", 1], 


            ["geralt", 1],
            ["dandelion", 1],
            ["mysterious_elf", 1],
            ["zoltan_chivay", 1],
            ["yennefer", 1],
            ["villentretenmerth", 1],
            ["vesemir", 1],
            ["triss", 1],
            ["regis", 1],
            ["ciri", 1],
            ["frost", 3],
            ["fog", 3],
            ["rain", 2],
            ["clear_weather", 2],
            ["horn", 3],
            ["scorch", 3],
            ["decoy", 3],
            ["cow", 1],
            ["gaunter", 1],
            ["darkness", 3],
            ["olgierd", 1],
            ["roach", 1],
            ["baba", 1],
            ["bruxa", 1],
            ["ekimma", 1],
            ["endriaga", 1],
            ["fleder", 1],
            ["gargulec", 1],
            ["garkain", 1],
            ["ghul", 3],
            ["gryf", 1],
            ["harpia", 1],
            ["imlerith", 1],
            ["katakan", 1],
            ["kuchta", 1],
            ["kuroliszek", 1],
            ["leszy", 1],
            ["lodowy_gigant", 1],
            ["mglak", 1],
            ["morowa", 1],
            ["nekker", 3],
            ["ognia", 1],
            ["olbrzymi", 1],
            ["poroniec", 1],
            ["przadka", 1],
            ["przeraza", 1],
            ["szepciucha", 1],
            ["widlogon", 1],
            ["wilkolak", 1],
            ["wiverna", 1],
            ["ziemi", 1]
        ]
    },

    skellige: {
        id: "skellige",
        name: "Skellige",
        leader: "crach_an_craite",
        cards: [
            ["berserker", 1],
            ["birna", 1],
            ["cerys", 1],
            ["ciri", 1],
            ["clear_weather", 2],
            ["cow", 1],
            ["dandelion", 1],
            ["darkness", 3],
            ["decoy", 3],
            ["donar", 1],
            ["draig", 1],
            ["drakkar", 3],
            ["fog", 3],
            ["frost", 3],
            ["gaunter", 1],
            ["geralt", 1],
            ["hjalmar", 1],
            ["holger", 1],
            ["horn", 3],
            ["kambi", 1],
            ["lekki", 3],
            ["lucznik", 3],
            ["mardroeme", 3],
            ["mlody_berserker", 3],
            ["mysterious_elf", 1],
            ["myszowor", 1],
            ["olaf", 1],
            ["olgierd", 1],
            ["pirat", 1],
            ["platnerz", 1],
            ["rain", 2],
            ["regis", 1],
            ["roach", 1],
            ["scorch", 3],
            ["siny", 1],
            ["skald", 1],
            ["svanrige", 1],
            ["szalony", 1],
            ["tarczowniczka1", 3],
            ["triss", 1],
            ["udalryk", 1],
            ["vesemir", 1],
            ["villentretenmerth", 1],
            ["wojownik", 3],
            ["yennefer", 1],
            ["zoltan_chivay", 1]
        ]
    }
};

/** Przyjmuje identyfikator talii wbudowanej albo gotowy obiekt talii (np. z deck buildera). */
export function resolveDeck(deckOrId) {
    if (typeof deckOrId === "string") {
        const deck = DECKS[deckOrId];
        if (!deck) {
            throw new Error("Nieznana talia: " + deckOrId);
        }
        return deck;
    }
    if (!deckOrId || !Array.isArray(deckOrId.cards)) {
        throw new Error("Nieprawidłowy obiekt talii.");
    }
    return deckOrId;
}

/** Rozwija [id, liczba] na płaską listę identyfikatorów definicji. */
export function expandDeckList(deckOrId) {
    const deck = resolveDeck(deckOrId);
    const list = [];
    for (const [cardId, count] of deck.cards) {
        for (let i = 0; i < count; i++) {
            list.push(cardId);
        }
    }
    return list;
}

/**
 * Sprawdza talię wg zasad z W3.
 * Zwraca { ok, errors, warnings }.
 *   errors   — łamią zasady: obca frakcja, za dużo kart specjalnych, nieznana karta
 *   warnings — do czasu rozbudowy talii: mniej niż 22 jednostki
 */
export function validateDeck(deckOrId) {
    const errors = [];
    const warnings = [];
    let deck;

    try {
        deck = resolveDeck(deckOrId);
    } catch (error) {
        return { ok: false, errors: [error.message], warnings };
    }

    const faction = deck.faction || deck.id;
    let units = 0;
    let specials = 0;

    for (const [cardId, count] of deck.cards) {
        const card = CARD_BY_ID[cardId];
        if (!card) {
            errors.push("Nieznana karta w talii: " + cardId);
            continue;
        }
        if (card.faction !== faction && card.faction !== "neutral") {
            errors.push(card.name + " należy do frakcji " + card.faction + ", a talia to " + faction);
        }
        if (card.summonOnly) {
            errors.push(card.name + " nie może być w talii — pojawia się tylko przez przywołanie");
        }
        if (card.type === "special") {
            specials += count;
        } else {
            units += count;
        }
    }

    if (specials > DECK_LIMITS.maxSpecials) {
        errors.push("Za dużo kart specjalnych: " + specials + " (limit " + DECK_LIMITS.maxSpecials + ")");
    }
    if (units < DECK_LIMITS.minUnits) {
        warnings.push("Tylko " + units + " jednostek (docelowo min. " + DECK_LIMITS.minUnits + ")");
    }

    const leader = LEADER_BY_ID[deck.leader];
    if (!leader) {
        errors.push("Nieznany lider: " + deck.leader);
    } else if (leader.faction !== faction) {
        errors.push("Lider " + leader.name + " nie należy do frakcji " + faction);
    }

    return { ok: errors.length === 0, errors, warnings };
}
