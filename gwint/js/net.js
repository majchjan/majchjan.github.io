/**
 * gwint/js/net.js — warstwa sieciowa nad silnikiem.
 *
 * Odpowiada za: logowanie anonimowe, pokoje na 5-znakowych kodach,
 * transakcyjny zapis ruchu, konwersję GameState ⇄ format Realtime Database.
 *
 * Silnik nie wie o istnieniu tego pliku. Tutaj nie ma ŻADNEJ logiki reguł —
 * ruch to funkcja przekazana z ui.js, wykonywana wewnątrz transakcji.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getDatabase, ref, set, get, remove, onValue, onDisconnect, runTransaction, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { createLobby } from "./engine.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";  // bez mylących I, L, O, 0, 1
const ROOM_TIMEOUT = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL = 2 * 60 * 1000;

let myUid = null;
let roomCode = null;
let mySeat = null;          // "A" | "B" | null (obserwator)
let unsubscribe = null;
let heartbeat = null;
let changeHandler = null;

export function getUid()  { return myUid; }
export function getSeat() { return mySeat; }
export function getCode() { return roomCode; }

/* ============================================================
   KONWERSJA GameState ⇄ BAZA
   Listy kart lecą jako CSV — baza gubi puste tablice i potrafi zamienić
   tablicę na obiekt z kluczami liczbowymi. Identyfikator instancji
   ("A:blue_stripes#2") nie zawiera przecinka, więc podział jest jednoznaczny.
   ============================================================ */

function toCsv(list) {
    return list.join(",");
}

function fromCsv(value) {
    return value ? String(value).split(",") : [];
}

function pair(source, fallback) {
    const object = source || {};
    return {
        A: object.A === undefined || object.A === null ? fallback : object.A,
        B: object.B === undefined || object.B === null ? fallback : object.B
    };
}

function rowsToDb(rows) {
    return { melee: toCsv(rows.melee), ranged: toCsv(rows.ranged), siege: toCsv(rows.siege) };
}

function rowsFromDb(rows) {
    const object = rows || {};
    return {
        melee: fromCsv(object.melee),
        ranged: fromCsv(object.ranged),
        siege: fromCsv(object.siege)
    };
}

function hornFromDb(horn) {
    const object = horn || {};
    return { melee: !!object.melee, ranged: !!object.ranged, siege: !!object.siege };
}

function historyToDb(history) {
    return history.map(entry => entry.round + ":" + entry.A + "-" + entry.B + ":" + entry.winner).join(",");
}

function historyFromDb(value) {
    return fromCsv(value).map(chunk => {
        const [round, scores, winner] = chunk.split(":");
        const [scoreA, scoreB] = scores.split("-");
        return { round: Number(round), A: Number(scoreA), B: Number(scoreB), winner: winner };
    });
}

/** GameState → { state, hands, decks } gotowe do zapisu. */
function toDb(state) {
    const dbState = {
        seed: state.seed,
        rngCursor: state.rngCursor,
        status: state.status,
        round: state.round,
        turn: state.turn,
        startedRound: state.startedRound,
        ready: state.ready,
        faction: state.faction,
        leader: state.leader,
        leaderUsed: state.leaderUsed,
        passed: state.passed,
        lives: state.lives,
        mulliganLeft: state.mulliganLeft,
        mulliganDone: state.mulliganDone,
        grave: { A: toCsv(state.grave.A), B: toCsv(state.grave.B) },
        board: { A: rowsToDb(state.board.A), B: rowsToDb(state.board.B) },
        horn: state.horn,
        weather: state.weather,
        history: historyToDb(state.history),
        log: state.log.join("\n")
    };

    // Klucze o wartości null pomijamy — baza i tak by je usunęła
    if (state.winner) {
        dbState.winner = state.winner;
    }
    if (state.faction.A === null) delete dbState.faction.A;
    if (state.faction.B === null) delete dbState.faction.B;
    if (state.leader.A === null) delete dbState.leader.A;
    if (state.leader.B === null) delete dbState.leader.B;
    if (state.pending) {
        dbState.pending = {
            kind: state.pending.kind,
            side: state.pending.side,
            options: toCsv(state.pending.options)
        };
    }

    return {
        state: dbState,
        hands: { A: toCsv(state.hand.A), B: toCsv(state.hand.B) },
        decks: { A: toCsv(state.deck.A), B: toCsv(state.deck.B) }
    };
}

