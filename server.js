//WebSocketServer anlegen
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, clientTracking: true });

const testFolder = '/media/usb_red/audio/kindermusik/rz/jahresuhr';
const fs = require('fs');
var path = require('path');


currentFiles = [];

fs.readdirSync(testFolder).forEach(file => {

    if (path.extname(file).toLowerCase() === ".mp3") {
        currentFiles.push(testFolder + "/" + file)
    }
})

console.log(currentFiles);

//Befehle auf Kommandzeile ausfuehren
const { execSync } = require('child_process');

//Timer benachrichtigt in regelmaesigen Abstaenden ueber Aenderung z.B. Zeit
timerID = null;

//Aktuellen Song / Volume / MuteStatus / Song innerhalb der Playlist merken, damit Clients, die sich spaeter anmelden, diese Info bekommen
currentSong = null;
currentVolume = 100;
currentMute = false;
currentPosition = 0;

//Wenn sich ein WebSocket mit dem WebSocketServer verbindet
wss.on('connection', function connection(ws) {
    console.log("new client connected");

    //Timer starten, falls er nicht laeuft
    if (!timerID) {
        startTimer();
    }

    //Wenn WebSocket eine Nachricht sendet
    ws.on('message', function incoming(message) {

        //Nachricht kommt als String -> in JSON Objekt konvertieren
        var obj = JSON.parse(message);
        console.log(obj)

        //Werte auslesen
        let type = obj.type;
        let value = obj.value;

        //Array von MessageObjekte erstellen, die an WS gesendet werden
        let messageObjArr = [{
            type: type,
            value: value
        }];

        //Pro Typ gewisse Aktionen durchfuehren
        switch (type) {

            //Song wurde vom Nutzer weitergeschaltet
            case 'change-song':

                console.log("change-song " + value);

                if (value) {

                    if (currentPosition < (currentFiles.length - 1)) {
                        execSync('mocp --next');
                    }
                    else {
                        console.log("kein next beim letzten Track");
                    }
                }
                else {

                    if (currentPosition > 0) {
                        execSync('mocp --previous');
                    }
                    else {
                        console.log("1. Titel von vorne");
                        execSync('mocp --play');
                    }
                }
                break;

            //Song hat sich geandert
            case 'song-change':
                console.log("New Song is " + value);

                //Der wie vielte Titel in der Playlist ist es
                currentPosition = currentFiles.indexOf(value);

                console.log("Position " + currentPosition);

                //Zusaetzliche Nachricht an clients, welche Position der Titel hat
                messageObjArr.push({
                    type: "set-position",
                    value: (currentPosition + 1)
                });

                //neue Song merken
                currentSong = value;
                break;

            //Playback wurde beendet
            case 'stop':
                console.log("STOPPED")
                break;

            //Lautstaerke setzen
            case 'set-volume':

                //neue Lautstaerke merken 
                currentVolume = value;

                //Mute (ggf.) entfernen und Lautstaerke setzen
                let volumeCommand = "sudo amixer sset PCM on && sudo amixer sset PCM " + value + "% -M";
                console.log(volumeCommand)
                execSync(volumeCommand);

                //Zusaetzliche Nachricht an clients, dass nun nicht mehr gemutet ist
                messageObjArr.push({
                    type: "set-mute",
                    value: false
                })
                break;

            //Mute-Status setzen
            case 'set-mute':

                //neuen Mutestatus merken 
                currentMute = value;

                //Mute fuer Mixer ermitteln
                muteState = value ? "off" : "on";

                //Lautstaerke setzen
                let muteCommand = "sudo amixer sset PCM " + muteState;
                console.log(muteCommand)
                execSync(muteCommand);
                break;
        }

        //Ueber Liste der MessageObjs gehen und an WS senden
        for (ws of wss.clients) {
            for (messageObj of messageObjArr)
                ws.send(JSON.stringify(messageObj));
        }
    });

    //WS (einmalig beim Verbinden) ueber aktuellen Titel informieren
    ws.send(JSON.stringify({
        type: "song-change",
        value: currentSong
    }));

    //WS (einmalig beim Verbinden) ueber aktuelles Volume informieren
    ws.send(JSON.stringify({
        type: "set-volume",
        value: currentVolume
    }));

    //WS (einmalig beim Verbinden) ueber aktuellen Mutezustand informieren
    ws.send(JSON.stringify({
        type: "set-mute",
        value: currentMute
    }));

    //WS (einmalig beim Verbinden) ueber aktuellen Position informieren
    ws.send(JSON.stringify({
        type: "set-position",
        value: (currentPosition + 1)
    }));
});

//Timer-Funktion benachrichtigt regelmaessig die WS
function startTimer() {
    console.log("startTimer")

    //TimerID, damit Timer zurueckgesetzt werden kann
    timerID = setInterval(() => {
        //console.log("Send to " + wss.clients.length + " Clients")

        //Wenn es keine Clients gibt
        if (wss.clients.length == 0) {
            console.log("No more Clients for Timer")

            //Timer zuruecksetzen
            clearInterval(timerID);
            timerID = null;
        }

        //Aktuelle Zeit in Titel ermitteln
        let time = execSync('mocp -Q %ct');
        console.log(time.toString().trim())

        //MessageObj erstellen
        let messageObj = {
            type: "time",
            value: time.toString().trim()
        };

        //MessageObj an WS senden
        for (ws of wss.clients) {
            ws.send(JSON.stringify(messageObj));
        }
    }, 1000)
}