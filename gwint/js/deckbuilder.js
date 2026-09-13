/**
 * gwint/js/deckbuilder.js — edytor talii.
 *
 * Importuje wyłącznie cards.js, decks-storage.js i cardview.js — żadnego Firebase,
 * więc otwarcie edytora nie loguje nikogo do bazy.
 */

import { DECKS, CARD_BY_ID, LEADERS, LEADER_BY_ID, DECK_LIMITS, PASSIVES, hasAbility, validateDeck }
    from "./cards.js";
import * as storage from "./decks-storage.js";
import { openCardPreview, openPileView, openMessage, buildCard, buildPreviewFrame, leaderCard,
         PASSIVE_TEXT } from "./cardview.js";

const FACTION_ORDER = Object.keys(DECKS);
const WEATHER = ["frost", "fog", "rain", "clearWeather"];
const ROW_ORDER = { melee: 0, ranged: 1, siege: 2 };

const FILTERS = [
    { id: "all",     name: "Wszystkie karty",             icon: "img/icons/cards.svg" },
    { id: "melee",   name: "Jednostki bliskiego starcia", icon: "img/icons/melee.svg" },
    { id: "ranged",  name: "Jednostki dystansowe",        icon: "img/icons/ranged.svg" },
    { id: "siege",   name: "Jednostki oblężnicze",        icon: "img/icons/siege.svg" },
    { id: "hero",    name: "Bohaterowie",                 icon: "img/icons/hero.svg" },
    { id: "weather", name: "Karty pogody",                icon: "img/icons/clear_weather.svg" },
    { id: "special", name: "Karty specjalne",             icon: "img/icons/scorch.svg" }
];

let deck = null;
let drafts = {};
let poolFilter = "all";
let deckFilter = "all";
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
    } else {
        setCount(cardId, current + 1);
        note("");
    }
    render();
}

function removeCard(cardId) {
    setCount(cardId, (deckCounts()[cardId] || 0) - 1);
    note("");
    render();
}

function note(text, isError = false) {
    noteText = text;
    noteError = isError;
}

