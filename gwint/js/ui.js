/**
 * gwint/js/ui.js — renderowanie stanu i obsługa wejścia.
 *
 * Nie zawiera reguł gry. Każdy ruch to wywołanie funkcji z engine.js
 * opakowane w transakcję przez net.applyMove().
 */

import * as net from "./net.js";
import * as engine from "./engine.js";
import { DECKS, PASSIVES, LEADER_BY_ID, ROWS, hasAbility } from "./cards.js";

const PASSIVE_TEXT = {
    drawOnRoundWin:  "Dobiera 1 kartę po wygranej rundzie",
    winsDraws:       "Wygrywa rundę w przypadku remisu",
    choosesStarter:  "Decyduje, kto zaczyna rundę",
    keepsRandomUnit: "Po rundzie zostawia na planszy losową jednostkę",
    resurrectRound3: "Na początku 3. rundy wskrzesza 2 karty"
};

const ROW_NAME = { melee: "Wręcz", ranged: "Dystansowy", siege: "Oblężniczy" };
const WEATHER_NAME = { frost: "Trzaskający Mróz", fog: "Nieprzenikliwa Mgła", rain: "Ulewny Deszcz" };

let view = null;            // ostatni stan z net.onRoomChange
let selected = null;        // { iid, needs: "row" | "target" }
let leaderNeedsRow = false; // lider czeka na wskazanie rzędu
let showGrave = false;
let busy = false;
let errorText = "";

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

/* ============================================================
   POMOCNICZE
   ============================================================ */

function activeScreen() {
    return $(".screen.active");
}

function note(text, isError = false) {
    const screen = activeScreen();
    if (!screen) return;
    const element = screen.querySelector(".noteshower");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", isError);
}

function setBusy(value) {
    busy = value;
    $(".loader").classList.toggle("active", value);
    render();
}

function showScreen(name) {
    $$(".screen").forEach(screen => screen.classList.remove("active"));
    $("." + name + "-screen").classList.add("active");
}

/** Wykonuje ruch przez silnik i zapisuje transakcją. */
async function submit(action) {
    if (busy) return;
    errorText = "";
    setBusy(true);
    try {
        await net.applyMove(action);
        selected = null;
        leaderNeedsRow = false;
    } catch (error) {
        errorText = error.message;
        console.error(error);
    } finally {
        setBusy(false);
    }
}

function mySeat() {
    return net.getSeat();
}

function bottomSide() {
    return mySeat() || "A";
}

function topSide() {
    return engine.opposite(bottomSide());
}

/* ============================================================
   BUDOWANIE KART
   ============================================================ */

function tagsOf(card) {
    const tags = [];
    if (card.type === "hero") tags.push("BOHATER");
    if (card.type === "special") tags.push("SPEC");
    if (hasAbility(card, "tightBond")) tags.push("Więź");
    if (hasAbility(card, "moraleBoost")) tags.push("Morale");
    if (hasAbility(card, "muster")) tags.push("Zgrup");
    if (hasAbility(card, "spy")) tags.push("Szpieg");
    if (hasAbility(card, "medic")) tags.push("Medyk");
    if (hasAbility(card, "horn")) tags.push("Róg");
    return tags.join(" ");
}

/**
 * @param {string} iid
 * @param {{ strength?: number|string, clickable?: boolean, selected?: boolean, subtitle?: string }} options
 */
function cardElement(iid, options = {}) {
    const card = engine.cardOf(iid);
    const element = document.createElement("div");
    element.className = "card";
    element.dataset.iid = iid;

    if (card.type === "hero") element.classList.add("hero");
    if (card.type === "special") element.classList.add("special");
    if (hasAbility(card, "spy")) element.classList.add("spy");
    if (options.clickable) element.classList.add("clickable");
    if (options.selected) element.classList.add("selected");

    const shown = options.strength !== undefined ? options.strength : card.strength;
    if (typeof shown === "number" && card.type === "unit") {
        if (shown > card.strength) element.classList.add("boosted");
        if (shown < card.strength) element.classList.add("weakened");
    }

    const strength = document.createElement("div");
    strength.className = "strength";
    strength.textContent = card.type === "special" ? "—" : String(shown);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = card.name;

    const tags = document.createElement("div");
    tags.className = "tags";
    tags.textContent = options.subtitle !== undefined ? options.subtitle : tagsOf(card);

    element.append(strength, name, tags);
    element.title = card.name + (card.row ? " — " + ROW_NAME[card.row] : "") + "\n" + tagsOf(card);
    return element;
}

