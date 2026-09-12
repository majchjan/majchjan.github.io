/**
 * gwint/js/ui.js — renderowanie stanu i obsługa wejścia.
 *
 * Nie zawiera reguł gry. Każdy ruch to wywołanie funkcji z engine.js
 * opakowane w transakcję przez net.applyMove().
 */

import * as net from "./net.js";
import * as engine from "./engine.js";
import { DECKS, PASSIVES, LEADER_BY_ID, ROWS, hasAbility, validateDeck } from "./cards.js";
import * as storage from "./decks-storage.js";
import { openCardPreview, openPileView, describeCard, buildCard, leaderCard,
         backArtUrl, enableDragScroll } from "./cardview.js";

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
let chosenDeckId = null;
let deckAutoTried = false;
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
        maybeAutoFinishMulligan();   // druga wymiana kończy fazę bez klikania przycisku
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

function cardElement(iid, options = {}) {
    const element = buildCard(engine.cardOf(iid), options);
    element.dataset.iid = iid;

    const move = view && view.state.lastMove;
    if (move && move.iids.includes(iid)) {
        element.classList.add("justplayed");
    }
    return element;
}

/** Otwiera powiększony podgląd karty. onConfirm wykonuje się po kliknięciu karty. */
function openPreview(iid, strength, hint, onConfirm) {
    openCardPreview({
        card: engine.cardOf(iid),
        strength: strength,
        hint: hint,
        onConfirm: onConfirm
    });
}

/* ============================================================
   EKRAN: WYBÓR FRAKCJI
   ============================================================ */

function renderSetup() {
    const state = view.state;
    const seat = mySeat();

    $(".codeshower").textContent = view.code;

    const select = $(".deck-select");
    const decks = storage.listDecks();
    select.replaceChildren();

    if (decks.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "— nie masz zapisanych talii —";
        select.appendChild(option);
    }
    for (const item of decks) {
        const option = document.createElement("option");
        option.value = item.id;
        const check = validateDeck(item);
        option.textContent = item.name + (check.ok ? "" : "  (niezgodna z zasadami)");
        option.disabled = !check.ok;
        select.appendChild(option);
    }
    select.value = chosenDeckId || "";
    select.disabled = state.ready[seat];

    const leaderBox = $(".leader-info");
    leaderBox.style.whiteSpace = "pre-line";
    const leader = LEADER_BY_ID[state.leader[seat]];
    const pool = DECKS[state.faction[seat]];
    leaderBox.textContent = leader && pool
        ? pool.name + "\nDowódca: " + leader.name + " — " + leader.text
          + "\nPasywka: " + (PASSIVE_TEXT[PASSIVES[state.faction[seat]]] || "—")
        : "Wybierz talię, żeby zobaczyć frakcję i dowódcę.";

    const readyBtn = $(".ready-btn");
    readyBtn.textContent = state.ready[seat] ? "Cofnij gotowość" : "Gotowy";
    readyBtn.disabled = !state.deckList[seat];

    const opponent = engine.opposite(seat);
    if (decks.length === 0) {
        note("Zbuduj najpierw talię w edytorze.", true);
    } else if (!view.players[opponent]) {
        note("Czekam na drugiego gracza. Podaj mu kod: " + view.code);
    } else if (state.ready[opponent]) {
        note("Przeciwnik jest gotowy.");
    } else {
        note("Przeciwnik wybiera talię...");
    }
}

/** Podstawia ostatnio używaną talię, żeby wybierać ją raz, a nie przed każdą partią. */
function maybeAutoPickDeck() {
    if (!view || view.state.status !== "lobby") return;
    const seat = mySeat();
    if (!seat || deckAutoTried || view.state.deckList[seat]) return;

    deckAutoTried = true;
    const remembered = storage.recallLastDeck();
    if (!remembered) return;
    const deck = storage.loadPlayableDeck(remembered);
    if (!deck) return;

    chosenDeckId = deck.id;
    submit((s, side) => engine.chooseDeck(s, side, deck));
}