/** Zwinność pasuje do obu filtrów rzędów, pogoda należy także do specjalnych. */
function matchesFilter(card, filter) {
    const unit = card.type !== "special";
    const agile = hasAbility(card, "agile");
    switch (filter) {
        case "melee":   return unit && (card.row === "melee" || agile);
        case "ranged":  return unit && (card.row === "ranged" || agile);
        case "siege":   return unit && card.row === "siege";
        case "hero":    return card.type === "hero";
        case "weather": return WEATHER.includes(card.special);
        case "special": return card.type === "special";
        default:        return true;
    }
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

/* ============================================================
   RENDEROWANIE
   ============================================================ */

function renderHeader() {
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
    select.value = deck.id || "";

    $(".name-input").value = deck.name;
    $(".delete-btn").disabled = !deck.id;
}

function renderFaction() {
    $(".factionname").textContent = DECKS[deck.faction].name;
    $(".factionpassive").textContent = PASSIVE_TEXT[PASSIVES[deck.faction]] || "";
}

function renderFilters(barSelector, nameSelector, current, onChange) {
    const bar = $(barSelector);
    bar.replaceChildren();
    for (const filter of FILTERS) {
        const button = document.createElement("button");
        button.className = "filterbtn" + (filter.id === current ? " active" : "");
        button.title = filter.name;
        const iconUrl = new URL(filter.icon, document.baseURI).href;
        button.style.setProperty("--icon", "url(\"" + iconUrl + "\")");
        button.onclick = () => onChange(filter.id);
        bar.appendChild(button);
    }
    $(nameSelector).textContent = FILTERS.find(filter => filter.id === current).name;
}

function renderLeader() {
    const slot = $(".leaderslot");
    slot.replaceChildren();

    const leader = LEADER_BY_ID[deck.leader];
    if (!leader) return;

    const frame = buildPreviewFrame(leaderCard(leader));
    frame.title = "Kliknij, aby zmienić dowódcę";
    frame.onclick = chooseLeader;
    slot.appendChild(frame);
}

function chooseLeader() {
    const options = LEADERS.filter(leader => leader.faction === deck.faction);
    openPileView(
        "Wybierz dowódcę",
        options.map(leaderCard),
        index => {
            deck.leader = options[index].id;
            render();
        },
        { dismissible: true, showCount: false }
    );
}

function renderStats() {
    let total = 0;
    let units = 0;
    let specials = 0;
    let strength = 0;
    let heroes = 0;

    for (const [cardId, count] of deck.cards) {
        const card = CARD_BY_ID[cardId];
        total += count;
        if (card.type === "special") {
            specials += count;
        } else {
            units += count;
            strength += card.strength * count;
            if (card.type === "hero") heroes += count;
        }
    }

    $(".stat-total").textContent = String(total);

    const specialsBox = $(".stat-specials");
    specialsBox.textContent = specials + " / " + DECK_LIMITS.maxSpecials;
    specialsBox.classList.toggle("bad", specials > DECK_LIMITS.maxSpecials);

    $(".stat-strength").textContent = String(strength);
    $(".stat-heroes").textContent = String(heroes);
}

function tile(cardId, count, hint, onConfirm) {
    const card = CARD_BY_ID[cardId];
    const element = buildCard(card, { count: count, clickable: true });
    element.onclick = () => openCardPreview({ card: card, hint: hint, onConfirm: onConfirm });
    return element;
}

function renderPanels() {
    const limits = storage.poolFor(deck.faction);
    const inDeck = deckCounts();

    const pool = $(".pool-grid");
    pool.replaceChildren();
    const poolIds = Object.keys(limits)
        .filter(cardId => limits[cardId] - (inDeck[cardId] || 0) > 0)
        .filter(cardId => matchesFilter(CARD_BY_ID[cardId], poolFilter));
    for (const cardId of sortIds(poolIds)) {
        const left = limits[cardId] - (inDeck[cardId] || 0);
        pool.appendChild(tile(cardId, left, "Kliknij kartę, aby dodać do talii", () => addCard(cardId)));
    }
    if (poolIds.length === 0) {
        pool.textContent = "Brak kart dla tego filtra.";
    }

    const deckGrid = $(".deck-grid");
    deckGrid.replaceChildren();
    const deckIds = Object.keys(inDeck)
        .filter(cardId => inDeck[cardId] > 0)
        .filter(cardId => matchesFilter(CARD_BY_ID[cardId], deckFilter));
    for (const cardId of sortIds(deckIds)) {
        deckGrid.appendChild(tile(cardId, inDeck[cardId], "Kliknij kartę, aby usunąć z talii", () => removeCard(cardId)));
    }
    if (deckIds.length === 0) {
        deckGrid.textContent = deck.cards.length === 0
            ? "Talia jest pusta — klikaj karty z kolekcji."
            : "Brak kart dla tego filtra.";
    }
}

function render() {
    renderHeader();
    renderFaction();
    renderFilters(".pool-filters", ".pool-filtername", poolFilter, id => { poolFilter = id; render(); });
    renderFilters(".deck-filters", ".deck-filtername", deckFilter, id => { deckFilter = id; render(); });
    renderLeader();
    renderStats();
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
    drafts = {};
    poolFilter = "all";
    deckFilter = "all";
    note("");
    render();
}

function startNewDeck(factionId) {
    deck = storage.newDeck(factionId || FACTION_ORDER[0]);
    drafts = {};
    poolFilter = "all";
    deckFilter = "all";
    note("Nowa talia — wybierz karty z kolekcji.");
    render();
}

function switchFaction(step) {
    drafts[deck.faction] = { cards: deck.cards, leader: deck.leader };

    const index = FACTION_ORDER.indexOf(deck.faction);
    const next = FACTION_ORDER[(index + step + FACTION_ORDER.length) % FACTION_ORDER.length];
    const draft = drafts[next];

    deck.faction = next;
    deck.cards = draft ? draft.cards : [];
    deck.leader = draft ? draft.leader : DECKS[next].leader;
    poolFilter = "all";
    deckFilter = "all";
    note("");
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
            const faction = deck.faction;
            storage.deleteDeck(deck.id);
            startNewDeck(faction);
            note("Talia usunięta.");
        } catch (error) {
            note(error.message, true);
        }
        render();
    };

    $(".name-input").oninput = event => { deck.name = event.target.value; };

    $(".save-btn").onclick = () => {
        const errors = validateDeck(deck).errors;
        if (errors.length > 0) {
            openMessage("Nie można zapisać talii", errors.join("\n"));
            return;
        }
        try {
            deck = storage.saveDeck(deck);
            note("Zapisano talię „" + deck.name + "”.");
        } catch (error) {
            note(error.message, true);
        }
        render();
    };

    $(".faction-prev").onclick = () => switchFaction(-1);
    $(".faction-next").onclick = () => switchFaction(1);

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
            drafts = {};
            poolFilter = "all";
            deckFilter = "all";
            note(result.warnings.length
                ? "Wczytano z zastrzeżeniami: " + result.warnings.join(" ")
                : "Wczytano talię „" + deck.name + "”. Kliknij Zapisz, żeby ją zachować.",
                result.warnings.length > 0);
        } catch (error) {
            note(error.message, true);
        }
        render();
    };

    // Hash z kodem stołu oddajemy z powrotem, żeby wrócić na swoje miejsce
    $(".back-btn").onclick = () => { location.href = "./index.html" + location.hash; };
    const footerLink = document.querySelector("footer a[href='./index.html']");
    if (footerLink) {
        footerLink.href = "./index.html" + location.hash;
    }
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
        deck = storage.newDeck(FACTION_ORDER[0]);
        note("Nie masz jeszcze talii — zbuduj pierwszą.");
    }
    render();
});
