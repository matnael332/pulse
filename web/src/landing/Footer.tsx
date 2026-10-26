// The page closes on the name, built from blocks: each letter knocked out of its own rectangle,
// the rectangles of different heights, bottoms on one line (a drawing of the mark, in SVG).
import { useI18n } from "../i18n";
import classes from "./Landing.module.css";

const W = 1000;
const H = 220;
const GAP = 4;
const BLOCKS: [letter: string, height: number, colour: string][] = [
  ["P", 1, "#ffffff"],
  ["U", 0.72, "#e0e0e0"],
  ["L", 0.86, "#b4b4b4"],
  ["S", 0.64, "#e0e0e0"],
  ["E", 0.92, "#ffffff"],
];
const WIDTH = (W - GAP * (BLOCKS.length - 1)) / BLOCKS.length;

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className={classes.footer}>
      <svg className={classes.blocks} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="PULSE">
        {BLOCKS.map(([letter, height, colour], i) => {
          const x = i * (WIDTH + GAP);
          return (
            <g key={letter}>
              <rect x={x} y={H * (1 - height)} width={WIDTH} height={H * height} fill={colour} />
              <text x={x + WIDTH / 2} y={H - 6} className={classes.blockLetter}>
                {letter}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={classes.footerRow}>
        <div className={classes.footerLinks}>
          <a className={classes.navLink} href="#how">
            {t("landing.nav.how")}
          </a>
          <a className={classes.navLink} href="#privacy">
            {t("landing.nav.privacy")}
          </a>
          <a className={classes.navLink} href="#start">
            {t("landing.nav.start")}
          </a>
        </div>
        <span>{t("landing.footer.rights")}</span>
      </div>
    </footer>
  );
}
