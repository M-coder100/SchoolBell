import Backend from "./backend.js";
const backend = new Backend(`ws://${window.location.hostname}:81`);
const $ = querySelector => document.querySelector(querySelector);
const editor = $("#alarmEditor");
const tracker = $("#attendanceTracker");
const alarmsRoot = $("#alarms");
let intervalIDs = [];
let currentDayOfTheWeekIndex = 0;
function init() {
    let isInitialized = false;
    console.log("Program starting...");
    backend.onConnect = onServerConnect;
    backend.onDisconnect = onServerDisconnect;

    backend.onTime = time => {
        displayTime(time);

        if (!isInitialized) {
            let dayOfTheWeekIndex = time[0];
            handleQuickBellBtn();

            loadSettings.then((settings) => {
                const alarms = settings[0], ringtones = settings[1];
                displayAlarms(alarms, ringtones, time);
            })


            document.querySelectorAll("nav > .day").forEach(elm => {
                let index = [...elm.parentElement.children].indexOf(elm);

                elm.parentElement.children[currentDayOfTheWeekIndex].classList.add("currentDay");
                if (dayOfTheWeekIndex == index) elm.classList.add("active");
                elm.onclick = () => {
                    elm.parentElement.querySelector(".day.active")?.classList.remove("active");
                    elm.classList.add("active");

                    loadSettings.then((settings) => {
                        const alarms = settings[0], ringtones = settings[1];
                        let timeArray = time;
                        dayOfTheWeekIndex = index;
                        timeArray[0] = index;
                        displayAlarms(alarms, ringtones, timeArray);
                    })
                }
            })
            $("#attendanceBtn").onclick = openAttendanceTracker;
            $("#recalibrate").onclick = () => openAlarmEditor(time, "time");
            $("#settingsBtn").onclick = () => document.documentElement.requestFullscreen();
            ;
            $("#searchCheckbox").onchange = (e) => {
                loadSettings.then((settings) => {
                    const alarms = settings[0], ringtones = settings[1];
                    let timeArray = time;
                    timeArray[0] = dayOfTheWeekIndex;
                    displayAlarms(alarms, ringtones, timeArray, e.target.checked);
                })
            };
            isInitialized = true;
            console.log("Initialization Complete");
        }
    }
    backend.getTime(1000);
}


