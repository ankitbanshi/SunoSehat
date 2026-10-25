# SunoSehat

SunoSehat is a voice-first local demo for organizing report text, medicine schedules, allergy notes, and reminders. It is an information organizer, not a medical service.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. Choose **Try demo patient** to load fictional sample data. Use **Reset demo** to restore that sample.

For a production build:

```sh
npm run build
npm start
```

## Demo walkthrough

1. Load the sample patient and review the next scheduled dose on Home.
2. Choose **Review dose**, then explicitly confirm a taken, missed, or skipped dose.
3. Open **Scan Report**. Upload a printed English report, review and edit OCR text and extracted fields, then save it. The OCR engine runs in the browser; a clear image works best.
4. Open **My Health** to review saved report text, the simple text organizer, allergy notes, and the sample follow-up appointment.
5. Open **My Medicines** to add or edit a schedule, test a reminder, and review the visible dose history.
6. Open **Voice Assistant** and try a suggested command. Type works when browser speech recognition is unavailable.

## Data, permissions, and limits

- The profile, reports, medicines, appointments, and dose history use browser `localStorage` on this device. There is no server database, account, encryption, or sync. Avoid shared devices and do not treat the demo as a secure medical record.
- Report OCR is performed in the browser and currently uses the English Tesseract model. The OCR engine may download its language model the first time. Handwriting and low-quality images can be inaccurate. OCR text is not medically verified.
- Speech recognition and text-to-speech depend on browser support. The microphone is used only after the user taps the speak button. Notifications require browser permission.
- Reminder checks run only while the app is open. Browser notifications may not fire if the browser is closed or the device is offline.
- Explanations are a deterministic text organizer; there is no AI API integration. The app does not diagnose, check drug interactions, or establish that a medicine is safe.
- Allergy matching only flags an obvious text match in the saved medicine name. “No match” is not medical clearance.
- No API key is needed for the demo.