/* ============================================================
   EKRAN: WYBÓR FRAKCJI
   ============================================================ */

function renderSetup() {
    const state = view.state;
    const seat = mySeat();

    $(".codeshower").textContent = view.code;

    const list = $(".faction-list");
    list.replaceChildren();
    for (const factionId of Object.keys(DECKS)) {
        const deck = DECKS[factionId];
        const item = document.createElement("div");
        item.className = "faction";
        if (state.faction[seat] === factionId) item.classList.add("selected");

        const name = document.createElement("div");
        name.className = "fname";
        name.textContent = deck.name;

        const passive = document.createElement("div");
        passive.className = "fpassive";
        passive.textContent = PASSIVE_TEXT[PASSIVES[factionId]] || "";

        item.append(name, passive);
        item.onclick = () => {
            if (state.ready[seat]) {
                note("Cofnij gotowość, żeby zmienić frakcję.", true);
                return;
            }
            submit((s, side) => engine.chooseFaction(s, side, factionId));
        };
        list.appendChild(item);
    }

    const leaderBox = $(".leader-info");
    const leader = LEADER_BY_ID[state.leader[seat]];
    leaderBox.textContent = leader
        ? "Lider: " + leader.name + " — " + leader.text
        : "Wybierz frakcję, żeby zobaczyć lidera.";

    const readyBtn = $(".ready-btn");
    readyBtn.textContent = state.ready[seat] ? "Cofnij gotowość" : "Gotowy";
    readyBtn.disabled = !state.faction[seat];

    const opponent = engine.opposite(seat);
    if (!view.players[opponent]) {
        note("Czekam na drugiego gracza. Podaj mu kod: " + view.code);
    } else if (state.ready[opponent]) {
        note("Przeciwnik jest gotowy.");
    } else {
        note("Przeciwnik wybiera frakcję...");
    }
}

/* ============================================================
   EKRAN: MULLIGAN
   ============================================================ */

function renderMulligan() {
    const state = view.state;
    const seat = mySeat();

    $(".mulligan-info").textContent = state.mulliganDone[seat]
        ? "Wymiana zakończona"
        : "Możesz wymienić jeszcze " + state.mulliganLeft[seat] + " kart(y)";

    const hand = $(".mulligan-hand");
    hand.replaceChildren();
    const canSwap = !state.mulliganDone[seat] && state.mulliganLeft[seat] > 0;
    for (const iid of state.hand[seat]) {
        const element = cardElement(iid, { clickable: canSwap });
        if (canSwap) {
            element.onclick = () => submit((s, side) => engine.mulligan(s, side, iid));
        }
        hand.appendChild(element);
    }

    $(".mulligan-done-btn").disabled = state.mulliganDone[seat];
    note(state.mulliganDone[seat] ? "Czekam na przeciwnika..." : "");
}

/* ============================================================
   EKRAN: GRA
   ============================================================ */

function myTurn() {
    const state = view.state;
    const seat = mySeat();
    return state.status === "playing"
        && state.turn === seat
        && !state.pending
        && !state.passed[seat];
}