/** Węzeł pokoju → GameState z uzupełnionymi wartościami domyślnymi. */
function fromDb(room) {
    const raw = room.state || {};
    const hands = room.hands || {};
    const decks = room.decks || {};
    const board = raw.board || {};
    const horn = raw.horn || {};
    const weather = raw.weather || {};
    const grave = raw.grave || {};

    return {
        seed: raw.seed ?? 0,
        rngCursor: raw.rngCursor ?? 0,
        status: raw.status ?? "lobby",
        round: raw.round ?? 1,
        turn: raw.turn ?? "A",
        startedRound: raw.startedRound ?? "A",
        winner: raw.winner ?? null,
        ready:        pair(raw.ready, false),
        faction:      pair(raw.faction, null),
        leader:       pair(raw.leader, null),
        leaderUsed:   pair(raw.leaderUsed, false),
        passed:       pair(raw.passed, false),
        lives:        pair(raw.lives, 2),
        mulliganLeft: pair(raw.mulliganLeft, 2),
        mulliganDone: pair(raw.mulliganDone, false),
        deck:  { A: fromCsv(decks.A), B: fromCsv(decks.B) },
        hand:  { A: fromCsv(hands.A), B: fromCsv(hands.B) },
        grave: { A: fromCsv(grave.A), B: fromCsv(grave.B) },
        board: { A: rowsFromDb(board.A), B: rowsFromDb(board.B) },
        horn:  { A: hornFromDb(horn.A), B: hornFromDb(horn.B) },
        weather: { frost: !!weather.frost, fog: !!weather.fog, rain: !!weather.rain },
        pending: raw.pending
            ? { kind: raw.pending.kind, side: raw.pending.side, options: fromCsv(raw.pending.options) }
            : null,
        history: historyFromDb(raw.history),
        log: raw.log ? String(raw.log).split("\n") : []
    };
}

/* ============================================================
   POŁĄCZENIE
   ============================================================ */

/** Loguje anonimowo i czeka na uid. */
export function connect() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, user => {
            if (user) {
                myUid = user.uid;
                resolve(user.uid);
            }
        });
        signInAnonymously(auth).catch(reject);
    });
}

/** Rejestruje odbiorcę zmian stanu pokoju. */
export function onRoomChange(handler) {
    changeHandler = handler;
}

function notify(room) {
    if (!changeHandler) return;
    changeHandler({
        code: roomCode,
        seat: mySeat,
        players: (room && room.meta && room.meta.players) || {},
        state: fromDb(room)
    });
}

function randomCode() {
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
}

function randomSeed() {
    return Math.floor(Math.random() * 2147483647);
}

/* ============================================================
   POKOJE
   ============================================================ */

export async function createRoom() {
    if (!myUid) throw new Error("Brak połączenia z bazą.");

    const code = randomCode();
    const parts = toDb(createLobby(randomSeed()));

    await set(ref(db, "gwint/rooms/" + code), {
        meta: {
            createdAt: Date.now(),
            lastActivity: serverTimestamp(),
            players: { A: myUid }
        },
        state: parts.state,
        hands: parts.hands,
        decks: parts.decks
    });

    enterRoom(code, "A");
    return code;
}

export async function joinRoom(code) {
    if (!myUid) throw new Error("Brak połączenia z bazą.");
    if (code.length !== 5) throw new Error("Kod stołu ma 5 znaków.");

    const roomRef = ref(db, "gwint/rooms/" + code);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) throw new Error("Nie ma stołu o takim kodzie.");

    // Transakcja liczona jest na lokalnym cache; przy pierwszym przebiegu
    // podstawiamy stan z get(), inaczej callback dostaje null i przerywa zajmowanie miejsca.
    let firstRun = true;
    const result = await runTransaction(roomRef, room => {
        if (!room && firstRun) {
            room = snapshot.val();
        }
        firstRun = false;
        if (!room) return;

        if (!room.meta) room.meta = {};
        if (!room.meta.players) room.meta.players = {};
        const players = room.meta.players;

        if (players.A !== myUid && players.B !== myUid) {
            if (!players.A) {
                players.A = myUid;
            } else if (!players.B) {
                players.B = myUid;
            } else {
                return;                    // stół pełny
            }
        }
        room.meta.lastActivity = serverTimestamp();
        return room;
    });

    if (!result.committed) throw new Error("Ten stół jest już pełny.");

    const players = result.snapshot.val().meta.players;
    const seat = players.A === myUid ? "A" : (players.B === myUid ? "B" : null);
    enterRoom(code, seat);
    return seat;
}

