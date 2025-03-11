class Backend {
    /** @type {WebSocket} */
    websocket;
    /** @type {string} - Private*/
    #gateway;
    isConnected = false;

    constructor(gateway) {
        this.#gateway = gateway;
    }
    init() {
        console.log('Trying to open a WebSocket connection...');
        this.websocket = new WebSocket(this.#gateway);
        this.websocket.onopen = this.sk.onOpen;
        this.websocket.onclose = this.sk.onClose.bind(this); // Ensure proper this context in onClose
        this.websocket.onerror = this.sk.onError;
        this.websocket.onmessage = (event) => this.sk.onMsg(JSON.parse(event.data)); // Deserialize the json data to read the object
    }

    /**
     * @param {Event} eventType - Web socket event type.
     * @param {Function} handler - Function handler.
     */
    on(eventType, handler) { this.websocket.addEventListener(eventType, handler) }

    /** 
     * @param {string} name 
     * @param {*} data 
    */
    send(name, data) {
        let object = { name: name, data: data }
        try {
            this.websocket.send(JSON.stringify(object));
        } catch (error) {
            this.sk.onError(error);
        }
    }

    onConnect = () => console.log("%c Connected", "color: aqua");
    onDisconnect = () => console.log("%c Disconnected", "color: orange");

    getTime(interval) {
        var eventFunc = this.onTime.bind(this); // Ensure the correct 'this' context 
        var onConnect = this.onConnect;
        var onDisconnect = this.onDisconnect;
        var isConnected = false;
        setInterval(() => {
            var xhttpTime = new XMLHttpRequest();
            xhttpTime.open("GET", "/time", true);

            xhttpTime.onreadystatechange = function () {
                if (this.readyState == 4) {
                    if (this.status == 200) {
                        eventFunc(JSON.parse(this.responseText));
                        if (isConnected == false) {
                            onConnect();
                            
                            this.isConnected = true;
                        }
                        isConnected = true;
                    } else {
                        if (isConnected == true) {
                            onDisconnect();
                            this.isConnected = false;
                        }
                        isConnected = false;
                    }
                }
            };
            xhttpTime.send();
        }, interval);
    }
    onTime = console.log;

    async getSetting(settingName) {
        return fetch("./settings.json")
            .then(response => {
                if (!response.ok) {
                    throw new Error("Failed to fetch settings.json");
                }
                return response.json();
            })
            .then(settings => {
                if (!settings.hasOwnProperty(settingName)) {
                    throw new Error(`Setting '${settingName}' not found in settings.json`);
                }

                return {
                    data: settings[settingName],
                    search: (index = 0, ...searchItems) => {
                        if (searchItems[1]) {
                            return settings[settingName][index][searchItems[0]][searchItems[1]];
                        }
                        return settings[settingName][index][searchItems[0]];
                    }
                };
            })
            .catch(error => {
                console.error("Error fetching or processing settings:", error);
                return null;
            });
    }
    async saveSettings(settingName, data, index) {
        let fileObject = fetch("./settings.json").then(res => res.json());
        fileObject.then(settings => {
            if (isFinite(index)) {
                settings[settingName][index] = data;
            } else {
                settings[settingName] = data;
            }
            this.send("SETTINGS", JSON.stringify(settings));
        })
    }
    sk = {
        /** @type {Function} */
        onOpen: () => {
            // WebSocket connection oppened
            console.log('Connection opened');
            this.isConnected = true;
        },
        /** 
         * @type {Function} 
         * @param {CloseEvent} event
         **/
        onClose: (event) => {
            // WebSocket connection closed
            if (event.wasClean) {
                console.log(`Connection closed cleanly, code=${event.code}, reason=${event.reason}`);
            } else {
                console.error(`Connection died`);
                console.log("WebSocket Connection Lost", "The server may be down.");
            }
            this.isConnected = false;
            setTimeout(() => this.init(), 2000);
        },
        /** @type {Function} */
        onError: (error) => {
            // WebSocket connection error
            console.error("WebSocket Error:", error);
        },
        /** @type {Function} */
        onMsg: (msg) => {
            console.log(msg);
        },
    }
}

export default Backend;