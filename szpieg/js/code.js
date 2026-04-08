let places = [];
let items = [];

let questions = [];
let players = [];
let playersCopy = [];
let availablePlayers = [];
let spies = [];
let lokacja = "";
let currentQuestionIndex = 0;

let gameMode = ""; // "items" lub "places"

async function loadData() {
    try {
        const itemsResponse = await fetch('./data/items.json');
        const placesResponse = await fetch('./data/places.json');
        const questionsResponse = await fetch('./data/questions.json');

        if (!placesResponse.ok || !questionsResponse.ok || !itemsResponse.ok) {
            throw new Error('Błąd ładowania plików JSON');
        }

        places = await placesResponse.json();
        items = await itemsResponse.json();
        questions = await questionsResponse.json();

        console.log("Miejsca załadowane:", places);
        console.log("Przedmioty załadowane:", items);
        console.log("Pytania załadowane:", questions);
    } catch (error) {
        console.error("Błąd wczytywania danych:", error);
    }
}

// Wczytywanie danych po załadowaniu DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
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
    // let location = "";
    const inputContainer = document.querySelector('.input-container');
    const inputs = inputContainer.querySelectorAll('input[type="text"]');
    const spiesNumber = inputContainer.querySelector('input[type="number"]').value;
    players = [];
    inputs.forEach(input => {
        const playerName = input.value.trim();
        if (playerName) {
            players.push(playerName);
        }
    });

    if (players.length < 3) {
        alert('Musisz podać przynajmniej trzech graczy');
        return;
    }
    if(spiesNumber >= players.length){
        alert('Liczba szpiegów nie może być większa lub równa liczbie graczy');
        return;
    }
    assignRoles(spiesNumber);
    return;
}
function assignRoles(spiesNumber) {
    // console.log("Liczba szpiegów: " + spiesNumber);
    spies = [];
    playersCopy = [...players];
    availablePlayers = [...players];
    // console.log(availablePlayers);
    if(gameMode === "items"){
        lokacja = items[Math.floor(Math.random() * items.length)];
    } else if (gameMode === "places"){
        lokacja = places[Math.floor(Math.random() * places.length)];
    }

    // Losowanie szpiegów
    for (let i = 0; i < spiesNumber; i++) {
        const randomIndex = Math.floor(Math.random() * availablePlayers.length);
        spies.push(availablePlayers[randomIndex]);
        availablePlayers.splice(randomIndex, 1);
    }
    // alert("szpiegami są: " + spies);

    // Zresetowanie indeksu pytań
    currentQuestionIndex = 0;
    shuffleQuestions();
    showNextPlayer();
    return;
}
function shuffleQuestions() {
    questions = questions.sort(() => Math.random() - 0.5);
    return;
    // console.log(questions);
    
}

function showNextPlayer() {
    if (playersCopy.length <= 0) {
        // startQuestionRound();
        displayQuestion();
        return;
    } 

    let player = playersCopy.shift();
    // let roleMessage = spies.includes(player) ? `${player}, jesteś SZPIEGIEM!` : `${player}, Twoje miejsce to: ${location}`;
    // alert(roleMessage);
    // console.log(player.length);

    const inputContainer = document.querySelector('.input-container');
    inputContainer.replaceChildren();
    const nickname = document.createElement('div');
    nickname.classList.add('nickshower');
    nickname.textContent = player;
    inputContainer.appendChild(nickname);


    const nextBTn = document.createElement('button');
    nextBTn.classList.add('nextbutton');
    if(gameMode === "items"){
        nextBTn.textContent = 'Pokaż przedmiot';
    } else if(gameMode === "places"){
        nextBTn.textContent = 'Pokaż miejsce';
    }
    nextBTn.onclick = function() {
        showRole(player);
    };
    inputContainer.appendChild(nextBTn);

    return;
   
}
function showRole(player){
    const inputContainer = document.querySelector('.input-container');
    inputContainer.replaceChildren();
    const roleinfo = document.createElement('div');
    if(spies.includes(player)){
        roleinfo.classList.add('spieshower');
        roleinfo.textContent = "Jesteś szpiegiem!";
        inputContainer.appendChild(roleinfo);
        // return;
    } else {
        roleinfo.classList.add('placeshower');
        if(gameMode === "items"){
            roleinfo.textContent = "Przedmiot: " + lokacja.toUpperCase();
        } else if(gameMode === "places"){
            roleinfo.textContent = "Miejsce: " + lokacja.toUpperCase();
        }
        inputContainer.appendChild(roleinfo);
        // return;
    }
    const nextBTn = document.createElement('button');
    nextBTn.classList.add('nextbutton');
    nextBTn.textContent = 'Dalej!';
    nextBTn.onclick = function() {
        showNextPlayer();
    };
    inputContainer.appendChild(nextBTn);
    return;
}

// Funkcja do rozpoczęcia rundy pytań
function startQuestionRound() {
    // console.log("startQuestionRound");
    displayQuestion();
}

function displayQuestion() {
    // console.log("displayQuestion");
    // console.log(questions.length);
    if (currentQuestionIndex < questions.length) {
        var inputContainer = document.querySelector('.input-container');
        inputContainer.replaceChildren();
        if (gameMode === "places") {
            // console.log("displayQuestionad1");
            
            
            var question = document.createElement('div');
            question.classList.add('textinfo');
            // console.log(questions[currentQuestionIndex]);
            question.textContent = questions[currentQuestionIndex];
            currentQuestionIndex++;
            inputContainer.appendChild(question);

            var nextBTn = document.createElement('button');
            nextBTn.classList.add('nextbutton');
            nextBTn.textContent = 'Dalej!';
            nextBTn.onclick = function() {
                displayQuestion();
            }; 
            inputContainer.appendChild(nextBTn);
        }

        var endroundBtn = document.createElement('button');
        endroundBtn.classList.add('endroundbutton');
        endroundBtn.textContent = 'Ja wiem kto jest szpiegiem!';
        endroundBtn.onclick = function() {
            identifySpy();
        };
        inputContainer.appendChild(endroundBtn);
    } else {
        // console.log("displayQuestionad2");
        alert('Brak więcej pytań w tej rundzie!');
        identifySpy();
    }
    return;
}

function identifySpy(){
    const inputContainer = document.querySelector('.input-container');
    inputContainer.replaceChildren();
    const spyinfo = document.createElement('div');
    spyinfo.classList.add('nickshower');
    const par1 = document.createElement('p');
    if (gameMode === "items") {
        par1.textContent = "Przedmiot to: " + lokacja + ".";
    } else if (gameMode === "places") {
        par1.textContent = "Miejsce to: " + lokacja + ".";
    }
    const par2 = document.createElement('p');
    par2.textContent = "Szpieg: " + spies;
    spyinfo.appendChild(par1);
    spyinfo.appendChild(par2);
    inputContainer.appendChild(spyinfo);
    const endroundBtn = document.createElement('button');
    endroundBtn.classList.add('nextbutton');
    endroundBtn.textContent = 'Nowa runda!';
    endroundBtn.onclick = function() {
        assignRoles(spies.length);
    };
    inputContainer.appendChild(endroundBtn);
    // console.log(spies.length);
    return;
}

function toggleMode(checkbox) {
    if (checkbox.checked) {
        gameMode = "items";
        // alert("Tryb przedmiotów aktywowany! Szpiedzy będą musieli odgadnąć przedmiot, a nie miejsce.");
    } else {
        gameMode = "places";
        // alert("Tryb miejsc aktywowany! Szpiedzy będą musieli odgadnąć miejsce, a nie przedmiot.");
    }

    return;
}