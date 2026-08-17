import { NextResponse } from "next/server";
import { UnknownBookError, fetchPassage } from "@/lib/passage";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const book = params.get("book");
  const chapter = Number(params.get("chapter") ?? 1);

  if (!book) {
    return NextResponse.json({ error: "Name a book to read." }, { status: 400 });
  }
  if (!Number.isFinite(chapter) || chapter < 1) {
    return NextResponse.json({ error: "Chapter must be a positive number." }, { status: 400 });
  }

  try {
    const passage = await fetchPassage(book, chapter);
    return NextResponse.json(passage, {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (error) {
    if (error instanceof UnknownBookError) {
      return NextResponse.json(
        { error: `There is no book of the Bible called “${book}”.` },
        { status: 404 },
      );
    }
    console.error(`passage: ${book} ${chapter}`, error);
    return NextResponse.json(
      { error: `The text of ${book} ${chapter} is not reachable right now.` },
      { status: 502 },
    );
  }
}
