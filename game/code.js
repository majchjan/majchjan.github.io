//Stała alfabet polski w tablicy znaków
var ALPHABET = new Array('A', 'Ą', 'B', 'C', 'Ć', 'D', 'E', 'Ę', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'Ł', 'M', 'N', 'Ń', 'O', 'Ó', 'Q', 'P', 'R', 'S', 'Ś', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ź', 'Ż');

function randNum(A, B){
    var wynik = Math.random();
    return Math.floor(A + wynik * (B-A));
}
//Hasła do gry:

var gameWords = new Array("Antyterrorystyczne karaluchy,",
    "Prima Aprilis",
    "Metamorfoza",
    "Gżegżółka",
    "Oksymoron",
    "Aleksandryjskie królestwo",
    "Ewidencja podatkowa",
    "Europarlamentarzysta ortodoksyjny",
    "Wyimaginowany konsultant",
    "Florystyka",
    "Onomatopeja",
    "Oksymoron",
    "Tabernakulum",
    "wódka gorzka żołądkowa",
    "Buty na wysokich obcasach",
    "Nie ma róży bez kolców",
    "Wąchać kwiatki od spodu",
    "kluczyki od samochodu",
    "Bogatemu to i byk się ocieli",
    "Wróg u bram",
    "Zakaz jazdy na rolkach",
    "Albo rybki albo akwarium",
    "Szczotka do włosów",
    "Prezenty pod choinką");

var word = gameWords[randNum(0, 24)].toUpperCase();  //"Powiedzenia i przysłowia".toUpperCase();
console.log(word);
// var word = "Powiedzenia i przysłowia".toUpperCase();

var wordCovered = "";

var failed = 0;

//Pliki muzyczne

var yesSound = new Audio("yes.wav");
var noSound = new Audio("no.wav");

for(i=0; i<word.length; i++){
    if(word.charAt(i) == " ")
    {
        wordCovered = wordCovered + " ";
    } else {
        wordCovered = wordCovered + "-";
    }
}



function printWord(){

    document.getElementById("board").innerHTML = wordCovered;
}

window.onload = main;

function main(){

    var trescDiva = "";

    for(i=0; i<5; i++){

        for(j=0; j<7; j++){
            var element = "let" + (i*7+j);
            trescDiva = trescDiva + '<div class="letter" onclick="check(' + (i*7+j) +')" id="' + element + '">' + ALPHABET[(i*7)+j] + '</div>';
        }

        trescDiva = trescDiva + '<div style="clear: both;"></div>';
    }

    printWord();
    document.getElementById("alphabet").innerHTML = trescDiva;
}

String.prototype.setLetter = function(index, letter){

    if(index > this.length - 1){
        return this.toString();
    } else {
        var napis = this.substring(0, index);
        napis = napis + letter;
        napis = napis + this.substring(index+1, this.length);
        return napis;
    }
}

function check(id){

    var flag = false;

    for(var i = 0; i<word.length; i++){

        if(word.charAt(i) == ALPHABET[id]){
            flag = true;
            wordCovered = wordCovered.setLetter(i, ALPHABET[id]);

        }
    }
    if(flag){
        yesSound.play();
        var element = "let" + id;
        document.getElementById(element).style.background = "#00AA00";
        document.getElementById(element).style.color = "#FFFFFF";
        document.getElementById(element).style.cursor = "default";
        document.getElementById(element).style.border = "3px solid green";
        document.getElementById(element).style.fontSize = "24px";

        printWord();
    } else {
        noSound.play();
        var element = "let" + id;
        document.getElementById(element).style.background = "#AA0000";
        document.getElementById(element).style.color = "#FFFFFF";
        document.getElementById(element).style.cursor = "default";
        document.getElementById(element).style.border = "3px solid red";
        document.getElementById(element).style.fontSize = "24px";

        document.getElementById(element).setAttribute("onclick", ";");

        failed++;
        var image = "img/s" + failed + ".jpg";
        document.getElementById("gallows").innerHTML = '<img src="' + image + '" alt="' + failed + '/9"/>';
    }

    if (word == wordCovered){

        document.getElementById("alphabet").innerHTML = "DOBRZE! Poprawne Hasło: " + word + '<br><br><span class=reset onclick="location.reload()"">JESZCZE RAZ?</span>'
    }

    if(failed >= 9){
        document.getElementById("alphabet").innerHTML = "PRZEGRANA! Poprawne Hasło: " + word + '<br><br><span class=reset onclick="location.reload()"">JESZCZE RAZ?</span>'
    }
}