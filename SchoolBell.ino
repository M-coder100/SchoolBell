#include <LittleFS.h>
#include <RTClib.h>
#include <ESP8266WiFi.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <TM1637Display.h>
#include <ArduinoJson.h>

// Module connection pins (Digital Pins)
#define CLK D3
#define DIO D4
#define RELAY D0
int btns[4] = {D7, A0, D6, D5};

RTC_DS3231 rtc;
AsyncWebServer server(80);
TM1637Display display(CLK, DIO);

JsonArray alarms;
JsonArray ringtones;
JsonObject activeAlarm;

StaticJsonDocument<8192> doc_alarms;
StaticJsonDocument<256> doc_noValidAlarms;

// w:yy:mm:dd:hh:mm:ss
// 0: dayOfTheWeek
// 1: year
// 2: month
// 3: day
// 4: hour
// 5: minute
// 6: second
int timeArray[7] = {};

bool colonState = false;
char daysOfTheWeek[7][12] = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
unsigned long clkLoopLastMillis = 0;
unsigned long btnLoopLastMillis = 0;
int clkLoopDuration = 1000;
int btnLoopDuration = 100;

// 1: middle line
// 2: top left line
// 3: bottom left line
// 4: bottom line
// 5: bottom right line
// 6: top right line
// 7: top line

const uint8_t T = 0b01111000; // T
const uint8_t I = 0b00110000; // I
const uint8_t M = 0b01010101; // M
const uint8_t E = 0b01111001; // E
const uint8_t S = 0b01101101; // S
const uint8_t B = 0b01111100; // B
const uint8_t L = 0b00111000; // L
const uint8_t A = 0b01110111; // A
const uint8_t D = 0b01011110; // D

int pressCount = 0;
int lastModeIndex = 0;
int lastMenuOptIndex = 0;
int btnModeTimeout = 0;
int btnMenuTimeout = 0;
int maxCycleModeIndex = 5;
int maxCycleMenuIndex = 0;
bool inMode = false;

bool inEditMode = false;
bool editModeBlinkState = false;
int editModeTime = 0;
int editModeIndex = 0;

const char* ssid = "Smart School Bell";
const char* password = "ghskoila2024";

// Setup Functions
void mountFileSystem() {
	LittleFS.begin();
	if (!LittleFS.begin()) {
		Serial.println("File does not exist");
	} else if (!LittleFS.exists("/index.html")) {
		Serial.println("Failed to mount file system");
	} else {
		Serial.println("File system mounted successfully!");
	}
}
void initializeComponents() {
	// RELAY
	pinMode(RELAY, OUTPUT);
	digitalWrite(RELAY, HIGH);

	// BUTTONS
	for (int i = 0; i < sizeof(btns); i++) {
		pinMode(btns[i], INPUT);
	} 

	// DISPLAY
	display.setBrightness(0x0f);

	// RTC
	if (!rtc.begin()) {
		Serial.println("Couldn't find RTC");
		Serial.flush();
		while (1) delay(10);
	}
	if (rtc.lostPower()) {
		Serial.println("RTC lost power, let's set the time!");
		rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
	}
}
void serveWiFi() {
	WiFi.softAP(ssid, password);
	IPAddress myIP = WiFi.softAPIP();
	Serial.print("AP IP address: ");
	Serial.println(myIP);
}
void handleServerRequests() {
	// Serve static files from LittleFS
	server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
		request->send(LittleFS, "/index.html", "text/html", false);          
	});
	// Serve dynamic content
	server.on("/time", HTTP_GET, [](AsyncWebServerRequest *request) {
		String newString = "[";
		for (int i = 0; i < 7; i++) {
			newString += timeArray[i];
			if (i != 6) newString += ",";
		}
		newString += "]";

		request->send(200, "text/plain", newString.c_str());
	});
	server.begin();
}
void serveWebApp() {
	serveWiFi();
	handleServerRequests();
	Serial.println("Web server started!");
}
bool loadAlarms() {
	File file = LittleFS.open("/settings.json", "r");
	if (!file) {
		Serial.println("Failed to open settings file");
		return false;
	}
	size_t size = file.size();
	if (size == 0) {
		Serial.println("Settings file is empty");
		file.close();
		return false;
	}
	std::unique_ptr<char[]> buf(new char[size]);
	file.readBytes(buf.get(), size);
	file.close();


	// Parse JSON data
	DeserializationError error = deserializeJson(doc_alarms, buf.get());
	if (error) {
		Serial.println("Failed to parse JSON");
		return false;
	}

	alarms = doc_alarms["alarms"];
	ringtones = doc_alarms["ringtones"];
	return true;
}


