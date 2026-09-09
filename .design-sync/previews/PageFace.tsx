import { PageFace } from "foredge";

// World English Bible (public domain) — the translation the app reads.
const VERSO = [
  { verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
  { verse: 2, text: "The same was in the beginning with God." },
  { verse: 3, text: "All things were made through him. Without him, nothing was made that has been made." },
  { verse: 4, text: "In him was life, and the life was the light of men." },
  { verse: 5, text: "The light shines in the darkness, and the darkness hasn't overcome it." },
];

const RECTO = [
  { verse: 6, text: "There came a man sent from God, whose name was John." },
  {
    verse: 7,
    text: "The same came as a witness, that he might testify about the light, that all might believe through him.",
  },
  { verse: 8, text: "He was not the light, but was sent that he might testify about the light." },
  { verse: 9, text: "The true light that enlightens everyone was coming into the world." },
  {
    verse: 10,
    text: "He was in the world, and the world was made through him, and the world didn't recognize him.",
  },
];

/** A leaf is `h-full`, so it needs a parent that gives it a height. */
function Leaf({ children }: { children: React.ReactNode }) {
  return (
    <div className="shadow-lg" style={{ height: 440, width: 320 }}>
      {children}
    </div>
  );
}

/**
 * The spread as it is read: book name on the outer corner of the verso, the
 * verse range on the recto, and the gutter shadow falling toward the centre.
 */
export function Spread() {
  return (
    <div className="room-light flex justify-center" style={{ gap: 1, padding: 32 }}>
      <Leaf>
        <PageFace side="verso" book="John" chapter={1} verses={VERSO} folio={1042} />
      </Leaf>
      <Leaf>
        <PageFace side="recto" book="John" chapter={1} verses={RECTO} folio={1043} />
      </Leaf>
    </div>
  );
}

/**
 * A leaf the chapter ran out before reaching. The running head and folio are
 * hidden rather than removed — the body between them is the paginator's ruler,
 * and a ruler that grows on a blank leaf moves which leaves come up blank.
 */
export function BlankLeaf() {
  return (
    <div className="room-light flex justify-center" style={{ gap: 1, padding: 32 }}>
      <Leaf>
        <PageFace side="verso" book="Obadiah" chapter={1} verses={VERSO.slice(0, 2)} folio={1180} />
      </Leaf>
      <Leaf>
        <PageFace side="recto" book="Obadiah" chapter={1} verses={[]} folio={1181} />
      </Leaf>
    </div>
  );
}
