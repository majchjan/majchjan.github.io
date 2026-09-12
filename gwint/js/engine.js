/**
 * gwint/js/engine.js — silnik reguł.
 *
 * Czyste funkcje: każda akcja przyjmuje GameState i zwraca NOWY stan.
 * Wejściowy stan nie jest modyfikowany. Błędny ruch rzuca Error z polskim komunikatem.
 *
 * Zależności: cards.js, rng.js. Nic więcej — ani DOM, ani sieci.
 *
 * ============================================================
 * KOLEJNOŚĆ LICZENIA SIŁY (obowiązująca, od niej zależą wszystkie wyniki)
 * ============================================================
 * Dla każdej jednostki NIE-bohaterskiej w rzędzie, po kolei:
 *   1. baza      — strength z definicji karty
 *   2. pogoda    — jeśli rząd objęty pogodą, siła spada do 1
 *   3. Więź      — k kart o tym samym id z "tightBond" w rzędzie; gdy k > 1, siła × k
 *   4. Zagrzewanie — +1 za każdą INNĄ jednostkę w rzędzie z "moraleBoost"
 *   5. Róg       — × 2, jeśli w rzędzie leży karta Rogu Dowódcy ALBO inna jednostka
 *                  ze zdolnością "horn". Jednostka z "horn" nie podwaja samej siebie.
 *                  Róg działa raz, niezależnie od liczby źródeł.
 *
 * Bohaterowie pomijają kroki 2–5 — ich siła to zawsze strength.
 * Bohater nadal EMITUJE efekty: bohater z "moraleBoost" podbija sąsiadów.
 * Karty specjalne leżące na planszy (Wabik) mają siłę 0.
 * Spalenie patrzy na wartości PO wszystkich modyfikatorach i pomija bohaterów.
 * ============================================================
 */

import { ROWS, PASSIVES, LEADER_BY_ID, getCard, hasAbility, validateDeck } from "./cards.js";
import { randomInt, shuffle } from "./rng.js";

export const SIDES = ["A", "B"];

const WEATHER_ROW = { frost: "melee", fog: "ranged", rain: "siege" };
const MAX_LOG = 60;
const HAND_SIZE = 10;

export function opposite(side) {
    return side === "A" ? "B" : "A";
}

/* ============================================================
   IDENTYFIKATORY INSTANCJI:  "A:blue_stripes#2"
   Prefiks to tylko przestrzeń nazw talii — NIE oznacza właściciela w sensie zasad.
   O kontroli nad kartą decyduje strona planszy, na której leży.
   ============================================================ */

export function makeIid(namespace, cardId, copyNumber) {
    return namespace + ":" + cardId + "#" + copyNumber;
}

export function defIdOf(iid) {
    return iid.slice(iid.indexOf(":") + 1, iid.lastIndexOf("#"));
}

export function cardOf(iid) {
    return getCard(defIdOf(iid));
}

/** Przestrzeń nazw identyfikatora — z której talii pochodzi egzemplarz. */
export function nsOf(iid) {
    return iid.slice(0, iid.indexOf(":"));
}


/* ============================================================
   NARZĘDZIA WEWNĘTRZNE
   ============================================================ */

function clone(state) {
    return structuredClone(state);
}

function fail(message) {
    throw new Error(message);
}

function log(state, text) {
    state.log.push("R" + state.round + " " + text);
    if (state.log.length > MAX_LOG) {
        state.log = state.log.slice(-MAX_LOG);
    }
}

function setLastMove(state, side, text, iids) {
    state.lastMove = { side: side, text: text, iids: iids || [] };
}

function removeFrom(list, value) {
    const index = list.indexOf(value);
    if (index === -1) {
        return false;
    }
    list.splice(index, 1);
    return true;
}

function draw(state, side, count) {
    for (let i = 0; i < count; i++) {
        if (state.deck[side].length === 0) {
            log(state, side + ": talia pusta, brak dobrania");
            return;
        }
        const iid = state.deck[side].shift();
        state.hand[side].push(iid);
    }
    log(state, side + ": dobrał " + count + " kart(y)");
}

/* ============================================================
   TWORZENIE GRY I LOBBY
   ============================================================ */

