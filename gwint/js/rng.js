/**
 * gwint/js/rng.js — deterministyczny generator liczb pseudolosowych.
 *
 * Bezstanowy: każda funkcja przyjmuje (seed, cursor) i zwraca wynik razem
 * z nowym kursorem. Silnik przechowuje kursor w GameState, więc dowolny klient
 * odtwarzający ten sam stan otrzyma te same losowania.
 *
 * Zero zależności — ani DOM, ani sieci.
 */

/** Skrót 32-bitowy z pary (seed, cursor) → liczba z przedziału [0, 1). */
function hash32(seed, cursor) {
    let t = (seed + Math.imul(0x6D2B79F5, cursor + 1)) | 0;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Liczba zmiennoprzecinkowa [0, 1). */
export function randomFloat(seed, cursor) {
    return { value: hash32(seed, cursor), cursor: cursor + 1 };
}

/** Liczba całkowita z przedziału [0, maxExclusive). */
export function randomInt(seed, cursor, maxExclusive) {
    if (maxExclusive <= 0) {
        return { value: 0, cursor };
    }
    return { value: Math.floor(hash32(seed, cursor) * maxExclusive), cursor: cursor + 1 };
}

/** Tasowanie Fishera-Yatesa. Nie modyfikuje wejścia. */
export function shuffle(items, seed, cursor) {
    const result = items.slice();
    let c = cursor;
    for (let i = result.length - 1; i > 0; i--) {
        const draw = randomInt(seed, c, i + 1);
        c = draw.cursor;
        const j = draw.value;
        const tmp = result[i];
        result[i] = result[j];
        result[j] = tmp;
    }
    return { items: result, cursor: c };
}
