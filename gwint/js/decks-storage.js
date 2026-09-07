/**
 * gwint/js/decks-storage.js — talie gracza.
 *
 * Dwa poziomy trwałości:
 *   localStorage — robocza lista talii, przeżywa odświeżenie strony
 *   plik JSON    — eksport i import, do backupu i wymiany talii ze znajomymi
 *
 * Kształt talii jest ten sam, co wpisy w DECKS, więc validateDeck z cards.js
 * przyjmuje go bez żadnej konwersji:
 *   { id, version, name, faction, leader, cards: [[cardId, count], ...], updatedAt }
 *
 * Zero zależności od sieci i od reguł gry.
 */

import { DECKS, CARD_BY_ID, LEADER_BY_ID, validateDeck } from "./cards.js";

const STORAGE_KEY = "gwint.decks.v1";
export const DECK_VERSION = 1;

/* ============================================================
   LOCALSTORAGE
   Każdy odczyt i zapis w try/catch — w trybie prywatnym albo przy
   zablokowanych danych stron localStorage potrafi rzucić wyjątkiem.
   ============================================================ */

function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Nie udało się odczytać talii z pamięci przeglądarki:", error);
        return [];
    }
}

function writeAll(decks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
        return true;
    } catch (error) {
        console.error("Nie udało się zapisać talii:", error);
        return false;
    }
}

