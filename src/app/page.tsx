"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Pause, Play, FileImage, FileText, HeartPulse, Home, Languages, Mic, MicOff, Pill, Plus, ScanLine, Settings, ShieldCheck, Sparkles, Stethoscope, Volume2, VolumeX, X } from "lucide-react";
import { createWorker } from "tesseract.js";

type Section = "Home" | "Scan Report" | "My Medicines" | "My Health" | "Voice Assistant";
type Medication = { id: string; name: string; strength: string; dosage: string; frequency: string; times: string[]; food: string; source: string; confirmed: boolean; active: boolean };
type Report = { id: string; title: string; date: string; text: string; created: string };
type Profile = { name: string; language: string; age: string; emergency: string; allergies: string[] };
type DoseMap = Record<string, { status: "taken" | "missed" | "skipped"; recordedAt: string }>;
type Appointment = { id: string; title: string; when: string; notes?: string };
const STORAGE = "sunosehat-v1";
function extractReportFields(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const pick = (labels: string[]) => { const line = lines.find(line => labels.some(label => new RegExp(`^${label}\\s*[:—-]`, "i").test(line))); if (!line) return ""; const separator = line.search(/[:—-](?:\s|$)/); return separator < 0 ? line : line.slice(separator + 1).trim(); };
  return [["Patient name",pick(["Patient(?: name)?"])],["Report date",pick(["Date","Report date"])],["Doctor / clinic",pick(["Doctor","Hospital","Clinic"])],["Condition mentioned",pick(["Diagnosis","Condition","Impression"])],["Medicine text",pick(["Medicine","Medication","Rx"])],["Medicine directions",pick(["Dosage instructions?","Dose","Directions","Instructions","How to take","Frequency","Schedule"])],["Food instructions",pick(["Food instructions?","Food","Before food","After food","With food"])],["Follow-up",pick(["Follow-up","Appointment"])]];
}

function dayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function makeDemo() {
  return {
    profile: { name: "Ramesh", language: "Hindi", age: "68", emergency: "", allergies: ["Penicillin — sample allergy"] } as Profile,
    meds: [
      { id: "demo-a", name: "Demo medicine A", strength: "Sample only", dosage: "Follow your own prescription", frequency: "Once daily", times: ["08:30"], food: "No instruction confirmed", source: "Fictional demo data", confirmed: true, active: true },
      { id: "demo-b", name: "Demo medicine B", strength: "Sample only", dosage: "Follow your own prescription", frequency: "Twice daily", times: ["14:00", "20:00"], food: "No instruction confirmed", source: "Fictional demo data", confirmed: true, active: true },
    ] as Medication[],
    reports: [{ id: "demo-report", title: "Sample clinic note", date: new Date().toLocaleDateString(), text: "SAMPLE DATA — FICTIONAL DOCUMENT\nPatient: Ramesh Demo\nDate: 25 October 2026\nClinic: SunoSehat Demonstration Clinic\nNote: This fictional sample contains no real diagnosis or prescription.\nFollow-up: Ask your healthcare professional if you have questions.", created: new Date().toISOString() }] as Report[],
    doses: {} as DoseMap,
    appointments: [{ id: "demo-appointment", title: "Sample follow-up", when: new Date(Date.now()+7*24*60*60*1000).toISOString(), notes: "Fictional sample appointment" }] as Appointment[],
  };
}

