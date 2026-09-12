/**
 * gwint/js/cardview.js — powiększony podgląd karty, wspólny dla gry i edytora talii.
 *
 * Kliknięcie karty otwiera podgląd na przyciemnionym tle.
 * Kliknięcie powiększonej karty wykonuje akcję, kliknięcie poza nią zamyka podgląd.
 *
 * Nakładka jest tworzona leniwie i doklejana do <body>, więc żadna strona
 * nie musi mieć jej w swoim HTML-u.
 */

import { hasAbility } from "./cards.js";

const ROW_NAME = { melee: "wręcz", ranged: "dystansowy", siege: "oblężniczy" };

/* ============================================================
   GRAFIKI
   Katalog frakcji nie zawsze równa się jej identyfikatorowi —
   Królestwa Północy mają na dysku folder "realms".
   ============================================================ */

const FACTION_DIR = {
    northern:  "realms",
    nilfgaard: "nilfgaard",
    scoiatael: "scoiatael",
    monsters:  "monsters",
    skellige:  "skellige",
    neutral:   "neutral"
};

const ICON = {
    melee:        "img/icons/melee.svg",
    ranged:       "img/icons/ranged.svg",
    siege:        "img/icons/siege.svg",
    tightBond:    "img/icons/tight_bond.svg",
    moraleBoost:  "img/icons/morale_boost.svg",
    muster:       "img/icons/muster.svg",
    spy:          "img/icons/spy.svg",
    medic:        "img/icons/medic.svg",
    horn:         "img/icons/horn.svg",
    scorch:       "img/icons/scorch.svg",
    decoy:        "img/icons/decoy.svg",
    frost:        "img/icons/frost.svg",
    fog:          "img/icons/fog.svg",
    rain:         "img/icons/rain.svg",
    clearWeather: "img/icons/clear_weather.svg"
};

export function cardArtUrl(card) {
    const dir = FACTION_DIR[card.faction];
    return card.isLeader
        ? "img/cards/" + dir + "/leaders/" + card.id + ".webp"
        : "img/cards/" + dir + "/" + card.id + ".webp";
}

/** Lider udający kartę — dzięki temu przechodzi przez buildCard i podgląd bez wyjątków. */
export function leaderCard(leader) {
    return {
        id: leader.id,
        name: leader.name,
        faction: leader.faction,
        type: "leader",
        row: null,
        strength: 0,
        abilities: [],
        musterGroup: null,
        special: null,
        isLeader: true,
        leaderText: leader.text
    };
}

export function leaderArtUrl(leader) {
    return "img/cards/" + FACTION_DIR[leader.faction] + "/leaders/" + leader.id + ".webp";
}

export function backArtUrl(factionId) {
    return "img/cards/back/" + FACTION_DIR[factionId] + ".webp";
}

/** Ikony do nałożenia na kartę: najpierw rząd, potem zdolności. */
function rowIcons(card) {
    if (hasAbility(card, "agile")) {
        return [ICON.melee, ICON.ranged];   // Zwinność = oba rzędy
    }
    return ICON[card.row] ? [ICON[card.row]] : [];
}

function abilityIcons(card) {
    const paths = [];
    for (const ability of ["tightBond", "moraleBoost", "muster", "spy", "medic", "horn"]) {
        if (hasAbility(card, ability)) paths.push(ICON[ability]);
    }
    if (hasAbility(card, "scorchRow")) paths.push(ICON.scorch);
    return paths;
}

/** Kółko na karcie: albo ikona (maską, więc kolor nadaje CSS), albo liczba. */
function pip(kind, iconPath, text) {
    const element = document.createElement("div");
    element.className = "pip " + kind;

    if (text !== undefined) {
        element.textContent = text;
        return element;
    }
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.style.webkitMaskImage = "url(" + iconPath + ")";
    icon.style.maskImage = "url(" + iconPath + ")";
    element.appendChild(icon);
    return element;
}

/**
 * Buduje element karty. Wspólny dla gry, edytora talii i podglądu.
 *
 * @param {object} card definicja karty z cards.js
 * @param {{ strength?: number, count?: number, preview?: boolean,
 *           clickable?: boolean, selected?: boolean }} options
 */
export function buildCard(card, options = {}) {
    const element = document.createElement("div");
    element.className = "card";
    element.style.backgroundImage = "url(" + cardArtUrl(card) + ")";

    if (card.type === "hero") element.classList.add("hero");
    if (card.type === "special") element.classList.add("special");
    if (hasAbility(card, "spy")) element.classList.add("spy");
    if (options.preview) element.classList.add("preview");
    if (options.clickable) element.classList.add("clickable");
    if (options.selected) element.classList.add("selected");

    if (card.type === "leader") {
        element.classList.add("leadercard");
    } else if (card.type === "special") {
        element.appendChild(pip("specialpip", ICON[card.special]));
    } else {
        const shown = options.strength !== undefined ? options.strength : card.strength;
        const strength = pip("strength", null, String(shown));
        // Jedno oznaczenie na każdy efekt — kierunku nie rozróżniamy
        if (shown !== card.strength) strength.classList.add("affected");

        element.appendChild(strength);

        const bar = document.createElement("div");
        bar.className = "pipbar";
        for (const path of rowIcons(card)) {
            bar.appendChild(pip("rowpip", path));
        }
        for (const path of abilityIcons(card)) {
            bar.appendChild(pip("ability", path));
        }
        element.appendChild(bar);
    }

    if (options.count !== undefined) {
        element.appendChild(pip("count", null, "×" + options.count));
    }

    element.title = card.name + "\n" + describeCard(card);
    return element;
}

