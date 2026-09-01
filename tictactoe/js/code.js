import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getDatabase, ref, set, get, remove, onValue, onDisconnect, runTransaction, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let myUid = null;        // identyfikator gracza z logowania anonimowego
let roomCode = null;     // kod stołu, przy którym siedzimy
let myRole = null;       // "X", "O" albo null (obserwator)
let unsubscribe = null;  // funkcja odpinająca nasłuch pokoju

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bez mylących znaków: I, L, O, 0, 1
const EMPTY_BOARD = "---------";
const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // wiersze
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolumny
    [0, 4, 8], [2, 4, 6]             // przekątne
];
let heartbeat = null;    // odświeżanie lastActivity, dopóki siedzimy przy stole

const ROOM_TIMEOUT = 10 * 60 * 1000;  // po tylu ms bezczynności stół idzie do kosza
const HEARTBEAT_INTERVAL = 2 * 60 * 1000;

// Logowanie anonimowe po załadowaniu DOM — każdy gracz dostaje własne uid
document.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('.code-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') joinFromInput();
    });

    setBusy(true);
    try {
        await signInAnonymously(auth);
    } catch (error) {
        setBusy(false);
        showNote("Nie udało się połączyć z bazą. Sprawdź konfigurację Firebase.", true);
        console.error("Błąd logowania:", error);
    }
});

onAuthStateChanged(auth, (user) => {
    if (!user) {
        return;
    }
    myUid = user.uid;
    console.log("Zalogowano anonimowo:", myUid);

    cleanOldRooms();

    // Wejście linkiem w postaci .../tictactoe/#KOD — dołączamy od razu
    const codeFromUrl = location.hash.replace('#', '').toUpperCase();
    if (!roomCode && codeFromUrl.length === 5) {
        joinRoom(codeFromUrl);
    }
    setBusy(false);
    return;
});

function showScreen(screenClass) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.querySelector(screenClass).classList.add('active');
    return;
}

// Kręciołek plus blokada przycisków lobby, żeby nie wyglądało to na zawieszenie
function setBusy(isBusy) {
    document.querySelector('.loader').classList.toggle('active', isBusy);
    document.querySelectorAll('.lobby-screen button').forEach(button => {
        button.disabled = isBusy;
    });
    return;
}

function showNote(message, isError = false) {
    const note = document.querySelector('.lobby-note');
    note.textContent = message;
    note.classList.toggle('error', isError);
    return;
}

function randomCode() {
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
}

// Sprzątanie po grach porzuconych bez zamknięcia karty
async function cleanOldRooms() {
    let rooms = null;
    try {
        const snapshot = await get(ref(db, 'rooms'));
        rooms = snapshot.val();
    } catch (error) {
        console.error("Błąd odczytu listy stołów:", error);
        return;
    }
    if (!rooms) {
        return;
    }

    const deadline = Date.now() - ROOM_TIMEOUT;
    for (const code in rooms) {
        if (code === roomCode) {
            continue; // własnego stołu nie ruszamy
        }
        const lastActivity = rooms[code].lastActivity || rooms[code].createdAt || 0;
        if (lastActivity >= deadline) {
            continue;
        }
        try {
            await remove(ref(db, 'rooms/' + code));
            console.log("Usunięto porzucony stół:", code);
        } catch (error) {
            console.error("Nie udało się usunąć stołu " + code + ":", error);
        }
    }
    return;
}


async function createRoom() {
    if (!myUid) {
        showNote("Łączę z bazą, chwileczkę...");
        return;
    }

    const code = randomCode();
    setBusy(true);
    try {
        await set(ref(db, 'rooms/' + code), {
            board: EMPTY_BOARD,
            turn: "X",
            status: "waiting",
            players: { X: myUid },
            createdAt: Date.now(),
            lastActivity: serverTimestamp()
        });
        enterRoom(code, "X");
    } catch (error) {
        showNote("Nie udało się stworzyć stołu. Sprawdź reguły bazy.", true);
        console.error("Błąd tworzenia stołu:", error);
    } finally {
        setBusy(false);
    }
    return;
}

function joinFromInput() {
    const code = document.querySelector('.code-input').value.trim().toUpperCase();
    joinRoom(code);
    return;
}

