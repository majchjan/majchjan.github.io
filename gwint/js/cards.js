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
    skellige:  "resurrectRound3"     // ZAREZERWOWANE — implementacja na później
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

    /* ---------- Neutralne karty specjalne ---------- */
    { id: "frost",         name: "Trzaskający Mróz",    faction: "neutral", type: "special", special: "frost" },
    { id: "fog",           name: "Nieprzenikliwa Mgła", faction: "neutral", type: "special", special: "fog" },
    { id: "rain",          name: "Ulewny Deszcz",       faction: "neutral", type: "special", special: "rain" },
    { id: "clear_weather", name: "Czysta Pogoda",       faction: "neutral", type: "special", special: "clearWeather" },
    { id: "horn",          name: "Róg Dowódcy",         faction: "neutral", type: "special", special: "horn" },
    { id: "scorch",        name: "Spalenie",            faction: "neutral", type: "special", special: "scorch" },
    { id: "decoy",         name: "Wabik",               faction: "neutral", type: "special", special: "decoy" },

    /* ---------- Królestwa Północy ---------- */
    { id: "blue_stripes",       name: "Komando Błękitnych Pasów",  faction: "northern", type: "unit", row: "melee",  strength: 4, abilities: ["tightBond"] },
    { id: "siege_tower",        name: "Wieża oblężnicza",          faction: "northern", type: "unit", row: "siege",  strength: 6 },
    { id: "dun_banner_medic",   name: "Medyczka Burej Chorągwi", faction: "northern", type: "unit", row: "siege",  strength: 5, abilities: ["medic"] },
    { id: "sigismund_dijkstra", name: "Sigismund Dijkstra",        faction: "northern", type: "unit", row: "melee",  strength: 4, abilities: ["spy"] },
    { id: "john_natalis",       name: "Jan Natalis",               faction: "northern", type: "hero", row: "melee",  strength: 10 },

    /* ---------- Cesarstwo Nilfgaardu ---------- */
    { id: "impera_brigade",        name: "Brygada Impera",           faction: "nilfgaard", type: "unit", row: "ranged", strength: 3, abilities: ["tightBond"] },
    { id: "siege_technician",      name: "Wsparcie oblężnicze",       faction: "nilfgaard", type: "unit", row: "siege",  strength: 0, abilities: ["medic"] },
    { id: "black_infantry_archer", name: "Nilfgaardzki łucznik",  faction: "nilfgaard", type: "unit", row: "ranged", strength: 10 },
    { id: "stefan_skellen",        name: "Stefan Skellen",           faction: "nilfgaard", type: "unit", row: "melee",  strength: 9, abilities: ["spy"] },
    { id: "menno_coehoorn",        name: "Menno Coehoorn",           faction: "nilfgaard", type: "hero", row: "melee",  strength: 10 },

    /* ---------- Scoia'tael ---------- */
    { id: "havekar_smuggler",     name: "Havekarskie wsparcie ",         faction: "scoiatael", type: "unit", row: "melee",  strength: 5, abilities: ["muster"], musterGroup: "havekar" },
    { id: "elven_skirmisher",     name: "Elfi harcownik",             faction: "scoiatael", type: "unit", row: "ranged", strength: 2, abilities: ["muster"], musterGroup: "elven_skirmisher" },
    { id: "dol_blathanna_archer", name: "Łucznia z Dol Blathanna", faction: "scoiatael", type: "unit", row: "ranged", strength: 10 },
    { id: "schirru",              name: "Schirrú",                    faction: "scoiatael", type: "unit", row: "siege",  strength: 8, abilities: ["scorchRow"], scorchRow: "siege" },
    { id: "iorveth",              name: "Iorveth",                    faction: "scoiatael", type: "hero", row: "melee",  strength: 10 },

    /* ---------- Potwory ---------- */
    { id: "arachas",       name: "Krabopająk",         faction: "monsters", type: "unit", row: "melee",  strength: 4, abilities: ["muster"], musterGroup: "arachas" },
    { id: "kayran",        name: "Kejran",          faction: "monsters", type: "unit", row: "melee",  strength: 8, abilities: ["moraleBoost"] },
    { id: "fiend",         name: "Bies",            faction: "monsters", type: "unit", row: "melee",  strength: 6 },
    { id: "celaeno_harpy", name: "Harpia Celaeno",  faction: "monsters", type: "unit", row: "melee",  strength: 2, abilities: ["agile"] },
    { id: "draug",         name: "Draug",           faction: "monsters", type: "hero", row: "melee",  strength: 14 },
    { id: "toad_prince",   name: "Królewicz Ropuch",faction: "monsters", type: "unit", row: "ranged", strength: 7, abilities: ["scorchRow"], scorchRow: "ranged" }
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
    { id: "foltest_king",      name: "Foltest, Król Temerii",             faction: "northern",  ability: "clearWeather", weather: null,
      text: "Usuwa wszystkie efekty pogody." },
    { id: "emhyr_white_flame", name: "Emhyr var Emreis, Biały Płomień",   faction: "nilfgaard", ability: "weather",      weather: "fog",
      text: "Zagrywa Nieprzenikliwą Mgłę." },
    { id: "francesca_daisy",   name: "Francesca Findabair, Stokrotka z Doliny", faction: "scoiatael", ability: "horn",   weather: null,
      text: "Zagrywa Róg Dowódcy na wybrany rząd." },
    { id: "eredin_king",       name: "Eredin, Król Dzikiego Gonu",        faction: "monsters",  ability: "weather",      weather: "frost",
      text: "Zagrywa Trzaskający Mróz." }
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
            ["blue_stripes", 3],        // Więź: 3 kopie po 4
            ["siege_tower", 2],         // Zagrzewanie
            ["dun_banner_medic", 2],    // Medyk
            ["sigismund_dijkstra", 1],  // Szpieg
            ["john_natalis", 1]        // Bohater
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
            ["impera_brigade", 4],        // Więź: 4 kopie po 3
            ["siege_technician", 2],      // Medyk o sile 0
            ["black_infantry_archer", 2],
            ["stefan_skellen", 1],        // Szpieg o dużej sile
            ["menno_coehoorn", 1]       // Bohater
        ]
    },

    scoiatael: {
        id: "scoiatael",
        name: "Scoia'tael",
        leader: "francesca_daisy",
        cards: [
            ["havekar_smuggler", 3],      // Zgrupowanie w rzędzie wręcz
            ["elven_skirmisher", 3],      // Zgrupowanie w rzędzie dystansowym
            ["dol_blathanna_archer", 2],
            ["schirru", 2],
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
            ["decoy", 3]
        ]
    },

    monsters: {
        id: "monsters",
        name: "Potwory",
        leader: "eredin_king",
        cards: [
            ["arachas", 3],               // Zgrupowanie
            ["kayran", 2],                // Zagrzewanie
            ["fiend", 2],
            ["celaeno_harpy", 2],
            ["draug", 1],                 // Bohater o sile 14
            ["toad_prince", 1], 
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
            ["decoy", 3]
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
