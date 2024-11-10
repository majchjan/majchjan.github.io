let words = [];

async function loadData() {
    try {
        const wordsResponse = await fetch('./data/words.json');

        if (!wordsResponse.ok) {
            throw new Error('Błąd ładowania plików JSON');
        }

        words = await wordsResponse.json();

        console.log("Słowa załadowane: ", places);
    } catch (error) {
        console.error("Błąd wczytywania danych:", error);
    }
}
// Wczytywanie danych po załadowaniu DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    shuffleWords();
    const word = words.shift();
    const wordDiv = document.querySelector('.wordshower');
    wordDiv.textContent = word.toUpperCase();
});

function shuffleWords() {
    words = words.sort(() => Math.random() - 0.5);
    return;    
}

function nextWord() {
    const word = words.shift();


    const wordDiv = document.querySelector('.wordshower');
    wordDiv.textContent = word.toUpperCase();

    return word;
}