async function joinRoom(code) {
    if (!myUid) {
        showNote("Łączę z bazą, chwileczkę...");
        return;
    }
    if (code.length !== 5) {
        showNote("Kod stołu ma 5 znaków.", true);
        return;
    }

    setBusy(true);
    try {
        const roomRef = ref(db, 'rooms/' + code);
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) {
            showNote("Nie ma stołu o takim kodzie.", true);
            return;
        }

        // Transakcja, żeby dwóch graczy nie zajęło tego samego miejsca.
        // Firebase liczy ją na lokalnym cache i w pierwszym przebiegu podaje null,
        // gdy pokoju jeszcze w tym cache nie ma — podstawiamy wtedy stan z get().
        // Jeśli serwer uzna go za nieaktualny, sam wymusi kolejny przebieg ze świeżymi danymi.
        let firstRun = true;
        const result = await runTransaction(roomRef, (room) => {
            if (!room && firstRun) {
                room = snapshot.val();
            }
            firstRun = false;

            if (!room) {
                return;                       // stół naprawdę zniknął
            }
            room.lastActivity = serverTimestamp();
            if (!room.players) {
                room.players = {};
            }

            // Zajmujemy wolne miejsce, o ile już przy tym stole nie siedzimy
            if (room.players.X !== myUid && room.players.O !== myUid) {
                if (!room.players.X) {
                    room.players.X = myUid;
                } else if (!room.players.O) {
                    room.players.O = myUid;
                } else {
                    return;                   // stół pełny — przerywamy transakcję
                }
            }

            // Komplet graczy — o tym, kto zaczyna pierwszą partię, decyduje los
            if (room.status === "waiting" && room.players.X && room.players.O) {
                room.starter = Math.random() < 0.5 ? "X" : "O";
                room.turn = room.starter;
                room.status = "playing";
            }
            return room;
        });

        if (!result.committed) {
            showNote("Ten stół jest już pełny.", true);
            return;
        }

        const players = result.snapshot.val().players;
        enterRoom(code, players.X === myUid ? "X" : "O");
    } catch (error) {
        showNote("Nie udało się dołączyć do stołu.", true);
        console.error("Błąd dołączania:", error);
    } finally {
        setBusy(false);
    }
    return;
}

function enterRoom(code, role) {
    roomCode = code;
    myRole = role;
    location.hash = code;
    showNote("");

    // Zamknięcie karty zwalnia miejsce i resetuje stół
    onDisconnect(ref(db, 'rooms/' + code)).update({
        ['players/' + role]: null,
        board: EMPTY_BOARD,
        turn: "X",
        status: "waiting",
        winner: null,
        rematch: null,
        lastActivity: serverTimestamp()
    });

    // Dopóki siedzimy przy stole, odświeżamy znacznik
    heartbeat = setInterval(() => {
        set(ref(db, 'rooms/' + code + '/lastActivity'), serverTimestamp());
    }, HEARTBEAT_INTERVAL);

    // Nasłuch zmian — każda zmiana w bazie przerysowuje ekran
    unsubscribe = onValue(ref(db, 'rooms/' + code), (snapshot) => {
        const room = snapshot.val();
        if (!room) {
            leaveRoom().then(() => showNote("Stół został zamknięty."));
            return;
        }
        render(room);
    });
    return;
}

async function leaveRoom() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
    }

    if (roomCode && myRole) {
        const roomRef = ref(db, 'rooms/' + roomCode);
        await onDisconnect(roomRef).cancel();
        await runTransaction(roomRef, (room) => {
            if (!room) {
                return;
            }
            if (room.players && room.players[myRole] === myUid) {
                delete room.players[myRole];
            }
            if (!room.players || (!room.players.X && !room.players.O)) {
                return null;              // pusty stół sprzątamy po sobie
            }
            room.board = EMPTY_BOARD;
            room.turn = "X";
            room.status = "waiting";
            room.winner = null;
            room.rematch = null;
            room.lastActivity = serverTimestamp();
            return room;
        });
    }

    roomCode = null;
    myRole = null;
    location.hash = "";
    showNote("");
    showScreen('.lobby-screen');
    return;
}

function render(room) {
    // Rolę odczytujemy z bazy, a nie z pamięci — przetrwa odświeżenie strony
    if (room.players && room.players.X === myUid) {
        myRole = "X";
    } else if (room.players && room.players.O === myUid) {
        myRole = "O";
    } else {
        myRole = null;
    }

    if (room.status === "waiting") {
        document.querySelector('.codeshower').textContent = roomCode;
        showScreen('.waiting-screen');
        return;
    }

    showScreen('.game-screen');
    drawBoard(room);
    drawStatus(room);
    return;
}

function drawBoard(room) {
    const board = room.board || EMPTY_BOARD;
    const winningLine = room.status === "done" && room.winner !== "draw" ? findLine(board) : null;
    const myTurn = room.status === "playing" && room.turn === myRole;

    const boardDiv = document.querySelector('.board');
    boardDiv.replaceChildren();

    for (let i = 0; i < 9; i++) {
        const sign = board[i];
        const cell = document.createElement('button');
        cell.classList.add('cell');
        if (sign !== "-") {
            cell.classList.add(sign.toLowerCase());
        }
        if (winningLine && winningLine.includes(i)) {
            cell.classList.add('win');
        }
        cell.textContent = sign === "-" ? "" : sign;
        cell.disabled = sign !== "-" || !myTurn;
        cell.onclick = function() {
            makeMove(i);
        };
        boardDiv.appendChild(cell);
    }
    return;
}

