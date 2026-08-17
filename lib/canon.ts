export type Division =
  | "Law"
  | "History"
  | "Poetry"
  | "Prophets"
  | "Gospels"
  | "Letters"
  | "Apocalypse";

export type Book = {
  /** Display name, as it appears on the running head. */
  name: string;
  /** Path segment bible-api.com expects. */
  slug: string;
  chapters: number;
  /**
   * Only for the five books with a single chapter. bible-api reads a bare
   * number after those as a verse, not a chapter, so they have to be asked
   * for as an explicit verse range — which means knowing where they end.
   */
  verses?: number;
  division: Division;
  testament: "Old" | "New";
};

export const CANON: Book[] = [
  { name: "Genesis", slug: "genesis", chapters: 50, division: "Law", testament: "Old" },
  { name: "Exodus", slug: "exodus", chapters: 40, division: "Law", testament: "Old" },
  { name: "Leviticus", slug: "leviticus", chapters: 27, division: "Law", testament: "Old" },
  { name: "Numbers", slug: "numbers", chapters: 36, division: "Law", testament: "Old" },
  { name: "Deuteronomy", slug: "deuteronomy", chapters: 34, division: "Law", testament: "Old" },
  { name: "Joshua", slug: "joshua", chapters: 24, division: "History", testament: "Old" },
  { name: "Judges", slug: "judges", chapters: 21, division: "History", testament: "Old" },
  { name: "Ruth", slug: "ruth", chapters: 4, division: "History", testament: "Old" },
  { name: "1 Samuel", slug: "1samuel", chapters: 31, division: "History", testament: "Old" },
  { name: "2 Samuel", slug: "2samuel", chapters: 24, division: "History", testament: "Old" },
  { name: "1 Kings", slug: "1kings", chapters: 22, division: "History", testament: "Old" },
  { name: "2 Kings", slug: "2kings", chapters: 25, division: "History", testament: "Old" },
  { name: "1 Chronicles", slug: "1chronicles", chapters: 29, division: "History", testament: "Old" },
  { name: "2 Chronicles", slug: "2chronicles", chapters: 36, division: "History", testament: "Old" },
  { name: "Ezra", slug: "ezra", chapters: 10, division: "History", testament: "Old" },
  { name: "Nehemiah", slug: "nehemiah", chapters: 13, division: "History", testament: "Old" },
  { name: "Esther", slug: "esther", chapters: 10, division: "History", testament: "Old" },
  { name: "Job", slug: "job", chapters: 42, division: "Poetry", testament: "Old" },
  { name: "Psalms", slug: "psalms", chapters: 150, division: "Poetry", testament: "Old" },
  { name: "Proverbs", slug: "proverbs", chapters: 31, division: "Poetry", testament: "Old" },
  { name: "Ecclesiastes", slug: "ecclesiastes", chapters: 12, division: "Poetry", testament: "Old" },
  { name: "Song of Solomon", slug: "song of solomon", chapters: 8, division: "Poetry", testament: "Old" },
  { name: "Isaiah", slug: "isaiah", chapters: 66, division: "Prophets", testament: "Old" },
  { name: "Jeremiah", slug: "jeremiah", chapters: 52, division: "Prophets", testament: "Old" },
  { name: "Lamentations", slug: "lamentations", chapters: 5, division: "Prophets", testament: "Old" },
  { name: "Ezekiel", slug: "ezekiel", chapters: 48, division: "Prophets", testament: "Old" },
  { name: "Daniel", slug: "daniel", chapters: 12, division: "Prophets", testament: "Old" },
  { name: "Hosea", slug: "hosea", chapters: 14, division: "Prophets", testament: "Old" },
  { name: "Joel", slug: "joel", chapters: 3, division: "Prophets", testament: "Old" },
  { name: "Amos", slug: "amos", chapters: 9, division: "Prophets", testament: "Old" },
  { name: "Obadiah", slug: "obadiah", chapters: 1, verses: 21, division: "Prophets", testament: "Old" },
  { name: "Jonah", slug: "jonah", chapters: 4, division: "Prophets", testament: "Old" },
  { name: "Micah", slug: "micah", chapters: 7, division: "Prophets", testament: "Old" },
  { name: "Nahum", slug: "nahum", chapters: 3, division: "Prophets", testament: "Old" },
  { name: "Habakkuk", slug: "habakkuk", chapters: 3, division: "Prophets", testament: "Old" },
  { name: "Zephaniah", slug: "zephaniah", chapters: 3, division: "Prophets", testament: "Old" },
  { name: "Haggai", slug: "haggai", chapters: 2, division: "Prophets", testament: "Old" },
  { name: "Zechariah", slug: "zechariah", chapters: 14, division: "Prophets", testament: "Old" },
  { name: "Malachi", slug: "malachi", chapters: 4, division: "Prophets", testament: "Old" },
  { name: "Matthew", slug: "matthew", chapters: 28, division: "Gospels", testament: "New" },
  { name: "Mark", slug: "mark", chapters: 16, division: "Gospels", testament: "New" },
  { name: "Luke", slug: "luke", chapters: 24, division: "Gospels", testament: "New" },
  { name: "John", slug: "john", chapters: 21, division: "Gospels", testament: "New" },
  { name: "Acts", slug: "acts", chapters: 28, division: "History", testament: "New" },
  { name: "Romans", slug: "romans", chapters: 16, division: "Letters", testament: "New" },
  { name: "1 Corinthians", slug: "1corinthians", chapters: 16, division: "Letters", testament: "New" },
  { name: "2 Corinthians", slug: "2corinthians", chapters: 13, division: "Letters", testament: "New" },
  { name: "Galatians", slug: "galatians", chapters: 6, division: "Letters", testament: "New" },
  { name: "Ephesians", slug: "ephesians", chapters: 6, division: "Letters", testament: "New" },
  { name: "Philippians", slug: "philippians", chapters: 4, division: "Letters", testament: "New" },
  { name: "Colossians", slug: "colossians", chapters: 4, division: "Letters", testament: "New" },
  { name: "1 Thessalonians", slug: "1thessalonians", chapters: 5, division: "Letters", testament: "New" },
  { name: "2 Thessalonians", slug: "2thessalonians", chapters: 3, division: "Letters", testament: "New" },
  { name: "1 Timothy", slug: "1timothy", chapters: 6, division: "Letters", testament: "New" },
  { name: "2 Timothy", slug: "2timothy", chapters: 4, division: "Letters", testament: "New" },
  { name: "Titus", slug: "titus", chapters: 3, division: "Letters", testament: "New" },
  { name: "Philemon", slug: "philemon", chapters: 1, verses: 25, division: "Letters", testament: "New" },
  { name: "Hebrews", slug: "hebrews", chapters: 13, division: "Letters", testament: "New" },
  { name: "James", slug: "james", chapters: 5, division: "Letters", testament: "New" },
  { name: "1 Peter", slug: "1peter", chapters: 5, division: "Letters", testament: "New" },
  { name: "2 Peter", slug: "2peter", chapters: 3, division: "Letters", testament: "New" },
  { name: "1 John", slug: "1john", chapters: 5, division: "Letters", testament: "New" },
  { name: "2 John", slug: "2john", chapters: 1, verses: 13, division: "Letters", testament: "New" },
  { name: "3 John", slug: "3john", chapters: 1, verses: 14, division: "Letters", testament: "New" },
  { name: "Jude", slug: "jude", chapters: 1, verses: 25, division: "Letters", testament: "New" },
  { name: "Revelation", slug: "revelation", chapters: 22, division: "Apocalypse", testament: "New" },
];

/** One line of orientation per division, shown under the book on the shelf. */
export const DIVISION_NOTE: Record<Division, string> = {
  Law: "The five books of the Law",
  History: "The chronicle of Israel",
  Poetry: "Songs and wisdom",
  Prophets: "The prophets of Israel",
  Gospels: "The life of Christ",
  Letters: "Letters to the early church",
  Apocalypse: "The revelation to John",
};

export const bookIndex = (name: string) =>
  CANON.findIndex((b) => b.name.toLowerCase() === name.toLowerCase());

export const findBook = (name: string) => CANON[bookIndex(name)];