function renderScoreboard() {
    const state = view.state;
    const top = topSide();
    const bottom = bottomSide();

    const fill = (selector, side) => {
        const box = $(selector);
        const deck = DECKS[state.faction[side]];
        box.querySelector(".playerfaction").textContent = deck ? deck.name : "—";
        box.querySelector(".total").textContent = String(engine.sideScore(state, side));
        box.classList.toggle("active", state.turn === side && state.status === "playing");
        box.classList.toggle("passed", state.passed[side]);

        const lives = box.querySelector(".lives");
        lives.replaceChildren();
        for (let i = 0; i < 2; i++) {
            const dot = document.createElement("span");
            dot.className = "life" + (i < state.lives[side] ? " on" : "");
            lives.appendChild(dot);
        }

        const parts = [];
        if (state.passed[side]) parts.push("spasował");
        if (state.leaderUsed[side]) parts.push("lider zużyty");
        parts.push("ręka: " + state.hand[side].length);
        parts.push("talia: " + state.deck[side].length);
        parts.push("cmentarz: " + state.grave[side].length);
        box.querySelector(".playerstate").textContent = parts.join(" · ");
    };

    fill(".player-top", top);
    fill(".player-bottom", bottom);

    $(".roundnumber").textContent = "Runda " + state.round;

    let turnText = "—";
    if (state.status === "playing") {
        turnText = state.pending ? "Oczekiwanie na wybór"
            : (state.turn === bottom ? "Twój ruch" : "Ruch przeciwnika");
    } else if (state.status === "roundEnd") {
        turnText = "Koniec rundy";
    } else if (state.status === "finished") {
        turnText = "Koniec gry";
    }
    $(".turninfo").textContent = turnText;

    const weather = Object.keys(WEATHER_NAME).filter(key => state.weather[key]);
    $(".weatherbar").textContent = weather.length
        ? "Pogoda: " + weather.map(key => WEATHER_NAME[key]).join(", ")
        : "";

    $(".historyinfo").textContent = state.history
        .map(entry => "R" + entry.round + " " + entry.A + ":" + entry.B)
        .join("  ");
}

function renderBoard() {
    const state = view.state;
    const sideFor = pos => (pos === "top" ? topSide() : bottomSide());

    for (const rowElement of $$(".row")) {
        const pos = rowElement.dataset.pos;
        const row = rowElement.dataset.row;
        const side = sideFor(pos);

        rowElement.classList.toggle("weathered",
            (state.weather.frost && row === "melee")
            || (state.weather.fog && row === "ranged")
            || (state.weather.rain && row === "siege"));

        const hornActive = state.horn[side][row]
            || state.board[side][row].some(iid => hasAbility(engine.cardOf(iid), "horn"));
        rowElement.querySelector(".rowhorn").textContent = hornActive ? "♪ Róg" : "";
        rowElement.querySelector(".rowscore").textContent =
            String(engine.rowScore(state, side, row));

        // Podświetlenie rzędu jako celu — tylko własna połowa
        const rowTargetable = pos === "bottom" && myTurn()
            && ((selected && selected.needs === "row") || leaderNeedsRow);
        rowElement.classList.toggle("targetable", rowTargetable);

        const container = rowElement.querySelector(".rowcards");
        container.replaceChildren();
        for (const iid of state.board[side][row]) {
            const card = engine.cardOf(iid);
            const canTarget = pos === "bottom"
                && selected && selected.needs === "target"
                && card.type === "unit"
                && myTurn();
            const element = cardElement(iid, {
                strength: engine.cardStrength(state, side, row, iid),
                clickable: canTarget
            });
            if (canTarget) {
                element.onclick = event => {
                    event.stopPropagation();
                    submit((s, seat) => engine.playCard(s, seat, selected.iid, { targetIid: iid }));
                };
            }
            container.appendChild(element);
        }
    }
}

function needsOf(card) {
    if (card.special === "horn") return "row";
    if (card.special === "decoy") return "target";
    return null;
}

function renderHand() {
    const state = view.state;
    const seat = mySeat();
    const hand = $(".game-hand");
    hand.replaceChildren();

    for (const iid of state.hand[seat]) {
        const card = engine.cardOf(iid);
        const clickable = myTurn();
        const element = cardElement(iid, {
            clickable: clickable,
            selected: selected && selected.iid === iid,
            subtitle: card.row ? ROW_NAME[card.row] : tagsOf(card)
        });
        if (clickable) {
            element.onclick = () => onHandCard(iid);
        }
        hand.appendChild(element);
    }
}

function onHandCard(iid) {
    const card = engine.cardOf(iid);
    const needs = needsOf(card);

    if (selected && selected.iid === iid) {
        selected = null;
        render();
        return;
    }
    if (needs === null) {
        submit((s, seat) => engine.playCard(s, seat, iid));
        return;
    }
    selected = { iid: iid, needs: needs };
    leaderNeedsRow = false;
    render();
}

