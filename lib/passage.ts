import { findBook } from "./canon";

export type Verse = { verse: number; text: string };

export type Passage = {
  book: string;
  chapter: number;
  verses: Verse[];
  translation: string;
};

type ApiResponse = {
  verses?: { book_name: string; chapter: number; verse: number; text: string }[];
  translation_name?: string;
  error?: string;
};

const SOURCE = "https://bible-api.com";

/** Thrown when the request itself is wrong, rather than the source failing. */
export class UnknownBookError extends Error {}

/**
 * The World English Bible is public domain, so the text can be cached
 * indefinitely — a chapter never changes.
 */
export async function fetchPassage(book: string, chapter: number): Promise<Passage> {
  const entry = findBook(book);
  if (!entry) throw new UnknownBookError(book);

  const bounded = Math.min(Math.max(chapter, 1), entry.chapters);
  // A bare number after a one-chapter book reads as a verse, so those are
  // asked for as a full verse range instead.
  const ref = entry.verses ? `1:1-${entry.verses}` : `${bounded}`;
  const url = `${SOURCE}/${encodeURIComponent(entry.slug)}+${ref}?translation=web`;

  const res = await fetch(url, { next: { revalidate: false } });
  if (!res.ok) throw new Error(`${SOURCE} returned ${res.status}`);

  const data = (await res.json()) as ApiResponse;
  if (!data.verses?.length) throw new Error(data.error ?? "No verses in response");

  return {
    book: entry.name,
    chapter: bounded,
    translation: data.translation_name ?? "World English Bible",
    verses: data.verses.map((v) => ({ verse: v.verse, text: v.text.trim() })),
  };
}

/**
 * Genesis 1 travels with the app so the shelf always opens to something,
 * even with no network on first paint.
 */
export const OPENING: Passage = {
  book: "Genesis",
  chapter: 1,
  translation: "World English Bible",
  verses: [
    { verse: 1, text: "In the beginning, God created the heavens and the earth." },
    {
      verse: 2,
      text: "The earth was formless and empty. Darkness was on the surface of the deep and God's Spirit was hovering over the surface of the waters.",
    },
    { verse: 3, text: "God said, “Let there be light,” and there was light." },
    { verse: 4, text: "God saw the light, and saw that it was good. God divided the light from the darkness." },
    {
      verse: 5,
      text: "God called the light “day”, and the darkness he called “night”. There was evening and there was morning, the first day.",
    },
    {
      verse: 6,
      text: "God said, “Let there be an expanse in the middle of the waters, and let it divide the waters from the waters.”",
    },
    {
      verse: 7,
      text: "God made the expanse, and divided the waters which were under the expanse from the waters which were above the expanse; and it was so.",
    },
    { verse: 8, text: "God called the expanse “sky”. There was evening and there was morning, a second day." },
    {
      verse: 9,
      text: "God said, “Let the waters under the sky be gathered together to one place, and let the dry land appear;” and it was so.",
    },
    {
      verse: 10,
      text: "God called the dry land “earth”, and the gathering together of the waters he called “seas”. God saw that it was good.",
    },
  ],
};