function enterRoom(code, seat) {
    roomCode = code;
    mySeat = seat;
    location.hash = code;

    // Miejsca NIE zwalniamy przy rozłączeniu — partia trwa długo, a odświeżenie
    // strony nie może kosztować gry. Wracamy na swoje krzesło po uid.
    onDisconnect(ref(db, "gwint/rooms/" + code + "/meta/lastActivity")).set(serverTimestamp());

    heartbeat = setInterval(() => {
        set(ref(db, "gwint/rooms/" + code + "/meta/lastActivity"), serverTimestamp());
    }, HEARTBEAT_INTERVAL);

    unsubscribe = onValue(ref(db, "gwint/rooms/" + code), snapshot => {
        const room = snapshot.val();
        if (!room) {
            leaveRoom();
            if (changeHandler) changeHandler(null);
            return;
        }
        notify(room);
    });
}

export function leaveRoom() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
    }
    roomCode = null;
    mySeat = null;
    location.hash = "";
}

/** Kasuje stół razem z partią. Do użycia świadomie, nie przy zwykłym wyjściu. */
export async function destroyRoom() {
    if (!roomCode) return;
    const code = roomCode;
    leaveRoom();
    await remove(ref(db, "gwint/rooms/" + code));
}

/* ============================================================
   RUCH
   ============================================================ */

/**
 * Wykonuje ruch transakcyjnie.
 *
 * @param {(state: object, seat: string) => object} action
 *        Funkcja z engine.js opakowana w domknięcie, np.
 *        applyMove((state, seat) => engine.pass(state, seat))
 *
 * Błąd rzucony przez silnik (nielegalny ruch) przerywa transakcję
 * i wraca do wywołującego — nic nie zostaje zapisane.
 */
export async function applyMove(action) {
    if (!roomCode) throw new Error("Nie siedzisz przy żadnym stole.");
    if (!mySeat) throw new Error("Jesteś obserwatorem — nie możesz wykonywać ruchów.");

    const roomRef = ref(db, "gwint/rooms/" + roomCode);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) throw new Error("Stół już nie istnieje.");

    let engineError = null;
    let firstRun = true;

    const result = await runTransaction(roomRef, room => {
        if (!room && firstRun) {
            room = snapshot.val();
        }
        firstRun = false;
        if (!room) return;

        let nextState;
        try {
            nextState = action(fromDb(room), mySeat);
        } catch (error) {
            engineError = error;
            return;                        // przerwij transakcję, nic nie zapisuj
        }

        const parts = toDb(nextState);
        room.state = parts.state;
        room.hands = parts.hands;
        room.decks = parts.decks;
        if (!room.meta) room.meta = {};
        room.meta.lastActivity = serverTimestamp();
        return room;
    });

    if (engineError) throw engineError;
    if (!result.committed) throw new Error("Nie udało się zapisać ruchu — spróbuj ponownie.");
}

/* ============================================================
   SPRZĄTANIE PORZUCONYCH STOŁÓW
   ============================================================ */

export async function cleanOldRooms() {
    let rooms = null;
    try {
        const snapshot = await get(ref(db, "gwint/rooms"));
        rooms = snapshot.val();
    } catch (error) {
        console.error("Błąd odczytu listy stołów:", error);
        return;
    }
    if (!rooms) return;

    const deadline = Date.now() - ROOM_TIMEOUT;
    for (const code in rooms) {
        if (code === roomCode) continue;
        const meta = rooms[code].meta || {};
        const lastActivity = meta.lastActivity || meta.createdAt || 0;
        if (lastActivity >= deadline) continue;
        try {
            await remove(ref(db, "gwint/rooms/" + code));
            console.log("Usunięto porzucony stół:", code);
        } catch (error) {
            console.error("Nie udało się usunąć stołu " + code + ":", error);
        }
    }
}