export default function Page() {
  const [section, setSection] = useState<Section>("Home");
  const [profile, setProfile] = useState<Profile>({ name: "", language: "Hindi", age: "", emergency: "", allergies: [] });
  const [meds, setMeds] = useState<Medication[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [doses, setDoses] = useState<DoseMap>({});
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [ready, setReady] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [allergyDraft, setAllergyDraft] = useState("");
  const [medForm, setMedForm] = useState(false);
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [medDraft, setMedDraft] = useState({ name: "", strength: "", dosage: "", frequency: "", times: "", food: "" });
  const [reportText, setReportText] = useState("");
  const [reportTitle, setReportTitle] = useState("Medical report");
  const [reportImage, setReportImage] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDose, setConfirmDose] = useState<Medication | null>(null);
  const [lastSpeech, setLastSpeech] = useState("");
  const [speechActive, setSpeechActive] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [explanationBusy, setExplanationBusy] = useState(false);
  const [reportExplanation, setReportExplanation] = useState("");
  const [explainedText, setExplainedText] = useState("");
  const [explainedLanguage, setExplainedLanguage] = useState("");
  const [voiceInput, setVoiceInput] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [voiceReply, setVoiceReply] = useState("नमस्ते! मैं आपकी दवाओं, रिपोर्ट और एलर्जी की जानकारी ढूँढ़ने में मदद कर सकता हूँ।");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [notifPermission, setNotifPermission] = useState("default");
  const [reminder, setReminder] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef("");
  const audioAutoPlayRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      let localData: any = null;
      try {
        const saved = localStorage.getItem(STORAGE);
        if (saved) {
          localData = JSON.parse(saved);
          setProfile(localData.profile ?? { name: "", language: "Hindi", age: "", emergency: "", allergies: [] });
          setMeds(localData.meds ?? []); setReports(localData.reports ?? []); setDoses(localData.doses ?? {});
          setAppointments(localData.appointments ?? (localData.isDemo ? makeDemo().appointments : [])); setIsDemo(!!localData.isDemo);
        }
        let token = localStorage.getItem("sunosehat-device-token");
        if (!token) { token = crypto.randomUUID(); localStorage.setItem("sunosehat-device-token", token); }
        const headers = { "x-device-token": token };
        const response = await fetch("/api/data", { headers });
        if (response.ok) {
          const remote = await response.json();
          if (remote.data) {
            localData = remote.data;
            setProfile(remote.data.profile ?? { name: "", language: "Hindi", age: "", emergency: "", allergies: [] });
            setMeds(remote.data.meds ?? []); setReports(remote.data.reports ?? []); setDoses(remote.data.doses ?? {});
            setAppointments(remote.data.appointments ?? []); setIsDemo(!!remote.data.isDemo);
            localStorage.setItem(STORAGE, JSON.stringify(remote.data));
          } else if (localData) {
            await fetch("/api/data", { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ data: localData }) });
          }
        } else {
          setNotice("MongoDB is unavailable. Your information is still saved on this device.");
        }
        if (!localData) setShowSetup(true);
      } catch {
        if (!localData) setShowSetup(true);
        setNotice("MongoDB is unavailable. Your information is still saved on this device.");
      }
      if ("Notification" in window) setNotifPermission(Notification.permission);
      setReady(true);
    };
    void load();
  }, []);
  useEffect(() => {
    if (!ready) return;
    const data = { profile, meds, reports, doses, appointments, isDemo };
    try { localStorage.setItem(STORAGE, JSON.stringify(data)); } catch { setNotice("Local storage is unavailable. Your changes may not persist after closing this browser."); }
    const timeout = window.setTimeout(async () => {
      try {
        const token = localStorage.getItem("sunosehat-device-token");
        if (!token) return;
        const response = await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json", "x-device-token": token }, body: JSON.stringify({ data }) });
        if (!response.ok) setNotice("MongoDB could not save this change. Your information is still saved on this device.");
      } catch { setNotice("MongoDB could not save this change. Your information is still saved on this device."); }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [ready, profile, meds, reports, doses, appointments, isDemo]);
  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!audioUrl || !audioAutoPlayRef.current || !audioRef.current) return; audioAutoPlayRef.current = false; audioRef.current.play().catch(() => setNotice("हिंदी ऑडियो तैयार है। सुनने के लिए ऑडियो प्ले दबाएँ।")); }, [audioUrl]);
  useEffect(() => { if (!lastQuery) setVoiceReply(profile.language === "Hindi" ? "नमस्ते! मैं आपकी दवाओं, रिपोर्ट और एलर्जी की जानकारी ढूँढ़ने में मदद कर सकता हूँ।" : "Hello! I can help you find your medicines, read your report, or review your saved allergies."); }, [profile.language, lastQuery]);
  useEffect(() => {
    if (!ready) return;
    const now = new Date(); const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    meds.filter(m => m.active && m.confirmed).forEach(m => m.times.forEach(time => {
      const key = `${dayKey()}_${m.id}_${time}`;
      const seen = JSON.parse(localStorage.getItem("sunosehat-reminded") || "{}");
      if (time === hhmm && !seen[key] && !doses[key]) {
        const msg = `It is time for your scheduled medicine. Please check the instructions given by your doctor.${m.food && m.food !== "No instruction confirmed" ? ` Your confirmed instruction says: ${m.food}.` : ""}`;
        setReminder(msg); speak(msg); if ("Notification" in window && Notification.permission === "granted") new Notification("SunoSehat medicine reminder", { body: msg });
        seen[key] = true; localStorage.setItem("sunosehat-reminded", JSON.stringify(seen));
      }
    }));
  }, [currentTime, ready, meds, doses]);

  const activeMeds = meds.filter(m => m.active);
  const todayDoses = activeMeds.flatMap(m => m.times.map(time => ({ med: m, time, key: `${dayKey()}_${m.id}_${time}` }))).sort((a,b) => a.time.localeCompare(b.time));
  const nextDose = todayDoses.find(d => !doses[d.key] && new Date(`${dayKey()}T${d.time}:00`) >= currentTime);
  const takenCount = todayDoses.filter(d => doses[d.key]?.status === "taken").length;
  const adherence = todayDoses.length ? Math.round(takenCount / todayDoses.length * 100) : 0;
  const todayLabel = currentTime.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const safetyMatch = (name: string) => profile.allergies.filter(a => { const token = a.split(/[—-]/)[0].trim().toLowerCase(); return token && name.toLowerCase().includes(token); });
  const persistNow = (next: Partial<{profile:Profile;meds:Medication[];reports:Report[];doses:DoseMap;appointments:Appointment[];isDemo:boolean}>) => { try { localStorage.setItem(STORAGE, JSON.stringify({ profile, meds, reports, doses, appointments, isDemo, ...next })); } catch { setNotice("Local storage is unavailable. Your changes may not persist after closing this browser."); } };

  const speak = useCallback(async (text: string) => {
    if (!("speechSynthesis" in window)) { setNotice("Spoken audio is not available in this browser."); return; }
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = ""; setAudioUrl("");
    let voices = synthesis.getVoices();
    let voice = voices.find(v => v.lang.toLowerCase().startsWith(profile.language === "Hindi" ? "hi" : "en-in"));
    if (profile.language === "Hindi" && !voice) {
      await new Promise<void>(resolve => {
        const timeout = window.setTimeout(resolve, 1200);
        synthesis.addEventListener("voiceschanged", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      });
      voices = synthesis.getVoices();
      voice = voices.find(v => v.lang.toLowerCase().startsWith("hi"));
    }
    if (profile.language === "Hindi" && !voice) {
      setSpeechActive(false);
      setNotice("इस ब्राउज़र में हिंदी आवाज़ उपलब्ध नहीं है। हिंदी आवाज़ वाला ब्राउज़र या सिस्टम वॉइस चुनें।");
      return;
    }
    if (!voice) voice = voices.find(v => v.lang.toLowerCase().startsWith("en"));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = profile.language === "Hindi" ? "hi-IN" : "en-IN";
    if (voice) u.voice = voice;
    u.onstart = () => { setSpeechActive(true); setSpeechPaused(false); };
    u.onend = () => { setSpeechActive(false); setSpeechPaused(false); };
    u.onerror = () => { setSpeechActive(false); setSpeechPaused(false); };
    setSpeechActive(true); setSpeechPaused(false); synthesis.speak(u); setLastSpeech(text);
  }, [profile.language]);
  const explainWithSarvam = async (text: string) => {
    if (!text.trim()) return "";
    setExplanationBusy(true);
    try {
      const response = await fetch("/api/report-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language: profile.language }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "रिपोर्ट की व्याख्या अभी उपलब्ध नहीं है।");
      setReportExplanation(result.summary);
      setExplainedText(text);
      setExplainedLanguage(profile.language);
      return result.summary as string;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "रिपोर्ट की व्याख्या अभी उपलब्ध नहीं है।");
      return "";
    } finally { setExplanationBusy(false); }
  };
  const playHindiAudio = async (text: string) => {
    setAudioLoading(true);
    try {
      const response = await fetch("/api/report-audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "हिंदी ऑडियो अभी उपलब्ध नहीं है।");
      }
      const blob = await response.blob();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url; audioAutoPlayRef.current = true;
      setAudioUrl(url); setSpeechActive(false); setSpeechPaused(false); setLastSpeech(text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "हिंदी ऑडियो अभी उपलब्ध नहीं है।");
    } finally { setAudioLoading(false); }
  };
  const listenToReport = async (text: string) => {
    stopSpeech();
    const summary = text === explainedText && reportExplanation && explainedLanguage === profile.language ? reportExplanation : await explainWithSarvam(text);
    if (!summary) return;
    if (profile.language === "Hindi") await playHindiAudio(summary);
    else speak(summary);
  };
  const pauseSpeech = () => {
    if (audioRef.current && !audioRef.current.paused) { audioRef.current.pause(); setSpeechPaused(true); return; }
    if ("speechSynthesis" in window && window.speechSynthesis.speaking) { window.speechSynthesis.pause(); setSpeechPaused(true); }
  };
  const resumeSpeech = () => {
    if (audioRef.current?.paused && audioUrl) { audioRef.current.play().then(() => setSpeechPaused(false)).catch(() => setNotice("ऑडियो फिर से चल नहीं पाया। प्ले बटन दबाएँ।")); return; }
    if ("speechSynthesis" in window && window.speechSynthesis.paused) { window.speechSynthesis.resume(); setSpeechPaused(false); }
  };
  const stopSpeech = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = ""; setAudioUrl(""); setSpeechActive(false); setSpeechPaused(false);
  };
  const addDemo = () => { const d = makeDemo(); setProfile(d.profile); setMeds(d.meds); setReports(d.reports); setDoses(d.doses); setAppointments(d.appointments); setIsDemo(true); persistNow({profile:d.profile,meds:d.meds,reports:d.reports,doses:d.doses,appointments:d.appointments,isDemo:true}); setShowSetup(false); setNotice("Demo patient loaded. Sample data is fictional."); };
  const resetDemo = () => { if (!confirm("Reset the demo profile, medicines, reports, and dose history?")) return; localStorage.removeItem(STORAGE); localStorage.removeItem("sunosehat-reminded"); const d = makeDemo(); setProfile(d.profile); setMeds(d.meds); setReports(d.reports); setDoses({}); setAppointments(d.appointments); setIsDemo(true); persistNow({profile:d.profile,meds:d.meds,reports:d.reports,doses:{},appointments:d.appointments,isDemo:true}); setShowSetup(false); setNotice("Demo reset."); };
  const saveProfile = () => { if (!profile.name.trim()) { setNotice("Please add a name or nickname to continue."); return; } setShowSetup(false); setNotice("Your profile is saved on this device."); };
  const addAllergy = () => { const a = allergyDraft.trim(); if (!a) return; if (!profile.allergies.some(x => x.toLowerCase() === a.toLowerCase())) { const nextProfile = { ...profile, allergies: [...profile.allergies, a] }; setProfile(nextProfile); persistNow({profile:nextProfile}); } setAllergyDraft(""); };
  const startNewMed = (m?: Medication) => { setEditMed(m ?? null); setMedDraft(m ? { name: m.name, strength: m.strength, dosage: m.dosage, frequency: m.frequency, times: m.times.join(", "), food: m.food } : { name: "", strength: "", dosage: "", frequency: "", times: "", food: "" }); setMedForm(true); };
  const saveMed = () => {
    const times = medDraft.times.split(",").map(t => t.trim()).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    if (!medDraft.name.trim() || !times.length) { setNotice("Enter a medicine name and at least one time in HH:MM format."); return; }
    const nameKey = medDraft.name.trim().toLowerCase();
    if (!editMed && activeMeds.some(m => m.name.toLowerCase() === nameKey)) { setNotice("A medicine with that name is already in your list."); return; }
    const item: Medication = { id: editMed?.id ?? crypto.randomUUID(), name: medDraft.name.trim(), strength: medDraft.strength.trim(), dosage: medDraft.dosage.trim(), frequency: medDraft.frequency.trim() || "As entered", times, food: medDraft.food.trim() || "No instruction confirmed", source: editMed?.source ?? "Patient / caregiver entered", confirmed: true, active: true };
    const nextMeds = editMed ? meds.map(m => m.id === item.id ? item : m) : [...meds, item]; setMeds(nextMeds); persistNow({meds:nextMeds}); setMedForm(false); setNotice("Medicine saved. Please follow your prescription and confirm unclear instructions with a professional.");
  };
  const doseAction = (m: Medication, status: "taken"|"missed"|"skipped", time?: string) => {
    const t = time ?? m.times[0]; const key = `${dayKey()}_${m.id}_${t}`;
    const nextDoses = { ...doses, [key]: { status, recordedAt: new Date().toISOString() } }; setDoses(nextDoses); persistNow({doses:nextDoses}); setConfirmDose(null);
    const msg = status === "taken" ? `${m.name} marked as taken.` : `${m.name} marked as ${status}.`;
    setNotice(msg); speak(msg);
  };
  const testReminder = () => { const msg = "This is a test reminder. It is time for your scheduled medicine. Please check your prescription."; setReminder(msg); speak(msg); if ("Notification" in window && Notification.permission === "granted") new Notification("SunoSehat test reminder", { body: msg }); };
  const requestNotifications = async () => { if (!("Notification" in window)) { setNotice("Browser notifications are not supported here. In-app reminders still work while the app is open."); return; } const p = await Notification.requestPermission(); setNotifPermission(p); setNotice(p === "granted" ? "Notifications are enabled for this browser." : "Notifications were not enabled. In-app reminders still work while the app is open."); };
  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setNotice("Choose a JPEG, PNG, or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { setNotice("Image is too large. Choose a file under 8 MB."); return; }
    setReportImage(URL.createObjectURL(file)); setOcrBusy(true); setOcrStatus(profile.language==="Hindi"?"तस्वीर से रिपोर्ट का पाठ निकाला जा रहा है…":"Reading the report…");
    try { const worker = await createWorker(profile.language === "Hindi" ? "hin" : "eng", 1, { logger: m => { if (m.status === "recognizing text") setOcrStatus(profile.language==="Hindi"?`रिपोर्ट पढ़ रहे हैं… ${Math.round(m.progress * 100)}%`:`Reading the report… ${Math.round(m.progress * 100)}%`); } }); const { data } = await worker.recognize(file); await worker.terminate(); setReportText(data.text); setReportExplanation(""); setExplainedText(""); setExplainedLanguage(""); setOcrStatus(profile.language==="Hindi"?"रिपोर्ट का पाठ तैयार है। आसान सारांश बनाया जा रहा है…":"Report text is ready. Preparing a simple explanation…"); await explainWithSarvam(data.text); }
    catch { setOcrStatus(profile.language==="Hindi"?"इस तस्वीर से पाठ नहीं मिल पाया। आप नीचे रिपोर्ट का पाठ लिख या चिपका सकते हैं।":"I couldn’t read text from this image. You can type or paste the report below."); }
    finally { setOcrBusy(false); }
  };
  const saveReport = () => { if (!reportText.trim()) { setNotice("Add report text before saving."); return; } const r = { id: crypto.randomUUID(), title: reportTitle.trim() || "Medical report", date: new Date().toLocaleDateString(), text: reportText.trim(), created: new Date().toISOString() }; const nextReports = [r, ...reports]; setReports(nextReports); persistNow({reports:nextReports}); setNotice("Report saved on this device. Please review extracted details with your healthcare professional."); setSection("My Health"); };
  const explain = (text: string) => {
    const fields = extractReportFields(text);
    const get = (label: string) => {
      const raw = fields.find(([name]) => name === label)?.[1] as string | undefined;
      if (!raw) return "";
      const colon = raw.indexOf(":"); return colon >= 0 ? raw.slice(colon + 1).trim() : raw;
    };
    const patient = get("Patient name"); const date = get("Report date"); const clinic = get("Doctor / clinic");
    const condition = get("Condition mentioned"); const medicine = get("Medicine text");
    const directions = get("Medicine directions"); const food = get("Food instructions"); const followUp = get("Follow-up");
    const hindi = profile.language === "Hindi";
    const plainHindi = (value: string) => {
      const normal = value.toLowerCase().replace(/\s+/g, " ").trim();
      if (/take (one|1) tablet (by mouth|orally) (twice daily|twice a day|2 times daily) after (meals|food)/.test(normal)) return "एक गोली मुँह से लें, दिन में दो बार, खाना खाने के बाद";
      if (/take (one|1) tablet (by mouth|orally) (once daily|once a day|1 time daily) after (meals|food)/.test(normal)) return "एक गोली मुँह से लें, दिन में एक बार, खाना खाने के बाद";
      return value
      .replace(/take\s+(one|1)\s+tablet\s+(by\s+mouth|orally)/ig, "मुँह से एक गोली लें")
      .replace(/take\s+(one|1)\s+capsule\s+(by\s+mouth|orally)/ig, "मुँह से एक कैप्सूल लें")
      .replace(/take\s+(one|1)\s+tablet/ig, "एक गोली लें")
      .replace(/take\s+(one|1)\s+capsule/ig, "एक कैप्सूल लें")
      .replace(/\b(one|1)\s+tablet\b/ig, "एक गोली")
      .replace(/\b(one|1)\s+capsule\b/ig, "एक कैप्सूल")
      .replace(/take\s+by\s+mouth|take\s+orally|by\s+mouth|orally/ig, "मुँह से लें")
      .replace(/three times (a |per )?day|three times daily|3 times daily/ig, "दिन में तीन बार")
      .replace(/twice (a |per )?day|twice daily|two times a day|two times daily|2 times daily/ig, "दिन में दो बार")
      .replace(/once (a |per )?day|once daily|one time a day/ig, "दिन में एक बार")
      .replace(/after meals|after food/ig, "खाना खाने के बाद")
      .replace(/before meals|before food/ig, "खाना खाने से पहले")
      .replace(/with meals|with food/ig, "खाने के साथ")
      .replace(/with water/ig, "पानी के साथ")
      .replace(/every (8|eight) hours/ig, "हर आठ घंटे में")
      .replace(/every (12|twelve) hours/ig, "हर बारह घंटे में")
      .replace(/every morning/ig, "हर सुबह")
      .replace(/every evening/ig, "हर शाम")
      .replace(/as needed/ig, "ज़रूरत पड़ने पर")
      .replace(/at bedtime|before bed/ig, "सोने से पहले")
      .replace(/for (\d+) days?/ig, "$1 दिनों तक")
      .replace(/for (\d+) weeks?/ig, "$1 हफ्तों तक")
      .replace(/next week/ig, "अगले हफ्ते")
      .replace(/next month/ig, "अगले महीने")
      .replace(/follow up/ig, "फिर से जाँच");
    };
    const details: string[] = [];
    if (patient) details.push(hindi ? `आपकी रिपोर्ट में मरीज़ का नाम ${patient} है।` : `The report is for ${patient}.`);
    if (date) details.push(hindi ? `रिपोर्ट की तारीख ${date} है।` : `The report is dated ${date}.`);
    if (clinic) details.push(hindi ? `इसमें ${clinic} का नाम डॉक्टर या क्लिनिक के रूप में है।` : `It names ${clinic} as the doctor or clinic.`);
    if (condition) details.push(hindi ? `रिपोर्ट में यह लिखा है: ${condition}.` : `The report says: ${condition}.`);
    if (medicine) {
      if (directions) details.push(hindi ? `दवा ${medicine} के लिए: ${plainHindi(directions)}.` : `For ${medicine}, the report says: “${directions}.”`);
      else details.push(hindi ? `रिपोर्ट में ${medicine} दवा का नाम है, लेकिन इसे कितनी बार या कब लेना है, यह नहीं लिखा। मैं इसका समय या तरीका अनुमान से नहीं बताऊँगा।` : `The report names ${medicine}, but it doesn’t say how often or when to take it. I won’t guess; please check the prescription or ask a doctor or pharmacist.`);
    } else if (directions) details.push(hindi ? `दवा लेने का निर्देश: ${plainHindi(directions)}.` : `Medicine instruction: “${directions}.”`);
    if (food) details.push(hindi ? `खाने से जुड़ा निर्देश: ${plainHindi(food)}.` : `Food instruction: “${food}.”`);
    if (followUp) details.push(hindi ? `आगे की मुलाक़ात ${plainHindi(followUp)} है।` : `For follow-up, it says: ${followUp}.`);
    if (!details.length) return hindi ? "मैं इस पाठ से कोई साफ़ जानकारी नहीं पहचान पाया। रिपोर्ट में जो लिखा है, उसे नीचे देख सकते हैं।" : "I couldn’t find clear details to explain. You can read the report text below.";
    const opening = hindi ? "मैंने आपकी रिपोर्ट पढ़ी। आसान हिंदी में, इसका मतलब है:" : "I read your report. Here’s what it says in simple words:";
    const close = hindi ? "दवा की मात्रा या समय को लेकर कोई बात साफ़ न हो, तो डॉक्टर या फार्मासिस्ट से पूछें।" : "If the dose or timing is unclear, please ask your doctor or pharmacist.";
    return [opening, ...details.map(line => `• ${line}`), close].join("\n");
  };
  const handleVoice = (text: string) => {
    const q = text.toLowerCase(); const hindi = profile.language === "Hindi";
    setLastQuery(text); setVoiceInput("");
    let translateReportForSpeech = false;
    let reply = hindi ? "मैं इस चिकित्सा सवाल का सुरक्षित जवाब नहीं दे सकता। कृपया अपने डॉक्टर या फार्मासिस्ट से पूछें।" : "I can't safely answer that medical question. Please ask your doctor or pharmacist.";
    if ((q.includes("taken") || q.includes("take my medicine") || q.includes("ले ली")) && (q.includes("medicine") || q.includes("medication") || q.includes("दवा"))) {
      if (nextDose) { setSection("Home"); setConfirmDose(nextDose.med); reply = hindi ? `कृपया पुष्टि करें: क्या ${nextDose.med.name} को ली हुई दवा के रूप में दर्ज करें?` : `Please confirm in the dialog: mark ${nextDose.med.name} as taken?`; }
      else reply = hindi ? "आज के लिए कोई बाकी तय दवा नहीं है।" : "There is no remaining scheduled dose to confirm today.";
    } else if (q.includes("medicine") || q.includes("medication") || q.includes("दवा")) {
      if (q.includes("next") || q.includes("when") || q.includes("अगली") || q.includes("कब")) reply = nextDose ? (hindi ? `आपकी अगली तय दवा ${nextDose.time} बजे है। दवा लेने का तरीका अपनी पर्ची पर देख लें।` : `Your next scheduled medicine is ${nextDose.med.name} at ${nextDose.time}. Please check the instructions on your prescription.`) : (hindi ? "आज के लिए कोई अगली तय दवा नहीं दिख रही।" : "I don't see a remaining scheduled medicine for today.");
      else reply = activeMeds.length ? (hindi ? `आपकी ${activeMeds.length} दवाएँ यहाँ सेव हैं: ${activeMeds.map(m=>m.name).join(", ")}।` : `You have ${activeMeds.length} active medicines saved: ${activeMeds.map(m=>m.name).join(", ")}.`) : (hindi ? "अभी कोई दवा सेव नहीं है।" : "No medicines are saved yet.");
    } else if (q.includes("allerg") || q.includes("एलर्जी")) reply = profile.allergies.length ? (hindi ? `आपने ये एलर्जी दर्ज की हैं: ${profile.allergies.join(", ")}। यह सेव की हुई जानकारी है, दवा की सुरक्षा की जाँच नहीं।` : `Your recorded allergies are: ${profile.allergies.join(", ")}. This is your saved information, not a safety assessment.`) : (hindi ? "कोई एलर्जी सेव नहीं है। इसका मतलब यह नहीं कि आपको एलर्जी नहीं है।" : "No allergies are saved. That does not mean you have no allergies.");
    else if (q.includes("report") || q.includes("रिपोर्ट")) { reply = reports[0] ? explain(reports[0].text) : (hindi ? "अभी कोई मेडिकल रिपोर्ट सेव नहीं है।" : "No medical report is saved yet."); translateReportForSpeech = !!reports[0] && hindi; }
    else if (q.includes("remind") || q.includes("याद दिला")) {
      const msg = nextDose ? (hindi ? `${nextDose.med.name} लेने का तय समय ${nextDose.time} बजे है। कृपया डॉक्टर की दी हुई हिदायत देखें।` : `It is time for your scheduled medicine, ${nextDose.med.name}. Please check the instructions given by your doctor.`) : (hindi ? "यह एक नमूना रिमाइंडर है। अपनी दवा की पर्ची देख लें।" : "This is a test reminder. Please check your own prescription.");
      setReminder(msg); if ("Notification" in window && Notification.permission === "granted") new Notification(hindi ? "दवा का रिमाइंडर" : "SunoSehat test reminder", { body: msg }); reply = msg;
    } else if (q.includes("repeat") || q.includes("दोहर")) reply = lastSpeech || voiceReply;
    else if (q.includes("stop") || q.includes("बंद करो")) { stopSpeech(); reply = hindi ? "आवाज़ रोक दी है।" : "Speaking stopped."; }
    else if (q.includes("hindi") || q.includes("हिंदी")) { setProfile(p => ({ ...p, language: "Hindi" })); reply = "भाषा हिन्दी कर दी गई है।"; }
    else if (q.includes("hello") || q.includes("नमस्ते")) reply = hindi ? "नमस्ते! आप अपनी सेव की हुई दवाओं, रिपोर्ट या एलर्जी के बारे में पूछ सकते हैं।" : "Namaste! You can ask about your saved medicines, next reminder, report, or allergies.";
    setVoiceReply(reply); if (!q.includes("stop") && !q.includes("बंद करो")) { if (translateReportForSpeech && reports[0]) listenToReport(reports[0].text); else speak(reply); }
  };
  const startListening = () => {
    setMicError(""); const w = window as any; const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) { setMicError("Speech recognition is unavailable in this browser. Use the text box below or try a supported browser."); return; }
    try { const rec = new Recognition(); recognitionRef.current = rec; rec.lang = profile.language === "Hindi" ? "hi-IN" : "en-IN"; rec.interimResults = false; rec.onstart = () => setListening(true); rec.onend = () => setListening(false); rec.onerror = (e: any) => { setListening(false); setMicError(e.error === "not-allowed" ? "Microphone permission was denied. You can type your request below." : "I could not hear that. Please try again or use the text box."); }; rec.onresult = (e: any) => handleVoice(e.results[0][0].transcript); rec.start(); } catch { setListening(false); setMicError("Could not start the microphone. Check browser permission and try again."); }
  };
  const closeDialog = () => { setShowSetup(false); setMedForm(false); setConfirmDose(null); };

  if (!ready) return <main className="boot-screen"><div className="boot-mark"><HeartPulse size={24}/></div><b>SunoSehat</b><span>Loading your health information…</span></main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><HeartPulse size={24}/></div><div><b>SunoSehat</b><small>Your Health, In Your Language</small></div></div>
      <div className="side-label">YOUR SPACE</div>
      <nav aria-label="Main navigation">{([ ["Home",Home], ["Scan Report",ScanLine], ["My Medicines",Pill], ["My Health",Activity], ["Voice Assistant",Mic] ] as const).map(([label,Icon])=><button key={label} className={`nav-item ${section===label?"active":""}`} onClick={()=>setSection(label)}><Icon size={19}/><span>{label}</span>{label==="Voice Assistant"&&<span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">{profile.name ? profile.name[0].toUpperCase() : "?"}</div><div className="profile-mini-text"><b>{profile.name || "Your profile"}</b><small>{isDemo ? "SAMPLE PATIENT" : "On this device"}</small></div><button className="icon-button" aria-label="Edit profile" onClick={()=>setShowSetup(true)}><Settings size={17}/></button></div><div className="local-note"><ShieldCheck size={16}/><span>Your data stays on this device</span></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="mobile-brand"><div className="brand-mark"><HeartPulse size={20}/></div><b>SunoSehat</b></div><div className="top-date"><CalendarDays size={16}/>{todayLabel}</div><button className="language-select" onClick={()=>setProfile(p=>({...p,language:p.language==="English"?"Hindi":"English"}))}><Languages size={16}/>{profile.language}<ChevronDown size={14}/></button></header>
      {isDemo && <div className="demo-banner"><Sparkles size={16}/><b>Sample data</b><span>Fictional demo patient. Not medical advice.</span><button onClick={resetDemo}>Reset demo</button></div>}
      {section === "Home" && <div className="page-content">
        <div className="welcome-row"><div><div className="eyebrow">YOUR HEALTH, IN YOUR LANGUAGE</div><h1>{profile.name ? `${profile.language==="Hindi"?"नमस्ते":"Namaste"}, ${profile.name}!` : "Welcome to SunoSehat"}</h1><p className="subhead">Here’s a simple look at your health for today.</p></div><button className="round-assistant" onClick={()=>setSection("Voice Assistant")} aria-label="Open voice assistant"><Mic size={23}/><span>Talk to Suno</span></button></div>
        <div className="hero-card"><div className="hero-copy"><span className="pill-tag"><Clock3 size={14}/> NEXT MEDICINE</span><h2>{nextDose ? nextDose.med.name : "You're all caught up"}</h2><p>{nextDose ? `Scheduled for ${formatTime(nextDose.time)}${nextDose.med.food !== "No instruction confirmed" ? ` · ${nextDose.med.food}` : ""}` : "No more scheduled doses today."}</p>{nextDose&&<button className="white-cta" onClick={()=>setConfirmDose(nextDose.med)}>Review dose <ArrowRight size={17}/></button>}</div><div className="hero-art"><div className="art-circle"><Pill size={40}/></div><span className="sparkle s1">✦</span><span className="sparkle s2">✧</span></div></div>
        {reminder&&<div className="reminder-alert"><Bell size={19}/><div><b>Reminder</b><p>{reminder}</p></div><button onClick={()=>setReminder("")} aria-label="Dismiss reminder"><X size={18}/></button></div>}
        <div className="quick-actions"><button className="quick-action" onClick={()=>setSection("Scan Report")}><span className="quick-icon"><ScanLine size={22}/></span><span><b>Scan a report</b><small>Take a photo or upload an image</small></span><ArrowRight size={17}/></button><button className="quick-action" onClick={()=>setSection("Voice Assistant")}><span className="quick-icon coral"><Mic size={22}/></span><span><b>Ask Suno Assistant</b><small>Speak or type a question</small></span><ArrowRight size={17}/></button></div>
        <div className="section-heading"><div><h2>Today’s medicines</h2><p>Only follow instructions confirmed by your healthcare professional.</p></div><button className="text-link" onClick={()=>setSection("My Medicines")}>View all <ArrowRight size={16}/></button></div>
        <div className="schedule-list">{todayDoses.length ? todayDoses.map(({med,time,key})=><DoseRow key={key} med={med} time={time} dose={doses[key]} onTake={()=>setConfirmDose(med)} onMiss={()=>doseAction(med,"missed",time)}/>) : <div className="empty-card"><div className="empty-icon"><Pill size={22}/></div><b>No medicines scheduled yet</b><p>Add your prescribed schedule to see reminders here.</p><button className="outline-button" onClick={()=>startNewMed()}>Add a medicine</button></div>}</div>
        <div className="dashboard-bottom"><div className="adherence-card"><div className="mini-card-title"><span className="mini-icon mint"><CheckCircle2 size={18}/></span><div><b>Today’s progress</b><small>Based on doses you marked taken</small></div></div><div className="progress-row"><div className="progress-track"><span style={{width:`${adherence}%`}}/></div><b>{adherence}%</b></div><small className="muted">{takenCount} of {todayDoses.length} scheduled doses marked taken</small></div><div className="allergy-card"><div className="mini-card-title"><span className="mini-icon yellow"><AlertTriangle size={18}/></span><div><b>Allergy information</b><small>Recorded profile · not a safety clearance</small></div></div><p>{profile.allergies.length?profile.allergies.join(", "):"No allergies recorded. This does not mean there are no allergies."}</p><button className="text-link" onClick={()=>setSection("My Health")}>Review profile <ArrowRight size={15}/></button></div></div>
        <div className="section-heading recent-heading"><div><h2>Recent reports</h2><p>Your saved documents, stored on this device.</p></div><button className="text-link" onClick={()=>setSection("My Health")}>All reports <ArrowRight size={16}/></button></div>
        <div className="reports-row">{reports.slice(0,2).map(r=><button className="report-tile" key={r.id} onClick={()=>{setReportText(r.text);setReportExplanation("");setExplainedText("");setExplainedLanguage("");setReportTitle(r.title);setSection("My Health");}}><span className="file-icon"><FileText size={19}/></span><span><b>{r.title}</b><small>{r.date} · Saved report</small></span><ArrowRight size={16}/></button>)}{!reports.length&&<div className="report-empty">No reports yet. Scan a document to get started.</div>}</div>
      </div>}

      {section === "Scan Report" && <div className="page-content narrow-page"><div className="eyebrow">DOCUMENTS</div><h1>{profile.language==="Hindi"?"मेडिकल रिपोर्ट समझें":"Understand a medical report"}</h1><p className="subhead">{profile.language==="Hindi"?"रिपोर्ट की तस्वीर जोड़ें। इसका पाठ आसान भाषा में समझाने के लिए Sarvam AI को भेजा जाएगा।":"Add a report image. Its text is sent to Sarvam AI for a simple explanation."}</p><div className="scan-card"><div className="scan-drop"><div className="scan-illustration"><FileImage size={32}/></div><h2>{profile.language==="Hindi"?"रिपोर्ट की तस्वीर जोड़ें":"Add a report image"}</h2><p>JPEG, PNG या WebP · 8 MB तक</p><div className="button-row"><button className="primary-button" onClick={()=>inputRef.current?.click()}><ScanLine size={17}/>{profile.language==="Hindi"?"तस्वीर चुनें":"Choose image"}</button><label className="outline-button file-label">{profile.language==="Hindi"?"कैमरा इस्तेमाल करें":"Use camera"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>chooseFile(e.target.files?.[0])}/></label></div><input ref={inputRef} className="hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>chooseFile(e.target.files?.[0])}/></div></div>{reportImage&&<div className="image-preview"><img src={reportImage} alt="Selected medical report preview"/><button className="icon-button" aria-label="Remove image" onClick={()=>{setReportImage("");setOcrStatus("");}}><X size={18}/></button></div>}{ocrStatus&&<div className={`status-line ${ocrBusy?"loading":""}`} aria-live="polite">{ocrBusy?<span className="spinner"/>:<CheckCircle2 size={17}/>} {ocrStatus}</div>}<div className="editor-card"><label className="field-label" htmlFor="report-title">{profile.language==="Hindi"?"रिपोर्ट का नाम":"Report name"}</label><input id="report-title" className="text-input" value={reportTitle} onChange={e=>setReportTitle(e.target.value)}/><div className="field-label-row"><label className="field-label" htmlFor="report-text">{profile.language==="Hindi"?"रिपोर्ट का पाठ":"Report text"} <span>· {profile.language==="Hindi"?"बदल सकते हैं":"editable"}</span></label><button className="text-link" onClick={()=>listenToReport(reportText)} disabled={!reportText||explanationBusy||audioLoading}><Volume2 size={15}/> {profile.language==="Hindi"?(explanationBusy?"समझा रहे हैं…":audioLoading?"हिंदी आवाज़ तैयार हो रही है…":"हिंदी में सुनें"):"Listen"}</button></div><textarea id="report-text" className="text-area report-editor" value={reportText} onChange={e=>{setReportText(e.target.value);setReportExplanation("");setExplainedText("");setExplainedLanguage("");}} onBlur={()=>{if(reportText.trim()&&(explainedText!==reportText||explainedLanguage!==profile.language))void explainWithSarvam(reportText);}} placeholder={profile.language==="Hindi"?"यहाँ रिपोर्ट का पाठ लिखें या चिपकाएँ।":"Report text will appear here. You can also type or paste it."}/><div className="structured-preview"><div className="structured-heading"><FileText size={16}/> {profile.language==="Hindi"?"रिपोर्ट की जानकारी":"Report details"} <small>{profile.language==="Hindi"?"यहाँ रिपोर्ट में लिखी जानकारी है":"Information written in the report"}</small></div><div className="structured-grid">{extractReportFields(reportText).filter(([,value])=>Boolean(value)).map(([label,value])=><div key={label}><small>{profile.language==="Hindi"?({"Patient name":"मरीज़ का नाम","Report date":"रिपोर्ट की तारीख","Doctor / clinic":"डॉक्टर / क्लिनिक","Condition mentioned":"रिपोर्ट में लिखी स्थिति","Medicine text":"दवा का नाम","Medicine directions":"दवा लेने का तरीका","Food instructions":"खाने से जुड़ा निर्देश","Follow-up":"आगे की मुलाक़ात"}[label]||label):label}</small><b>{value}</b></div>)}{!extractReportFields(reportText).some(([,value])=>Boolean(value))&&<p className="muted">{profile.language==="Hindi"?"रिपोर्ट की जानकारी का आसान सारांश नीचे दिया गया है।":"A simple explanation of the report appears below."}</p>}</div></div><section className="summary-preview" aria-live="polite"><div className="summary-preview-heading"><div><Sparkles size={16}/><b>{profile.language==="Hindi"?"आसान भाषा में":"Simple explanation"}</b></div><div className="speech-controls"><button className="text-link" onClick={()=>listenToReport(reportText)} disabled={!reportText.trim()||explanationBusy||audioLoading}><Volume2 size={15}/> {profile.language==="Hindi"?(explanationBusy?"समझा रहे हैं…":audioLoading?"हिंदी आवाज़ तैयार हो रही है…":"हिंदी में सुनें"):"Listen"}</button><button className="outline-button compact" onClick={speechPaused?resumeSpeech:pauseSpeech} disabled={!speechActive}>{speechPaused?<Play size={14}/>:<Pause size={14}/>} {speechPaused?(profile.language==="Hindi"?"फिर चलाएँ":"Resume"):(profile.language==="Hindi"?"रोकें":"Pause")}</button><button className="outline-button compact" onClick={stopSpeech} disabled={!speechActive}><VolumeX size={14}/> {profile.language==="Hindi"?"बंद":"Stop"}</button></div></div><p className="explanation">{reportText.trim()?(reportExplanation&&explainedText===reportText&&explainedLanguage===profile.language?reportExplanation:(explanationBusy?(profile.language==="Hindi"?"रिपोर्ट को आसान भाषा में समझा जा रहा है…":"Preparing a simple explanation…"):explain(reportText))):(profile.language==="Hindi"?"रिपोर्ट जोड़ें या उसका पाठ डालें, फिर यहाँ आसान भाषा में समझें।":"Add or upload report text to see a plain-language explanation here.")}</p></section><p className="helper-text"><AlertTriangle size={15}/>{profile.language==="Hindi"?"रिपोर्ट को आसान हिंदी में समझाया जाता है और आवाज़ में सुनाया जाता है। यह सेवा Sarvam AI का उपयोग करती है।":"Sarvam AI prepares the simple explanation and Hindi audio from your report text."}</p><button className="primary-button" onClick={saveReport} disabled={!reportText.trim()}><Check size={17}/> {profile.language==="Hindi"?"रिपोर्ट सेव करें":"Save report"}</button></div></div>}

      {section === "My Medicines" && <div className="page-content"><div className="page-title-row"><div><div className="eyebrow">YOUR SCHEDULE</div><h1>My medicines</h1><p className="subhead">Saved instructions are not a substitute for your prescription.</p></div><button className="primary-button" onClick={()=>startNewMed()}><Plus size={17}/> Add medicine</button></div><div className="safety-strip"><ShieldCheck size={21}/><div><b>Safety information</b><span>No match found is not proof that a medicine is safe. Ask a healthcare professional about any concern.</span></div></div><div className="medicine-cards">{activeMeds.length?activeMeds.map(m=><article className="medicine-card" key={m.id}><div className="medicine-top"><div className="med-icon"><Pill size={22}/></div><div className="med-name"><h3>{m.name}</h3><p>{m.strength||"Strength not recorded"} · {m.frequency}</p></div><button className="outline-button compact" onClick={()=>startNewMed(m)}>Edit</button></div><div className="med-detail-grid"><div><small>DOSAGE AS ENTERED</small><p>{m.dosage||"Not recorded — check prescription"}</p></div><div><small>SCHEDULED TIMES</small><p>{m.times.map(formatTime).join(" · ")}</p></div><div><small>FOOD INSTRUCTION</small><p>{m.food||"No specific food instruction confirmed. Please follow your prescription and ask your doctor or pharmacist if unsure."}</p></div><div><small>INFORMATION SOURCE</small><p>{m.source}{m.confirmed?" · confirmed by user":" · needs confirmation"}</p></div></div>{safetyMatch(m.name).length>0?<div className="risk-warning"><AlertTriangle size={18}/><div><b>Possible allergy match — review required</b><p>Medicine text matches recorded allergy: {safetyMatch(m.name).join(", ")}. Verify with a qualified healthcare professional before proceeding. This is not a diagnosis.</p></div></div>:<div className="safety-neutral"><CircleHelp size={16}/>No match detected in available text. This is not a medical clearance.</div>}<div className="medicine-foot"><span><Clock3 size={15}/> Next: {m.times.map(formatTime).join(", ")}</span><button className="text-link danger-link" onClick={()=>setMeds(ms=>ms.map(x=>x.id===m.id?{...x,active:false}:x))}>Remove</button></div></article>):<div className="empty-card"><Pill size={25}/><b>No medicines saved</b><p>Add details exactly as prescribed. Unclear details should be confirmed with a professional.</p></div>}</div><div className="section-heading history-heading"><div><h2>Today’s dose history</h2><p>Only actions you confirm are recorded.</p></div></div><div className="history-card">{todayDoses.filter(d=>doses[d.key]).length?todayDoses.filter(d=>doses[d.key]).map(d=><div className="history-row" key={d.key}><CheckCircle2 size={17}/><b>{d.med.name}</b><span>{formatTime(d.time)}</span><em className={`status-chip ${doses[d.key]?.status}`}>{doses[d.key]?.status}</em></div>):<p className="muted">No doses marked yet today.</p>}</div><div className="reminder-settings"><div className="reminder-copy"><span className="mini-icon mint"><Bell size={18}/></span><div><b>Reminders while app is open</b><small>Enable browser permission to show reminders at scheduled times. They may not appear while closed or offline.</small></div></div><div className="button-row"><button className="outline-button" onClick={requestNotifications}>{notifPermission==="granted"?"Notifications enabled":"Enable notifications"}</button><button className="outline-button" onClick={testReminder}><Volume2 size={16}/> Test reminder</button></div></div></div>}

      {section === "My Health" && <div className="page-content"><div className="eyebrow">YOUR HEALTH RECORD</div><h1>My health</h1><p className="subhead">A private, simple record saved in this browser on this device.</p><div className="health-grid"><section className="health-card"><div className="health-title"><span className="mini-icon yellow"><AlertTriangle size={18}/></span><div><h2>Allergies & safety</h2><p>Patient / caregiver reported · no automated clearance</p></div></div><div className="allergy-list">{profile.allergies.length?profile.allergies.map((a,i)=><div className="allergy-item" key={i}><AlertTriangle size={16}/><span>{a}</span><button className="icon-button" aria-label={`Remove ${a}`} onClick={()=>setProfile(p=>({...p,allergies:p.allergies.filter((_,ix)=>ix!==i)}))}><X size={15}/></button></div>):<p className="muted">No allergies recorded. Missing information does not mean no allergies.</p>}</div><div className="inline-form"><input className="text-input" value={allergyDraft} onChange={e=>setAllergyDraft(e.target.value)} placeholder="Add an allergy or substance" onKeyDown={e=>e.key==="Enter"&&addAllergy()}/><button className="outline-button" onClick={addAllergy}><Plus size={16}/> Add</button></div><p className="helper-text">If a medicine may match an allergy, check with your doctor or pharmacist before proceeding.</p></section><section className="health-card"><div className="health-title"><span className="mini-icon mint"><HeartPulse size={18}/></span><div><h2>Patient profile</h2><p>Can be edited by patient or caregiver</p></div><button className="text-link" onClick={()=>setShowSetup(true)}>Edit</button></div><div className="profile-details"><div><small>NAME</small><b>{profile.name||"Not set"}</b></div><div><small>LANGUAGE</small><b>{profile.language}</b></div><div><small>AGE</small><b>{profile.age||"Not recorded"}</b></div><div><small>EMERGENCY CONTACT</small><b>{profile.emergency||"Not recorded"}</b></div></div><p className="caregiver-note"><ShieldCheck size={16}/> Patient / caregiver provided details are stored locally on this device. Avoid using shared devices.</p></section></div><div className="health-subhead"><div><h2>Upcoming appointments</h2><p>From information saved on this device.</p></div><button className="outline-button" onClick={()=>{ const title=prompt("Appointment name or clinic"); if(!title?.trim()) return; const when=prompt("Date and time (YYYY-MM-DDTHH:MM)"); if(!when || Number.isNaN(new Date(when).getTime())) { setNotice("Enter a valid local date and time."); return; } const item={id:crypto.randomUUID(),title:title.trim(),when:new Date(when).toISOString()}; const next=[...appointments,item].sort((a,b)=>a.when.localeCompare(b.when)); setAppointments(next); persistNow({appointments:next}); }}><Plus size={16}/> Add appointment</button></div><div className="saved-reports">{appointments.length?appointments.map(a=><div className="report-tile" key={a.id}><span className="mini-icon mint"><CalendarDays size={18}/></span><span><b>{a.title}</b><small>{new Date(a.when).toLocaleString()} · {a.notes||"Patient / caregiver entered"}</small></span><button className="icon-button" aria-label={`Remove ${a.title}`} onClick={()=>{const next=appointments.filter(x=>x.id!==a.id);setAppointments(next);persistNow({appointments:next});}}><X size={15}/></button></div>):<p className="muted">No upcoming appointments saved.</p>}</div><div className="health-subhead" style={{marginTop:24}}><div><h2>Saved reports</h2><p>Review the saved report text and explanation.</p></div><button className="outline-button" onClick={()=>setSection("Scan Report")}><ScanLine size={16}/> Scan report</button></div><div className="saved-reports">{reports.length?reports.map(r=><article className="saved-report" key={r.id}><div className="report-head"><span className="file-icon"><FileText size={19}/></span><div><h3>{r.title}</h3><small>{r.date} · reviewed text</small></div><button className="text-link" onClick={()=>listenToReport(r.text)}><Volume2 size={16}/> Listen</button></div><div className="explain-label"><Sparkles size={15}/> PLAIN-LANGUAGE SUMMARY</div><p className="explanation">{explain(r.text)}</p><details><summary>Review extracted text</summary><pre>{r.text}</pre></details><button className="text-link danger-link" onClick={()=>setReports(rs=>rs.filter(x=>x.id!==r.id))}>Delete report</button></article>):<div className="empty-card"><FileText size={24}/><b>No reports saved</b><p>Scan a printed report to view its text and a simple, non-diagnostic explanation.</p><button className="outline-button" onClick={()=>setSection("Scan Report")}>Scan a report</button></div>}</div><div className="disclaimer"><Stethoscope size={18}/><span>SunoSehat helps organize information. It does not diagnose, verify prescriptions, or replace a qualified healthcare professional.</span></div></div>}

      {section === "Voice Assistant" && <div className="page-content narrow-page"><div className="eyebrow">SPEAK OR TYPE</div><h1>Suno Assistant</h1><p className="subhead">Ask about information saved in this app. I can’t diagnose or recommend treatment.</p><div className="assistant-card"><div className="assistant-top"><div className="assistant-avatar"><Mic size={23}/></div><div><b>Suno Assistant</b><small>English and Hindi · रिपोर्ट की हिंदी आवाज़ Sarvam AI से आती है</small></div><div className="speech-controls"><button className="outline-button compact" onClick={speechPaused?resumeSpeech:pauseSpeech} disabled={!speechActive} aria-label={speechPaused?"Resume voice":"Pause voice"}>{speechPaused?<Play size={15}/>:<Pause size={15}/>} {profile.language==="Hindi"?(speechPaused?"फिर चलाएँ":"रोकें"):(speechPaused?"Resume voice":"Pause voice")}</button><button className="outline-button compact" onClick={stopSpeech} disabled={!speechActive} aria-label={profile.language==="Hindi"?"आवाज़ बंद करें":"Stop voice"}><VolumeX size={15}/> {profile.language==="Hindi"?"बंद":"Stop"}</button></div></div><div className="conversation">{lastQuery&&<div className="chat-bubble user-bubble">{lastQuery}</div>}<div className="chat-bubble assistant-bubble">{voiceReply}</div></div><div className="mic-area"><button className={`mic-button ${listening?"listening":""}`} onClick={listening?()=>recognitionRef.current?.stop():startListening} aria-label={listening?"Stop listening":"Start speaking"}>{listening?<MicOff size={28}/>:<Mic size={28}/>}</button><b>{listening?"Listening… speak now":"Tap to speak"}</b><small>{listening?"Your browser is listening":"Microphone permission may be requested"}</small></div>{micError&&<div className="inline-warning"><AlertTriangle size={16}/>{micError}</div>}<form className="voice-input-row" onSubmit={e=>{e.preventDefault();if(voiceInput.trim())handleVoice(voiceInput.trim());}}><input className="text-input" value={voiceInput} onChange={e=>setVoiceInput(e.target.value)} placeholder="Type what you’d like to ask" aria-label="Type a question"/><button className="primary-button" type="submit" disabled={!voiceInput.trim()}>Ask <ArrowRight size={16}/></button></form><div className="suggestion-list"><small>TRY SAYING</small>{["When is my next medicine?","What allergies have I told you about?","Read my medical report","Remind me about my next medicine"].map(q=><button key={q} onClick={()=>handleVoice(q)}>{q}<ArrowRight size={14}/></button>)}</div><div className="helper-text"><CircleHelp size={15}/> Voice recognition availability depends on your browser. You can always type a request. {profile.language==="Hindi"?"रिपोर्ट की आसान हिंदी व्याख्या Sarvam AI से तैयार होती है। आवाज़ रोकने, फिर चलाने या बंद करने के लिए ऊपर के बटन दबाएँ।":"Sarvam AI explains and speaks Hindi reports. Use Pause or Resume to control the audio, or Stop to end it."}</div></div><div className="disclaimer"><Stethoscope size={18}/><span>For medical advice, diagnosis, or treatment decisions, contact your doctor or pharmacist.</span></div></div>}
    </section>
    {audioUrl&&<div className="report-audio-dock"><audio className="report-audio" ref={audioRef} src={audioUrl} controls onPlay={()=>{setSpeechActive(true);setSpeechPaused(false);}} onPause={e=>{if(!e.currentTarget.ended)setSpeechPaused(true);}} onEnded={()=>{setSpeechActive(false);setSpeechPaused(false);if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current="";setAudioUrl("");}}/></div>}
    <nav className="mobile-nav" aria-label="Mobile navigation">{([ ["Home",Home], ["Scan Report",ScanLine], ["My Medicines",Pill], ["My Health",Activity], ["Voice Assistant",Mic] ] as const).map(([label,Icon])=><button key={label} className={section===label?"selected":""} onClick={()=>setSection(label)} aria-label={label}><Icon size={19}/><small>{label.replace("My ","")}</small></button>)}</nav>

    {showSetup&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeDialog();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-heading"><button className="modal-close" onClick={closeDialog} aria-label="Close"><X size={19}/></button><span className="modal-icon"><HeartPulse size={23}/></span><div className="eyebrow">WELCOME TO SUNOSEHAT</div><h2 id="setup-heading">Your health, in your language</h2><p className="modal-intro">SunoSehat helps you understand your health and remember your medicines.</p><label className="field-label" htmlFor="patient-name">Name or nickname</label><input id="patient-name" className="text-input" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))} placeholder="What should we call you?"/><div className="form-two"><div><label className="field-label" htmlFor="language">Preferred language</label><select id="language" className="text-input" value={profile.language} onChange={e=>setProfile(p=>({...p,language:e.target.value}))}><option>English</option><option>Hindi</option></select></div><div><label className="field-label" htmlFor="age">Age (optional)</label><input id="age" className="text-input" type="number" min="1" max="120" value={profile.age} onChange={e=>setProfile(p=>({...p,age:e.target.value}))}/></div></div><label className="field-label" htmlFor="emergency">Emergency contact (optional)</label><input id="emergency" className="text-input" value={profile.emergency} onChange={e=>setProfile(p=>({...p,emergency:e.target.value}))} placeholder="Name and phone number"/><div className="button-row modal-buttons"><button className="primary-button" onClick={saveProfile}>Start using SunoSehat <ArrowRight size={16}/></button><button className="outline-button" onClick={addDemo}><Sparkles size={16}/> Try demo patient</button></div><p className="modal-footnote"><ShieldCheck size={14}/> Your profile is stored in this browser on this device.</p></section></div>}
    {medForm&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setMedForm(false);}}><section className="modal med-modal" role="dialog" aria-modal="true" aria-labelledby="med-heading"><button className="modal-close" onClick={()=>setMedForm(false)} aria-label="Close"><X size={19}/></button><span className="modal-icon mint-bg"><Pill size={22}/></span><div className="eyebrow">PRESCRIPTION DETAILS</div><h2 id="med-heading">{editMed?"Edit medicine":"Add a medicine"}</h2><p className="modal-intro">Enter details exactly as written. Don’t guess a dose or schedule.</p><label className="field-label" htmlFor="med-name">Medicine name *</label><input id="med-name" className="text-input" value={medDraft.name} onChange={e=>setMedDraft(d=>({...d,name:e.target.value}))}/><div className="form-two"><div><label className="field-label" htmlFor="strength">Strength</label><input id="strength" className="text-input" value={medDraft.strength} onChange={e=>setMedDraft(d=>({...d,strength:e.target.value}))} placeholder="As prescribed"/></div><div><label className="field-label" htmlFor="frequency">Frequency</label><input id="frequency" className="text-input" value={medDraft.frequency} onChange={e=>setMedDraft(d=>({...d,frequency:e.target.value}))} placeholder="As prescribed"/></div></div><label className="field-label" htmlFor="dosage">Dosage instructions</label><input id="dosage" className="text-input" value={medDraft.dosage} onChange={e=>setMedDraft(d=>({...d,dosage:e.target.value}))} placeholder="Copy from your prescription"/><label className="field-label" htmlFor="times">Reminder times * <span>· 24-hour time, comma separated (08:00, 20:00)</span></label><input id="times" className="text-input" value={medDraft.times} onChange={e=>setMedDraft(d=>({...d,times:e.target.value}))} placeholder="08:00"/><label className="field-label" htmlFor="food">Confirmed food instruction</label><input id="food" className="text-input" value={medDraft.food} onChange={e=>setMedDraft(d=>({...d,food:e.target.value}))} placeholder="Only if explicitly prescribed"/><p className="helper-text"><AlertTriangle size={15}/> Medication safety is not assessed. Ask a doctor or pharmacist if anything is unclear.</p><button className="primary-button full-button" onClick={saveMed}><Check size={17}/> Save medicine</button></section></div>}
    {confirmDose&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmDose(null);}}><section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-heading"><button className="modal-close" onClick={()=>setConfirmDose(null)} aria-label="Close"><X size={19}/></button><span className="modal-icon mint-bg"><Pill size={22}/></span><div className="eyebrow">DOSE CONFIRMATION</div><h2 id="confirm-heading">Did you take {confirmDose.name}?</h2><p className="modal-intro">This will record your confirmation for today. Check your own prescription before taking any medicine.</p><div className="dose-instructions"><b>Saved details</b><span>{confirmDose.dosage||"No dosage instruction recorded"}</span><span>{confirmDose.food||"No food instruction confirmed"}</span></div><button className="primary-button full-button" onClick={()=>doseAction(confirmDose,"taken")}><Check size={17}/> I have taken this medicine</button><div className="button-row full-row"><button className="outline-button" onClick={()=>doseAction(confirmDose,"skipped")}>Skipped</button><button className="outline-button" onClick={()=>doseAction(confirmDose,"missed")}>Mark missed</button></div></section></div>}
    {notice&&<div className="toast" role="status"><CheckCircle2 size={18}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}
  </main>;
}

function formatTime(t:string) { const [h,m]=t.split(":").map(Number); return new Date(2000,0,1,h,m).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}); }
function DoseRow({med,time,dose,onTake,onMiss}:{med:Medication;time:string;dose?:DoseMap[string];onTake:()=>void;onMiss:()=>void}) { return <article className="dose-row"><div className="time-col"><b>{formatTime(time)}</b><span>{dose?"Recorded":"Scheduled"}</span></div><div className="dose-divider"/><div className="dose-icon"><Pill size={19}/></div><div className="dose-info"><b>{med.name}</b><small>{med.dosage||"Check your prescription"}{med.food!=="No instruction confirmed"?` · ${med.food}`:""}</small></div>{dose?<span className={`status-chip ${dose.status}`}>{dose.status==="taken"?<Check size={14}/>:<AlertTriangle size={14}/>} {dose.status}</span>:<div className="dose-actions"><button className="take-button" onClick={onTake}>Review dose</button><button className="icon-button" onClick={onMiss} aria-label={`Mark ${med.name} missed`}><X size={16}/></button></div>}</article>; }