function newId() {
    return "d" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

/* ============================================================
   PULA KART FRAKCJI
   DECKS[faction] to zbiór wszystkich kart dostępnych dla frakcji,
   a liczba przy karcie to maksymalna liczba egzemplarzy w talii.
   ============================================================ */

/** @returns {Object<string, number>} cardId → maksymalna liczba kopii */
export function poolFor(factionId) {
    const pool = DECKS[factionId];
    if (!pool) {
        throw new Error("Nieznana frakcja: " + factionId);
    }
    const limits = {};
    for (const [cardId, count] of pool.cards) {
        limits[cardId] = (limits[cardId] || 0) + count;
    }
    return limits;
}

/** Ile kopii danej karty wolno mieć w talii tej frakcji. */
export function maxCopies(factionId, cardId) {
    return poolFor(factionId)[cardId] || 0;
}

/* ============================================================
   CRUD
   ============================================================ */

export function listDecks() {
    return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getDeck(id) {
    return readAll().find(deck => deck.id === id) || null;
}

/** Zapisuje talię. Bez id — tworzy nową. Zwraca zapisaną talię. */
export function saveDeck(deck) {
    const decks = readAll();
    const stored = {
        id: deck.id && !String(deck.id).startsWith("builtin:") ? deck.id : newId(),
        version: DECK_VERSION,
        name: (deck.name || "Bez nazwy").trim(),
        faction: deck.faction,
        leader: deck.leader,
        cards: deck.cards.map(([cardId, count]) => [cardId, count]),
        updatedAt: Date.now()
    };

    const index = decks.findIndex(item => item.id === stored.id);
    if (index === -1) {
        decks.push(stored);
    } else {
        decks[index] = stored;
    }

    if (!writeAll(decks)) {
        throw new Error("Nie udało się zapisać talii — pamięć przeglądarki jest niedostępna.");
    }
    return stored;
}

export function deleteDeck(id) {
    const decks = readAll().filter(deck => deck.id !== id);
    if (!writeAll(decks)) {
        throw new Error("Nie udało się usunąć talii — pamięć przeglądarki jest niedostępna.");
    }
}

/** Pusty szkielet talii dla wskazanej frakcji. */
export function newDeck(factionId) {
    const source = DECKS[factionId];
    return {
        id: null,
        version: DECK_VERSION,
        name: "Nowa talia",
        faction: factionId,
        leader: source ? source.leader : null,
        cards: [],
        updatedAt: 0
    };
}

/** Kopia talii pod nową nazwą — do edycji talii wbudowanej. */
export function duplicateDeck(deck, name) {
    return {
        id: null,
        version: DECK_VERSION,
        name: name || (deck.name + " — kopia"),
        faction: deck.faction,
        leader: deck.leader,
        cards: deck.cards.map(([cardId, count]) => [cardId, count]),
        updatedAt: 0
    };
}

/* ============================================================
   WCZYTYWANIE Z ZEWNĄTRZ
   ============================================================ */

/**
 * Sprawdza i naprawia talię z niepewnego źródła (plik, stary zapis).
 * Nieznane identyfikatory kart są POMIJANE z ostrzeżeniem, nie wywalają wczytywania —
 * dzięki temu usunięcie karty z puli nie unieważnia zapisanych talii.
 *
 * @returns {{ deck: object, warnings: string[] }}
 */
export function sanitizeDeck(raw) {
    const warnings = [];

    if (!raw || typeof raw !== "object") {
        throw new Error("To nie jest plik talii.");
    }
    if (raw.version && raw.version > DECK_VERSION) {
        warnings.push("Plik pochodzi z nowszej wersji gry (" + raw.version + ") — mogą zginąć jakieś ustawienia.");
    }
    if (!DECKS[raw.faction]) {
        throw new Error("Nieznana frakcja w pliku: " + raw.faction);
    }
    const limits = poolFor(raw.faction);
    if (!Array.isArray(raw.cards)) {
        throw new Error("Plik talii nie zawiera listy kart.");
    }

    const cards = [];
    for (const entry of raw.cards) {
        if (!Array.isArray(entry) || entry.length < 2) {
            warnings.push("Pominięto uszkodzony wpis w liście kart.");
            continue;
        }
        const [cardId, count] = entry;
        const card = CARD_BY_ID[cardId];
        if (!card) {
            warnings.push("Pominięto nieznaną kartę: " + cardId);
            continue;
        }
        const limit = limits[cardId] || 0;
        const amount = Math.min(limit, Math.max(1, Math.floor(Number(count) || 0)));
        if (amount < 1) {
            warnings.push("Pominięto " + card.name + " — karta spoza puli tej frakcji.");
            continue;
        }
        if (amount < Number(count)) {
            warnings.push(card.name + ": przycięto do " + amount + " kopii (limit frakcji).");
        }
        cards.push([cardId, amount]);
    }

    let leader = raw.leader;
    if (!LEADER_BY_ID[leader] || LEADER_BY_ID[leader].faction !== raw.faction) {
        leader = DECKS[raw.faction].leader;
        warnings.push("Nieznany lider w pliku — ustawiono domyślnego dla frakcji.");
    }

    return {
        deck: {
            id: null,
            version: DECK_VERSION,
            name: String(raw.name || "Wczytana talia").slice(0, 60),
            faction: raw.faction,
            leader: leader,
            cards: cards,
            updatedAt: 0
        },
        warnings: warnings
    };
}

/* ============================================================
   PLIK JSON
   ============================================================ */

function slug(text) {
    return String(text).toLowerCase()
        .replace(/[ąćęłńóśźż]/g, ch => ({ "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z" })[ch])
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "talia";
}

/** Pobiera talię jako plik .json. */
export function exportDeckToFile(deck) {
    const payload = {
        version: DECK_VERSION,
        name: deck.name,
        faction: deck.faction,
        leader: deck.leader,
        cards: deck.cards
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "gwint-" + slug(deck.name) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Wczytuje talię z pliku wybranego przez gracza.
 * @param {File} file
 * @returns {Promise<{ deck: object, warnings: string[] }>}
 */
export async function importDeckFromFile(file) {
    const text = await file.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error("Plik nie jest poprawnym JSON-em.");
    }
    return sanitizeDeck(parsed);
}

/* ============================================================
   TALIA WYBRANA DO GRY
   Zapamiętywana osobno, żeby gracz wybierał ją raz, a nie przed każdą partią.
   ============================================================ */

const LAST_DECK_KEY = "gwint.lastDeck.v1";

export function rememberLastDeck(deckId) {
    try {
        localStorage.setItem(LAST_DECK_KEY, deckId);
    } catch (error) {
        /* brak pamięci — trudno, gracz wybierze ponownie */
    }
}

export function recallLastDeck() {
    try {
        return localStorage.getItem(LAST_DECK_KEY);
    } catch (error) {
        return null;
    }
}

/** Skrót: talia gotowa do gry albo null, jeśli nie istnieje lub nie przechodzi walidacji. */
export function loadPlayableDeck(deckId) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    return validateDeck(deck).ok ? deck : null;
}