export function createLobby(seed) {
    return {
        seed: seed,
        rngCursor: 0,
        status: "lobby",
        round: 1,
        turn: "A",
        startedRound: "A",
        winner: null,
        ready:        { A: false, B: false },
        faction:      { A: null,  B: null },
        leader:       { A: null,  B: null },
        leaderUsed:   { A: false, B: false },
        passed:       { A: false, B: false },
        lives:        { A: 2, B: 2 },
        mulliganLeft: { A: 2, B: 2 },
        mulliganDone: { A: false, B: false },
        deckList: { A: "", B: "" },
        deck:  { A: [], B: [] },
        hand:  { A: [], B: [] },
        grave: { A: [], B: [] },
        board: {
            A: { melee: [], ranged: [], siege: [] },
            B: { melee: [], ranged: [], siege: [] }
        },
        horn: {
            A: { melee: "", ranged: "", siege: "" },
            B: { melee: "", ranged: "", siege: "" }
        },
        weatherCards: [],
        pending: null,
        lastMove: null,
        history: [],
        log: []
    };
}

/* Talia w stanie gry żyje jako zwarty tekst "id:liczba,id:liczba" —
   dzięki temu zapis do bazy to zwykłe pole tekstowe, bez tablic. */

function formatDeckList(cards) {
    return cards.map(([cardId, count]) => cardId + ":" + count).join(",");
}

function parseDeckList(text) {
    if (!text) return [];
    return text.split(",").map(chunk => {
        const [cardId, count] = chunk.split(":");
        return [cardId, Number(count) || 1];
    });
}

export function chooseDeck(state, side, deck) {
    const s = clone(state);
    if (s.status !== "lobby") fail("Talię wybiera się tylko w lobby.");
    if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
        fail("Nieprawidłowa talia.");
    }
    if (!LEADER_BY_ID[deck.leader]) fail("Talia nie ma poprawnego dowódcy.");

    const check = validateDeck(deck);
    if (!check.ok) fail("Talia niezgodna z zasadami: " + check.errors[0]);

    s.faction[side] = deck.faction;
    s.leader[side] = deck.leader;
    s.deckList[side] = formatDeckList(deck.cards);
    s.ready[side] = false;
    log(s, side + ": wybrał talię " + (deck.name || deck.faction));
    return s;
}

export function setReady(state, side, value = true) {
    const s = clone(state);
    if (s.status !== "lobby") fail("Gotowość zgłasza się tylko w lobby.");
    if (!s.deckList[side]) fail("Najpierw wybierz talię.");

    s.ready[side] = value;
    if (s.ready.A && s.ready.B) {
        dealStart(s);
    }
    return s;
}

function dealStart(state) {
    for (const side of SIDES) {
        const cardIds = [];
        for (const [cardId, count] of parseDeckList(state.deckList[side])) {
            for (let i = 0; i < count; i++) {
                cardIds.push(cardId);
            }
        }
        const counters = {};
        const iids = cardIds.map(cardId => {
            counters[cardId] = (counters[cardId] || 0) + 1;
            return makeIid(side, cardId, counters[cardId]);
        });
        const shuffled = shuffle(iids, state.seed, state.rngCursor);
        state.deck[side] = shuffled.items;
        state.rngCursor = shuffled.cursor;
        state.hand[side] = [];
    }
    for (const side of SIDES) {
        draw(state, side, HAND_SIZE);
    }
    state.mulliganLeft = { A: 2, B: 2 };
    state.mulliganDone = { A: false, B: false };
    state.status = "mulligan";
    log(state, "rozdano po " + HAND_SIZE + " kart, czas na mulligan");
}

/* ============================================================
   MULLIGAN
   ============================================================ */

export function mulligan(state, side, iid) {
    const s = clone(state);
    if (s.status !== "mulligan") fail("To nie jest faza mulligana.");
    if (s.mulliganDone[side]) fail("Masz już zakończony mulligan.");
    if (s.mulliganLeft[side] <= 0) fail("Wykorzystałeś obie wymiany.");
    if (!s.hand[side].includes(iid)) fail("Tej karty nie ma w twojej ręce.");

    removeFrom(s.hand[side], iid);
    if (s.deck[side].length > 0) {
        s.hand[side].push(s.deck[side].shift());
    }
    // Odrzucona karta wraca w losowe miejsce talii
    const spot = randomInt(s.seed, s.rngCursor, s.deck[side].length + 1);
    s.rngCursor = spot.cursor;
    s.deck[side].splice(spot.value, 0, iid);

    s.mulliganLeft[side]--;
    log(s, side + ": wymienił " + cardOf(iid).name);
    return s;
}