const ABILITY_TEXT = {
    tightBond:   "Więź — karty o tej samej nazwie w jednym rzędzie mnożą swoją siłę przez ich liczbę.",
    moraleBoost: "Zagrzewanie do walki — dodaje 1 do siły wszystkich pozostałych jednostek w rzędzie.",
    muster:      "Zgrupowanie — przy zagraniu przyciąga z talii i ręki wszystkie karty tej samej grupy.",
    spy:         "Szpieg — trafia na stronę przeciwnika, a ty dobierasz 2 karty.",
    medic:       "Medyk — wskrzesza jednostkę z twojego cmentarza i zagrywa ją natychmiast.",
    horn:        "Róg dowódcy — podwaja siłę pozostałych jednostek w swoim rzędzie.",
    agile:       "Zwinność — przy zagraniu wybierasz rząd wręcz albo dystansowy."
};

const SPECIAL_TEXT = {
    frost:        "Trzaskający Mróz — obniża siłę jednostek w rzędzie wręcz do 1.",
    fog:          "Nieprzenikliwa Mgła — obniża siłę jednostek w rzędzie dystansowym do 1.",
    rain:         "Ulewny Deszcz — obniża siłę jednostek w rzędzie oblężniczym do 1.",
    clearWeather: "Czysta Pogoda — usuwa wszystkie efekty pogody.",
    horn:         "Róg Dowódcy — podwaja siłę jednostek we wskazanym rzędzie.",
    scorch:       "Spalenie — niszczy najsilniejsze jednostki na całej planszy. Bohaterowie są odporni.",
    decoy:        "Wabik — zamienia się miejscem z twoją jednostką, która wraca do ręki."
};

/** Pełny opis karty do okna podglądu. */
export function describeCard(card) {
    if (card.isLeader) {
        return card.leaderText;
    }
    const lines = [];

    if (card.type === "special") {
        lines.push(SPECIAL_TEXT[card.special] || "Karta specjalna.");
    } else {
        lines.push("Rząd " + (ROW_NAME[card.row] || "?") + ", siła bazowa " + card.strength + ".");
    }
    if (card.type === "hero") {
        lines.push("Bohater — odporny na pogodę, Róg Dowódcy, Zagrzewanie i Spalenie. Jego siła jest niezmienna.");
    }
    if (hasAbility(card, "scorchRow")) {
        lines.push("Pożoga — przy zagraniu niszczy najsilniejsze jednostki przeciwnika w rzędzie "
            + (ROW_NAME[card.scorchRow] || "?") + ", o ile suma sił tego rzędu wynosi co najmniej "
            + card.scorchThreshold + ".");
    }

    for (const ability of Object.keys(ABILITY_TEXT)) {
        if (hasAbility(card, ability)) {
            lines.push(ABILITY_TEXT[ability]);
        }
    }
    return lines.join("\n");
}

let overlay = null;
let pendingConfirm = null;

function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "cardoverlay hidden";
    overlay.onclick = () => closeCardPreview();
    document.body.appendChild(overlay);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeCardPreview();
    });
    return overlay;
}

export function closeCardPreview() {
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.replaceChildren();
    pendingConfirm = null;
}

/**
 * @param {object} options
 * @param {object}  options.card       definicja karty z cards.js
 * @param {number}  [options.strength] siła po modyfikatorach (na planszy)
 * @param {string}  [options.hint]     podpowiedź, co zrobi kliknięcie karty
 * @param {Function}[options.onConfirm] akcja po kliknięciu powiększonej karty
 */
/** Powiększona karta razem z panelem opisu — jeden obiekt wizualny. */
function buildPreviewFrame(card, strength) {
    const element = buildCard(card, { strength: strength, preview: true });

    const info = document.createElement("div");
    info.className = "cardinfo";

    const name = document.createElement("div");
    name.className = "cardinfo-name";
    name.textContent = card.name;

    const text = document.createElement("div");
    text.className = "cardinfo-text";
    text.textContent = describeCard(card);
    info.append(name, text);

    const frame = document.createElement("div");
    frame.className = "previewframe";
    if (card.type === "hero") frame.classList.add("hero");
    if (card.type === "special") frame.classList.add("special");
    if (hasAbility(card, "spy")) frame.classList.add("spy");
    frame.append(element, info);
    return frame;
}

