/**
 * The design-system surface of Foredge.
 *
 * Foredge is an application, not a library, so there is no dist/ to point the
 * converter at. This file is the entry instead: it names the parts that are
 * genuinely reusable and leaves out the two that are not — BibleTable (takes
 * no props; it *is* the screen) and BookScene (a WebGL canvas that cannot
 * render meaningfully in a static preview card, and would drag three.js into
 * the bundle).
 */
export { Chevron } from "../components/Chevron";
export { BooksIcon } from "../components/BooksIcon";
export { PageFace, VerseFlow, BODY_TYPE } from "../components/Page";
export { default as Contents } from "../components/Contents";
