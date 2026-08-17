/** The outside of the front board: grained leather, blocked in gold foil. */
export function CoverOutside({ book }: { book: string }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[3px_7px_7px_3px]"
      style={{
        containerType: "inline-size",
        background:
          "linear-gradient(118deg, #10132f 0%, #1b2050 34%, #0d1029 58%, #191e46 78%, #0b0e24 100%)",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -14px 26px rgba(0,0,0,0.45), 0 14px 26px rgba(28,36,74,0.32)",
      }}
    >
      <div className="grain-leather absolute inset-0 opacity-[0.3] mix-blend-overlay" />
      {/* Light from the window, raking across the grain. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(112deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.02) 26%, rgba(255,255,255,0) 52%, rgba(0,0,0,0.22) 100%)",
        }}
      />

      {/* Blind-tooled double rule. */}
      <div
        className="absolute inset-[5.5%] rounded-[2px]"
        style={{ boxShadow: "0 0 0 1px rgba(201,162,39,0.42), inset 0 0 0 3px rgba(0,0,0,0.28)" }}
      />
      <div className="absolute inset-[7.4%] rounded-[1px]" style={{ boxShadow: "0 0 0 1px rgba(201,162,39,0.2)" }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-[12%] text-center">
        <Rule />
        <h2
          className="mt-[7%] font-display text-gilt-bright"
          style={{
            fontSize: "clamp(0.8rem, 8cqw, 1.55rem)",
            letterSpacing: "0.3em",
            textIndent: "0.3em",
            textShadow: "0 1px 0 rgba(0,0,0,0.6), 0 0 12px rgba(240,220,154,0.28)",
          }}
        >
          HOLY
          <br />
          BIBLE
        </h2>
        <div className="mt-[7%] w-full">
          <Rule />
        </div>

        <p
          className="label mt-[11%] text-gilt/85"
          style={{ fontSize: "clamp(0.4rem, 3.1cqw, 0.62rem)", textShadow: "0 1px 0 rgba(0,0,0,0.5)" }}
        >
          {book}
        </p>
      </div>

      <p
        className="label absolute inset-x-0 bottom-[6.5%] text-center text-gilt/45"
        style={{ fontSize: "clamp(0.34rem, 2.4cqw, 0.5rem)" }}
      >
        World English Bible
      </p>
    </div>
  );
}

function Rule() {
  return (
    <div className="flex w-full items-center justify-center gap-[6px]">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gilt/55" />
      <span className="size-[3px] rotate-45 bg-gilt/70" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gilt/55" />
    </div>
  );
}

/** The inside of the board: pastedown endpaper, marbled the old way. */
export function CoverInside() {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[7px_3px_3px_7px]"
      style={{
        background: "linear-gradient(160deg, #26305f 0%, #1a2247 46%, #222b57 100%)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 0 70px rgba(0,0,0,0.45)",
      }}
    >
      {/* Combed marble: drawn stone, pulled through in one direction. */}
      <div
        className="absolute inset-0 opacity-55"
        style={{
          background:
            "repeating-linear-gradient(102deg, rgba(240,220,154,0.13) 0 1px, rgba(240,220,154,0) 1px 7px, rgba(163,55,44,0.12) 7px 9px, rgba(240,220,154,0) 9px 19px)",
          maskImage:
            "radial-gradient(120% 90% at 34% 26%, #000 12%, rgba(0,0,0,0.45) 58%, rgba(0,0,0,0.15) 100%)",
        }}
      />
      <div className="grain-leather absolute inset-0 opacity-30 mix-blend-overlay" />
      {/* The endpaper is pasted down to within a few mm of the turn-in. */}
      <div className="absolute inset-[3.5%] rounded-[2px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]" />
    </div>
  );
}