export function finishMulligan(state, side) {
    const s = clone(state);
    if (s.status !== "mulligan") fail("To nie jest faza mulligana.");

    s.mulliganDone[side] = true;
    log(s, side + ": zakończył mulligan");
    if (s.mulliganDone.A && s.mulliganDone.B) {
        determineStarter(s);
    }
    return s;
}

function determineStarter(state) {
    const aChooses = state.faction.A === "scoiatael";
    const bChooses = state.faction.B === "scoiatael";
    state.status = "playing";

    if (aChooses !== bChooses) {
        const chooser = aChooses ? "A" : "B";
        state.pending = { kind: "starter", side: chooser, options: ["A", "B"] };
        log(state, chooser + " (Scoia'tael): decyduje, kto zaczyna");
        return;
    }
    const roll = randomInt(state.seed, state.rngCursor, 2);
    state.rngCursor = roll.cursor;
    state.startedRound = roll.value === 0 ? "A" : "B";
    state.turn = state.startedRound;
    log(state, "losowanie: zaczyna " + state.startedRound);
}

/* ============================================================
   LICZENIE SIŁY
   ============================================================ */

/** Czy rząd jest objęty pogodą — wynika z kart leżących na wspólnym polu pogody. */
export function weatherAffects(state, row) {
    return state.weatherCards.some(iid => WEATHER_ROW[cardOf(iid).special] === row);
}

/** Karty pogody wracają na cmentarze tych, którzy je zagrali. */
function clearWeatherField(state) {
    for (const iid of state.weatherCards) {
        state.grave[nsOf(iid)].push(iid);
    }
    state.weatherCards = [];
}

/** Rogi zagrane jako karty idą na cmentarz strony, po której leżały. */
function clearHornCards(state) {
    for (const side of SIDES) {
        for (const row of ROWS) {
            const value = state.horn[side][row];
            if (value && value !== "leader") {
                state.grave[side].push(value);
            }
            state.horn[side][row] = "";
        }
    }
}

function hornHits(state, boardSide, row, iid) {
    if (state.horn[boardSide][row]) {
        return true;
    }
    return state.board[boardSide][row].some(other =>
        other !== iid && hasAbility(cardOf(other), "horn"));
}

export function cardStrength(state, boardSide, row, iid) {
    const card = cardOf(iid);
    if (card.type === "special") return 0;
    if (card.type === "hero") return card.strength;

    let value = card.strength;

    if (weatherAffects(state, row)) {
        value = 1;
    }

    if (hasAbility(card, "tightBond")) {
        const bonded = state.board[boardSide][row].filter(other =>
            defIdOf(other) === card.id && hasAbility(cardOf(other), "tightBond"));
        if (bonded.length > 1) {
            value *= bonded.length;
        }
    }

    const morale = state.board[boardSide][row].filter(other =>
        other !== iid && cardOf(other).type !== "special" && hasAbility(cardOf(other), "moraleBoost"));
    value += morale.length;

    if (hornHits(state, boardSide, row, iid)) {
        value *= 2;
    }
    return value;
}

export function rowScore(state, boardSide, row) {
    return state.board[boardSide][row]
        .reduce((sum, iid) => sum + cardStrength(state, boardSide, row, iid), 0);
}

export function sideScore(state, boardSide) {
    return ROWS.reduce((sum, row) => sum + rowScore(state, boardSide, row), 0);
}

/* ============================================================
   ZAGRYWANIE KART
   ============================================================ */

function assertCanAct(state, side) {
    if (state.status !== "playing") fail("Gra nie jest w fazie zagrywania kart.");
    if (state.pending) fail("Najpierw dokończ oczekujący wybór.");
    if (state.passed[side]) fail("Spasowałeś w tej rundzie.");
    if (state.turn !== side) fail("To nie jest twoja tura.");
}

/**
 * Kładzie jednostkę na planszy.
 * triggerAbilities === false dla kart przyciąganych Zgrupowaniem — ich zdolności
 * się nie odpalają (inaczej wchodzimy w rekurencję muster→muster).
 */
