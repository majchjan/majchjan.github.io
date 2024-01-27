document.addEventListener("DOMContentLoaded", function() {
    // Pobierz element listy
    var imageList = document.getElementById("imageList");

    // Katalog ze zdjęciami
    var imageDirectory = "img/";

    // Iteruj przez pliki w katalogu
    fetchImages(imageDirectory, function(imageFiles) {
        // Iteruj przez tablicę i dodawaj elementy do listy
        imageFiles.forEach(function(fileName) {
            var listItem = document.createElement("li");
            var link = document.createElement("a");

            // Ustaw atrybuty hiperłącza
            link.href = imageDirectory + fileName;
            link.target = "_blank"; // Otwórz w nowej karcie

            // Ustaw tekst hiperłącza na nazwę pliku
            link.textContent = fileName;

            // Dodaj hiperłącze do elementu listy
            listItem.appendChild(link);

            // Dodaj element listy do listy głównej
            imageList.appendChild(listItem);
        });
    });
});

function fetchImages(directory, callback) {
    fetch(directory)
        .then(response => response.text())
        .then(data => {
            // Pobierz listę plików z HTML zawierającego listę katalogu
            var parser = new DOMParser();
            var htmlDoc = parser.parseFromString(data, 'text/html');
            var files = Array.from(htmlDoc.querySelectorAll("a")).map(a => a.href);

            // Odfiltruj tylko pliki graficzne (jpg, jpeg, png)
            var imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));

            // Wywołaj callback z listą plików
            callback(imageFiles);
        })
        .catch(error => console.error('Error:', error));
}
