// Escalating reminders that nag "Kommer"-users to upload photos to a finished
// event's album. Same bot personality as reminderPhrases.js — friendly → furious.
const PHRASES = {
  '0m': [
    (name, title) => `@${name} "${title}" er over! Har du noen bilder? Legg dem inn i albumet 📸`,
    (name, title) => `@${name} takk for i dag på "${title}"! Del gjerne bildene dine i albumet 😊`,
    (name, title) => `@${name} hei! "${title}" er ferdig – legg inn bildene dine så alle kan se dem 📷`,
    (name, title) => `@${name} håper du koste deg på "${title}"! Nå mangler vi bare bildene dine.`,
    (name, title) => `@${name} bildene fra "${title}" gjør seg ikke selv – last dem opp i albumet 🙏`,
    (name, title) => `@${name} du var jo på "${title}"! Del bildene dine i albumet, da vel 😊`,
  ],

  '8h': [
    (name, title) => `@${name} fortsatt ingen bilder fra "${title}"? Kom igjen, du hadde jo mobilen framme hele kvelden.`,
    (name, title) => `@${name} albumet til "${title}" er tomt fra din side. Last opp noe, da!`,
    (name, title) => `@${name} vi venter på bildene dine fra "${title}". Det tar 10 sekunder.`,
    (name, title) => `@${name} du glemte visst noe etter "${title}" – nemlig å legge inn bildene dine.`,
    (name, title) => `@${name} bildene fra "${title}"? Hallo? Albumet trenger deg.`,
    (name, title) => `@${name} andre har lagt inn bilder fra "${title}". Hvor er dine?`,
  ],

  '24h': [
    (name, title) => `@${name} ETT DØGN uten et eneste bilde fra "${title}". Skjerp deg og last opp!`,
    (name, title) => `@${name} du har hatt 24 timer på deg til å legge inn bilder fra "${title}". Kom igjen nå.`,
    (name, title) => `@${name} albumet til "${title}" gråter. Det mangler bildene dine. Last opp!`,
    (name, title) => `@${name} seriøst, ingen bilder fra "${title}" enda? Du var jo der!`,
    (name, title) => `@${name} 24 timer. Ingen bilder. "${title}". Dette er pinlig. Last opp.`,
    (name, title) => `@${name} jeg begynner å bli utålmodig. Bildene fra "${title}" – NÅ.`,
  ],

  '48h': [
    (name, title) => `@${name} TO DAGER uten bilder fra "${title}"?! Hva driver du med? Last opp med en gang!`,
    (name, title) => `@${name} nå er jeg irritert. "${title}"-albumet mangler fortsatt bildene dine. To dager!`,
    (name, title) => `@${name} du ignorerer meg? Bildene fra "${title}". Last dem opp før jeg blir sur.`,
    (name, title) => `@${name} 48 timer og null bilder fra "${title}". Du er en skam for albumet.`,
    (name, title) => `@${name} last opp bildene fra "${title}" ELLER så maser jeg til du gjør det.`,
    (name, title) => `@${name} to dager. Bildene fra "${title}". Jeg gir meg ikke. LAST OPP.`,
  ],

  '72h': [
    (name, title) => `@${name} TRE DAGER! Hvor er bildene fra "${title}"?! Last opp NÅ, din trege gnom!`,
    (name, title) => `@${name} jeg har mast i tre dager om bildene fra "${title}". Du later som ingenting. LAST OPP.`,
    (name, title) => `@${name} 72 timer uten bilder fra "${title}". Dette er en fornærmelse mot albumet. SVAR MED BILDER.`,
    (name, title) => `@${name} du tror du slipper unna? Bildene fra "${title}" – last opp eller jeg finner deg.`,
    (name, title) => `@${name} tre dager. Bildene fra "${title}". Jeg blir mer og mer forbanna for hver time.`,
    (name, title) => `@${name} FOR HELVETE @${name}, last opp bildene fra "${title}" før jeg mister det totalt.`,
  ],

  every5d: [
    (name, title) => `NÅ ER DET NOK @${name}! Bildene fra "${title}" – LAST OPP DIN LATSABB! Albumet har ventet i evigheter!`,
    (name, title) => `@${name} jeg drømmer om bildene fra "${title}" om natta. Du nekter å laste dem opp. Hva feiler det deg?`,
    (name, title) => `@${name} SVAR MED BILDER FRA "${title}" ELLER JEG MELDER DEG UT AV ALBUMET FOR LIVET.`,
    (name, title) => `@${name} dagene går. Bildene fra "${title}" er fortsatt ikke lastet opp. Jeg er rasende på dine vegne.`,
    (name, title) => `@${name} du er offisielt fienden av albumet. Last opp bildene fra "${title}" eller bli tilintetgjort.`,
    (name, title) => `@${name} jeg har en øks og en plan. Last opp bildene fra "${title}" før jeg setter planen i verk.`,
  ],
};

// One-shot gentle nudge for "Kanskje"/ikke-svart users. No escalation, no lock.
const SOFT_PHRASES = [
  (name, title) => `@${name} var du innom "${title}" likevel? Legg gjerne inn bildene dine i albumet 📸`,
  (name, title) => `@${name} hvis du tok bilder på "${title}", del dem gjerne i albumet 😊`,
  (name, title) => `@${name} psst – hadde du noen bilder fra "${title}"? Albumet tar imot dem 📷`,
  (name, title) => `@${name} om du var på "${title}", hadde det vært stas med bildene dine i albumet!`,
];

export function getRandomAlbumPhotoPhrase(stageKey, userName, eventTitle) {
  const key = stageKey.startsWith('5d-') ? 'every5d' : stageKey;
  const pool = PHRASES[key] ?? PHRASES.every5d;
  const fn = pool[Math.floor(Math.random() * pool.length)];
  return fn(userName, eventTitle);
}

export function getSoftAlbumPhotoPhrase(userName, eventTitle) {
  const fn = SOFT_PHRASES[Math.floor(Math.random() * SOFT_PHRASES.length)];
  return fn(userName, eventTitle);
}