function drawStatus(room) {
    const seat = document.querySelector('.seatshower');
    seat.textContent = myRole ? "Grasz jako " + myRole : "Obserwujesz";
    seat.className = myRole ? 'seatshower ' + myRole.toLowerCase() : 'seatshower';

    const turn = document.querySelector('.turnshower');
    const result = document.querySelector('.resultshower');
    const rematchBtn = document.querySelector('.rematch-btn');

    if (room.status === "done") {
        turn.textContent = "Koniec gry";
        turn.className = 'turnshower';

        if (room.winner === "draw") {
            result.textContent = "Remis!";
            result.className = 'resultshower';
        } else if (!myRole) {
            result.textContent = "Wygrywa " + room.winner + "!";
            result.className = 'resultshower ' + room.winner.toLowerCase();
        } else if (room.winner === myRole) {
            result.textContent = "Wygrywasz!";
            result.className = 'resultshower ' + myRole.toLowerCase();
        } else {
            result.textContent = "Przegrywasz!";
            result.className = 'resultshower ' + room.winner.toLowerCase();
        }

        rematchBtn.style.display = myRole ? 'block' : 'none';
        if (myRole) {
            const rematch = room.rematch || {};
            const opponentRole = myRole === "X" ? "O" : "X";
            if (rematch[myRole]) {
                rematchBtn.textContent = "Czekam na przeciwnika...";
                rematchBtn.disabled = true;
            } else if (rematch[opponentRole]) {
                rematchBtn.textContent = "Przeciwnik chce rewanżu!";
                rematchBtn.disabled = false;
            } else {
                rematchBtn.textContent = "Rewanż";
                rematchBtn.disabled = false;
            }
        }
    } else {
        turn.textContent = myRole
            ? (room.turn === myRole ? "Twój ruch" : "Ruch przeciwnika")
            : "Ruch gracza " + room.turn;
        turn.className = 'turnshower ' + room.turn.toLowerCase();
        result.textContent = "";
        result.className = 'resultshower';
        rematchBtn.style.display = 'none';
        rematchBtn.disabled = false;
        rematchBtn.textContent = "Rewanż";
    }
    return;
}

function makeMove(index) {
    if (!roomCode || !myRole) {
        return;
    }

    // Transakcja pilnuje, że przy jednoczesnym kliknięciu wygra tylko jeden ruch
    runTransaction(ref(db, 'rooms/' + roomCode), (room) => {
        if (!room || room.status !== "playing") {
            return;                       // gra nie trwa
        }
        if (room.turn !== myRole) {
            return;                       // nie nasza tura
        }
        const board = room.board || EMPTY_BOARD;
        if (board[index] !== "-") {
            return;                       // pole zajęte
        }

        room.lastActivity = serverTimestamp();
        room.board = board.substring(0, index) + myRole + board.substring(index + 1);
        const winner = getWinner(room.board);
        if (winner) {
            room.status = "done";
            room.winner = winner;
        } else {
            room.turn = myRole === "X" ? "O" : "X";
        }
        return room;
    });
    return;
}

function rematch() {
    if (!roomCode || !myRole) {
        return;
    }

    runTransaction(ref(db, 'rooms/' + roomCode), (room) => {
        if (!room || room.status !== "done") {
            return;                       // rewanż tylko po skończonej partii
        }
        if (!room.players || !room.players.X || !room.players.O) {
            return;                       // rewanż tylko przy komplecie graczy
        }

        if (!room.rematch) {
            room.rematch = {};
        }
        room.rematch[myRole] = true;
        room.lastActivity = serverTimestamp();

        // Obaj gracze potwierdzili — zaczynamy nową partię
        if (room.rematch.X && room.rematch.O) {
            // Pierwszy ruch przechodzi na tego, kto poprzednio nie zaczynał
            room.starter = room.starter === "X" ? "O" : "X";
            room.turn = room.starter;
            room.board = EMPTY_BOARD;
            room.status = "playing";
            room.winner = null;
            room.rematch = null;
        }
        return room;
    });
    return;
}

function getWinner(board) {
    for (const [a, b, c] of LINES) {
        if (board[a] !== "-" && board[a] === board[b] && board[b] === board[c]) {
            return board[a];
        }
    }
    return board.includes("-") ? null : "draw";
}

function findLine(board) {
    for (const line of LINES) {
        const [a, b, c] = line;
        if (board[a] !== "-" && board[a] === board[b] && board[b] === board[c]) {
            return line;
        }
    }
    return null;
}

function copyCode() {
    if (!roomCode) {
        return;
    }
    const note = document.querySelector('.waiting-note');
    if (!navigator.clipboard) {
        note.textContent = "Przepisz kod ręcznie: " + roomCode;
        return;
    }
    navigator.clipboard.writeText(roomCode).then(() => {
        note.textContent = "Skopiowano kod: " + roomCode;
        setTimeout(() => { note.textContent = "Czekam na przeciwnika..."; }, 1500);
    });
    return;
}

window.createRoom = createRoom;
window.joinFromInput = joinFromInput;
window.copyCode = copyCode;
window.leaveRoom = leaveRoom;
window.rematch = rematch;