// Utility Functions
void secondsToTime (int totalSeconds, int& hours, int& minutes, int& seconds) {
  hours = totalSeconds / 3600;
  totalSeconds %= 3600;
  minutes = totalSeconds / 60;
  seconds = totalSeconds % 60;
}
int timeToSeconds (int hour, int minutes, int seconds) {
	return hour * 3600 + minutes * 60 + seconds;
}
bool isExcluded (JsonArray excludeDays, int day) {
  for (JsonVariant v : excludeDays) {
    if (v.as<int>() == day) {
      return true;
    }
  }
  return false;
}
void clearActiveAlarm () {
	JsonObject root_noValidAlarms = doc_noValidAlarms.to<JsonObject>();
	root_noValidAlarms["noValidAlarms"] = true;
	activeAlarm = root_noValidAlarms;
}
void getActiveAlarm () {
	clearActiveAlarm();
	// Initialize variables to find the alarm with least timestamp
	int leastTimestamp = 86401; // 24h + 1s to seconds
	int currentDayOfTheWeek = timeArray[0];
	int currentTotalSeconds = timeToSeconds(timeArray[4], timeArray[5], timeArray[6]);
	Serial.println("");
	Serial.println("==============================");
	Serial.println("Checking For Any Active Alarms");
	Serial.println("==============================");
	Serial.print("currentDayOfTheWeek: ");
	Serial.println(currentDayOfTheWeek);
	Serial.print("currentTime: ");
	Serial.print(timeArray[4], DEC);
	Serial.print(":");
	Serial.print(timeArray[5], DEC);
	Serial.print(":");
	Serial.println(timeArray[6], DEC);

	// Iterate over alarms array
	for (JsonObject alarm : alarms) {
		int timestamp = alarm["timestamp"];
		bool isActive = alarm["isActive"];

		int hours = 0; int minutes = 0; int seconds = 0;
		secondsToTime(timestamp, hours, minutes, seconds);

		JsonArray excludeDaysOfTheWeek = alarm["excludeDaysOfTheWeek"];

		serializeJson(excludeDaysOfTheWeek, Serial);
		Serial.print(", Timestamp: ");
		Serial.print(hours);
		Serial.print(":");
		Serial.print(minutes);
		Serial.print(":");
		Serial.print(seconds);
		Serial.print(", Is Active: ");
		Serial.print(isActive ? "Yes" : "No");
		Serial.print(", Is Not Excluded: ");
		Serial.println(!isExcluded(excludeDaysOfTheWeek, currentDayOfTheWeek) ? "Yes" : "No");

		// Check if current day is not excluded and alarm is active
		if (isActive && !isExcluded(excludeDaysOfTheWeek, currentDayOfTheWeek)) {
			// Check if this alarm has the least timestamp so far
			if ((timestamp < leastTimestamp) && (timestamp > currentTotalSeconds)) {
				leastTimestamp = timestamp;
				activeAlarm = alarm;
			}
		}
	}

	// Check if we found a valid alarm
	if (activeAlarm.size() > 1) {
		Serial.print("=> Next active alarm is at Time: ");
		int hours = 0; int minutes = 0; int seconds = 0;
		secondsToTime(activeAlarm["timestamp"].as<int>(), hours, minutes, seconds);
		Serial.print(hours);
		Serial.print(":");
		Serial.print(minutes);
		Serial.print(":");
		Serial.println(seconds);
	} else {
		Serial.println("=> No valid alarms found for today.");
		clearActiveAlarm();
	}
	Serial.println("");
}
void createNewAlarm (int totalSeconds, bool isActive, int ringtoneIndex) {
	JsonObject newAlarm = alarms.createNestedObject();
	newAlarm["timestamp"] = totalSeconds;
	newAlarm["isActive"] = true;
	newAlarm.createNestedArray("excludeDaysOfTheWeek");
	newAlarm["ringtoneIndex"] = 1;

	getActiveAlarm();
}
void playRingtone (JsonArray ringtoneArray) {
	int index = 0;
	for (int ringtoneDuration: ringtoneArray) {
		if (index % 2 == 0) {
			digitalWrite(RELAY, LOW);
			delay(ringtoneDuration);
			digitalWrite(RELAY, HIGH);
		} else delay(ringtoneDuration);
		index++;
	}
	digitalWrite(RELAY, HIGH);
}
int analogToDigitalRead (uint8_t pin) {
	return int(analogRead(pin)/1024);
}
void enterEditMode (int time) {
	editModeTime = time;
	editModeIndex = 0;
	inEditMode = true;
	inMode = true;
}
void resetDisplay () {
	btnModeTimeout = 0;
	btnMenuTimeout = 0;
	lastModeIndex = 0;
	lastMenuOptIndex = 0;
	inMode = false;
	inEditMode = false;
	editModeTime = 0;
	handleDisplayLoop();
}
void displayMode (int modeIndex) {
	uint8_t set[] = {S,E,T,0x00};
	uint8_t time[] = {T,I,M,E};
	uint8_t bell[] = {B,E,L,L};
	uint8_t add[] = {A,D,D,0x00};
	if (modeIndex == 1) display.setSegments(set);
	if (modeIndex == 2) display.setSegments(time);
	if (modeIndex == 3) display.setSegments(bell);
	if (modeIndex == 4) display.setSegments(add);
}