/** Po zużyciu obu wymian nie ma już czego wybierać — kończymy mulligan sami. */
function maybeAutoFinishMulligan() {
    if (!view || view.state.status !== "mulligan") return;
    const seat = mySeat();
    if (!seat) return;
    if (view.state.mulliganDone[seat]) return;
    if (view.state.mulliganLeft[seat] > 0) return;

    submit((s, side) => engine.finishMulligan(s, side));
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
        element.onclick = () => openPreview(
            iid,
            undefined,
            canSwap ? "Kliknij kartę, aby ją wymienić" : null,
            canSwap ? () => submit((s, side) => engine.mulligan(s, side, iid)) : null
        );
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

function renderSidebar() {
    const state = view.state;

    renderLeaderBox(".leader-top", topSide());
    renderLeaderBox(".leader-bottom", bottomSide());
    renderPlayerBox(".player-top", topSide());
    renderPlayerBox(".player-bottom", bottomSide());

    const field = $(".weathercards");
    field.replaceChildren();
    for (const iid of state.weatherCards) {
        const element = cardElement(iid, { clickable: true });
        element.onclick = () => openPreview(iid);
        field.appendChild(element);
    }
}

function renderLeaderBox(selector, side) {
    const state = view.state;
    const box = $(selector);
    box.replaceChildren();

    const leader = LEADER_BY_ID[state.leader[side]];
    if (!leader) return;

    const used = state.leaderUsed[side];
    box.classList.toggle("used", used);

    const pseudo = leaderCard(leader);
    const canUse = side === bottomSide() && !used && myTurn();
    const element = buildCard(pseudo, {});
    element.onclick = () => openCardPreview({
        card: pseudo,
        hint: canUse ? "Kliknij kartę, aby użyć zdolności" : null,
        onConfirm: canUse ? useLeaderAbility : null
    });
    box.appendChild(element);
}

function renderPlayerBox(selector, side) {
    const state = view.state;
    const box = $(selector);
    const deck = DECKS[state.faction[side]];

    box.querySelector(".playerfaction").textContent = deck ? deck.name : "—";
    box.querySelector(".handcount").textContent = String(state.hand[side].length);
    box.querySelector(".total").textContent = String(engine.sideScore(state, side));
    box.classList.toggle("active", state.status === "playing" && state.turn === side);
    box.classList.toggle("passed", state.passed[side]);

    const lives = box.querySelector(".lives");
    lives.replaceChildren();
    for (let i = 0; i < 2; i++) {
        const dot = document.createElement("span");
        dot.className = "life" + (i < state.lives[side] ? " on" : "");
        lives.appendChild(dot);
    }
    box.querySelector(".playerstate").textContent = state.passed[side] ? "spasował" : "";
}

function renderTurnbar() {
    const state = view.state;
    $(".roundnumber").textContent = "Runda " + state.round;

    let turnText = "—";
    if (state.status === "playing") {
        turnText = state.pending
            ? "Oczekiwanie na wybór"
            : (state.turn === bottomSide() ? "Twój ruch" : "Ruch przeciwnika");
    } else if (state.status === "roundEnd") {
        turnText = "Koniec rundy";
    } else if (state.status === "finished") {
        turnText = "Koniec gry";
    }
    $(".turninfo").textContent = turnText;

    const move = state.lastMove;
    $(".lastmove").textContent = move
        ? (move.side === bottomSide() ? "Ty: " : "Przeciwnik: ") + move.text
        : "";

    $(".historyinfo").textContent = state.history
        .map(entry => "R" + entry.round + " " + entry.A + ":" + entry.B)
        .join("   ");
}

/* ---- Cmentarze i talie ---- */

function renderPiles() {
    renderGravePile(".grave-top", topSide(), false);
    renderDeckPile(".deck-top", topSide(), false);
    renderGravePile(".grave-bottom", bottomSide(), true);
    renderDeckPile(".deck-bottom", bottomSide(), true);
}

function renderGravePile(selector, side, viewable) {
    const state = view.state;
    const box = $(selector);
    const slot = box.querySelector(".pileslot");
    const list = state.grave[side];

    box.querySelector(".pilecount").textContent = String(list.length);
    slot.replaceChildren();
    slot.classList.toggle("filled", list.length > 0);
    slot.classList.toggle("clickable", viewable && list.length > 0);
    if (list.length === 0) return;

    const topCard = list[list.length - 1];
    const element = cardElement(topCard, { clickable: viewable });
    if (viewable) {
        element.onclick = () => openPileView("Twój cmentarz",
            list.map(iid => engine.cardOf(iid)));
    }
    slot.appendChild(element);
}

function renderDeckPile(selector, side, viewable) {
    const state = view.state;
    const box = $(selector);
    const slot = box.querySelector(".pileslot");
    const list = state.deck[side];

    box.querySelector(".pilecount").textContent = String(list.length);
    slot.replaceChildren();
    slot.classList.toggle("filled", list.length > 0);
    if (list.length === 0) return;

    const back = document.createElement("div");
    back.className = "deckback";
    back.style.backgroundImage = "url(" + backArtUrl(state.faction[side]) + ")";
    if (viewable) {
        back.onclick = () => openPileView("Karty pozostałe w talii", sortedDeckCards(list));
    } else {
        back.style.cursor = "default";
    }
    slot.appendChild(back);
}

/**
 * Talia jest przechowywana w kolejności dobierania, więc pokazanie jej wprost
 * zdradzałoby, co przyjdzie następne. Sortujemy jak w edytorze talii.
 */
function sortedDeckCards(list) {
    const order = { melee: 0, ranged: 1, siege: 2 };
    return list.map(iid => engine.cardOf(iid)).sort((a, b) => {
        const groupA = a.type === "special" ? 3 : order[a.row];
        const groupB = b.type === "special" ? 3 : order[b.row];
        if (groupA !== groupB) return groupA - groupB;
        if (b.strength !== a.strength) return b.strength - a.strength;
        return a.name.localeCompare(b.name, "pl");
    });
}

function renderBoard() {
    const state = view.state;
    const sideFor = pos => (pos === "top" ? topSide() : bottomSide());

    for (const rowElement of $$(".row")) {
        const pos = rowElement.dataset.pos;
        const row = rowElement.dataset.row;
        const side = sideFor(pos);

        rowElement.classList.toggle("weathered", engine.weatherAffects(state, row));

        rowElement.querySelector(".rowscore").textContent =
            String(engine.rowScore(state, side, row));

        const hornValue = state.horn[side][row];
        const slot = rowElement.querySelector(".hornslot");
        slot.replaceChildren();
        slot.classList.toggle("filled", Boolean(hornValue) && hornValue !== "leader");
        slot.classList.toggle("leaderhorn", hornValue === "leader");
        if (hornValue && hornValue !== "leader") {
            const hornEl = cardElement(hornValue, { clickable: true });
            hornEl.onclick = event => {
                event.stopPropagation();
                openPreview(hornValue);
            };
            slot.appendChild(hornEl);
        }

        // Podświetlenie rzędu jako celu — tylko własna połowa
        const rowTargetable = pos === "bottom" && myTurn()
            && ((selected && selected.needs === "row"
                    && allowedRows(engine.cardOf(selected.iid)).includes(row))
                || leaderNeedsRow);
        rowElement.classList.toggle("targetable", rowTargetable);

        const container = rowElement.querySelector(".rowcards");
        container.replaceChildren();
        for (const iid of state.board[side][row]) {
            const card = engine.cardOf(iid);
            const canTarget = pos === "bottom"
                && selected && selected.needs === "target"
                && card.type === "unit"
                && myTurn();
            const strength = engine.cardStrength(state, side, row, iid);
            const element = cardElement(iid, { strength: strength, clickable: canTarget });
            const decoyIid = selected ? selected.iid : null;
            element.onclick = event => {
                if (rowTargetable) {
                    return;   // trwa wybór rzędu — kliknięcie ma dojść do rzędu, nie do karty
                }
                event.stopPropagation();   // inaczej kliknięcie wpadłoby w wybór rzędu
                openPreview(
                    iid,
                    strength,
                    canTarget ? "Kliknij kartę, aby zamienić ją Wabikiem" : null,
                    canTarget ? () => submit((s, seat) => engine.playCard(s, seat, decoyIid, { targetIid: iid })) : null
                );
            };
            container.appendChild(element);
        }
    }
}

function needsOf(card) {
    if (card.special === "horn") return "row";
    if (card.special === "decoy") return "target";
    if (hasAbility(card, "agile")) return "row";
    return null;
}

/** Rzędy, w których wolno zagrać kartę. Zwinność zawęża wybór do dwóch. */
function allowedRows(card) {
    return hasAbility(card, "agile") ? ["melee", "ranged"] : ROWS;
}

function renderHand() {
    const state = view.state;
    const seat = mySeat();
    const hand = $(".game-hand");
    hand.replaceChildren();

    for (const iid of state.hand[seat]) {
        const clickable = myTurn();
        const element = cardElement(iid, {
            clickable: clickable,
            selected: selected && selected.iid === iid
        });
        element.onclick = () => openPreview(
            iid,
            undefined,
            clickable ? "Kliknij kartę, aby zagrać" : null,
            clickable ? () => onHandCard(iid) : null
        );
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
        const row = open(result + "   Wynik rund: "
            + state.history.map(h => h.A + ":" + h.B).join(", "));

        const again = button(row, "Zagraj ponownie",
            () => submit((s, side) => engine.requestNewGame(s, side)));
        if (state.ready[seat]) {
            again.disabled = true;
            again.textContent = "Czekam na przeciwnika...";
        } else if (state.ready[engine.opposite(seat)]) {
            again.textContent = "Przeciwnik chce rewanżu — zagraj!";
        }

        button(row, "Opuść stół", () => { net.leaveRoom(); view = null; render(); });
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
                element.onclick = () => openPreview(
                    iid,
                    undefined,
                    "Kliknij kartę, aby ją wskrzesić",
                    () => submit((s, side) => engine.resolvePending(s, side, iid))
                );
                row.appendChild(element);
            }
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
            renderSidebar();
            renderTurnbar();
            renderBoard();
            renderHand();
            renderControls();
            renderPiles();
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

    $(".deck-select").onchange = event => {
        const id = event.target.value;
        if (!id) return;
        const deck = storage.getDeck(id);
        if (!deck) {
            errorText = "Nie znaleziono tej talii.";
            render();
            return;
        }
        const check = validateDeck(deck);
        if (!check.ok) {
            errorText = "Talia niezgodna z zasadami: " + check.errors[0];
            render();
            return;
        }
        chosenDeckId = id;
        storage.rememberLastDeck(id);
        submit((s, side) => engine.chooseDeck(s, side, deck));
    };

    $$(".editor-btn").forEach(button => { button.onclick = goToEditor; });

    $(".ready-btn").onclick = () => {
        const seat = mySeat();
        const value = !view.state.ready[seat];
        submit((s, side) => engine.setReady(s, side, value));
    };

    $(".mulligan-done-btn").onclick = () => submit((s, side) => engine.finishMulligan(s, side));

    $(".pass-btn").onclick = () => submit((s, side) => engine.pass(s, side));

    $(".leader-btn").onclick = useLeaderAbility;

    $$(".leave-btn").forEach(button => {
        button.onclick = () => { net.leaveRoom(); view = null; selected = null; render(); };
    });

    $(".log-toggle").onclick = () => $(".logpanel").classList.toggle("collapsed");

    // Poziome przewijanie ręki i rzędów: przeciąganie myszą oraz kółko
    $$(".hand").forEach(enableDragScroll);
    $$(".rowcards").forEach(enableDragScroll);

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

function goToEditor() {
    location.href = view && view.code ? "./deck.html#" + view.code : "./deck.html";
}

/** Wspólne dla przycisku i dla kliknięcia w kartę lidera. */
function useLeaderAbility() {
    const leader = LEADER_BY_ID[view.state.leader[mySeat()]];
    if (!leader) return;
    if (leader.ability === "horn") {
        leaderNeedsRow = true;
        selected = null;
        render();
        return;
    }
    submit((s, side) => engine.useLeader(s, side));
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
            deckAutoTried = false;
        }
        render();
        maybeAutoPickDeck();
        maybeAutoFinishMulligan();
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
