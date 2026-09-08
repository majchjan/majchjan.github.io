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

const ABILITY_TEXT = {
    tightBond:   "Więź — karty o tej samej nazwie w jednym rzędzie mnożą swoją siłę przez ich liczbę.",
    moraleBoost: "Zagrzewanie do walki — dodaje 1 do siły wszystkich pozostałych jednostek w rzędzie.",
    muster:      "Zgrupowanie — przy zagraniu przyciąga z talii i ręki wszystkie karty tej samej grupy.",
    spy:         "Szpieg — trafia na stronę przeciwnika, a ty dobierasz 2 karty.",
    medic:       "Medyk — wskrzesza jednostkę z twojego cmentarza i zagrywa ją natychmiast.",
    horn:        "Róg dowódcy — podwaja siłę pozostałych jednostek w swoim rzędzie."
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
    const lines = [card.name];

    if (card.type === "special") {
        lines.push(SPECIAL_TEXT[card.special] || "Karta specjalna.");
    } else {
        lines.push("Rząd " + (ROW_NAME[card.row] || "?") + ", siła bazowa " + card.strength + ".");
    }
    if (card.type === "hero") {
        lines.push("Bohater — odporny na pogodę, Róg Dowódcy, Zagrzewanie i Spalenie. Jego siła jest niezmienna.");
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
 * @param {HTMLElement} options.element   gotowy element karty (zostanie powiększony)
 * @param {string}  [options.description] tekst pod kartą
 * @param {string}  [options.hint]        podpowiedź, co zrobi kliknięcie karty
 * @param {Function}[options.onConfirm]   akcja po kliknięciu powiększonej karty
 */
export function openCardPreview({ element, description, hint, onConfirm }) {
    const box = ensureOverlay();
    box.replaceChildren();

    element.classList.remove("clickable", "selected");
    element.classList.add("preview");
    element.onclick = event => {
        event.stopPropagation();
        const confirm = pendingConfirm;
        closeCardPreview();
        if (confirm) confirm();
    };

    const inner = document.createElement("div");
    inner.className = "cardoverlay-inner";
    inner.appendChild(element);

    if (description) {
        const box2 = document.createElement("div");
        box2.className = "cardoverlay-desc";
        box2.textContent = description;
        inner.appendChild(box2);
    }

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
