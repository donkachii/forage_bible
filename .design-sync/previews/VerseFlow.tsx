import { BODY_TYPE, VerseFlow } from "foredge";

// World English Bible (public domain) — the translation the app reads.
const GENESIS_1 = [
  { verse: 1, text: "In the beginning, God created the heavens and the earth." },
  {
    verse: 2,
    text: "The earth was formless and empty. Darkness was on the surface of the deep and God's Spirit was hovering over the surface of the waters.",
  },
  { verse: 3, text: 'God said, "Let there be light," and there was light.' },
  { verse: 4, text: "God saw the light, and saw that it was good. God divided the light from the darkness." },
  {
    verse: 5,
    text: 'God called the light "day", and the darkness he called "night". There was evening and there was morning, the first day.',
  },
];

const JOHN_1_CONT = [
  { verse: 6, text: "There came a man sent from God, whose name was John." },
  {
    verse: 7,
    text: "The same came as a witness, that he might testify about the light, that all might believe through him.",
  },
  { verse: 8, text: "He was not the light, but was sent that he might testify about the light." },
  {
    verse: 9,
    text: "The true light that enlightens everyone was coming into the world.",
  },
];

const PSALM_23 = [
  { verse: 1, text: "Yahweh is my shepherd; I shall lack nothing." },
  { verse: 2, text: "He makes me lie down in green pastures. He leads me beside still waters." },
  { verse: 3, text: "He restores my soul. He guides me in the paths of righteousness for his name's sake." },
  {
    verse: 4,
    text: "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.",
  },
];

/** The column VerseFlow is set into — vellum, the shared body type, a page measure. */
function Column({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-vellum text-ink" style={{ padding: 32 }}>
      <div className={BODY_TYPE} style={{ maxWidth: "34em", marginInline: "auto" }}>
        {children}
      </div>
    </div>
  );
}

/** Verse 1 is the chapter opening, so it takes the rubricated drop initial. */
export function ChapterOpening() {
  return (
    <Column>
      <VerseFlow verses={GENESIS_1} chapter={1} />
    </Column>
  );
}

/** Past verse 1 there is no initial — just the superscript numbers people scan for. */
export function MidChapter() {
  return (
    <Column>
      <VerseFlow verses={JOHN_1_CONT} chapter={1} />
    </Column>
  );
}

/** A chapter whose number runs to two figures, to check the initial still sets. */
export function TwoFigureChapter() {
  return (
    <Column>
      <VerseFlow verses={PSALM_23} chapter={23} />
    </Column>
  );
}