function placeUnit(state, playerSide, iid, triggerAbilities, chosenRow) {
    const card = cardOf(iid);
    const isSpy = hasAbility(card, "spy");
    const boardSide = isSpy ? opposite(playerSide) : playerSide;
    const row = chosenRow || card.row;   // Zwinność podaje rząd, reszta bierze z definicji

    state.board[boardSide][row].push(iid);
    log(state, playerSide + ": zagrał " + card.name
        + (isSpy ? " jako szpiega na stronę " + boardSide : "")
        + " (" + row + ")");

    if (!triggerAbilities) {
        return;
    }
    if (isSpy) {
        draw(state, playerSide, 2);
    }
    if (hasAbility(card, "scorchRow")) {
        resolveScorchRow(state, playerSide, card.scorchRow, card.scorchThreshold);
    }
    if (hasAbility(card, "muster")) {
        resolveMuster(state, playerSide, card.musterGroup);
    }
    if (hasAbility(card, "medic")) {
        openMedicChoice(state, playerSide);
    }
}

/**
 * Pożoga ograniczona do jednego rzędu przeciwnika.
 * Próg liczy się z sumy rzędu widocznej na planszy, czyli po wszystkich modyfikatorach.
 */
function resolveScorchRow(state, playerSide, row, threshold) {
    if (!ROWS.includes(row)) return;

    const enemy = opposite(playerSide);
    const total = rowScore(state, enemy, row);

    if (total < threshold) {
        log(state, "Pożoga: rząd " + row + " przeciwnika ma " + total
            + " przy progu " + threshold + " — bez efektu");
        return;
    }

    let best = -1;
    let victims = [];
    for (const iid of state.board[enemy][row]) {
        if (cardOf(iid).type !== "unit") continue;   // bohaterowie i Wabik odporni
        const value = cardStrength(state, enemy, row, iid);
        if (value > best) {
            best = value;
            victims = [];
        }
        if (value === best) {
            victims.push(iid);
        }
    }

    if (victims.length === 0) {
        log(state, "Pożoga: w rzędzie " + row + " nie ma celów");
        return;
    }
    for (const iid of victims) {
        removeFrom(state.board[enemy][row], iid);
        state.grave[enemy].push(iid);
    }
    log(state, "Pożoga zniszczyła w rzędzie " + row + " (" + best + "): "
        + victims.map(iid => cardOf(iid).name).join(", "));
}

function resolveMuster(state, playerSide, group) {
    const matches = iid => cardOf(iid).musterGroup === group;
    const pulled = [
        ...state.deck[playerSide].filter(matches),
        ...state.hand[playerSide].filter(matches)
    ];
    for (const iid of pulled) {
        removeFrom(state.deck[playerSide], iid);
        removeFrom(state.hand[playerSide], iid);
        placeUnit(state, playerSide, iid, false);
    }
    if (pulled.length > 0) {
        log(state, playerSide + ": Zgrupowanie przyciągnęło " + pulled.length + " kart(y)");
    }
}

function openMedicChoice(state, playerSide) {
    const options = state.grave[playerSide].filter(iid => cardOf(iid).type === "unit");
    if (options.length === 0) {
        log(state, playerSide + ": Medyk bez celu — cmentarz pusty");
        return;
    }
    state.pending = { kind: "medic", side: playerSide, options: options };
}

export function playCard(state, side, iid, params = {}) {
    const s = clone(state);
    assertCanAct(s, side);
    if (!s.hand[side].includes(iid)) fail("Tej karty nie ma w twojej ręce.");

    const card = cardOf(iid);
    removeFrom(s.hand[side], iid);

    if (card.type === "special") {
        applySpecial(s, side, iid, params);
    } else if (hasAbility(card, "agile")) {
        if (params.row !== "melee" && params.row !== "ranged") {
            fail("Zwinność: wskaż rząd.");
        }
        placeUnit(s, side, iid, true, params.row);
    } else {
        placeUnit(s, side, iid, true);
    }

    setLastMove(s, side, "zagrał " + card.name, [iid]);

    if (!s.pending) {
        advanceTurn(s, side);
    }
    return s;
}