function handleQuickBellBtn() {
    let quickBellBtn = $("#quickBellBtn");
    let timeoutID;
    quickBellBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        quickBellBtn.classList.add("press");
        timeoutID = setTimeout(() => {
            let ringtoneIndex = $("#ringtoneSelect").value;
            quickBell(ringtoneIndex);
            setTimeout(() => {
                clearTimeout(timeoutID)
                quickBellBtn.classList.remove("press");
            }, 1500);
        }, 2000);
    })
    quickBellBtn.addEventListener("touchend", (e) => {
        clearTimeout(timeoutID);
        quickBellBtn.classList.remove("press");
    })
}
function displayAlarm(alarm, ringtone, isCompleted) {
    const div = document.createElement("div");
    const alarmTime = secondsToTime(alarm.timestamp);
    div.classList.add("alarm");
    if (isCompleted) div.classList.add("completed");
    div.innerHTML = `
        <div class="status"></div>
        <div class="timeContainer">
            <div class="time"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M440.08 341.31c-1.66-2-3.29-4-4.89-5.93-22-26.61-35.31-42.67-35.31-118 0-39-9.33-71-27.72-95-13.56-17.73-31.89-31.18-56.05-41.12a3 3 0 01-.82-.67C306.6 51.49 282.82 32 256 32s-50.59 19.49-59.28 48.56a3.13 3.13 0 01-.81.65c-56.38 23.21-83.78 67.74-83.78 136.14 0 75.36-13.29 91.42-35.31 118-1.6 1.93-3.23 3.89-4.89 5.93a35.16 35.16 0 00-4.65 37.62c6.17 13 19.32 21.07 34.33 21.07H410.5c14.94 0 28-8.06 34.19-21a35.17 35.17 0 00-4.61-37.66zM256 480a80.06 80.06 0 0070.44-42.13 4 4 0 00-3.54-5.87H189.12a4 4 0 00-3.55 5.87A80.06 80.06 0 00256 480z"/></svg><span>${getMeridianTime([alarmTime[0], alarmTime[1]])}</span></div>
            <div class="timeGroup">
                <div class="seconds">:${keepDoubleDigits(alarmTime[2])}</div>
                <div class="meridian">${getMeridian(alarmTime[0])}</div>
            </div>
        </div>
        <p>${ringtone.name}</p>
    `
    div.addEventListener("click", (e) => {
        [...alarmsRoot.children].forEach(child => {
            child.classList.remove("hover");
        })
        if ($(".alarm:hover") == e.target) openAlarmEditor(alarm.timestamp, "edit")
    });
    alarmsRoot.appendChild(div);
}
function displayAlarms(alarms, ringtones, time, displayInactive = false) {
    alarmsRoot.innerHTML = "";

    for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        if (displayInactive || isAlarmActive(alarm, time)) {
            const ringtone = ringtones[alarm.ringtoneIndex];
            const currentTimestamp = timeToSeconds(time[4], time[5], time[6]);
            displayAlarm(alarm, ringtone, time[0] != currentDayOfTheWeekIndex || alarm.timestamp < currentTimestamp);
        }
    }

    const upcommingAlarm = alarmsRoot.querySelector(".alarm:not(.completed)");
    let scrollAmount = 0;
    if (upcommingAlarm) {
        upcommingAlarm.classList.add("hover");
        const upcommingAlarmIndex = [...upcommingAlarm.parentElement.children].indexOf(upcommingAlarm);
        $("#upcommingAlarmTime").textContent = getMeridianTime(secondsToTime(alarms[upcommingAlarmIndex].timestamp));
        $("#upcommingAlarmMeridian").textContent = getMeridian(secondsToTime(alarms[upcommingAlarmIndex].timestamp)[0]);
        $("#upcommingAlarmRingtone").textContent = "("+ringtones[alarms[upcommingAlarmIndex].ringtoneIndex].name+")";
        scrollAmount = upcommingAlarmIndex * 85;
    }
    alarmsRoot.classList.remove("notCurrentDay");
    if (time[0] != currentDayOfTheWeekIndex) alarmsRoot.classList.add("notCurrentDay");
    alarmsRoot.scrollTo({ top: scrollAmount, behavior: "smooth" });

}
function quickBell(ringtoneIndex) {
    backend.send("BELL", ringtoneIndex);
}
function displayTime(time) {
    console.log(time);
    currentDayOfTheWeekIndex = time[0];
    $("#timeDisplay .date").innerHTML = `${getDayOfTheWeek(time[0])}, ${getDate(time)}`;
    $("#timeDisplay .time span").innerHTML = getMeridianTime([time[4], time[5]]);
    $("#timeDisplay .timeGroup .seconds").innerHTML = keepDoubleDigits(time[6]);
    $("#timeDisplay .timeGroup .meridian").innerHTML = getMeridian(time[4]);
}
function openAlarmEditor(inputTime, mode) {
    console.log(inputTime);
    editor.show();
    $("#closeEditor").onclick = closeAlarmEditor;

    const numbers = document.querySelectorAll(".numbers");
    if (mode == "edit") {
        document.querySelectorAll(".editorSettingsContainer > :not(.editOnly)").forEach(elm => elm.style.display = "none");
        document.querySelectorAll(".editorSettingsContainer > .editOnly").forEach(elm => elm.style.display = "flex");

        let time = secondsToTime(inputTime);
        numbers[0].setAttribute("value", time[0]);
        numbers[1].setAttribute("value", time[1]);
        numbers[2].setAttribute("value", time[2]);
        backend.getSetting("alarms").then(alarms => alarms.data.forEach(alarm => {
            if (alarm.timestamp == inputTime) {
                let editorDays = [...$("#editorDays").children];
                alarm.excludeDaysOfTheWeek.forEach(index => editorDays[index].classList.add("excluded"));
                $("#isAlarmActiveCheckbox").checked = alarm.isActive;
                editorDays.forEach(elm => elm.onclick = (e) => {
                    e.target.classList.toggle("excluded");
                });

                backend.getSetting("ringtones").then(ringtones => {
                    ringtones.data.forEach(ringtone => {
                        let option = document.createElement("option");
                        option.value = ringtones.data.indexOf(ringtone);
                        option.innerHTML = ringtone.name;
                        $("#editorRingtoneSelect").appendChild(option);
                    })
                    $("#editorRingtoneSelect").value = alarm.ringtoneIndex;
                })
            }
        }))
    } else if (mode == "time") {
        document.querySelectorAll(".editorSettingsContainer > :not(.timeOnly)").forEach(elm => elm.style.display = "none");
        document.querySelectorAll(".editorSettingsContainer > .timeOnly").forEach(elm => elm.style.display = "flex");

        $("#dateInput").value = [inputTime[1], keepDoubleDigits(inputTime[2]), keepDoubleDigits(inputTime[3])].join("-");

        numbers[0].setAttribute("value", inputTime[4]);
        numbers[1].setAttribute("value", inputTime[5]);
        numbers[2].setAttribute("value", inputTime[6]);
    }

    // Create the number elements
    numbers.forEach(parentElement => {
        let selectedValue = parentElement.getAttribute("value");
        for (let i = 0; i < 60; i++) {
            let number = document.createElement("div");
            parentElement.appendChild(number);
            number.textContent = i;
            number.id = "NUMBER_" + i;
            number.classList.add("number");

            if (selectedValue == i) {
                number.classList.add("selected");
                number.scrollIntoView({ block: "center" });
            }
            number.addEventListener("click", () => {
                number.scrollIntoView({ block: "center" });
            })
        }

        parentElement.addEventListener("scroll", () => {
            let currentPos = Math.round(parentElement.scrollTop / 100);
            let currentNumber = parentElement.querySelector(".number#NUMBER_" + currentPos);
            parentElement.querySelector(".number.selected").classList.remove("selected");
            currentNumber.classList.add("selected");
        });
    });

    $("#useDeviceTimeBtn").onclick = () => {
        const date = new Date();
        let time = [date.getDay(), date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
        intervalIDs.forEach(id => clearInterval(id));
        closeAlarmEditor();
        openAlarmEditor(time, "time");
        numbers.forEach(parentElement => {
            let index = [...numbers].indexOf(parentElement);
            intervalIDs[index] = setInterval(() => {
                const date = new Date();
                let time = [date.getHours(), date.getMinutes(), date.getSeconds()];
                let currentNumber = parentElement.querySelector(".number#NUMBER_" + time[index]);
                if (!currentNumber) {
                    clearInterval(intervalIDs[index]);
                } else {
                    let currentNumberPosistion = currentNumber.offsetTop - (parentElement.getBoundingClientRect().height - currentNumber.getBoundingClientRect().height) / 2 - currentNumber.getBoundingClientRect().height;
                    parentElement.scrollTo({ top: currentNumberPosistion });
                }
            }, 1000);
        })
    }
    $("#saveBtn").onclick = () => {
        if (mode == "time") {
            let [year, month, day] = $("#dateInput").value.split("-");
            let time = [parseInt(year, 10), parseInt(month, 10), parseInt(day, 10)];
            numbers.forEach(parentElement => time.push(parseInt(parentElement.querySelector(".selected").innerHTML, 10)))
            console.log(time);
            if (!time.some(timeItem => isNaN(timeItem) && timeItem == null) && time.length == 6) {
                backend.send("TIME", time);
            }
        }
        closeAlarmEditor();
    }
}
function closeAlarmEditor() {
    editor.close();
    const numbers = document.querySelectorAll(".numbers");
    numbers.forEach(parentElement => parentElement.innerHTML = "");
}
function onServerConnect() {
    console.log("%c Connected", "color: aqua");
    backend.init();
}
function openAttendanceTracker() {
    tracker.show();
    const root = $("#itemRoot");
    root.innerHTML = "";
    $("#closeTracker").onclick = closeAttendanceTracker;

    const attendance = JSON.parse(localStorage.getItem("attendance")) || [
        ["5/11/24", 202, [23, 33, 32, 27, 58, 29]],
        ["6/11/24", 196, [29, 30, 30, 28, 56, 23]],
        ["7/11/24", 196, [23, 33, 32, 27, 52, 29]],
        ["8/11/24", 200, [28, 31, 32, 28, 56, 25]],
        ["9/11/24", 196, [28, 33, 32, 27, 55, 21]],
    ];
    console.log(attendance);
    attendance.forEach(item => {
        const div = document.createElement("div");
        div.classList.add("item");
        const date = item[0];
        const totalAttendance = item[1];
        const classData = item[2];
        div.innerHTML = `
            <span>${date}</span>
            <span>${totalAttendance}</span>
            <span>${classData[0] || "-"}, ${classData[1] || "-"}, ${classData[2] || "-"}, ${classData[3] || "-"}, ${classData[4] || "-"}, ${classData[5] || "-"}</span>
            <span class="optionsBtn"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M368 128h80M64 128h240M368 384h80M64 384h240M208 256h240M64 256h80"/><circle cx="336" cy="128" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="176" cy="256" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="336" cy="384" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg></span>
        `
        root.appendChild(div);
        div.querySelector(".optionsBtn").onclick = () => {
            const bool = prompt("Do you really want to delete this entry? (type: yes)") == "yes";
            if (bool) div.remove();
        };
    })


    const addNewEntryBtn = $("#addNewEntry");
    addNewEntryBtn.onclick = () => {
        addNewEntryBtn.classList.toggle("active");
        addNewEntryBtn.innerHTML = addNewEntryBtn.classList.contains("active") ? "Close" : '<svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208 208-93.31 208-208S370.69 48 256 48zm80 224h-64v64a16 16 0 01-32 0v-64h-64a16 16 0 010-32h64v-64a16 16 0 0132 0v64h64a16 16 0 010 32z"/></svg> Add New Entry';
        const inputElements = ["totalAttendance", "trackerDateInput", "attendance8A", "attendance8B", "attendance9A", "attendance9B", "attendance10A", "attendance10B"].map(field => $("#" + field));
        inputElements.forEach(elm => {
            if (elm.id != "totalAttendance" && elm.id != "trackerDateInput") {
                elm.addEventListener("input", () => {
                    const classDataArray = inputElements.filter(element => element.parentElement.classList.contains("classAttendance")).map(el => parseInt(el.value || 0, 10));
                    inputElements[0].value = parseInt(classDataArray.reduce((a, b) => a + b, 0));
                })
            }
        })
        $("#saveEntryBtn").onclick = () => {
            if (inputElements[0].value && inputElements[1].value) {
                const div = document.createElement("div");
                div.classList.add("item");
                let date = inputElements[1].value.split("-").reverse();
                date[2] = date[2].split("20")[1];
                date = date.join("/");
                div.innerHTML = `
                    <span>${date}</span>
                    <span>${inputElements[0].value}</span>
                    <span>${inputElements[2].value || "-"}, ${inputElements[3].value || "-"}, ${inputElements[4].value || "-"}, ${inputElements[5].value || "-"}, ${inputElements[6].value || "-"}, ${inputElements[7].value || "-"}</span>
                    <span class="optionsBtn"><svg xmlns="http://www.w3.org/2000/svg" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M368 128h80M64 128h240M368 384h80M64 384h240M208 256h240M64 256h80"/><circle cx="336" cy="128" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="176" cy="256" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="336" cy="384" r="32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg></span>
                `
                root.appendChild(div);
                div.querySelector(".optionsBtn").onclick = () => {
                    const bool = prompt("Do you really want to delete this entry? (type: yes)") == "yes";
                    if (bool) div.remove();
                };
                const array = [date, parseInt(inputElements[0].value), inputElements.filter(element => element.parentElement.classList.contains("classAttendance")).map(el => parseInt(el.value || 0, 10))];
                attendance.push(array);
                localStorage.setItem("attendance", JSON.stringify(attendance));
                addNewEntryBtn.click();
            }
        }

    }
}
function closeAttendanceTracker() {
    tracker.close();
}
function onServerDisconnect() {
    console.log("%c Disconnected", "color: orange");
    backend.websocket = null;
}
function isAlarmActive(alarm, time) {
    let isExcluded = false;
    [...alarm.excludeDaysOfTheWeek].forEach(index => { if (index == time[0]) isExcluded = true });
    if (isExcluded) return false;
    return alarm.isActive;
}
const loadSettings = new Promise((resolve, reject) => {
    let alarms, ringtones;
    backend.getSetting("alarms").then(alarmsArg => { alarms = alarmsArg.data }).then(() => {
        backend.getSetting("ringtones").then(ringtonesArg => { ringtones = ringtonesArg.data }).then(() => {
            resolve([alarms, ringtones]);
            console.log("Settings loaded successfully!");
            console.log("Alarms:", alarms, "\nRingtones:", ringtones);
        }).catch(reject);
    }).catch(reject);
})







function getDayOfTheWeek(index) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index];
}
function getDate(time) {
    return `${keepDoubleDigits(time[3])}/${keepDoubleDigits(time[2])}/${keepDoubleDigits(time[1])}`;
}
function getMeridianTime(time) {
    return `${time[0] > 12 ? time[0] - 12 : time[0]}:${keepDoubleDigits(time[1])}`;
}
function getMeridian(hours) {
    return hours > 12 ? "PM" : "AM";
}
function keepDoubleDigits(num) {
    return num < 10 ? "0" + num : num;
}
function secondsToTime(totalSeconds) {
    let hours = parseInt(totalSeconds / 3600, 10);
    totalSeconds %= 3600;
    let minutes = totalSeconds / 60;
    let seconds = totalSeconds % 60;
    return [hours, minutes, seconds];
}
function timeToSeconds(hours, minutes, seconds) {
    return hours * 3600 + minutes * 60 + seconds;
}

init();