/**
 * @param {object} options
 * @param {object}  options.card       definicja karty (albo lider z leaderCard)
 * @param {number}  [options.strength] siła po modyfikatorach
 * @param {string}  [options.hint]     podpowiedź, co zrobi kliknięcie
 * @param {Function}[options.onConfirm] akcja po kliknięciu karty
 */
export function openCardPreview({ card, strength, hint, onConfirm }) {
    const box = ensureOverlay();
    box.replaceChildren();

    const frame = buildPreviewFrame(card, strength);
    if (onConfirm) {
        frame.classList.add("actionable");
    }
    frame.onclick = event => {
        event.stopPropagation();
        const confirm = pendingConfirm;
        closeCardPreview();
        if (confirm) confirm();
    };

    const inner = document.createElement("div");
    inner.className = "cardoverlay-inner";
    inner.appendChild(frame);

    const hintBox = document.createElement("div");
    hintBox.className = "cardoverlay-hint";
    hintBox.textContent = onConfirm
        ? (hint || "Kliknij kartę, aby zatwierdzić") + " · kliknij poza kartą, aby anulować"
        : "Kliknij poza kartą, aby zamknąć";
    inner.appendChild(hintBox);

    box.appendChild(inner);
    pendingConfirm = onConfirm || null;
    box.classList.remove("hidden");
}

/** Przegląd zawartości stosu: talii albo cmentarza. Karty w formie szczegółowej. */
export function openPileView(title, cards) {
    const box = ensureOverlay();
    box.replaceChildren();

    const inner = document.createElement("div");
    inner.className = "cardoverlay-inner";

    const heading = document.createElement("div");
    heading.className = "pileview-title";
    heading.textContent = title + " — " + cards.length + " kart";
    inner.appendChild(heading);

    const strip = document.createElement("div");
    strip.className = "pileview";
    strip.onclick = event => event.stopPropagation();   // klik w pasek nie zamyka
    for (const card of cards) {
        strip.appendChild(buildPreviewFrame(card));
    }
    inner.appendChild(strip);
    enableDragScroll(strip);

    const hintBox = document.createElement("div");
    hintBox.className = "cardoverlay-hint";
    hintBox.textContent = "Przewijaj w bok · kliknij poza kartami, aby zamknąć";
    inner.appendChild(hintBox);

    box.appendChild(inner);
    pendingConfirm = null;
    box.classList.remove("hidden");
}

/** Nakładka z tekstem — dziennik zdarzeń. Ten sam mechanizm co podgląd stosu. */
export function openTextView(title, text) {
    const box = ensureOverlay();
    box.replaceChildren();

    const inner = document.createElement("div");
    inner.className = "cardoverlay-inner";

    const heading = document.createElement("div");
    heading.className = "pileview-title";
    heading.textContent = title;
    inner.appendChild(heading);

    const body = document.createElement("pre");
    body.className = "logview";
    body.textContent = text || "(pusto)";
    body.onclick = event => event.stopPropagation();
    inner.appendChild(body);

    const hintBox = document.createElement("div");
    hintBox.className = "cardoverlay-hint";
    hintBox.textContent = "Kliknij poza oknem, aby zamknąć";
    inner.appendChild(hintBox);

    box.appendChild(inner);
    pendingConfirm = null;
    box.classList.remove("hidden");
}

/** Ruch większy niż tyle pikseli traktujemy jako przeciąganie, nie kliknięcie. */
const DRAG_THRESHOLD = 5;

/**
 * Poziome przewijanie kontenera myszą: przeciąganiem i kółkiem.
 * Dotyku nie ruszamy — przeglądarka robi to lepiej.
 * Nasłuchy ruchu wieszamy na oknie tylko na czas przeciągania, żeby nie
 * narastały przy każdym otwarciu przeglądarki stosu.
 */
export function enableDragScroll(element) {
    let moved = 0;

    element.addEventListener("pointerdown", event => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;

        const startX = event.clientX;
        const startScroll = element.scrollLeft;
        moved = 0;

        const onMove = moveEvent => {
            const delta = moveEvent.clientX - startX;
            moved = Math.max(moved, Math.abs(delta));
            if (moved > DRAG_THRESHOLD) {
                element.classList.add("dragging");
                element.scrollLeft = startScroll - delta;
                moveEvent.preventDefault();
            }
        };
        const onUp = () => {
            element.classList.remove("dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    });

    // Po przeciągnięciu połykamy kliknięcie, żeby nie otworzyło podglądu karty
    element.addEventListener("click", event => {
        if (moved > DRAG_THRESHOLD) {
            event.stopPropagation();
            event.preventDefault();
            moved = 0;
        }
    }, true);

    element.addEventListener("wheel", event => {
        if (event.deltaY === 0) return;
        if (element.scrollWidth <= element.clientWidth) return;
        element.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive: false });
}
