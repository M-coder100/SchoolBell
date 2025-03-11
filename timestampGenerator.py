import pyperclip
print("\nPython TimeStamp Generator for Period Pulse")
while True:
    time = input("\n-> Hours Minutes Seconds: ").split(" ")
    newTime = int(time[0]) * 3600
    if len(time) > 1:
        newTime += int(time[1]) * 60  
    if len(time) > 2:
        newTime += int(time[2])
    print(newTime)
    pyperclip.copy(newTime)
    