// Loop Functions
void handleAlarmLoop () {
	int hour = timeArray[4];
	int minute = timeArray[5];
	int second = timeArray[6];
	if (activeAlarm.size() == 0) {
		getActiveAlarm();
	} else {
		if (activeAlarm.containsKey("timestamp") && activeAlarm.containsKey("isActive")) {
			int totalSeconds = timeToSeconds(hour, minute, second);
			int timestamp = activeAlarm["timestamp"];
			bool isActive = activeAlarm["isActive"];
			int ringtoneIndex =  activeAlarm["ringtoneIndex"];

			if ((totalSeconds >= timestamp) && isActive) {
				playRingtone(ringtones[ringtoneIndex]["ringtone"]);
				getActiveAlarm();
			}
		} else if (hour == 0 && minute == 0 && second == 0) {
			getActiveAlarm();
		}
	}
}
void handleDisplayLoop () {
	int hour = timeArray[4];
	int minute = timeArray[5];

	display.showNumberDecEx((hour > 12 ? hour - 12 : hour) * 100 + minute, colonState ? 0b11100000 : 0, true);
	colonState = !colonState;
}
void handleSerialLogs() {
	String dayOfTheWeek = daysOfTheWeek[timeArray[0]];
	int year = timeArray[1];
	int month = timeArray[2];
	int day = timeArray[3];
	int hour = timeArray[4];
	int minute = timeArray[5];
	int second = timeArray[6];

	Serial.print(":: (");
	Serial.print(dayOfTheWeek);
	Serial.print(") ");

	Serial.print(year);
	Serial.print('/');
	Serial.print(month);
	Serial.print('/');
	Serial.print(day);
	Serial.print(' ');
	Serial.print(hour, DEC);
	Serial.print(':');
	Serial.print(minute, DEC);
	Serial.print(':');
	Serial.println(second, DEC);
}
int serialActiveAlarmIndex = 0; // need to be removed
void handleSerialInput() {
	if (Serial.available() > 0) {
		String timeInput = Serial.readString(); // Read the input as a string
		int hour = timeInput.substring(0, 2).toInt(); // Parse hours
		int minute = timeInput.substring(3, 5).toInt(); // Parse minutes
		int second = (timeInput.length() == 8) ? timeInput.substring(6, 8).toInt() : 0; // Parse seconds or default to 0
		int totalSeconds = timeToSeconds(hour, minute, second); // Convert to seconds
		createNewAlarm(totalSeconds, true, serialActiveAlarmIndex);

		if (serialActiveAlarmIndex > 3) serialActiveAlarmIndex = 0;
		serialActiveAlarmIndex++; // need to be removed
	}
}
void updateTimeArray() {
	DateTime now = rtc.now();
		
	int year = now.year();
	int month = now.month();
	int day = now.day();
	int hour = now.hour();
	int minute = now.minute();
	int second = now.second();
	
	timeArray[0] = now.dayOfTheWeek();
	timeArray[1] = year;
	timeArray[2] = month;
	timeArray[3] = day;
	timeArray[4] = hour;
	timeArray[5] = minute;
	timeArray[6] = second;
}
void handleButtonInput () {
	int modeBtn = btns[0];
	int upBtn = btns[1];
	int proceedBtn = btns[2];
	int downBtn = btns[3];
	if (inEditMode) {
		if (editModeBlinkState) {
			uint8_t clear = 0b00000000;
			display.setSegments(&clear, 1, editModeIndex);
		} else display.showNumberDecEx(editModeTime, 0b11100000, true);
		editModeBlinkState = !editModeBlinkState;

		// Up & Down Buttons
		if (analogToDigitalRead(upBtn)) {
			int num = 1000/(pow10(editModeIndex));
			if (int(editModeTime%num) < 9*num) {
				editModeTime += num;
				display.showNumberDecEx(editModeTime, 0b11100000, true);
			} 
		}
		if (digitalRead(downBtn)) {
			int num = 1000/(pow10(editModeIndex));
			if (editModeTime > num) {
				editModeTime -= num;
				display.showNumberDecEx(editModeTime, 0b11100000, true);
			}
		}
		if (digitalRead(modeBtn) && editModeIndex < 3) { 
			editModeIndex++;
			if (int(editModeTime/100) > 24) {
				editModeTime = 2400 + editModeTime % 100;
			}
			if (int(editModeTime%100) > 60) {
				editModeTime = editModeTime - editModeTime % 100 + 60;
			}
		}
		if (digitalRead(proceedBtn) && editModeIndex > 0) { 
			editModeIndex--;
			if (int(editModeTime/100) > 24) {
				editModeTime = 2400 + editModeTime % 100;
			}
			if (int(editModeTime%100) > 60) {
				editModeTime = editModeTime - editModeTime % 100 + 60;
			}
		}
		if (digitalRead(proceedBtn)) {
			pressCount++;
			if (pressCount > 10) {
				pressCount = 0;
				if (lastModeIndex == 2) rtc.adjust(DateTime(timeArray[0], timeArray[1], timeArray[2], int(editModeTime/100), int(editModeTime%100), 0));
				if (lastModeIndex == 4) {
					int totalSeconds = timeToSeconds(int(editModeTime/100), int(editModeTime%100), 0); // Convert to seconds
					createNewAlarm(totalSeconds, true, 0);
				}
				resetDisplay();
			}
		} else {pressCount = 0;}
		if (digitalRead(modeBtn) && analogToDigitalRead(upBtn) && digitalRead(downBtn)) resetDisplay();
		return;
	}
	
	// Mode Button
	if (!inMode) {
		if (lastModeIndex >= maxCycleModeIndex) {
			resetDisplay();
			return;
		}
		if (digitalRead(modeBtn)) {
			if (btnModeTimeout < 0) {
				btnModeTimeout++;
			} else {
				btnModeTimeout = -3; // delay on press
				lastModeIndex++;
				displayMode(lastModeIndex);
			}
		} else if (btnModeTimeout >= 20) { // timeout delay after press
			resetDisplay();
		} else if (lastModeIndex != 0) btnModeTimeout++;
	} else if (digitalRead(modeBtn)) {
		resetDisplay();
	} else {
		// Up & Down Buttons
		if (analogToDigitalRead(upBtn) && lastMenuOptIndex < maxCycleMenuIndex) {
			lastMenuOptIndex++;
			display.showNumberDec(lastMenuOptIndex+1, true);
		}
		if (digitalRead(downBtn) && lastMenuOptIndex > 0) {
			lastMenuOptIndex--;
			display.showNumberDec(lastMenuOptIndex+1, true);
		}
	}

	// Proceed Button
	if (digitalRead(proceedBtn)) {
		if (btnMenuTimeout < 0) {
				btnMenuTimeout++;
		} else {
			btnMenuTimeout = -1; // delay on press
			switch (lastModeIndex) {
			case 1: // SET
				if (inMode) {
					btnMenuTimeout = 0;
					int hours = 0; int minutes = 0; int seconds = 0;
					secondsToTime(alarms[lastMenuOptIndex]["timestamp"], hours, minutes, seconds);
					enterEditMode(hours * 100 + minutes);
				} else display.showNumberDec(lastMenuOptIndex+1, true);
				inMode = true;
				maxCycleMenuIndex = alarms.size()-1;
				break;
			case 2: // TIME
				enterEditMode(timeArray[4] * 100 + timeArray[5]);
				break;
			case 3: // BELL
				display.showNumberDec(lastMenuOptIndex+1, true);

				if (inMode) {
					btnMenuTimeout = 0;
					playRingtone(ringtones[lastMenuOptIndex]["ringtone"]);
				}
				maxCycleMenuIndex = ringtones.size()-1;
				inMode = true;
				break;
			case 4: // ADD
				enterEditMode(0);
				break;
			default:
				break;
			}
		}
	}
}



void setup() {
	Serial.begin(115200);
	Serial.println();
	
	delay(5000);

	mountFileSystem();
	initializeComponents();
	serveWebApp();
	loadAlarms();
}
void loop() {
	unsigned long currentMillis = millis();
	if (currentMillis - clkLoopLastMillis >= clkLoopDuration) {
		clkLoopLastMillis = currentMillis;

		updateTimeArray();
		if (lastModeIndex == 0 && !inMode) handleDisplayLoop();
		handleAlarmLoop();
		// handleSerialLogs();
	}
	if (currentMillis - btnLoopLastMillis >= btnLoopDuration) {
		btnLoopLastMillis = currentMillis;
		handleButtonInput();
	}		
	// Take messages from serial
	handleSerialInput();
}