function applySpecial(state, side, iid, params) {
    const card = cardOf(iid);

    switch (card.special) {
        case "frost":
        case "fog":
        case "rain": {
            state.weatherCards.push(iid);   // karta zostaje na polu pogody
            log(state, side + ": zagrał " + card.name);
            break;
        }
        case "clearWeather": {
            clearWeatherField(state);
            state.grave[side].push(iid);
            log(state, side + ": zagrał Czystą Pogodę");
            break;
        }
        case "horn": {
            const row = params.row;
            if (!ROWS.includes(row)) fail("Wskaż rząd dla Rogu Dowódcy.");
            if (state.horn[side][row]) fail("W tym rzędzie leży już Róg Dowódcy.");
            state.horn[side][row] = iid;    // karta zostaje w slocie rzędu
            log(state, side + ": zagrał Róg Dowódcy na rząd " + row);
            break;
        }
        case "scorch": {
            state.grave[side].push(iid);
            resolveScorch(state);
            break;
        }
        case "decoy": {
            const target = params.targetIid;
            if (!target) fail("Wskaż jednostkę do zamiany.");
            const row = ROWS.find(r => state.board[side][r].includes(target));
            if (!row) fail("Ta jednostka nie leży po twojej stronie planszy.");
            const targetCard = cardOf(target);
            if (targetCard.type !== "unit") fail("Wabik nie działa na bohaterów ani karty specjalne.");

            const index = state.board[side][row].indexOf(target);
            state.board[side][row][index] = iid;
            state.hand[side].push(target);
            log(state, side + ": Wabik zabrał " + targetCard.name + " z powrotem do ręki");
            break;
        }
        default:
            fail("Nieobsługiwana karta specjalna: " + card.special);
    }
}

function resolveScorch(state) {
    let best = -1;
    let victims = [];

    for (const boardSide of SIDES) {
        for (const row of ROWS) {
            for (const iid of state.board[boardSide][row]) {
                if (cardOf(iid).type !== "unit") continue;
                const value = cardStrength(state, boardSide, row, iid);
                if (value > best) {
                    best = value;
                    victims = [];
                }
                if (value === best) {
                    victims.push({ boardSide, row, iid });
                }
            }
        }
    }

    if (victims.length === 0) {
        log(state, "Spalenie: brak celów");
        return;
    }
    for (const victim of victims) {
        removeFrom(state.board[victim.boardSide][victim.row], victim.iid);
        state.grave[victim.boardSide].push(victim.iid);
    }
    log(state, "Spalenie zniszczyło (" + best + "): "
        + victims.map(v => cardOf(v.iid).name).join(", "));
}

/* ============================================================
   OCZEKUJĄCE WYBORY
   ============================================================ */

export function resolvePending(state, side, choice) {
    const s = clone(state);
    if (!s.pending) fail("Nic nie czeka na wybór.");
    if (s.pending.side !== side) fail("To nie ty dokonujesz tego wyboru.");

    const kind = s.pending.kind;

    if (kind === "starter") {
        if (!SIDES.includes(choice)) fail("Wskaż gracza, który zaczyna.");
        s.pending = null;
        s.startedRound = choice;
        s.turn = choice;
        log(s, side + ": zdecydował, że zaczyna " + choice);
        return s;
    }

    if (kind === "medic") {
        const options = s.pending.options;
        if (!options.includes(choice)) fail("Wskrzeszenie jest obowiązkowe — wybierz kartę z listy.");
        s.pending = null;

        removeFrom(s.grave[side], choice);
        log(s, side + ": Medyk wskrzesił " + cardOf(choice).name);
        placeUnit(s, side, choice, true);
        setLastMove(s, side, "wskrzesił " + cardOf(choice).name, [choice]);

        if (!s.pending) {
            advanceTurn(s, side);
        }
        return s;
    }

    fail("Nieznany typ wyboru: " + kind);
}

/* ============================================================
   LIDER
   ============================================================ */

export function useLeader(state, side, params = {}) {
    const s = clone(state);
    assertCanAct(s, side);
    if (s.leaderUsed[side]) fail("Zdolność lidera została już użyta.");

    const leader = LEADER_BY_ID[s.leader[side]];
    if (!leader) fail("Brak lidera dla tego gracza.");

    if (leader.ability === "clearWeather") {
        clearWeatherField(s);
    } else if (leader.ability === "weather") {
        // Lider zagrywa pogodę spoza talii — egzemplarz oznaczamy numerem "leader"
        s.weatherCards.push(makeIid(side, leader.weather, "leader"));
    } else if (leader.ability === "horn") {
        const row = params.row;
        if (!ROWS.includes(row)) fail("Wskaż rząd dla Rogu Dowódcy.");
        if (s.horn[side][row]) fail("W tym rzędzie leży już Róg Dowódcy.");
        s.horn[side][row] = "leader";   // zdolność lidera, bez fizycznej karty
    } else {
        fail("Nieobsługiwana zdolność lidera: " + leader.ability);
    }

    s.leaderUsed[side] = true;
    log(s, side + ": użył zdolności lidera (" + leader.name + ")");
    setLastMove(s, side, "użył zdolności lidera: " + leader.name, []);
    advanceTurn(s, side);
    return s;
}

