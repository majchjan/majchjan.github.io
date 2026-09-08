/**
 * gwint/js/deckbuilder.js — edytor talii.
 *
 * Lewy panel: karty dostępne w puli frakcji (pomniejszone o to, co już jest w talii).
 * Prawy panel: aktualna talia. Kliknięcie przerzuca jeden egzemplarz na drugą stronę.
 *
 * Importuje wyłącznie cards.js i decks-storage.js — żadnego Firebase,
 * więc otwarcie edytora nie loguje nikogo do bazy.
 */

import { DECKS, CARD_BY_ID, LEADERS, LEADER_BY_ID, DECK_LIMITS, hasAbility, validateDeck } from "./cards.js";
import * as storage from "./decks-storage.js";
import { openCardPreview, describeCard, buildCard } from "./cardview.js";

const ROW_NAME = { melee: "Wręcz", ranged: "Dystansowy", siege: "Oblężniczy" };
const ROW_ORDER = { melee: 0, ranged: 1, siege: 2 };

let deck = null;        // edytowana talia
let noteText = "";
let noteError = false;

const $ = selector => document.querySelector(selector);

/* ============================================================
   MODEL
   ============================================================ */

function deckCounts() {
    const counts = {};
    for (const [cardId, count] of deck.cards) {
        counts[cardId] = count;
    }
    return counts;
}

function setCount(cardId, count) {
    const others = deck.cards.filter(([id]) => id !== cardId);
    deck.cards = count > 0 ? [...others, [cardId, count]] : others;
}

function addCard(cardId) {
    const limit = storage.maxCopies(deck.faction, cardId);
    const current = deckCounts()[cardId] || 0;
    if (current >= limit) {
        note("Limit egzemplarzy tej karty: " + limit, true);
        return;
    }
    setCount(cardId, current + 1);
    note("");
    render();
}

function removeCard(cardId) {
    const current = deckCounts()[cardId] || 0;
    setCount(cardId, current - 1);
    note("");
    render();
}

function sortIds(ids) {
    return ids.slice().sort((a, b) => {
        const cardA = CARD_BY_ID[a];
        const cardB = CARD_BY_ID[b];
        const groupA = cardA.type === "special" ? 3 : ROW_ORDER[cardA.row];
        const groupB = cardB.type === "special" ? 3 : ROW_ORDER[cardB.row];
        if (groupA !== groupB) return groupA - groupB;
        if (cardB.strength !== cardA.strength) return cardB.strength - cardA.strength;
        return cardA.name.localeCompare(cardB.name, "pl");
    });
}

function note(text, isError = false) {
    noteText = text;
    noteError = isError;
}

/* ============================================================
   KARTY
   ============================================================ */

function cardElement(cardId, count, onClick) {
    const element = buildCard(CARD_BY_ID[cardId], { count: count });
    element.onclick = onClick;
    return element;
}

/* ============================================================
   RENDEROWANIE
   ============================================================ */

function renderDeckSelect() {
    const select = $(".deck-select");
    const saved = storage.listDecks();
    select.replaceChildren();

    if (saved.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "— brak zapisanych talii —";
        select.appendChild(option);
    }
    for (const item of saved) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    }
    select.value = deck && deck.id ? deck.id : "";
    $(".delete-btn").disabled = !(deck && deck.id);
}

function renderHeader() {
    $(".name-input").value = deck.name;

    const factionSelect = $(".faction-select");
    factionSelect.replaceChildren();
    for (const factionId of Object.keys(DECKS)) {
        const option = document.createElement("option");
        option.value = factionId;
        option.textContent = DECKS[factionId].name;
        factionSelect.appendChild(option);
    }
    factionSelect.value = deck.faction;

    const leaderSelect = $(".leader-select");
    leaderSelect.replaceChildren();
    const available = LEADERS.filter(leader => leader.faction === deck.faction);
    for (const leader of available) {
        const option = document.createElement("option");
        option.value = leader.id;
        option.textContent = leader.name;
        leaderSelect.appendChild(option);
    }
    if (!available.some(leader => leader.id === deck.leader) && available.length > 0) {
        deck.leader = available[0].id;
    }
    leaderSelect.value = deck.leader || "";

    const leader = LEADER_BY_ID[deck.leader];
    $(".leadertext").textContent = leader ? "Zdolność: " + leader.text : "";
}

function renderValidation() {
    const box = $(".validation");
    const result = validateDeck(deck);

    let units = 0;
    let specials = 0;
    for (const [cardId, count] of deck.cards) {
        if (CARD_BY_ID[cardId].type === "special") {
            specials += count;
        } else {
            units += count;
        }
    }

    const lines = [
        "Jednostki: " + units + " / min. " + DECK_LIMITS.minUnits
            + "   ·   Karty specjalne: " + specials + " / maks. " + DECK_LIMITS.maxSpecials
            + "   ·   Razem: " + (units + specials)
    ];
    lines.push(...result.errors.map(text => "BŁĄD: " + text));
    lines.push(...result.warnings.map(text => "Uwaga: " + text));
    if (result.ok && result.warnings.length === 0) {
        lines.push("Talia gotowa do gry.");
    }

    box.textContent = lines.join("\n");
    box.style.whiteSpace = "pre-line";
    box.classList.toggle("ok", result.ok);
    box.classList.toggle("bad", !result.ok);
}

