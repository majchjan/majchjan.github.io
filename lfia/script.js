document.addEventListener("DOMContentLoaded", function() {
    // Pobierz element listy
    var imageList = document.getElementById("imageList");

    // Tablica z nazwami plików zdjęć
    var imageFiles = ["zdjecie1.jpg", "zdjecie2.jpg", "zdjecie3.jpg"];

    // Iteruj przez tablicę i dodawaj elementy do listy
    imageFiles.forEach(function(fileName) {
        var listItem = document.createElement("li");
        var link = document.createElement("a");

        // Ustaw atrybuty hiperłącza
        link.href = fileName;
        link.target = "_blank"; // Otwórz w nowej karcie

        // Ustaw tekst hiperłącza na nazwę pliku
        link.textContent = fileName;

        // Dodaj hiperłącze do elementu listy
        listItem.appendChild(link);

        // Dodaj element listy do listy głównej
        imageList.appendChild(listItem);
    });
});