function renderControls() {
    const state = view.state;
    const seat = mySeat();
    const leader = LEADER_BY_ID[state.leader[seat]];

    const leaderBtn = $(".leader-btn");
    leaderBtn.disabled = !myTurn() || state.leaderUsed[seat] || !leader;
    leaderBtn.textContent = leader ? "Lider: " + leader.text : "Zdolność lidera";

    $(".pass-btn").disabled = !myTurn();
    $(".grave-btn").textContent = showGrave ? "Ukryj cmentarz" : "Cmentarz";
}

function renderGraves() {
    const state = view.state;
    $(".gravepanel").classList.toggle("hidden", !showGrave);
    if (!showGrave) return;

    const side = bottomSide();
    const column = $(".grave-mine");
    column.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "gravetitle";
    heading.textContent = "Twój cmentarz — " + state.grave[side].length + " kart";

    const cards = document.createElement("div");
    cards.className = "gravecards";
    for (const iid of state.grave[side]) {
        cards.appendChild(cardElement(iid));
    }
    column.append(heading, cards);
}

function renderPrompt() {
    const state = view.state;
    const seat = mySeat();
    const box = $(".prompt");
    box.replaceChildren();
    box.classList.add("hidden");

    const open = (text) => {
        box.classList.remove("hidden");
        const label = document.createElement("div");
        label.className = "promptext";
        label.textContent = text;
        box.appendChild(label);
        const rowBox = document.createElement("div");
        rowBox.className = "promptrow";
        box.appendChild(rowBox);
        return rowBox;
    };

    const button = (parent, text, handler) => {
        const element = document.createElement("button");
        element.textContent = text;
        element.onclick = handler;
        parent.appendChild(element);
        return element;
    };

    if (state.status === "finished") {
        const result = state.winner === "draw" ? "Remis!"
            : (state.winner === seat ? "Wygrywasz całą grę!" : "Przegrywasz grę.");
        const row = open(result + "  Wynik rund: "
            + state.history.map(h => h.A + ":" + h.B).join(", "));
        button(row, "Wróć do lobby", () => { net.leaveRoom(); view = null; render(); });
        return;
    }

    if (state.pending) {
        if (state.pending.side !== seat) {
            open("Przeciwnik dokonuje wyboru...");
            return;
        }
        if (state.pending.kind === "starter") {
            const row = open("Scoia'tael: zdecyduj, kto zaczyna pierwszą rundę.");
            button(row, "Ja zaczynam", () => submit((s, side) => engine.resolvePending(s, side, seat)));
            button(row, "Przeciwnik zaczyna", () =>
                submit((s, side) => engine.resolvePending(s, side, engine.opposite(seat))));
            return;
        }
        if (state.pending.kind === "medic") {
            const row = open("Medyk: wskrzesz jednostkę z cmentarza.");
            for (const iid of state.pending.options) {
                const element = cardElement(iid, { clickable: true });
                element.onclick = () => submit((s, side) => engine.resolvePending(s, side, iid));
                row.appendChild(element);
            }
            button(row, "Pomiń", () => submit((s, side) => engine.resolvePending(s, side, "skip")));
            return;
        }
    }

    if (state.status === "roundEnd") {
        const last = state.history[state.history.length - 1];
        const outcome = last.winner === "draw" ? "Remis"
            : (last.winner === seat ? "Wygrywasz rundę" : "Przegrywasz rundę");
        const row = open("Runda " + last.round + ": " + last.A + " — " + last.B + ". " + outcome + ".");
        const next = button(row, "Dalej", () => submit((s, side) => engine.acknowledgeRound(s, side)));
        if (state.ready[seat]) {
            next.disabled = true;
            next.textContent = "Czekam na przeciwnika...";
        }
        return;
    }

    if (leaderNeedsRow) {
        const row = open("Wskaż rząd po swojej stronie dla zdolności lidera.");
        button(row, "Anuluj", () => { leaderNeedsRow = false; render(); });
        return;
    }

    if (selected) {
        const card = engine.cardOf(selected.iid);
        const text = selected.needs === "row"
            ? card.name + ": wskaż rząd po swojej stronie."
            : card.name + ": wskaż swoją jednostkę do zamiany (bohaterów nie można).";
        const row = open(text);
        button(row, "Anuluj", () => { selected = null; render(); });
    }
}

