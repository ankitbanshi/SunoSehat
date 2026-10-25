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
3. Open **Scan Report**. Upload a report image or paste report text. The app reads English or Hindi text and asks Sarvam AI for a simple explanation in the selected language. Review and edit the text, then save it.
4. Open **My Health** to review saved report text, the simple text organizer, allergy notes, and the sample follow-up appointment.
5. Open **My Medicines** to add or edit a schedule, test a reminder, and review the visible dose history.
6. Open **Voice Assistant** and try a suggested command. Type works when browser speech recognition is unavailable.

## Data, permissions, and limits

- The app keeps a browser cache and syncs the profile, reports, medicines, appointments, and dose history to MongoDB using a private per-browser token. There is no sign-in or account recovery; this is not a production-grade medical record system.
- Report OCR runs in the browser and downloads the English or Hindi Tesseract model the first time it is needed. Report text is sent to Sarvam AI to prepare a plain-language explanation; Hindi speech is generated with Sarvam text-to-speech. Review important medical decisions with a qualified professional.
- Speech recognition and text-to-speech depend on browser support. The microphone is used only after the user taps the speak button. Notifications require browser permission.
- Reminder checks run only while the app is open. Browser notifications may not fire if the browser is closed or the device is offline.
- Explanations use Sarvam AI and are not a diagnosis, drug-interaction check, or confirmation that a medicine is safe.
- Allergy matching only flags an obvious text match in the saved medicine name. “No match” is not medical clearance.
- Add `SARVAM_API_KEY` and `MONGODB_URI` to the ignored `.env` file before running the app. Never commit `.env`.
