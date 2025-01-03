let persons = [];
let foods = [];
let places = [];
let plants = [];
let professions = [];
let weathers = [];

let jsonData = {};

let shuffledWords = [];

let teams = 0;
let players = [];
let playersCopy = [];
let availablePlayers = [];
let lokacja = "";

let currentWordIndex = 0;

let points = 0;
let secondsLeft = 60;

async function loadData() {
    try {
        // Lista plików JSON
        const files = [
            './data/foods.json',
            './data/persons.json',
            './data/places.json',
            './data/plants.json',
            './data/professions.json',
            './data/weathers.json'
        ];

        // Wczytanie wszystkich plików JSON równocześnie
        const responses = await Promise.all(files.map(file => fetch(file)));

        // Sprawdzenie, czy wszystkie odpowiedzi są poprawne
        if (responses.some(response => !response.ok)) {
            throw new Error('Błąd ładowania jednego z plików JSON');
        }

        // Parsowanie danych JSON do tablicy obiektów
        const data = await Promise.all(responses.map(response => response.json()));

        // Przypisywanie kluczy do odpowiednich kategorii
        data.forEach((fileData, index) => {
            // `Object.keys()` pobiera wszystkie klucze z obiektu JSON
            const keys = Object.keys(fileData);

            // Rozdzielanie kluczy do odpowiednich tablic na podstawie kolejności plików
            switch (index) {
                case 0: foods.push(...keys); break;         // foods.json
                case 1: persons.push(...keys); break;       // persons.json
                case 2: places.push(...keys); break;        // places.json
                case 3: plants.push(...keys); break;        // plants.json
                case 4: professions.push(...keys); break;   // professions.json
                case 5: weathers.push(...keys); break;      // weathers.json
            }
        });

        // Łączenie wszystkich danych w jeden obiekt `jsonData`
        data.forEach(fileData => {
            Object.assign(jsonData, fileData);  // `Object.assign` łączy obiekty
        });

        // Logowanie wyników
        console.log("Połączone dane JSON:", jsonData);
        console.log("Foods:", foods);
        console.log("Persons:", persons);
        console.log("Places:", places);
        console.log("Plants:", plants);
        console.log("Professions:", professions);
        console.log("Weathers:", weathers);

    } catch (error) {
        console.error("Błąd wczytywania danych:", error);
    }
}
// Wczytywanie danych po załadowaniu DOM
document.addEventListener('DOMContentLoaded', async () => {
    loadData();
});

function addInput() {
    const inputContainer = document.querySelector('.input-container');

    const inputRow = document.createElement('div');
    inputRow.classList.add('input-row');

    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.placeholder = 'Wpisz imię/nazwę gracza';

    const removeBtn = document.createElement('button');
    removeBtn.classList.add('remove-btn');
    removeBtn.textContent = 'x';
    removeBtn.onclick = function() {
        removeInput(removeBtn);
    };

    inputRow.appendChild(newInput);
    inputRow.appendChild(removeBtn);

    inputContainer.insertBefore(inputRow, document.querySelector('.add-btn'));
    return;
}

function removeInput(button) {
    const inputRow = button.parentElement;
    inputRow.remove();
    return; 
}
function startGame(){
    console.log('start game');
    const inputContainer = document.querySelector('.input-container');
    const inputs = inputContainer.querySelectorAll('input[type="text"]');
    
    const categories = document.querySelectorAll('input[type="checkbox"]');

    categories.forEach(category => {
        if(category.checked){
            switch(category.id){
                case 'persons':
                    shuffledWords.push(...persons);
                    break;
                case 'foods':
                    shuffledWords.push(...foods);
                    break;
                case 'places':
                    shuffledWords.push(...places);
                    break;
                case 'plants':
                    shuffledWords.push(...plants);
                    break;
                case 'professions':
                    shuffledWords.push(...professions);
                    break;
                case 'weathers':
                    shuffledWords.push(...weathers);
                    break;
            }
        }
    });

    if(shuffledWords <= 0){
        alert('Musisz wybrać przynajmniej jedną kategorie!');
        return;
    }

    shuffledWords = shuffledWords.sort(() => Math.random() - 0.5);
    console.log(shuffledWords);

    const teamsInput = document.querySelector('input[type="number"]');
    teams = teamsInput.value;

    players = [];
    inputs.forEach(input => {
        const playerName = input.value.trim();
        if (playerName) {
            players.push(playerName);
        }
    });
    // console.log(players.length + " " + teams);
    if (players.length < 4) {
        alert('Musisz podać przynajmniej czterech graczy');
        return;
    }
    if(!(players.length % teams === 0)){
        alert('Drużyny powinny być równe!');
        return;
    }
    if(teams >= players.length){
        alert('Drużyna powinna być conajmniej dwuosobowa!');
        return;
    }


    playersCopy = [...players];
    availablePlayers = [...players];
    availablePlayers = availablePlayers.sort(() => Math.random() - 0.5);
    
    showWords();
    return;
}