function renderPanels() {
    const limits = storage.poolFor(deck.faction);
    const inDeck = deckCounts();

    const preview = (cardId, hint, onConfirm) => openCardPreview({
        card: CARD_BY_ID[cardId],
        hint: hint,
        onConfirm: onConfirm
    });

    const poolGrid = $(".pool-grid");
    poolGrid.replaceChildren();
    const availableIds = Object.keys(limits).filter(cardId => (limits[cardId] - (inDeck[cardId] || 0)) > 0);
    for (const cardId of sortIds(availableIds)) {
        const left = limits[cardId] - (inDeck[cardId] || 0);
        poolGrid.appendChild(cardElement(cardId, left,
            () => preview(cardId, "Kliknij kartę, aby dodać do talii", () => addCard(cardId))));
    }
    if (availableIds.length === 0) {
        poolGrid.textContent = "Wszystkie karty p uli są w talii.";
    }

    const deckGrid = $(".deck-grid");
    deckGrid.replaceChildren();
    const deckIds = Object.keys(inDeck).filter(cardId => inDeck[cardId] > 0);
    for (const cardId of sortIds(deckIds)) {
        deckGrid.appendChild(cardElement(cardId, inDeck[cardId],
            () => preview(cardId, "Kliknij kartę, aby usunąć z talii", () => removeCard(cardId))));
    }
    if (deckIds.length === 0) {
        deckGrid.textContent = "Talia jest pusta — klikaj karty po lewej.";
    }
}

function render() {
    renderDeckSelect();
    renderHeader();
    renderValidation();
    renderPanels();

    const noteBox = $(".builder-note");
    noteBox.textContent = noteText;
    noteBox.classList.toggle("error", noteError);
}

/* ============================================================
   AKCJE
   ============================================================ */

function loadDeck(id) {
    const loaded = storage.getDeck(id);
    if (!loaded) return;
    deck = loaded;
    note("");
    render();
}

function startNewDeck(factionId) {
    deck = storage.newDeck(factionId || Object.keys(DECKS)[0]);
    note("Nowa talia — wybierz karty po lewej.");
    render();
}

function bindEvents() {
    $(".deck-select").onchange = event => {
        if (event.target.value) loadDeck(event.target.value);
    };

    $(".new-btn").onclick = () => startNewDeck(deck ? deck.faction : null);

    $(".delete-btn").onclick = () => {
        if (!deck.id) return;
        if (!confirm("Usunąć talię „" + deck.name + "”?")) return;
        try {
            storage.deleteDeck(deck.id);
            startNewDeck(deck.faction);
            note("Talia usunięta.");
            render();
        } catch (error) {
            note(error.message, true);
            render();
        }
    };

    $(".name-input").oninput = event => { deck.name = event.target.value; };

    $(".faction-select").onchange = event => {
        const factionId = event.target.value;
        if (deck.cards.length > 0 && !confirm("Zmiana frakcji wyczyści zawartość talii. Kontynuować?")) {
            event.target.value = deck.faction;
            return;
        }
        deck.faction = factionId;
        deck.cards = [];
        deck.leader = DECKS[factionId].leader;
        note("Zmieniono frakcję — talia wyczyszczona.");
        render();
    };

    $(".leader-select").onchange = event => {
        deck.leader = event.target.value;
        render();
    };

    $(".save-btn").onclick = () => {
        try {
            deck = storage.saveDeck(deck);
            note("Zapisano talię „" + deck.name + "”.");
        } catch (error) {
            note(error.message, true);
        }
        render();
    };

    $(".export-btn").onclick = () => {
        try {
            storage.exportDeckToFile(deck);
            note("Pobrano plik talii.");
        } catch (error) {
            note(error.message, true);
        }
        render();
    };

    $(".import-btn").onclick = () => $(".import-input").click();

    $(".import-input").onchange = async event => {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        try {
            const result = await storage.importDeckFromFile(file);
            deck = result.deck;
            note(result.warnings.length
                ? "Wczytano z zastrzeżeniami: " + result.warnings.join(" ")
                : "Wczytano talię „" + deck.name + "”. Kliknij Zapisz, żeby ją zachować.",
                result.warnings.length > 0);
        } catch (error) {
            note(error.message, true);
        }
        render();
    };

    $(".back-btn").onclick = () => { location.href = "./index.html"; };
}

/* ============================================================
   START
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    const saved = storage.listDecks();
    if (saved.length > 0) {
        deck = saved[0];
    } else {
        deck = storage.newDeck(Object.keys(DECKS)[0]);
        note("Nie masz jeszcze talii — zbuduj pierwszą.");
    }
    render();
});