/* ============================================================
   GŁÓWNE RENDEROWANIE
   ============================================================ */

function render() {
    // Reset — renderery poniżej ustawiają stany przycisków od nowa
    $$("button").forEach(button => { button.disabled = false; });

    if (!view) {
        showScreen("lobby");
    } else {
        const status = view.state.status;
        if (status === "lobby") {
            showScreen("setup");
            renderSetup();
        } else if (status === "mulligan") {
            showScreen("mulligan");
            renderMulligan();
        } else {
            showScreen("game");
            renderScoreboard();
            renderBoard();
            renderHand();
            renderControls();
            renderGraves();
            renderPrompt();
        }
        $(".logtext").textContent = view.state.log.join("\n");
    }

    if (busy) {
        const screen = activeScreen();
        if (screen) {
            screen.querySelectorAll("button").forEach(button => { button.disabled = true; });
        }
    }
    if (errorText) {
        note(errorText, true);
    }
}

/* ============================================================
   OBSŁUGA WEJŚCIA
   ============================================================ */

function bindEvents() {
    $(".create-btn").onclick = async () => {
        setBusy(true);
        try {
            await net.createRoom();
        } catch (error) {
            note(error.message, true);
        } finally {
            setBusy(false);
        }
    };

    $(".join-btn").onclick = () => joinFromInput();
    $(".code-input").addEventListener("keydown", event => {
        if (event.key === "Enter") joinFromInput();
    });

    $(".codeshower").onclick = () => {
        if (!view || !navigator.clipboard) return;
        navigator.clipboard.writeText(view.code).then(() => note("Skopiowano kod: " + view.code));
    };

    $(".ready-btn").onclick = () => {
        const seat = mySeat();
        const value = !view.state.ready[seat];
        submit((s, side) => engine.setReady(s, side, value));
    };

    $(".mulligan-done-btn").onclick = () => submit((s, side) => engine.finishMulligan(s, side));

    $(".pass-btn").onclick = () => submit((s, side) => engine.pass(s, side));

    $(".leader-btn").onclick = () => {
        const leader = LEADER_BY_ID[view.state.leader[mySeat()]];
        if (!leader) return;
        if (leader.ability === "horn") {
            leaderNeedsRow = true;
            selected = null;
            render();
            return;
        }
        submit((s, side) => engine.useLeader(s, side));
    };

    $(".grave-btn").onclick = () => { showGrave = !showGrave; render(); };

    $$(".leave-btn").forEach(button => {
        button.onclick = () => { net.leaveRoom(); view = null; selected = null; render(); };
    });

    $(".log-toggle").onclick = () => $(".logpanel").classList.toggle("collapsed");

    // Kliknięcie w rząd — cel dla Rogu Dowódcy albo zdolności lidera
    $(".board").addEventListener("click", event => {
        const rowElement = event.target.closest(".row");
        if (!rowElement || !rowElement.classList.contains("targetable")) return;
        const row = rowElement.dataset.row;

        if (selected && selected.needs === "row") {
            submit((s, seat) => engine.playCard(s, seat, selected.iid, { row: row }));
        } else if (leaderNeedsRow) {
            submit((s, seat) => engine.useLeader(s, seat, { row: row }));
        }
    });
}

async function joinFromInput() {
    const code = $(".code-input").value.trim().toUpperCase();
    setBusy(true);
    try {
        await net.joinRoom(code);
    } catch (error) {
        note(error.message, true);
    } finally {
        setBusy(false);
    }
}

/* ============================================================
   START
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    setBusy(true);

    net.onRoomChange(incoming => {
        view = incoming;
        if (!view) {
            selected = null;
            leaderNeedsRow = false;
        }
        render();
    });

    try {
        await net.connect();
        net.cleanOldRooms();

        const codeFromUrl = location.hash.replace("#", "").toUpperCase();
        if (codeFromUrl.length === 5) {
            await net.joinRoom(codeFromUrl);
        }
    } catch (error) {
        note(error.message, true);
        console.error(error);
    } finally {
        setBusy(false);
    }
});