function showWords(){

    const inputContainer = document.querySelector('.input-container');
    inputContainer.replaceChildren();
    const player = document.createElement('div');
    player.classList.add('wordshower');

    const startButton = document.createElement('button');
    startButton.classList.add('nextWordButton');

    if(availablePlayers.length <= 0){
        player.textContent = "Koniec kolejki!";
        startButton.textContent = 'Rozpocznij nową kolejkę!';
        startButton.onclick = function() {
            playersCopy = [...players];
            availablePlayers = [...players];
            availablePlayers = availablePlayers.sort(() => Math.random() - 0.5);
            showWords();
        };

        


    } else {
        player.textContent = availablePlayers.pop();
        startButton.textContent = 'Rozpocznij rundę!';
        startButton.onclick = function() {
            secondsLeft = 60;
            startAsyncCountdown(60);
            nextWord();
        };
    }
    inputContainer.appendChild(player);
    inputContainer.appendChild(startButton);
    return;
}

function addPoint(){
    points++;
    nextWord();
    return;
}
function skipWord(){
    nextWord();
    return;
}

function nextWord(){
    const inputContainer = document.querySelector('.input-container');
    inputContainer.replaceChildren();
    const timer = document.createElement('div');
    timer.classList.add('timer');
    timer.textContent = secondsLeft;

    const word = document.createElement('div');
    word.classList.add('wordshower');
    word.textContent = shuffledWords[currentWordIndex].toUpperCase();
    inputContainer.appendChild(timer);
    inputContainer.appendChild(word);

    const tabooWords = document.createElement('div');
    // tabooWords.classList.add('infoshower');
    tabooWords.style.fontSize = 1.5 + 'em';
    tabooWords.textContent = "Zakazane słowa: ";

    const taboo1 = document.createElement('div');
    const taboo2 = document.createElement('div');
    const taboo3 = document.createElement('div');

    taboo1.classList.add('tabooshower');
    taboo2.classList.add('tabooshower');
    taboo3.classList.add('tabooshower');

    taboo1.textContent = jsonData[shuffledWords[currentWordIndex]][0].toUpperCase();
    taboo2.textContent = jsonData[shuffledWords[currentWordIndex]][1].toUpperCase();
    taboo3.textContent = jsonData[shuffledWords[currentWordIndex]][2].toUpperCase();
    
    inputContainer.appendChild(tabooWords);
    inputContainer.appendChild(taboo1);
    inputContainer.appendChild(taboo2);
    inputContainer.appendChild(taboo3);

    const skipButton = document.createElement('button');
    skipButton.classList.add('skipbutton');
    skipButton.textContent = 'Pomiń';
    skipButton.onclick = skipWord;

    const nextWordButton = document.createElement('button');
    nextWordButton.classList.add('nextWordButton');
    nextWordButton.textContent = 'Dalej';
    nextWordButton.onclick = addPoint;

    inputContainer.appendChild(skipButton);
    inputContainer.appendChild(nextWordButton);

    currentWordIndex++;

    return;
}

async function startAsyncCountdown(duration) {
    console.log("Odliczanie rozpoczęte!");
  
    for (let i = duration; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // odczekanie 1 sekundy
      console.log(i); // wypisywanie pozostałego czasu
      secondsLeft--;
      document.querySelector('.timer').textContent = secondsLeft;
    }
    showPoints();
  }

  function showPoints(){
    const inputContainer = document.querySelector('.input-container');
    inputContainer.replaceChildren();

    const word = document.createElement('div');
    word.classList.add('wordshower');
    word.textContent = "Zdobyte punkty: " + points;
    inputContainer.appendChild(word);

    const nextRoundButton = document.createElement('button');
    nextRoundButton.classList.add('nextWordButton');
    nextRoundButton.textContent = 'Dalej!';
    nextRoundButton.onclick = function() {
        showWords();
    }
    inputContainer.appendChild(nextRoundButton);
    points = 0;
    return;
  }