/* ============================================================
   PAS I PRZEBIEG TURY
   ============================================================ */

export function pass(state, side) {
    const s = clone(state);
    if (s.status !== "playing") fail("Gra nie jest w fazie zagrywania kart.");
    if (s.pending) fail("Najpierw dokończ oczekujący wybór.");
    if (s.passed[side]) fail("Już spasowałeś.");
    if (s.turn !== side) fail("To nie jest twoja tura.");

    s.passed[side] = true;
    log(s, side + ": spasował");
    setLastMove(s, side, "spasował", []);
    advanceTurn(s, side);
    return s;
}

/** Czy gracz ma czym zagrać: karta w ręce albo niewykorzystana zdolność lidera. */
function hasAnyMove(state, side) {
    if (state.hand[side].length > 0) {
        return true;
    }
    const leader = LEADER_BY_ID[state.leader[side]];
    return Boolean(leader) && !state.leaderUsed[side];
}

/** Pasuje za graczy, którzy nie mają już żadnego legalnego ruchu. */
function autoPassStuckPlayers(state) {
    for (const player of SIDES) {
        if (!state.passed[player] && !hasAnyMove(state, player)) {
            state.passed[player] = true;
            log(state, player + ": brak możliwego ruchu, automatyczny pas");
        }
    }
}

function advanceTurn(state, side) {
    autoPassStuckPlayers(state);

    if (state.passed.A && state.passed.B) {
        finishRound(state);
        return;
    }
    // Tura trafia do tego, kto jeszcze nie spasował
    if (state.passed.A) {
        state.turn = "B";
    } else if (state.passed.B) {
        state.turn = "A";
    } else {
        state.turn = opposite(side);
    }
}

/* ============================================================
   KONIEC RUNDY I NOWA RUNDA
   ============================================================ */

function finishRound(state) {
    const scoreA = sideScore(state, "A");
    const scoreB = sideScore(state, "B");
    let winner;

    if (scoreA > scoreB) {
        winner = "A";
    } else if (scoreB > scoreA) {
        winner = "B";
    } else {
        const aNilf = PASSIVES[state.faction.A] === "winsDraws";
        const bNilf = PASSIVES[state.faction.B] === "winsDraws";
        if (aNilf && !bNilf) {
            winner = "A";
        } else if (bNilf && !aNilf) {
            winner = "B";
        } else {
            winner = "draw";
        }
    }

    state.history.push({ round: state.round, A: scoreA, B: scoreB, winner: winner });
    log(state, "koniec rundy: A " + scoreA + " — B " + scoreB
        + (winner === "draw" ? ", remis" : ", wygrywa " + winner));

    if (winner === "draw") {
        state.lives.A--;
        state.lives.B--;
    } else {
        state.lives[opposite(winner)]--;
    }

    if (state.lives.A <= 0 || state.lives.B <= 0) {
        state.status = "finished";
        state.ready = { A: false, B: false };   // w tym stanie oznacza zgodę na rewanż
        if (state.lives.A <= 0 && state.lives.B <= 0) {
            state.winner = "draw";
        } else {
            state.winner = state.lives.A <= 0 ? "B" : "A";
        }
        log(state, "koniec gry: " + (state.winner === "draw" ? "remis" : "wygrywa " + state.winner));
    } else {
        state.status = "roundEnd";
        state.ready = { A: false, B: false };
    }
}

/** Obaj gracze potwierdzają wynik rundy — dopiero wtedy plansza jest sprzątana. */
export function acknowledgeRound(state, side) {
    const s = clone(state);
    if (s.status !== "roundEnd") fail("Runda nie jest zakończona.");

    s.ready[side] = true;
    if (s.ready.A && s.ready.B) {
        beginNextRound(s);
    }
    return s;
}

export function requestNewGame(state, side) {
    const s = clone(state);
    if (s.status !== "finished") fail("Gra jeszcze się nie skończyła.");
    if (s.ready[side]) fail("Już zgłosiłeś chęć rewanżu.");

    s.ready[side] = true;
    log(s, side + ": chce zagrać ponownie");

    if (s.ready.A && s.ready.B) {
        resetForNewGame(s);
    }
    return s;
}

