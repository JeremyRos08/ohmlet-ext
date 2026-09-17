# OLED SSD1306 : exemple SPI logiciel lent

1. Importer `examples/uno-oled-spi.json` dans Ohmlet.
2. Ouvrir `uno-oled-spi.ino` dans Arduino IDE, sélectionner **Arduino Uno**.
3. Exporter les binaires compilés et charger le `.hex` sans bootloader dans UNO1.
4. Lancer la simulation puis le firmware. Garder l'onglet actif.

L'alimentation USB simulée de l'Uno alimente VIN à 3,3 V et GND. Ne pas ajouter une deuxième alimentation. Les cinq signaux SPI/reset sont déjà câblés.

L'écran devient entièrement blanc, puis affiche progressivement un petit visage ; le firmware alterne ensuite normal/inversé. Le dessin prend environ une minute : chaque niveau est maintenu 100 ms pour traverser le pont GPIO échantillonné. Cette temporisation est une limitation du simulateur, pas du véritable SSD1306. Si le navigateur est fortement ralenti, des fronts peuvent encore être perdus.

Prise en charge : SPI 4 fils, RAM 128×64, adressages page/horizontal/vertical, marche/arrêt, contraste, inversion, remappage segments/COM et ligne de départ. Alimentation coupée ou RST bas : écran éteint et état réinitialisé.

Non pris en charge : I²C, SPI matériel rapide, défilement matériel, multiplexage partiel et temporisations électriques exactes. Ce firmware de démonstration n'a pas été compilé ni exécuté dans le navigateur lors de cette modification ; les tests automatisés couvrent le décodeur SPI et le rendu des pixels.

Référence des commandes : https://adafruit.github.io/Adafruit_SSD1306/html/_adafruit___s_s_d1306_8h_source.html