function resetForNewGame(state) {
    state.status = "lobby";
    state.round = 1;
    state.winner = null;
    state.ready = { A: false, B: false };
    state.leaderUsed = { A: false, B: false };
    state.passed = { A: false, B: false };
    state.lives = { A: 2, B: 2 };
    state.mulliganLeft = { A: 2, B: 2 };
    state.mulliganDone = { A: false, B: false };
    state.deck = { A: [], B: [] };
    state.hand = { A: [], B: [] };
    state.grave = { A: [], B: [] };
    state.board = {
        A: { melee: [], ranged: [], siege: [] },
        B: { melee: [], ranged: [], siege: [] }
    };
    state.horn = {
        A: { melee: "", ranged: "", siege: "" },
        B: { melee: "", ranged: "", siege: "" }
    };
    state.weatherCards = [];
    state.pending = null;
    state.lastMove = null;
    state.history = [];
    state.log = [];
    log(state, "nowa gra przy tym samym stole — potwierdźcie talie");
}

function beginNextRound(state) {
    // Pasywka Potworów — jedna losowa jednostka zostaje na planszy
    const kept = {};
    for (const side of SIDES) {
        if (PASSIVES[state.faction[side]] !== "keepsRandomUnit") continue;
        const survivors = [];
        for (const row of ROWS) {
            for (const iid of state.board[side][row]) {
                if (cardOf(iid).type !== "special") {
                    survivors.push({ row, iid });
                }
            }
        }
        if (survivors.length === 0) continue;
        const roll = randomInt(state.seed, state.rngCursor, survivors.length);
        state.rngCursor = roll.cursor;
        kept[side] = survivors[roll.value];
        log(state, side + " (Potwory): na planszy zostaje " + cardOf(kept[side].iid).name);
    }

    // Reszta planszy na cmentarz strony, po której leżała
    for (const side of SIDES) {
        for (const row of ROWS) {
            const staying = [];
            for (const iid of state.board[side][row]) {
                if (kept[side] && kept[side].iid === iid) {
                    staying.push(iid);
                } else {
                    state.grave[side].push(iid);
                }
            }
            state.board[side][row] = staying;
        }
    }

    clearWeatherField(state);
    clearHornCards(state);

    state.passed = { A: false, B: false };
    state.pending = null;
    state.lastMove = null;

    // Pasywka Królestw Północy — zwycięzca rundy dobiera kartę
    const last = state.history[state.history.length - 1];
    if (last.winner !== "draw" && PASSIVES[state.faction[last.winner]] === "drawOnRoundWin") {
        log(state, last.winner + " (Królestwa Północy): dobiera kartę za wygraną rundę");
        draw(state, last.winner, 1);
    }

    state.round++;
    state.startedRound = last.winner !== "draw" ? last.winner : opposite(state.startedRound);
    state.turn = state.startedRound;
    state.status = "playing";
    log(state, "zaczyna " + state.startedRound);

    // Ręki nie uzupełnia się między rundami, więc do nowej rundy można wejść
    // bez jednej karty — wtedy pasujemy za takiego gracza od razu.
    autoPassStuckPlayers(state);
    if (state.passed.A && state.passed.B) {
        finishRound(state);
        return;
    }
    if (state.passed[state.turn]) {
        state.turn = opposite(state.turn);
    }
}

/* ============================================================
   PODPOWIEDZI DLA UI
   ============================================================ */

export function legalMoves(state, side) {
    if (state.pending) {
        return state.pending.side === side
            ? [{ type: "resolve", kind: state.pending.kind, options: state.pending.options }]
            : [];
    }
    if (state.status === "roundEnd") {
        return state.ready[side] ? [] : [{ type: "acknowledge" }];
    }
    if (state.status !== "playing" || state.turn !== side || state.passed[side]) {
        return [];
    }

    const moves = state.hand[side].map(iid => {
        const card = cardOf(iid);
        let needs = null;
        if (card.special === "horn") needs = "row";
        if (card.special === "decoy") needs = "target";
        return { type: "play", iid: iid, needs: needs };
    });

    if (!state.leaderUsed[side]) {
        const leader = LEADER_BY_ID[state.leader[side]];
        moves.push({ type: "leader", needs: leader && leader.ability === "horn" ? "row" : null });
    }
    moves.push({ type: "pass" });
    return moves;
}
